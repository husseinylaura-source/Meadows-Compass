/* EduGhaf – Staff dashboard (#teacher)
   Each member of staff signs in with the username and password from the Sheet's Teachers tab.
   Teachers see only the students linked to their teacher code (from the school's master list) and can add
   missing students; leaders see everything and manage logins. Students are identified by M Number. Data comes from the Google Sheet in js/config.js → resultsUrl.
   Bands: Below 0–39 · Working towards 40–59 · Meeting 60–79 · Exceeding 80–100 */
(function(){
"use strict";
const CFG = window.COMPASS_CONFIG || {};
const BANDS = [
  {k:"below", name:"Below", min:0, range:"0–39%"},
  {k:"towards", name:"Working towards", min:40, range:"40–59%"},
  {k:"meeting", name:"Meeting", min:60, range:"60–79%"},
  {k:"exceeding", name:"Exceeding", min:80, range:"80–100%"}
];
const SUBJECTS = ["MSC","Social Studies","Moral Education","Literacy"];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bandOf = p => { if(p === "" || p == null || isNaN(p)) return null; let b = BANDS[0]; BANDS.forEach(x => { if(Math.round(p) >= x.min) b = x; }); return b; };
const pct = n => n === "" || n == null ? "–" : Math.round(n) + "%";
const ss = { get(k){ try{ return sessionStorage.getItem("mc-staff:"+k); }catch(e){ return null; } },
             set(k,v){ try{ v == null ? sessionStorage.removeItem("mc-staff:"+k) : sessionStorage.setItem("mc-staff:"+k, v); }catch(e){} } };
const nameKey = s => String(s||"").replace(/\s+/g," ").trim().toLowerCase();
const tidy = s => String(s||"").replace(/\s+/g," ").trim().split(" ").map(w => /^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");

let editing = null, issued = null;   // Staff accounts: account being edited, login just created
let DATA = null, F = null, sortBy = {col:"cls", dir:1}, query = "", onlyMissed = false, loading = false, listCls = "";

function creds(){ try{ return JSON.parse(ss.get("who") || "null"); }catch(e){ return null; } }

let tab = "reports";
const api = (b) => window.Auth.api("staff", b);
const signedIn = () => window.Auth && Auth.isStaff();

function show(app, crumbs){
  crumbs([["Staff"]]);
  document.body.classList.add("staff");
  app.setAttribute("data-unit","msc");
  if(DATA) return render(app);
  if(window.Auth && Auth.offline) return lock(app, "Staff sign-in works on the EduGhaf site on Cloudflare, not on this copy.");
  if(signedIn()){ if(Auth.session.mustChange) return Auth.changeForm(() => { location.hash = "teacher"; show(app, crumbs); }, true); return call(app, {action:"data"}); }
  lock(app);
}

function lock(app, msg){
  app.innerHTML = `<section class="panel staff-lock signin-card"><div class="lockup"><img src="images/logo.svg" alt="EduGhaf logo"><div><div class="wm"><span>Edu</span><b>Ghaf</b></div><span class="tagline">Staff · Progress reports</span></div></div>
    <h1>Staff sign in</h1>
    <p class="small">See lesson completion, averages and MOE / KHDA bands for your classes, and open any student's saved work.</p>
    <form id="sdForm" class="sd-form">
      <label>Username<input id="sdUser" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>Password<input id="sdPass" type="password" autocomplete="current-password" required></label>
      <button class="btn" type="submit">Sign in</button></form>
    <p class="sd-msg" id="sdMsg" role="status">${esc(msg||"")}</p>
    <p class="small">First time? Use the starting password you were given; you'll then choose your own. No account yet? Ask your Head of Teaching &amp; Learning.</p>
    <div class="sd-demo"><span class="small">Want to see how it works first?</span><button class="btn sm alt" id="sdDemo2" type="button">See a demo with sample data</button></div></section>`;
  const f = app.querySelector("#sdForm");
  f.onsubmit = async e => { e.preventDefault(); const m = app.querySelector("#sdMsg"); m.textContent = "Signing in…";
    try{
      const d = await Auth.api("login", {user: app.querySelector("#sdUser").value.trim(), pass: app.querySelector("#sdPass").value});
      if(!d.ok){ m.textContent = d.message || "Couldn't sign in."; return; }
      if(d.role === "student"){ m.textContent = "This is the staff page. Students sign in on the home page."; return; }
      try{ localStorage.setItem("eg:owner", d.user); }catch(x){}
      Auth.signIn({token: d.token, user: d.user, role: d.role, name: d.name, code: d.code || "", mustChange: d.mustChange});
      Auth.bar();
      if(d.mustChange) return Auth.changeForm(() => { location.hash = "teacher"; document.body.classList.add("staff"); call(app, {action:"data"}); }, true);
      call(app, {action:"data"});
    }catch(err){ m.textContent = "Couldn't reach EduGhaf. Check the connection."; }
  };
  app.querySelector("#sdUser").focus();
  const dm = app.querySelector("#sdDemo2"); if(dm) dm.onclick = () => { DATA = sample(); F = defaults(DATA); render(app); };
}

/* Every request to the EduGhaf database: load data, add or remove a student, manage logins and settings. */
async function call(app, body){
  if(loading) return; loading = true;
  if(DATA) setBusy(app, true); else app.innerHTML = `<p class="notebar">Loading your classes…</p>`;
  try{
    const d = await api(body);
    loading = false;
    if(!d.ok){
      if(d.error === "expired" || d.error === "change"){ DATA = null; F = null; return lock(app, d.message); }
      if(DATA){ setBusy(app, false); const m2 = app.querySelector("#acMsg"); if(m2 && body.action === "saveStaff") m2.textContent = d.message; return toast(d.message); }
      return lock(app, d.message || "Couldn't load the dashboard.");
    }
    DATA = d;
    if(body.action === "saveStaff"){ editing = null; if(body.account.pass) issued = {name: body.account.name, user: body.account.user.trim().toLowerCase(), pass: body.account.pass}; }
    if(!F) F = defaults(d);
    render(app);
    if(d.message) toast(d.message);
  }catch(e){
    loading = false;
    if(DATA){ setBusy(app, false); toast("Couldn't reach EduGhaf. Check the connection."); }
    else lock(app, "Couldn't reach EduGhaf. Check the connection.");
  }
}
function setBusy(app, on){ const b = app.querySelector("#sdRefresh"); if(b){ b.disabled = on; b.textContent = on ? "Refreshing…" : "Refresh"; } }
function toast(t){ const e = document.getElementById("toast"); if(!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2800); }

function currentTerm(terms){
  const today = new Date().toISOString().slice(0,10); let t = "Term 1";
  ["Term 1","Term 2","Term 3"].forEach(x => { if(terms && terms[x] && today >= terms[x]) t = x; });
  return t;
}
function defaults(d){ const subs = d.me && d.me.subjects || [];
  return {term: currentTerm(d.terms), year:"All", cls:"All", subject: subs.length === 1 ? subs[0] : "All"}; }

/* My students: the students linked to the teacher's code, by class and subject, with add / remove. */
function myClasses(){ return (DATA.me && DATA.me.classes) || []; }
let listSub = "";
function classLists(){
  const me = DATA.me || {}, mine = myClasses(), subs = (me.subjects && me.subjects.length) ? me.subjects : SUBJECTS;
  const title = me.role === "leader" ? "Class lists" : "My students";
  if(!mine.length) return `<div class="sd-ph"><h2>${title}</h2></div><p class="small">${me.role === "leader" ? "No students yet. Upload the school student list under Settings." : "No students are linked to your teacher code yet. Ask your Head of Teaching &amp; Learning to check your account."}</p>`;
  if(!mine.includes(listCls)) listCls = mine.includes(F.cls) ? F.cls : mine[0];
  const inClass = (DATA.students || []).filter(x => x.cls === listCls);
  const subsHere = subs.filter(x => inClass.some(y => y.subject === x));
  if(!subs.includes(listSub) || (subsHere.length && !subsHere.includes(listSub))) listSub = subs.includes(F.subject) && (!subsHere.length || subsHere.includes(F.subject)) ? F.subject : (subsHere[0] || subs[0]);
  const list = inClass.filter(x => x.subject === listSub);
  const onList = new Set(list.map(x => x.m));
  const unlisted = []; DATA.groups.filter(g => g.cls === listCls && g.subject === listSub).forEach(g => g.students.forEach(st => {
    if(!st.onRoster && !onList.has(st.m) && !unlisted.some(u => u.m === st.m)) unlisted.push(st); }));
  const canRemove = x => (x.shared && me.code && (x.teachers || []).includes(me.code)) || (x.addedBy && (me.role === "leader" || x.addedBy === me.user));
  const codes = [...new Set((DATA.staff || []).map(a => a.code).filter(Boolean))].sort();
  return `<div class="sd-ph"><h2>${title}</h2><span class="small">${me.role === "leader" ? "Every student from the school list, by class and subject." : "The students linked to your teacher code" + (me.code ? " (" + esc(me.code) + ")" : "") + ". They appear on your dashboard even before they send any work."}</span></div>
    <div class="row"><label class="sd-inline">Class <select id="lCls">${options(mine, listCls)}</select></label>
      <label class="sd-inline">Subject <select id="lSub">${options(subs, listSub)}</select></label><span class="small">${list.length} student${list.length===1?"":"s"}</span></div>
    ${unlisted.length ? `<div class="sd-unlisted"><b>Sending ${esc(listSub)} work in ${esc(listCls)}, but their M Number isn't on the school list</b><span class="small">Add them if they're yours. If the M Number looks mistyped, ask the student to correct it at the top of the website.</span>
      <div class="row">${unlisted.map(st => `<button class="btn sm alt" type="button" data-add="${esc(st.m)}" data-name="${esc(st.name)}">+ ${esc(st.name)} · ${esc(st.m)}</button>`).join("")}</div></div>` : ""}
    <ul class="sd-roster">${list.map(x => `<li><span>${esc(x.name)}</span><span class="small">${esc(x.m)}${me.role === "leader" ? " · " + esc((x.teachers || []).join(", ")) : ""}${x.login === "own" ? " · own password" : x.login === "class" ? " · class password" : " · not signed in yet"}${x.shared ? " · shared list" : x.addedBy ? (x.addedBy === me.user ? " · added by you" : " · added") : ""}</span>${x.login === "own" ? `<button class="btn sm alt" type="button" data-reset="${esc(x.m)}" data-name="${esc(x.name)}" title="Let them sign in with the class password again">Reset password</button>` : ""}${canRemove(x) ? `<button class="x" type="button" data-rm="${esc(x.m)}" data-name="${esc(x.name)}" aria-label="Remove ${esc(x.name)}" title="Remove">×</button>` : ""}</li>`).join("") || `<li class="small">No students on this list yet.</li>`}</ul>
    <form id="lAdd" class="sd-addform">
      <label>M Number<input id="lM" type="text" placeholder="e.g. M9093" autocomplete="off" spellcheck="false" maxlength="9" required></label>
      <label>Full name <span class="small">only if they're new to the school list</span><input id="lName" type="text" autocomplete="off" maxlength="80"></label>
      ${me.role === "leader" ? `<label>Teacher code<select id="lCode">${options(codes, (list[0] && list[0].teachers && list[0].teachers[0]) || codes[0])}</select></label>` : ""}
      <button class="btn" type="submit">Add to ${me.role === "leader" ? "" : "my "}${esc(listCls)} ${esc(listSub)} list</button></form>`;
}
function wireLists(app){
  const box = app.querySelector("#sdLists"); if(!box || !box.querySelectorAll) return;
  const again = () => { box.innerHTML = classLists(); wireLists(app); };
  const sel = app.querySelector("#lCls"); if(sel) sel.onchange = e => { listCls = e.target.value; again(); };
  const sub = app.querySelector("#lSub"); if(sub) sub.onchange = e => { listSub = e.target.value; again(); };
  const f = app.querySelector("#lAdd"); if(f) f.onsubmit = e => { e.preventDefault();
    const m = app.querySelector("#lM").value, code = app.querySelector("#lCode");
    if(!/^M?\d{3,7}$/i.test(String(m).replace(/\s+/g,""))) return toast("Enter the M Number, e.g. M9093.");
    change(app, "addStudent", {mno: m, name: app.querySelector("#lName").value, code: code ? code.value : ""}); };
  box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => change(app, "addStudent", {mno: b.dataset.add, name: b.dataset.name}));
  box.querySelectorAll("[data-reset]").forEach(b => b.onclick = () => { if(DATA.sample) return toast("Preview only."); if(confirm(`Reset ${b.dataset.name}'s password? They'll sign in with the class password and choose a new one.`)) call(app, {action:"resetStudent", mno: b.dataset.reset}); });
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { if(confirm(`Remove ${b.dataset.name} from the ${listCls} ${listSub} list?`)) change(app, "removeStudent", {mno: b.dataset.rm}); });
}
function change(app, action, x){
  if(!DATA.sample) return call(app, Object.assign({action, cls: listCls, subject: listSub}, x));
  const m = "M" + String(x.mno).toUpperCase().replace(/\s+/g,"").replace(/^M/,"");   // preview only: change the sample in the browser
  if(action === "addStudent"){
    if(DATA.students.some(s => s.m === m && s.subject === listSub)) return toast("Already on this list.");
    const name = tidy(x.name) || (DATA.students.find(s => s.m === m) || {}).name;
    if(!name) return toast("This M Number isn't on the school list yet, so enter the student's full name too.");
    DATA.students.push({m, name, cls: listCls, subject: listSub, teachers: [DATA.me.code || "SAM"], addedBy: DATA.me.user});
    DATA.students.sort((a,b) => a.name.localeCompare(b.name));
    DATA.groups.forEach(g => { if(g.cls === listCls && g.subject === listSub){ const st = g.students.find(s => s.m === m); if(st) st.onRoster = true; else g.students.push({m, name, onRoster: true, done: {}}); } });
    toast(name + " added (preview only).");
  } else {
    DATA.students = DATA.students.filter(s => !(s.m === m && s.subject === listSub && s.addedBy));
    DATA.groups.forEach(g => { if(g.cls === listCls && g.subject === listSub) g.students = g.students.filter(s => s.m !== m || Object.keys(s.done).length); });
    toast("Removed (preview only).");
  }
  render(app);
}

/* One row per student per class and subject in the chosen filters */
function rows(){
  const out = [];
  DATA.groups.forEach(g => {
    if(g.term !== F.term) return;
    if(F.year !== "All" && g.year !== F.year) return;
    if(F.cls !== "All" && g.cls !== F.cls) return;
    if(F.subject !== "All" && g.subject !== F.subject) return;
    const set = g.lessons.length;
    g.students.forEach(s => {
      const done = g.lessons.filter(l => s.done[l.id]);
      const sum = done.reduce((a,l) => a + s.done[l.id][0], 0);
      const avg = DATA.zeroForMissed ? (set ? sum/set : "") : (done.length ? sum/done.length : "");
      out.push({ g, cls:g.cls, year:g.year, subject:g.subject, name:s.name, m:s.m || "", onRoster:s.onRoster, set,
        attempted: done.length, completed: done.filter(l => s.done[l.id][1]).length,
        completion: set ? done.length/set*100 : 0, avg: avg === "" ? "" : Math.round(avg),
        missed: g.lessons.filter(l => !s.done[l.id]) });
    });
  });
  return out;
}
const yearNum = y => parseInt(String(y).replace(/\D/g,""), 10) || 0;
const clsCmp = (a,b) => parseInt(a) - parseInt(b) || String(a).localeCompare(String(b));

function options(list, val, all){ return (all ? [`<option value="All">${all}</option>`] : []).concat(list.map(v => `<option ${v===val?"selected":""}>${esc(v)}</option>`)).join(""); }

/* ---------- report (styled like the EduGhaf Teacher Report) ---------- */
const BAND_STYLE = {
  exceeding: {bg:"#1F4D3A", fg:"#FFFFFF", tint:"#DCEBE3", tfg:"#123326"},
  meeting:   {bg:"#5FA48C", fg:"#0E2A20", tint:"#E8F3EE", tfg:"#1D4A3B"},
  towards:   {bg:"#E8B547", fg:"#3D2C05", tint:"#FBF0D6", tfg:"#5C4307"},
  below:     {bg:"#B4471F", fg:"#FFFFFF", tint:"#F8DED3", tfg:"#7A2810"}
};
const pill = b => b ? `<span class="rp-pill" style="background:${BAND_STYLE[b.k].bg};color:${BAND_STYLE[b.k].fg}">${b.name}</span>` : `<span class="rp-pill none">No work yet</span>`;
const cell = (v, href, title) => { if(v == null) return `<span class="rp-cell none" title="Not started">—</span>`; const b = bandOf(v[0]), st = BAND_STYLE[b.k];
  const inner = `<span class="rp-cell${v[1] ? "" : " prog"}" style="background:${st.tint};color:${st.tfg}" title="${esc(title)}">${v[0]}</span>`;
  return href ? `<a href="${href}" class="rp-a">${inner}</a>` : inner; };

function navBar(){
  const me = DATA.me || {}, leader = me.role === "leader";
  const t = (k, label) => `<button type="button" class="rp-tab" data-tab="${k}" aria-current="${tab === k}">${label}</button>`;
  return `<header class="rp-bar"><div class="rp-in">
    <div class="rp-brand"><img src="images/logo.svg" alt=""><div><b>EduGhaf</b><span>Staff · Progress reports</span></div></div>
    <nav class="rp-nav" aria-label="Staff menu">${t("reports","Reports")}${t("students", leader ? "Class lists" : "My students")}${leader ? t("staff","Staff accounts") + t("settings","Settings") : ""}
      <a class="rp-tab" href="#">Lessons</a><span class="rp-sep"></span>
      <span class="rp-me">${esc(me.name || "")}${me.code ? " · " + esc(me.code) : ""}</span>
      <button type="button" class="rp-out" id="sdPw">Password</button><button type="button" class="rp-out" id="sdLock">Sign out</button></nav></div></header>`;
}

function render(app){
  const me = DATA.me || {};
  if(tab !== "reports" && !(tab === "students" || me.role === "leader")) tab = "reports";
  let body = "";
  if(tab === "reports") body = reportHTML();
  if(tab === "students") body = `<section class="rp-card" id="sdLists">${classLists()}</section>`;
  if(tab === "staff") body = `<section class="rp-card" id="sdStaff">${staffPanel()}</section>`;
  if(tab === "settings") body = settingsPanel();
  app.innerHTML = navBar() + `<div class="rp-main">${body}</div>`;
  const $ = s => app.querySelector(s);
  app.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; render(app); });
  $("#sdLock").onclick = () => { const wasSample = DATA.sample; DATA = null; F = null; listCls = ""; editing = null; issued = null; tab = "reports"; if(wasSample) return lock(app); Auth.logout(); };
  $("#sdPw").onclick = () => { if(DATA.sample) return toast("Preview only."); Auth.changeForm(() => { location.hash = "teacher"; document.body.classList.add("staff"); render(app); }, false); };
  if(tab === "reports") wireReport(app);
  if(tab === "students") wireLists(app);
  if(tab === "staff") wireStaff(app);
  if(tab === "settings") wireSettings(app);
}

function reportHTML(){
  const inTerm = DATA.groups.filter(g => g.term === F.term);
  const years = [...new Set(inTerm.map(g => g.year))].sort((a,b) => yearNum(a)-yearNum(b));
  if(F.year !== "All" && !years.includes(F.year)) F.year = "All";
  const classes = [...new Set(inTerm.filter(g => F.year === "All" || g.year === F.year).map(g => g.cls))].sort(clsCmp);
  if(F.cls !== "All" && !classes.includes(F.cls)) F.cls = "All";
  const subs = DATA.me && DATA.me.subjects.length ? DATA.me.subjects : SUBJECTS;
  const R = rows(), withAvg = R.filter(r => r.avg !== "");
  const counts = {}; BANDS.forEach(b => counts[b.k] = withAvg.filter(r => bandOf(r.avg) === b).length);
  const classAvg = withAvg.length ? Math.round(withAvg.reduce((a,r) => a + r.avg, 0)/withAvg.length) : "";
  const possible = R.reduce((a,r) => a + r.set, 0), done = R.reduce((a,r) => a + r.attempted, 0);
  const lessonCount = [...new Set(R.map(r => r.g))].reduce((a,g) => a + g.lessons.length, 0);
  const follow = R.filter(r => (r.avg !== "" && r.avg < 40) || r.set - r.attempted >= 3).length;
  const yr = F.cls !== "All" ? "Year " + parseInt(F.cls) : F.year === "All" ? "All year groups" : F.year;
  const title = [yr, F.subject === "All" ? "All subjects" : F.subject, F.cls === "All" ? "All classes" : "Class " + F.cls].join(" · ");
  const order = ["exceeding","meeting","towards","below"].map(k => BANDS.find(b => b.k === k));
  const sel = (id, label, list, val, all) => `<div class="rp-f"><label for="${id}">${label}</label><select id="${id}">${options(list, val, all)}</select></div>`;
  return `
  <div class="rp-head"><div><span class="rp-eyebrow">${esc(F.term)} report · 2026–27</span><h1>${esc(title)}</h1>
    <p>Lesson completion and average score per student, reported in the four MOE / KHDA bands.${DATA.sample ? ` <b class="rp-demo">Demo data — sample students.</b>` : ""}</p></div>
    <div class="rp-btns"><button type="button" class="rp-btn" id="sdRefresh">Refresh</button><button type="button" class="rp-btn" id="sdCsv">Download CSV</button><button type="button" class="rp-btn solid" id="sdPrint">Export term report (PDF)</button></div></div>
  <form class="rp-card rp-filters" onsubmit="return false">
    ${sel("fTerm","Term",["Term 1","Term 2","Term 3"],F.term)}
    ${sel("fYear","Year group",years,F.year,"All year groups")}
    ${sel("fSub","Subject",subs,F.subject,subs.length === 1 ? "" : "All subjects")}
    ${sel("fCls","Class",classes,F.cls,"All classes")}
    <div class="rp-f wide"><label for="sdQ">Find a student</label><input id="sdQ" type="search" placeholder="Name or M Number" value="${esc(query)}"></div>
  </form>
  ${R.length ? `
  <section class="rp-kpis" aria-label="Class summary">
    <div class="rp-card rp-kpi"><span class="l">${F.cls === "All" ? "Average" : "Class average"}</span><span class="v">${classAvg === "" ? "–" : classAvg + "%"}</span><span class="s">Band: <b>${classAvg === "" ? "no work yet" : bandOf(classAvg).name}</b></span></div>
    <div class="rp-card rp-kpi"><span class="l">Lessons completed</span><span class="v">${possible ? Math.round(done/possible*100) : 0}%</span><span class="s">${done} of ${possible} student-lessons</span></div>
    <div class="rp-card rp-kpi"><span class="l">Students</span><span class="v">${new Set(R.map(r => r.m)).size}</span><span class="s">${lessonCount} lesson${lessonCount === 1 ? "" : "s"} published this term</span></div>
    <div class="rp-card rp-kpi warn"><span class="l">Need follow-up</span><span class="v">${follow}</span><span class="s">Below band or 3+ lessons missing</span></div>
  </section>
  <section class="rp-card"><h2>Band distribution</h2>
    <div class="rp-dist" aria-hidden="true">${order.map(b => counts[b.k] ? `<div style="background:${BAND_STYLE[b.k].bg};flex:${counts[b.k]} 1 0;min-width:8px"></div>` : "").join("") || `<div style="background:#E6EAE5;flex:1"></div>`}</div>
    <div class="rp-legend">${order.map(b => `<div><span class="sw" style="background:${BAND_STYLE[b.k].bg}"></span><div><b>${b.name} · ${counts[b.k]}</b><span>${b.range}</span></div></div>`).join("")}
      ${R.length - withAvg.length ? `<div><span class="sw" style="background:#E6EAE5"></span><div><b>No work yet · ${R.length - withAvg.length}</b><span>not in the average</span></div></div>` : ""}</div></section>
  <section class="rp-card"><div class="rp-th"><h2>Students</h2><span>${DATA.zeroForMissed ? "Missed lessons count as 0%" : "Average is taken over lessons started"} · — = not started${F.cls !== "All" && F.subject !== "All" ? " · click a score to open the student's work" : ""}</span></div>
    <div class="rp-scroll" id="sdTable"></div></section>` : `
  <section class="rp-card"><h2>No results yet for ${esc(title)}</h2><p class="small">Results appear as soon as students work through a lesson while signed in. Try another term or class.</p></section>`}
  <p class="rp-foot">Bands: Below 0–39 · Working towards 40–59 · Meeting 60–79 · Exceeding 80–100. Teachers see only the students on their own timetable; missing students can be added under <a href="#teacher" data-tab="students">${DATA.me && DATA.me.role === "leader" ? "Class lists" : "My students"}</a>.</p>`;
}

function wireReport(app){
  const $ = s => app.querySelector(s);
  $("#fTerm").onchange = e => { F.term = e.target.value; render(app); };
  $("#fYear").onchange = e => { F.year = e.target.value; F.cls = "All"; render(app); };
  $("#fCls").onchange = e => { F.cls = e.target.value; render(app); };
  $("#fSub").onchange = e => { F.subject = e.target.value; render(app); };
  $("#sdRefresh").onclick = () => DATA.sample ? render(app) : call(app, {action:"data"});
  $("#sdPrint").onclick = () => window.print();
  $("#sdCsv").onclick = () => csv(rows());
  $("#sdQ").oninput = e => { query = e.target.value; table(app); };
  app.querySelectorAll(".rp-foot [data-tab]").forEach(a => a.onclick = e => { e.preventDefault(); tab = "students"; render(app); });
  table(app);
}

/* One class + one subject: lesson-by-lesson grid. Otherwise: one row per student per class and subject. */
function table(app){
  const box = app.querySelector("#sdTable"); if(!box) return;
  const q = query.trim().toLowerCase();
  const R = rows().filter(r => !q || r.name.toLowerCase().includes(q) || r.m.toLowerCase().includes(q));
  const g = F.cls !== "All" && F.subject !== "All" ? DATA.groups.find(x => x.term === F.term && x.cls === F.cls && x.subject === F.subject) : null;
  if(g){
    const L = g.lessons;
    box.innerHTML = `<table class="rp-table" style="min-width:${560 + L.length*46}px"><thead><tr><th>Student</th><th>M Number</th>${L.map((l,i) => `<th class="c" title="${esc(l.title)}${l.date ? " · " + esc(l.date) : ""}">L${i+1}</th>`).join("")}<th class="c">Done</th><th class="c">Average</th><th>Band</th></tr></thead><tbody>${
      R.sort((a,b) => a.name.localeCompare(b.name)).map(r => { const s = g.students.find(x => x.m === r.m) || {done:{}};
        return `<tr><td class="nm">${esc(r.name)}${r.onRoster ? "" : ` <span class="flag">check M Number</span>`}</td><td class="mn">${esc(r.m)}</td>${L.map(l => `<td class="c">${cell(s.done[l.id], !DATA.sample && l.key ? `#view/${esc(r.m)}/${esc(l.key)}` : "", l.title + (s.done[l.id] ? (s.done[l.id][1] ? " · completed" : " · in progress, steps " + s.done[l.id][2]) : ""))}</td>`).join("")}
          <td class="c mn">${r.attempted}/${r.set}</td><td class="c avg">${r.avg === "" ? "–" : r.avg + "%"}</td><td>${pill(bandOf(r.avg))}</td></tr>`; }).join("") || `<tr><td colspan="${L.length + 5}" class="small">No students match.</td></tr>`}</tbody></table>
      <p class="small rp-key">${L.map((l,i) => `<b>L${i+1}</b> ${esc(l.title)}`).join(" · ")}</p>`;
    return;
  }
  box.innerHTML = `<table class="rp-table" style="min-width:860px"><thead><tr><th>Student</th><th>M Number</th><th>Class</th><th>Subject</th><th class="c">Done</th><th class="c">Average</th><th>Band</th><th>Not attempted yet</th></tr></thead><tbody>${
    R.sort((a,b) => clsCmp(a.cls,b.cls) || SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.name.localeCompare(b.name)).map(r => `<tr>
      <td class="nm"><a href="#teacher" data-go="${esc(r.cls)}|${esc(r.subject)}">${esc(r.name)}</a>${r.onRoster ? "" : ` <span class="flag">check M Number</span>`}</td><td class="mn">${esc(r.m)}</td><td>${esc(r.cls)}</td><td>${esc(r.subject)}</td>
      <td class="c mn">${r.attempted}/${r.set}</td><td class="c avg">${r.avg === "" ? "–" : r.avg + "%"}</td><td>${pill(bandOf(r.avg))}</td>
      <td class="missed">${r.missed.length ? r.missed.map(l => esc(l.title)).join(" · ") : `<span class="small">All done</span>`}</td></tr>`).join("")
    || `<tr><td colspan="8" class="small">No students match.</td></tr>`}</tbody></table>`;
  box.querySelectorAll("[data-go]").forEach(a => a.onclick = e => { e.preventDefault(); const [c, s] = a.dataset.go.split("|"); F.cls = c; F.subject = s; F.year = "Year " + parseInt(c); render(app); });
}

/* ---------- Settings (leaders): class password, term dates, average rule, school list, backup ---------- */
function settingsPanel(){
  const st = DATA.settings || {studentPassword:"", terms: DATA.terms || {}, zeroForMissed: DATA.zeroForMissed};
  return `<section class="rp-card sd-admin"><h2>Student sign-in</h2>
    <p class="small">Students sign in with their M Number and this class password the first time, then choose their own password. If a student forgets theirs, press <b>Reset password</b> next to their name under Class lists: they can then use this class password again.</p>
    <div class="grid3"><label>Class password<input id="stPass" type="text" value="${esc(st.studentPassword)}" spellcheck="false" maxlength="40"></label></div></section>
  <section class="rp-card sd-admin"><h2>Terms and averages</h2>
    <p class="small">Each lesson is placed in a term by its lesson date.</p>
    <div class="grid3">${["Term 1","Term 2","Term 3"].map((t,i) => `<label>${t} starts<input id="stT${i}" type="date" value="${esc((st.terms || {})[t] || "")}"></label>`).join("")}</div>
    <label class="chk"><input id="stZero" type="checkbox" ${st.zeroForMissed ? "checked" : ""}> Missed lessons count as 0% in the average</label>
    <div class="row"><button class="btn" type="button" id="stSave">Save settings</button></div></section>
  <section class="rp-card sd-admin"><h2>School student list</h2>
    <p class="small">Upload the master student list as an Excel file (File → Download → Microsoft Excel in Google Sheets). One tab per year with the headings M Number, Name, Section, ME/ Lit (+ teacher), SS/MSC (+ teacher) and Literacy/ Islamic Teacher. Students added by teachers are kept. Last import: <b>${esc(DATA.lastImport || "not yet")}</b>.</p>
    <div class="row"><input type="file" id="stFile" accept=".xlsx,.xls,.csv"><button class="btn alt" type="button" id="stImport">Import list</button></div><p class="sd-msg" id="stMsg"></p></section>
  <section class="rp-card sd-admin"><h2>Backup</h2>
    <p class="small">Download everything (accounts, class lists, every student's saved work and results) as one file. Cloudflare also keeps 30 days of automatic restore points for the database (Time Travel).</p>
    <div class="row"><button class="btn alt" type="button" id="stBackup">Download full backup</button></div></section>`;
}
function wireSettings(app){
  const $ = s => app.querySelector(s);
  $("#stSave").onclick = () => { if(DATA.sample) return toast("Preview only.");
    call(app, {action:"saveSettings", settings:{studentPassword: $("#stPass").value, zeroForMissed: $("#stZero").checked,
      terms: {"Term 1": $("#stT0").value, "Term 2": $("#stT1").value, "Term 3": $("#stT2").value}}}); };
  $("#stBackup").onclick = async () => { if(DATA.sample) return toast("Preview only.");
    try{ const d = await api({action:"backup"}); if(!d.ok) return toast(d.message);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d.backup)], {type:"application/json"}));
      a.download = "EduGhaf-backup-" + new Date().toISOString().slice(0,10) + ".json"; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
    }catch(e){ toast("Couldn't download the backup."); } };
  $("#stImport").onclick = async () => { const f = $("#stFile").files[0], m = $("#stMsg"); if(!f){ m.textContent = "Choose the Excel file first."; return; }
    if(DATA.sample){ m.textContent = "Preview only."; return; }
    m.textContent = "Reading the file…";
    try{ const r = await readMasterList(f); if(!r.students.length){ m.textContent = "No students found. Check each year tab has M Number, Name and Section headings."; return; }
      m.textContent = "Importing " + r.students.length + " students…"; call(app, {action:"importRoster", students: r.students, legend: r.legend});
    }catch(e){ m.textContent = "Couldn't read that file: " + e.message; } };
}

/* The master list: one tab per year ("Year 7" …). Same rules as the old Google Sheet import. */
async function readMasterList(file){
  if(!window.XLSX) await new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = ok; s.onerror = () => no(new Error("couldn't load the Excel reader")); document.head.appendChild(s); });
  const wb = XLSX.read(await file.arrayBuffer(), {type:"array"});
  const codesOf = v => [...new Set(String(v||"").toUpperCase().split(/[\/,;&+\s]+/).map(x => x.trim()).filter(x => /^[A-Z]{2,4}$/.test(x) && x !== "NA"))];
  const mNo = v => { const m = String(v||"").trim().toUpperCase().replace(/\s+/g,"").match(/^M?(\d{3,7})$/); return m ? "M" + m[1] : ""; };
  const clsOf = sec => { const m = String(sec||"").toUpperCase().replace(/\s+/g,"").match(/^Y?(\d{1,2})([A-Z])/); return m ? m[1] + m[2] : ""; };
  const students = [], legend = {};
  wb.SheetNames.forEach(n => {
    if(!/year\s*\d+/i.test(n) && wb.SheetNames.length > 1) return;
    const v = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, raw:false, defval:""}).map(r => r.map(c => String(c)));
    const hr = v.findIndex(r => r.some(c => /^name$/i.test(c.trim())) && r.some(c => /^section$/i.test(c.trim()))); if(hr < 0) return;
    const H = v[hr].map(c => c.replace(/\s+/g,"").toLowerCase()), col = re => H.findIndex(h => re.test(h));
    let cM = col(/^mnumber$/); const cName = col(/^name$/), cSec = col(/^section$/), cMel = col(/^me\/?lit$/), cSsm = col(/^ss\/?msc$/), cLi = col(/^literacy\/?islamicteacher$/);
    if(cM < 0) cM = 0;
    for(let i = hr + 1; i < v.length; i++){ const r = v[i];
      for(let c = 0; c < r.length - 1; c++){ const code = r[c].trim().toUpperCase(), nm = r[c+1].trim(); if(/^[A-Z]{2,4}$/.test(code) && /^(ms|mr|mrs|miss|dr)\b/i.test(nm)) legend[code] = nm.replace(/\s+/g," "); }
      const m = mNo(r[cM]); if(!m) continue;
      const sub = {msc:[], ss:[], me:[], lit:[]};
      const mel = cMel >= 0 ? r[cMel].trim().toLowerCase() : "", melT = cMel >= 0 ? codesOf(r[cMel+1]) : [];
      if(mel === "lit") sub.lit = sub.lit.concat(melT); else if(mel === "me") sub.me = melT;
      const ssm = cSsm >= 0 ? r[cSsm].trim().toLowerCase() : "", ssmT = cSsm >= 0 ? codesOf(r[cSsm+1]) : [];
      if(ssm === "msc") sub.msc = ssmT; else if(ssm === "ss") sub.ss = ssmT;
      if(cLi >= 0) sub.lit = [...new Set(sub.lit.concat(codesOf(r[cLi])))];
      const sec = String(r[cSec] || "").trim();
      students.push([m, r[cName], clsOf(sec), sec, sub.msc.join(", "), sub.ss.join(", "), sub.me.join(", "), sub.lit.join(", ")]);
    }
  });
  return {students, legend};
}
function csv(R){
  const head = ["Term","Year","Class","Subject","M Number","Student","On school list","Lessons set","Lessons attempted","Lessons completed","Completion %","Term %","Band","Not attempted yet"];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
  const lines = [head].concat(R.map(r => [F.term, r.year, r.cls, r.subject, r.m, r.name, r.onRoster ? "Yes" : "Check M Number", r.set, r.attempted, r.completed,
    Math.round(r.completion), r.avg, bandOf(r.avg) ? bandOf(r.avg).name : "No work yet", r.missed.map(l => l.title).join(" · ")])).map(r => r.map(q).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], {type:"text/csv;charset=utf-8"});
  const name = ["EduGhaf", F.term, F.cls === "All" ? (F.year === "All" ? "all-years" : F.year) : F.cls, F.subject === "All" ? "all-subjects" : F.subject].join("_").replace(/\s+/g,"-") + ".csv";
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- Staff accounts (leaders only) ---------- */
function allClasses(){
  const Y = window.COMPASS_YEARS || {};
  const out = Object.keys(Y).map(y => ({year: y, classes: Y[y].classes || []}));
  const known = new Set(out.flatMap(x => x.classes));
  const extra = [...new Set((DATA.staff || []).flatMap(a => a.classes).concat(myClasses()))].filter(c => !known.has(c));
  if(extra.length) out.push({year: "Other", classes: extra});
  return out;
}
function suggestUser(name){ const p = String(name||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z\s-]/g,"").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p.length > 1 ? p[0] + "." + p[p.length-1] : p[0]) : ""; }
function genPass(){
  const w = ["maple","river","cedar","falcon","harbor","lantern","meadow","orbit","pebble","quartz","saffron","tundra","violet","willow","zephyr","amber","basalt","coral","dune","ember","fjord","glacier","jasmine","kestrel","lagoon","mosaic","nectar","oasis","prairie","summit"];
  const r = n => { try{ const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }catch(e){ return Math.floor(Math.random()*n); } };
  return w[r(w.length)] + "-" + w[r(w.length)] + "-" + (10 + r(90));
}
function staffPanel(){
  const list = DATA.staff || [], me = DATA.me;
  const rowsH = list.map(a => `<tr>
    <td class="nm">${esc(a.name || a.user)}${a.user === me.user ? ` <span class="small">(you)</span>` : ""}</td>
    <td><code>${esc(a.user)}</code></td>
    <td>${a.code ? `<code>${esc(a.code)}</code>` : "–"}</td>
    <td><span class="bchip ${a.role === "Leader" ? "b-exceeding" : "b-none"}">${a.role}</span></td>
    <td class="num">${a.role === "Leader" ? `<span class="small">All</span>` : a.students + (a.classes.length ? ` <span class="small">+ ${esc(a.classes.join(", "))}</span>` : "")}</td>
    <td>${!a.hasPass ? `<span class="flag">Not set</span>` : a.waiting ? "Starting password" : "Own password"}</td>
    <td class="acts"><button class="btn sm alt" type="button" data-edit="${esc(a.user)}">${a.hasPass ? "Edit" : "Set password"}</button>${a.user === me.user ? "" : `<button class="x" type="button" data-del="${esc(a.user)}" aria-label="Delete ${esc(a.name || a.user)}" title="Delete account">×</button>`}</td></tr>`).join("");
  const waiting = list.filter(a => !a.hasPass).length;
  return `<div class="sd-ph"><h2>Staff accounts</h2><span class="small">Only leaders see this. One login per teacher code from the school list; each teacher sees only their students.</span></div>
    <div class="row sd-import"><span class="small">School list: ${esc(DATA.lastImport || "not imported yet")}</span><button class="btn sm alt" type="button" id="acImport">Upload the school list</button></div>
    ${waiting ? `<p class="small">${waiting} teacher${waiting===1?" has":"s have"} no password yet, so can't sign in. Use <b>Set password</b> to give a starting password, then share the login: they choose their own password the first time they sign in.</p>` : ""}
    ${issued ? `<div class="sd-issued" role="status"><b>Login for ${esc(issued.name)}</b><span>Username <code>${esc(issued.user)}</code> · Password <code>${esc(issued.pass)}</code></span>
      <span class="small">Share it privately. This is a starting password: they'll choose their own the first time they sign in.</span>
      <div class="row"><button class="btn sm" type="button" id="acCopy">Copy login</button><button class="btn sm alt" type="button" id="acDone">Done</button></div></div>` : ""}
    <div class="sd-issued" style="background:#F1F4EF;border-color:#C7D0C9"><b>One starting password for all teachers</b>
      <span class="small">Sets the same starting password for every teacher who hasn't chosen their own yet (${list.filter(a => a.role !== "Leader" && (!a.hasPass || a.waiting)).length} now). Each teacher must choose their own the first time they sign in. Put this password in the staff email.</span>
      <div class="row"><input id="acAll" type="text" value="Welcome2026!" spellcheck="false" maxlength="40" style="font:inherit;font-size:16px;padding:8px 12px;border:1.5px solid #C7D0C9;border-radius:10px;max-width:220px"><button class="btn sm" type="button" id="acAllGo">Set for all teachers</button></div></div>
    ${editing ? accountForm() : `<div class="row"><button class="btn" type="button" id="acNew">+ Add a staff login</button></div>`}
    <div class="tscroll"><table class="sd-table sd-staff"><thead><tr><th>Name</th><th>Username</th><th>Code</th><th>Role</th><th>Students</th><th>Password</th><th></th></tr></thead><tbody>${rowsH || `<tr><td colspan="7" class="small">No accounts yet.</td></tr>`}</tbody></table></div>`;
}
function accountForm(){
  const a = editing, isNew = !a.orig, self = a.orig && a.orig === DATA.me.user;
  const codes = [...new Set((DATA.staff || []).map(x => x.code).filter(Boolean))].sort();
  return `<form class="sd-acct" id="acForm" novalidate>
    <h3>${isNew ? "New staff login" : (a.hasPass ? "Edit " : "Set a password for ") + esc(a.name || a.orig)}</h3>
    <div class="grid2">
      <label>Full name<input id="acName" type="text" value="${esc(a.name)}" autocomplete="off" maxlength="80" required></label>
      <label>Username<input id="acUser" type="text" value="${esc(a.user)}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="40" ${self ? "readonly" : ""} required></label>
    </div>
    <label>Teacher code <span class="small">from the school list, e.g. PLO. Their students come from this code.</span>
      <input id="acCode" type="text" value="${esc(a.code)}" list="acCodes" autocomplete="off" spellcheck="false" maxlength="4" style="text-transform:uppercase;max-width:140px">
      <datalist id="acCodes">${codes.map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
    <fieldset class="sd-role" ${self ? "disabled" : ""}><legend>Role</legend>
      <label><input type="radio" name="acRole" value="Teacher" ${a.role !== "Leader" ? "checked" : ""}> Teacher <span class="small">sees only their own students</span></label>
      <label><input type="radio" name="acRole" value="Leader" ${a.role === "Leader" ? "checked" : ""}> Leader <span class="small">sees every class and manages logins</span></label></fieldset>
    <fieldset class="sd-classes" id="acClasses" ${a.role === "Leader" ? "hidden" : ""}><legend>Whole classes <span class="small">optional, e.g. for a head of year: every student in these classes</span></legend>
      ${allClasses().map(g => `<div class="cl-year"><span class="small">${g.year === "Other" ? "Other" : "Year " + esc(g.year)}</span>${g.classes.map(c => `<label class="cl"><input type="checkbox" value="${esc(c)}" ${a.classes.includes(c) ? "checked" : ""}><span>${esc(c)}</span></label>`).join("")}</div>`).join("")}</fieldset>
    <label>Password ${isNew || !a.hasPass ? "" : `<span class="small">leave blank to keep the current one</span>`}
      <span class="row"><input id="acPass" type="text" value="${esc(a.pass || "")}" autocomplete="new-password" spellcheck="false" placeholder="At least 8 characters"><button class="btn sm alt" type="button" id="acGen">Generate</button></span></label>
    <p class="sd-msg" id="acMsg" role="status"></p>
    <div class="row"><button class="btn" type="submit">${isNew ? "Create login" : "Save"}</button><button class="btn alt" type="button" id="acCancel">Cancel</button></div>
  </form>`;
}
function wireStaff(app){
  const box = app.querySelector("#sdStaff"); if(!box || !box.querySelectorAll) return;
  const again = () => { box.innerHTML = staffPanel(); wireStaff(app); };
  const q = s => app.querySelector(s);
  const im = q("#acImport"); if(im) im.onclick = () => { tab = "settings"; render(app); };
  const ag = q("#acAllGo"); if(ag) ag.onclick = () => { if(DATA.sample) return toast("Preview only."); const v = q("#acAll").value.trim();
    if(v.length < 8) return toast("The starting password needs at least 8 characters.");
    if(confirm(`Set "${v}" as the starting password for every teacher who hasn't chosen their own yet?`)) call(app, {action:"setStartingAll", pass: v}); };
  const nb = q("#acNew"); if(nb) nb.onclick = () => { issued = null; editing = {name:"", user:"", code:"", role:"Teacher", classes:[], pass: genPass(), hasPass:false}; again(); const n = q("#acName"); n && n.focus && n.focus(); };
  box.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { const a = DATA.staff.find(x => x.user === b.dataset.edit); issued = null;
    editing = {orig:a.user, name:a.name, user:a.user, code:a.code, role:a.role, classes:a.classes.slice(), hasPass:a.hasPass, pass: a.hasPass ? "" : genPass()}; again(); });
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const a = DATA.staff.find(x => x.user === b.dataset.del);
    if(confirm(`Delete the login for ${a.name || a.user}? They won't be able to sign in. Their students and results stay.`)) saveAccount(app, "deleteStaff", {username: a.user}); });
  const cp = q("#acCopy"); if(cp) cp.onclick = () => { const t = `EduGhaf staff login\n${location.href.split("#")[0]}#teacher\nUsername: ${issued.user}\nStarting password: ${issued.pass}\nYou'll choose your own password when you first sign in.`;
    try{ navigator.clipboard.writeText(t).then(() => toast("Login copied."), () => toast("Couldn't copy. Select and copy the text instead.")); }catch(e){ toast("Couldn't copy. Select and copy the text instead."); } };
  const dn = q("#acDone"); if(dn) dn.onclick = () => { issued = null; again(); };
  const f = q("#acForm"); if(!f || !editing) return;
  const read = () => { const role = (box.querySelector('input[name="acRole"]:checked') || {}).value || editing.role;
    Object.assign(editing, {name: q("#acName").value.trim(), user: q("#acUser").value.trim().toLowerCase(), code: q("#acCode").value.trim().toUpperCase(), role, pass: q("#acPass").value.trim(),
      classes: [...box.querySelectorAll("#acClasses input:checked")].map(i => i.value)}); };
  let userTouched = !!editing.orig;
  q("#acUser").oninput = () => { userTouched = true; };
  q("#acName").oninput = () => { if(!userTouched) q("#acUser").value = suggestUser(q("#acName").value); };
  box.querySelectorAll('input[name="acRole"]').forEach(r => r.onchange = () => { q("#acClasses").hidden = r.value === "Leader" && r.checked; });
  q("#acGen").onclick = () => { q("#acPass").value = genPass(); };
  q("#acCancel").onclick = () => { editing = null; again(); };
  f.onsubmit = e => { e.preventDefault(); read(); const m = q("#acMsg");
    const err = !editing.name ? "Enter the teacher's full name." : !/^[a-z0-9._-]{2,40}$/.test(editing.user) ? "Username: 2–40 letters, numbers, dots or dashes, no spaces."
      : editing.code && !/^[A-Z]{2,4}$/.test(editing.code) ? "A teacher code is 2–4 letters, e.g. PLO."
      : editing.pass && editing.pass.length < 8 ? "Passwords need at least 8 characters." : (!editing.orig || !editing.hasPass) && !editing.pass ? "Set a password (or press Generate)."
      : editing.role === "Teacher" && !editing.code && !editing.classes.length ? "Enter their teacher code, or tick at least one whole class." : "";
    if(err){ m.textContent = err; return; }
    m.textContent = "Saving…";
    saveAccount(app, "saveStaff", {account: {orig: editing.orig || "", user: editing.user, name: editing.name, code: editing.code, role: editing.role,
      classes: editing.role === "Leader" ? [] : editing.classes, pass: editing.pass}}); };
}
function saveAccount(app, action, extra){
  if(!DATA.sample) return call(app, Object.assign({action}, extra));
  const L = DATA.staff;   // preview only: change the sample in the browser
  if(action === "deleteStaff"){ DATA.staff = L.filter(x => x.user !== extra.username); toast("Login deleted (preview only)."); }
  else { const a = extra.account, i = L.findIndex(x => x.user === (a.orig || a.user));
    if(!a.orig && i >= 0){ const m = app.querySelector("#acMsg"); if(m) m.textContent = "The username " + a.user + " is already taken."; return; }
    const row = {user:a.user, name:a.name, code:a.code, role:a.role, classes:a.classes, hasPass: true, students: i >= 0 ? L[i].students : 0};
    if(i >= 0) L[i] = row; else L.push(row);
    if(a.pass) issued = {name:a.name, user:a.user, pass:a.pass}; editing = null; toast((i >= 0 ? "Saved " : "Created ") + a.name + " (preview only)."); }
  render(app);
}

/* Made-up classes for the preview button (shown only before the Sheet is connected). */
function sample(){
  const first = ["Aisha","Omar","Lina","Yousef","Maya","Khalid","Sara","Adam","Noor","Hamad","Layla","Rayan","Fatima","Zaid","Hana","Ibrahim","Mariam","Sami"];
  const last = ["Ahmed","Bakri","Chaudhry","Daher","Haddad","Khoury","Mansour","Nasser","Rahman","Saleh"];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let mn = 8100; const students = [];
  const mk = (cls, subject, titles, n, code) => { const year = "Year " + parseInt(cls);
    const lessons = titles.map((t,i) => ({id:"l"+i, title:t, date:""}));
    const list = Array.from({length:n}, (_,i) => { const lvl = 25 + rnd()*75, done = {}, m = "M" + (mn += 7);
      lessons.forEach(l => { if(rnd() < 0.82){ const p = Math.max(5, Math.min(100, Math.round(lvl + (rnd()-0.5)*30))); done[l.id] = [p, rnd() < 0.8 ? 1 : 0, "7/10"]; } });
      const name = first[(i*5 + cls.charCodeAt(1)) % first.length] + " " + last[(i*3 + parseInt(cls)) % last.length];
      students.push({m, name, cls, subject, teachers:[code], addedBy:""});
      return {m, name, onRoster: true, done}; });
    return {term:"Term 1", year, cls, subject, lessons, students: list}; };
  const msc = ["Healthy lifestyles","Media and me","Rights and duties","Giving in the UAE","Community heroes"];
  const lit = ["Unit 1 Week 1 READ","Unit 1 Week 1 WORDS","Unit 1 Week 1 WRITE","Unit 1 Week 2 READ"];
  const groups = [mk("7A","MSC",msc,16,"SAY"), mk("7B","MSC",msc,15,"PLO"), mk("7A","Literacy",lit,14,"AEL")];
  groups[0].students.push({m:"M11999", name:"Yusuf Al Amri", onRoster:false, done:{l0:[64,1,"10/10"], l1:[58,0,"6/10"]}});
  students.sort((a,b) => a.name.localeCompare(b.name));
  return {ok:true, sample:true, updated:new Date().toISOString(), zeroForMissed:false, students, groups,
    me:{user:"sample.leader", name:"Sample Leader", role:"leader", code:"", classes:["7A","7B"], subjects:SUBJECTS.slice()},
    lastImport: "sample · 45 students",
    staff:[{user:"sample.leader", name:"Sample Leader", code:"", role:"Leader", classes:[], hasPass:true, students:0},
      {user:"say", name:"Sara Ayoub", code:"SAY", role:"Teacher", classes:[], hasPass:true, students:16},
      {user:"plo", name:"Premraj Loganathan", code:"PLO", role:"Teacher", classes:[], hasPass:false, students:15},
      {user:"ael", name:"Amany Elgwely", code:"AEL", role:"Teacher", classes:[], hasPass:false, students:14}],
    terms:{"Term 1":"2000-01-01","Term 2":"2999-01-01","Term 3":"2999-06-01"} };
}

window.Teacher = { show, leave(){ document.body.classList.remove("staff"); } };
})();
