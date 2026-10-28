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
let issuedStudent = null, detail = null, ACCTS = null, acctQ = "", acctCls = "", acctWaiting = false;
let DATA = null, F = null, sortBy = {col:"cls", dir:1}, query = "", onlyMissed = false, loading = false, listCls = "";

function show(app, crumbs){
  crumbs([["Staff dashboard"]]);
  document.body.classList.add("staff");
  app.setAttribute("data-unit","msc");
  const A = window.Auth && Auth.me;
  if(!A) return Auth.page(app, "teacher", "Staff: sign in with your teacher code (e.g. PLO) to see your students' progress.");
  if(A.role === "student"){ app.innerHTML = `<section class="panel staff-lock"><span class="eyebrow">Staff only</span><h1>Staff dashboard</h1><p>This page is for teachers. <a href="#">Go to your lessons →</a></p></section>`; return; }
  if(DATA && DATA.me && DATA.me.user === A.user) return render(app);
  DATA = null; F = null;
  app.innerHTML = `<section class="panel staff-lock"><span class="eyebrow">Staff dashboard</span><h1>Loading…</h1><p class="small" id="sdMsg"></p></section>`;
  call(app, {action:"data"});
}
function lock(app, msg){ DATA = null; F = null; if(window.Auth) Auth.page(app, "teacher", msg); }
function reset(){ DATA = null; F = null; listCls = ""; editing = null; issued = null; detail = null; ACCTS = null; }

/* Every request to the server: load data, add or remove a student, manage accounts. */
async function post(body){
  const r = await fetch("/api/staff", {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  let d = null; try{ d = await r.json(); }catch(e){}
  if(!d) throw new Error("Couldn't reach EduGhaf. Check the connection.");
  return d;
}
async function call(app, body){
  if(loading) return; loading = true;
  if(DATA) setBusy(app, true);
  const hadAccts = !!ACCTS;
  try{
    const d = await post(Object.assign({term: F ? F.term : undefined}, body));
    loading = false;
    if(!d.ok){
      if(d.error === "signin") return lock(app, "Your session ended. Sign in again.");
      if(d.error === "change") return Auth.passwordPage(app, "teacher", true);
      if(DATA){ setBusy(app, false); const m2 = app.querySelector("#acMsg"); if(m2 && body.action === "saveStaff") m2.textContent = d.message;
        const m3 = app.querySelector("#saMsg"); if(m3) m3.textContent = d.message; return toast(d.message); }
      app.innerHTML = `<section class="panel staff-lock"><h1>Staff dashboard</h1><p>${esc(d.message || "Couldn't load the dashboard.")}</p></section>`; return;
    }
    DATA = d;
    if(body.action === "saveStaff") editing = null;
    if(d.issued){ if(/^M\d+$/i.test(d.issued.user)) issuedStudent = d.issued; else issued = d.issued; }
    if(body.action === "resetPassword" || body.action === "saveStudentAccount" || body.action === "deleteStudentAccount") ACCTS = null;
    if(!F) F = defaults(d); else F.term = d.term || F.term;
    render(app);
    if(hadAccts && !ACCTS) loadAccts(app);
    if(d.message) toast(d.message);
  }catch(e){
    loading = false;
    if(DATA){ setBusy(app, false); toast(e.message); }
    else app.innerHTML = `<section class="panel staff-lock"><h1>Staff dashboard</h1><p>${esc(e.message)}</p></section>`;
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
  return {term: d.term || currentTerm(d.terms), year:"All", cls:"All", subject: subs.length === 1 ? subs[0] : "All"}; }

/* My students: the students linked to the teacher's code, by class and subject, with add / remove. */
function myClasses(){ return (DATA.me && DATA.me.classes) || []; }
let listSub = "";
function classLists(){
  const me = DATA.me || {}, mine = myClasses(), subs = (me.subjects && me.subjects.length) ? me.subjects : SUBJECTS;
  const title = me.role === "leader" ? "Class lists" : "My students";
  if(!mine.length) return `<div class="sd-ph"><h2>${title}</h2></div><p class="small">${me.role === "leader" ? "No students yet. Check the Student list Sheet link on the Settings tab, then press Import now below." : "No students are linked to your teacher code yet. Ask your Head of Teaching &amp; Learning to check your account."}</p>`;
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
    <ul class="sd-roster">${list.map(x => `<li><span>${esc(x.name)}</span><span class="small">${esc(x.m)}${me.role === "leader" ? " · " + esc((x.teachers || []).join(", ")) : ""}${x.shared ? " · shared list" : x.addedBy ? (x.addedBy === me.user ? " · added by you" : " · added") : ""}</span>${canRemove(x) ? `<button class="x" type="button" data-rm="${esc(x.m)}" data-name="${esc(x.name)}" aria-label="Remove ${esc(x.name)}" title="Remove">×</button>` : ""}</li>`).join("") || `<li class="small">No students on this list yet.</li>`}</ul>
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

function render(app){
  const inTerm = DATA.groups.filter(g => g.term === F.term);
  const years = [...new Set(inTerm.map(g => g.year))].sort((a,b) => yearNum(a)-yearNum(b));
  if(F.year !== "All" && !years.includes(F.year)) F.year = "All";
  const classes = [...new Set(inTerm.filter(g => F.year === "All" || g.year === F.year).map(g => g.cls))].sort(clsCmp);
  if(F.cls !== "All" && !classes.includes(F.cls)) F.cls = "All";
  const R = rows();
  const withAvg = R.filter(r => r.avg !== "");
  const counts = BANDS.map(b => withAvg.filter(r => bandOf(r.avg) === b).length);
  const noWork = R.length - withAvg.length;
  const share = i => withAvg.length ? counts[i]/withAvg.length*100 : 0;
  const meetPlus = withAvg.length ? (counts[2]+counts[3])/withAvg.length*100 : 0;
  const avgComp = R.length ? R.reduce((a,r) => a + r.completion, 0)/R.length : 0;
  const avgPct = withAvg.length ? withAvg.reduce((a,r) => a + r.avg, 0)/withAvg.length : "";
  const lessonsTotal = [...new Set(R.map(r => r.g))].reduce((a,g) => a + g.lessons.length, 0);
  const scope = [F.term, F.year === "All" ? "all year groups" : F.year, F.cls === "All" ? "all classes" : F.cls, F.subject === "All" ? "all subjects" : F.subject].join(" · ");
  const upd = new Date(DATA.updated);

  app.innerHTML = `
  <section class="sd-head">
    <div><span class="eyebrow">Staff dashboard${DATA.sample ? ` · <span class="flag">Sample data – not real students</span>` : ""}</span><h1>Progress &amp; achievement</h1>
      <p class="small" id="sdScope">${esc(scope)} · updated ${upd.toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
      ${DATA.me ? `<p class="sd-who">Signed in as <b>${esc(DATA.me.name)}</b> · ${DATA.me.code ? esc(DATA.me.code) + " · " : ""}${DATA.me.role === "leader" ? "Leader: all classes" : esc((DATA.me.classes.join(", ") || "no classes yet") + " · " + DATA.me.subjects.join(", "))}</p>` : ""}</div>
    <div class="row sd-actions">
      <button class="btn sm alt" id="sdRefresh" type="button">Refresh</button>
      <button class="btn sm alt" id="sdCsv" type="button">Download CSV</button>
      <button class="btn sm" id="sdPrint" type="button">Print report</button>
      <button class="btn sm alt" id="sdLock" type="button">Sign out</button>
    </div>
  </section>

  <section class="panel sd-filters" aria-label="Filters">
    <label>Term<select id="fTerm">${options(["Term 1","Term 2","Term 3"], F.term)}</select></label>
    <label>Year group<select id="fYear">${options(years, F.year, "All year groups")}</select></label>
    <label>Class<select id="fCls">${options(classes, F.cls, "All classes")}</select></label>
    <label>Subject<select id="fSub">${options(DATA.me && DATA.me.subjects.length ? DATA.me.subjects : SUBJECTS, F.subject, DATA.me && DATA.me.subjects.length === 1 ? "" : "All subjects")}</select></label>
  </section>

  ${R.length ? `
  <section class="sd-kpis">
    <div class="kpi"><span class="kpi-v">${R.length}</span><span class="kpi-l">student records</span><span class="kpi-s">${lessonsTotal} lesson${lessonsTotal===1?"":"s"} set</span></div>
    <div class="kpi"><span class="kpi-v">${pct(avgComp)}</span><span class="kpi-l">average completion</span><span class="kpi-s">${R.filter(r => r.attempted < r.set).length} missed at least one lesson</span></div>
    <div class="kpi"><span class="kpi-v">${pct(avgPct)}</span><span class="kpi-l">average term %</span><span class="kpi-s">${avgPct === "" ? "no work yet" : bandOf(avgPct).name}</span></div>
    <div class="kpi accent"><span class="kpi-v">${pct(meetPlus)}</span><span class="kpi-l">Meeting or above</span><span class="kpi-s">${counts[2]+counts[3]} of ${withAvg.length} students</span></div>
  </section>

  <section class="panel">
    <div class="sd-ph"><h2>Achievement bands</h2><span class="small">% of students with work this term${DATA.zeroForMissed ? " (missed lessons count as 0%)" : ""}</span></div>
    <div class="bandbar" role="img" aria-label="${BANDS.map((b,i) => `${b.name} ${Math.round(share(i))}%`).join(", ")}">
      ${BANDS.map((b,i) => counts[i] ? `<span class="b-${b.k}" style="flex:${counts[i]}"></span>` : "").join("") || `<span class="b-none" style="flex:1"></span>`}
    </div>
    <div class="bands">
      ${BANDS.map((b,i) => `<div class="bandrow"><span class="sw b-${b.k}"></span><b>${b.name}</b><span class="small">${b.range}</span><span class="n">${counts[i]}</span><span class="p">${pct(share(i))}</span></div>`).join("")}
      ${noWork ? `<div class="bandrow muted"><span class="sw b-none"></span><b>No work yet</b><span class="small">not in the %</span><span class="n">${noWork}</span><span class="p"></span></div>` : ""}
    </div>
  </section>

  <section class="panel" id="sdGridWrap">${grid()}</section>
  <section class="panel" id="sdDetail">${detailPanel()}</section>

  <section class="panel">
    <div class="sd-ph"><h2>Students</h2>
      <div class="row"><input id="sdQ" type="search" placeholder="Search a name or M Number" value="${esc(query)}" aria-label="Search a student">
        <label class="chk"><input id="sdMissed" type="checkbox" ${onlyMissed?"checked":""}> Missed a lesson</label></div></div>
    <div class="tscroll"><table class="sd-table" id="sdTable"></table></div>
  </section>` : `
  <section class="panel sd-empty"><h2>No results yet for ${esc(scope)}</h2><p class="small">Results appear as soon as your students sign in and work through a lesson. Try another term or class.</p></section>`}
  <section class="panel" id="sdLists">${classLists()}</section>
  ${DATA.me && DATA.me.role === "leader" ? `<section class="panel" id="sdStaff">${staffPanel()}</section>
  <section class="panel sd-accts" id="sdAccts">${acctsPanel()}</section>
  <section class="panel sd-backup" id="sdAdmin">${adminPanel()}</section>` : ""}`;

  const $ = s => app.querySelector(s);
  $("#fTerm").onchange = e => { F.term = e.target.value; detail = null; DATA.sample ? render(app) : call(app, {action:"data"}); };
  $("#fYear").onchange = e => { F.year = e.target.value; F.cls = "All"; render(app); };
  $("#fCls").onchange = e => { F.cls = e.target.value; render(app); };
  $("#fSub").onchange = e => { F.subject = e.target.value; render(app); };
  $("#sdRefresh").onclick = () => DATA.sample ? render(app) : call(app, {action:"data"});
  $("#sdLock").onclick = () => { reset(); Auth.signOut(); };
  wireLists(app); wireStaff(app); wireDetail(app); wireAccts(app); wireAdmin(app);
  $("#sdPrint").onclick = () => window.print();
  $("#sdCsv").onclick = () => csv(R);
  if(R.length){
    $("#sdQ").oninput = e => { query = e.target.value; table(app, R); };
    $("#sdMissed").onchange = e => { onlyMissed = e.target.checked; table(app, R); };
    table(app, R);
  }
}

/* Lesson-by-lesson grid: one class and one subject */
function grid(){
  if(F.cls === "All" || F.subject === "All")
    return `<div class="sd-ph"><h2>Lesson by lesson</h2></div><p class="small">Choose one <b>class</b> and one <b>subject</b> above to see each student's % for every lesson, and who hasn't done it yet.</p>`;
  const g = DATA.groups.find(x => x.term === F.term && x.cls === F.cls && x.subject === F.subject);
  if(!g) return `<div class="sd-ph"><h2>Lesson by lesson</h2></div><p class="small">No ${esc(F.subject)} lessons for ${esc(F.cls)} in ${esc(F.term)} yet.</p>`;
  const L = g.lessons;
  const head = `<tr><th class="nm">Student</th>${L.map((l,i) => `<th title="${esc(l.title)}${l.date ? " · "+esc(l.date) : ""}"><span class="ln">L${i+1}</span><span class="lt">${esc(l.title)}</span></th>`).join("")}<th>Done</th><th>Term</th></tr>`;
  const body = g.students.map(s => {
    const done = L.filter(l => s.done[l.id]); const sum = done.reduce((a,l) => a + s.done[l.id][0], 0);
    const avg = DATA.zeroForMissed ? (L.length ? sum/L.length : "") : (done.length ? sum/done.length : "");
    const b = bandOf(avg);
    return `<tr><td class="nm">${esc(s.name)}<span class="mno">${esc(s.m || "")}</span>${s.onRoster ? "" : ` <span class="flag" title="This M Number isn't on the school list">check M Number</span>`}</td>${L.map(l => {
      const d = s.done[l.id]; if(!d) return `<td class="c miss" title="Not attempted">—</td>`;
      const bb = bandOf(d[0]); return `<td class="c b-${bb.k}${d[1] ? "" : " prog"}" title="${d[1] ? "Completed" : "In progress · steps " + esc(d[2])}">${d[0]}%</td>`;
    }).join("")}<td class="c">${done.length}/${L.length}</td><td class="c ${b ? "b-"+b.k : "miss"}">${avg === "" ? "–" : Math.round(avg)+"%"}</td></tr>`;
  }).join("");
  return `<div class="sd-ph"><h2>Lesson by lesson · ${esc(F.cls)} ${esc(F.subject)}</h2><span class="small">— not attempted · <i>italic</i> started, not finished</span></div>
    <div class="tscroll"><table class="sd-grid">${head}${body}</table></div>`;
}

function table(app, R){
  const q = query.trim().toLowerCase();
  let list = R.filter(r => (!q || r.name.toLowerCase().includes(q) || r.m.toLowerCase().includes(q)) && (!onlyMissed || r.attempted < r.set));
  const key = {cls: r => [parseInt(r.cls), r.cls, SUBJECTS.indexOf(r.subject), r.name],
    name: r => [r.name], subject: r => [SUBJECTS.indexOf(r.subject), r.name], completion: r => [r.completion],
    avg: r => [r.avg === "" ? -1 : r.avg]}[sortBy.col];
  list.sort((a,b) => { const x = key(a), y = key(b); for(let i = 0; i < x.length; i++){ if(x[i] < y[i]) return -sortBy.dir; if(x[i] > y[i]) return sortBy.dir; } return 0; });
  const th = (col, label) => `<th${col ? ` data-col="${col}" aria-sort="${sortBy.col===col ? (sortBy.dir>0?"ascending":"descending") : "none"}" tabindex="0"` : ""}>${label}${sortBy.col===col ? (sortBy.dir>0 ? " ▲" : " ▼") : ""}</th>`;
  const t = app.querySelector("#sdTable");
  t.innerHTML = `<thead><tr>${th("cls","Class")}${th("subject","Subject")}${th("name","Student")}${th("completion","Completion")}${th("avg","Term %")}${th("","Band")}${th("","Not attempted yet")}</tr></thead><tbody>${
    list.map(r => { const b = bandOf(r.avg); return `<tr>
      <td>${esc(r.cls)}</td><td>${esc(r.subject)}</td>
      <td class="nm">${esc(r.name)}<span class="mno">${esc(r.m)}</span>${r.onRoster ? "" : ` <span class="flag" title="This M Number isn't on the school list">check M Number</span>`}</td>
      <td><span class="meter" aria-hidden="true"><i style="width:${Math.round(r.completion)}%"></i></span> ${r.attempted}/${r.set}</td>
      <td class="num">${pct(r.avg)}</td>
      <td>${b ? `<span class="bchip b-${b.k}">${b.name}</span>` : `<span class="bchip b-none">No work yet</span>`}</td>
      <td class="missed">${r.missed.length ? r.missed.map(l => esc(l.title)).join(" · ") : `<span class="small">All done</span>`}</td></tr>`; }).join("")
    || `<tr><td colspan="7" class="small">No students match.</td></tr>`}</tbody>`;
  t.querySelectorAll("th[data-col]").forEach(h => { const go = () => { const c = h.dataset.col; sortBy = {col:c, dir: sortBy.col === c ? -sortBy.dir : (c === "avg" || c === "completion" ? -1 : 1)}; table(app, R); };
    h.onclick = go; h.onkeydown = e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); go(); } }; });
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
    <td>${!a.hasPass ? `<span class="flag">Not set</span>` : a.mustChange ? `<span class="small">Not signed in yet</span>` : "Set"}</td>
    <td class="acts"><button class="btn sm alt" type="button" data-edit="${esc(a.user)}">${a.hasPass ? "Edit" : "Set password"}</button>${a.user === me.user ? "" : `<button class="btn sm alt" type="button" data-reset="${esc(a.user)}">New password</button>`}${a.user === me.user ? "" : `<button class="x" type="button" data-del="${esc(a.user)}" aria-label="Delete ${esc(a.name || a.user)}" title="Delete account">×</button>`}</td></tr>`).join("");
  const waiting = list.filter(a => !a.hasPass).length;
  return `<div class="sd-ph"><h2>Staff accounts</h2><span class="small">Only leaders see this. Teachers sign in with their code and see only their students. Leaders see everything.</span></div>
    <div class="row sd-import"><span class="small">Accounts imported: ${esc(DATA.lastImport || "not yet")} · Student accounts: ${DATA.studentCount || 0} (${DATA.studentActive || 0} have signed in)</span>
      <label class="btn sm alt">Import accounts file<input type="file" id="acImportFile" accept=".json,application/json" hidden></label></div>
    <p class="sd-progress" id="acImportMsg" role="status"></p>
    ${waiting ? `<p class="small">${waiting} teacher${waiting===1?" has":"s have"} no password yet, so can't sign in. Use <b>Set password</b>, then share the login.</p>` : ""}
    ${issued ? `<div class="sd-issued" role="status"><b>Login for ${esc(issued.name)}</b><span>Username <code>${esc(String(issued.user).toUpperCase())}</code> · Temporary password <code>${esc(issued.pass)}</code></span>
      <span class="small">Copy it now and share it privately: it can't be shown again. They choose their own password when they first sign in.</span>
      <div class="row"><button class="btn sm" type="button" id="acCopy">Copy login</button><button class="btn sm alt" type="button" id="acDone">Done</button></div></div>` : ""}
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
  const im = q("#acImportFile"); if(im) im.onchange = () => importFile(app, im.files[0]);
  const nb = q("#acNew"); if(nb) nb.onclick = () => { issued = null; editing = {name:"", user:"", code:"", role:"Teacher", classes:[], pass: genPass(), hasPass:false}; again(); const n = q("#acName"); n && n.focus && n.focus(); };
  box.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { const a = DATA.staff.find(x => x.user === b.dataset.edit); issued = null;
    editing = {orig:a.user, name:a.name, user:a.user, code:a.code, role:a.role, classes:a.classes.slice(), hasPass:a.hasPass, pass: a.hasPass ? "" : genPass()}; again(); });
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const a = DATA.staff.find(x => x.user === b.dataset.del);
    if(confirm(`Delete the login for ${a.name || a.user}? They won't be able to sign in. Their students and results stay.`)) saveAccount(app, "deleteStaff", {username: a.user}); });
  box.querySelectorAll("[data-reset]").forEach(b => b.onclick = () => { const a = DATA.staff.find(x => x.user === b.dataset.reset);
    if(confirm(`Give ${a.name || a.user} a new temporary password? Their old one stops working.`)) call(app, {action:"resetPassword", user: a.user}); });
  const cp = q("#acCopy"); if(cp) cp.onclick = () => { const t = `EduGhaf staff login\n${location.origin}/#login\nUsername: ${String(issued.user).toUpperCase()}\nTemporary password: ${issued.pass}\nYou'll choose your own password when you first sign in.`;
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

/* ---------- Each part of a lesson (one class, one subject, one lesson) ---------- */
const STEP_LABELS = {
  msc: [["start","Start"],["donow","Do Now"],["learn","Learn"],["group","Group task"],["game","Challenge"],["analyse","Analyse"],["create","Create"],["copy","Copy book"],["quiz","Quiz"],["reflect","Reflect & hand in"]],
  me:  [["start","Start"],["dna","Do Now"],["words","Word bank"],["task1","Task 1"],["task2","Task 2"],["task3","Task 3"],["game","Challenge"],["copy","Copy book"],["quiz","Quiz"],["reflect","Reflect & hand in"]],
  lit: [["retrieve","Retrieve"],["consolidate","Consolidate"],["practise","Practise"],["apply","Apply"],["reflect","Reflect"]]
};
STEP_LABELS.ss = STEP_LABELS.msc;
const SUBJECT_KEY = {"MSC":"msc","Social Studies":"ss","Moral Education":"me","Literacy":"lit"};
function detailPanel(){
  const head = `<div class="sd-ph"><h2>Each part of a lesson</h2><span class="small">Which steps each student has done, their auto-marked score and lesson %.</span></div>`;
  if(DATA.sample) return head + `<p class="small">Not available in the sample.</p>`;
  if(F.cls === "All" || F.subject === "All") return head + `<p class="small">Choose one <b>class</b> and one <b>subject</b> above, then pick a lesson.</p>`;
  const g = DATA.groups.find(x => x.term === F.term && x.cls === F.cls && x.subject === F.subject);
  if(!g || !g.lessons.length) return head + `<p class="small">No ${esc(F.subject)} work from ${esc(F.cls)} in ${esc(F.term)} yet.</p>`;
  const sel = detail && detail.cls === F.cls && detail.subject === F.subject ? detail.lessonId : "";
  let body = "";
  if(sel && detail.students){
    const L = STEP_LABELS[SUBJECT_KEY[F.subject]] || [];
    const allSteps = L.length ? L : [...new Set(detail.students.flatMap(s => s.steps))].map(k => [k,k]);
    body = `<div class="tscroll"><table class="sd-grid sd-steps"><tr><th class="nm">Student</th>${allSteps.map(x => `<th><span class="lt">${esc(x[1])}</span></th>`).join("")}<th>Auto-marked</th><th>Lesson %</th><th>Last saved</th></tr>${
      detail.students.map(st => { const started = st.pct != null; const b = bandOf(st.pct);
        return `<tr><td class="nm">${esc(st.name)}<span class="mno">${esc(st.m)}</span></td>${allSteps.map(x => `<td class="c">${st.steps.includes(x[0]) ? `<span class="ok" title="Done">✓</span>` : `<span class="no" title="Not done">·</span>`}</td>`).join("")}
          <td class="c">${started && st.autoTotal ? st.autoCorrect + "/" + st.autoTotal : "–"}</td>
          <td class="c ${b ? "b-" + b.k : "miss"}">${started ? st.pct + "%" : "Not started"}</td>
          <td class="c small">${st.updated ? new Date(st.updated).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}</td></tr>`; }).join("")}</table></div>`;
  } else if(sel) body = `<p class="small">Loading…</p>`;
  return head + `<div class="sd-detail-pick"><label>Lesson<select id="dLesson"><option value="">Choose a lesson</option>${g.lessons.map((l,i) => `<option value="${esc(l.id)}" ${l.id === sel ? "selected" : ""}>L${i+1} · ${esc(l.title)}</option>`).join("")}</select></label></div>` + body;
}
function wireDetail(app){
  const box = app.querySelector("#sdDetail"); if(!box || !box.querySelector) return;
  const s = box.querySelector("#dLesson"); if(!s) return;
  s.onchange = async () => {
    const id = s.value; if(!id){ detail = null; box.innerHTML = detailPanel(); return wireDetail(app); }
    detail = {cls: F.cls, subject: F.subject, lessonId: id}; box.innerHTML = detailPanel(); wireDetail(app);
    try{ const d = await post({action:"lessonDetail", cls: F.cls, subject: F.subject, lessonId: id, term: F.term});
      if(!d.ok) return toast(d.message);
      if(detail && detail.lessonId === id){ detail.students = d.students; box.innerHTML = detailPanel(); wireDetail(app); }
    }catch(e){ toast(e.message); }
  };
}

/* ---------- Student accounts (leaders) ---------- */
function acctsPanel(){
  const head = `<div class="sd-ph"><h2>Student accounts</h2><span class="small">Students sign in with their M Number. Reset a forgotten password here: they choose a new one when they sign in.</span></div>`;
  const issuedBox = issuedStudent ? `<div class="sd-issued" role="status"><b>${esc(issuedStudent.name)}</b><span>M Number <code>${esc(issuedStudent.user)}</code> · Temporary password <code>${esc(issuedStudent.pass)}</code></span>
      <span class="small">Give it to the student privately. They choose their own password when they sign in.</span>
      <div class="row"><button class="btn sm" type="button" id="saCopy">Copy</button><button class="btn sm alt" type="button" id="saDone">Done</button></div></div>` : "";
  if(!ACCTS) return head + issuedBox + `<div class="row"><button class="btn sm alt" type="button" id="saLoad">Show student accounts</button></div>`;
  const classes = [...new Set(ACCTS.map(a => a.cls))].sort(clsCmp);
  const q = acctQ.trim().toLowerCase();
  const list = ACCTS.filter(a => (!acctCls || a.cls === acctCls) && (!acctWaiting || a.waiting) && (!q || a.name.toLowerCase().includes(q) || a.m.toLowerCase().includes(q)));
  const shown = list.slice(0, 200);
  return head + issuedBox + `<div class="row"><input id="saQ" type="search" placeholder="Search a name or M Number" value="${esc(acctQ)}" aria-label="Search students">
      <label class="sd-inline">Class <select id="saCls"><option value="">All</option>${classes.map(c => `<option ${c === acctCls ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" id="saWait" ${acctWaiting ? "checked" : ""}> Haven't signed in yet</label>
      <span class="small">${list.length} of ${ACCTS.length}</span></div>
    <div class="tscroll"><table class="sd-table"><thead><tr><th>Class</th><th>Student</th><th>M Number</th><th>Status</th><th></th></tr></thead><tbody>${
      shown.map(a => `<tr><td>${esc(a.cls)}</td><td class="nm">${esc(a.name)}</td><td><code>${esc(a.m)}</code></td>
        <td>${a.locked ? `<span class="flag">Locked for 15 min</span>` : a.waiting ? `<span class="small">${a.lastLogin ? "Signed in, password not changed" : "Not signed in yet"}</span>` : `Active <span class="small">· last ${esc(new Date(a.lastLogin).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))}</span>`}</td>
        <td class="acts"><button class="btn sm alt" type="button" data-sreset="${esc(a.m)}">New password</button><button class="btn sm alt" type="button" data-sedit="${esc(a.m)}">Edit</button></td></tr>`).join("") || `<tr><td colspan="5" class="small">No students match.</td></tr>`}</tbody></table></div>
    ${list.length > shown.length ? `<p class="small">Showing the first 200. Search or pick a class to narrow it down.</p>` : ""}
    <form id="saForm" class="sd-addform"><h3 id="saTitle">Add a student account</h3>
      <label>M Number<input id="saM" type="text" placeholder="e.g. M9093" autocomplete="off" maxlength="9" required></label>
      <label>Full name<input id="saName" type="text" autocomplete="off" maxlength="100" required></label>
      <label>Class<input id="saClass" type="text" placeholder="e.g. 7A" autocomplete="off" maxlength="3" style="text-transform:uppercase;max-width:90px" required></label>
      <p class="sd-msg" id="saMsg" role="status"></p>
      <div class="row"><button class="btn" type="submit" id="saGo">Create account</button><button class="btn alt" type="button" id="saDel" hidden>Delete this account</button></div></form>`;
}
async function loadAccts(app){
  try{ const d = await post({action:"accounts"}); if(!d.ok) return toast(d.message); ACCTS = d.accounts; const b = app.querySelector("#sdAccts"); if(b){ b.innerHTML = acctsPanel(); wireAccts(app); } }
  catch(e){ toast(e.message); }
}
function wireAccts(app){
  const box = app.querySelector("#sdAccts"); if(!box || !box.querySelector) return;
  const q = s => box.querySelector(s), again = () => { box.innerHTML = acctsPanel(); wireAccts(app); };
  const ld = q("#saLoad"); if(ld){ ld.onclick = () => { ld.disabled = true; ld.textContent = "Loading…"; loadAccts(app); }; }
  const cp = q("#saCopy"); if(cp) cp.onclick = () => { const t = `EduGhaf: ${location.origin}/#login\nM Number: ${issuedStudent.user}\nTemporary password: ${issuedStudent.pass}\nYou'll choose your own password when you sign in.`;
    try{ navigator.clipboard.writeText(t).then(() => toast("Copied.")); }catch(e){ toast("Select and copy the text instead."); } };
  const dn = q("#saDone"); if(dn) dn.onclick = () => { issuedStudent = null; again(); };
  if(!ACCTS) return;
  const sq = q("#saQ"); sq.oninput = e => { acctQ = e.target.value; const pos = sq.selectionStart; again(); const n = box.querySelector("#saQ"); n.focus(); try{ n.setSelectionRange(pos, pos); }catch(err){} };
  q("#saCls").onchange = e => { acctCls = e.target.value; again(); };
  q("#saWait").onchange = e => { acctWaiting = e.target.checked; again(); };
  box.querySelectorAll("[data-sreset]").forEach(b => b.onclick = () => { const a = ACCTS.find(x => x.m === b.dataset.sreset);
    if(confirm(`Give ${a.name} (${a.m}) a new temporary password? Their old one stops working.`)) call(app, {action:"resetPassword", user: a.m}); });
  box.querySelectorAll("[data-sedit]").forEach(b => b.onclick = () => { const a = ACCTS.find(x => x.m === b.dataset.sedit);
    q("#saTitle").textContent = "Edit " + a.name; q("#saM").value = a.m; q("#saM").readOnly = true; q("#saName").value = a.name; q("#saClass").value = a.cls;
    q("#saGo").textContent = "Save"; const del = q("#saDel"); del.hidden = false;
    del.onclick = () => { if(confirm(`Delete the account for ${a.name}? They won't be able to sign in. Their saved work stays in the backups.`)) call(app, {action:"deleteStudentAccount", user: a.m}); };
    q("#saName").focus(); });
  q("#saForm").onsubmit = e => { e.preventDefault(); const m = q("#saM").value.trim(), n = q("#saName").value.trim(), c = q("#saClass").value.trim().toUpperCase();
    if(!/^M?\d{3,7}$/i.test(m)) return q("#saMsg").textContent = "Enter the M Number, e.g. M9093.";
    if(!n) return q("#saMsg").textContent = "Enter the student's full name.";
    if(!/^\d{1,2}[A-Z]$/.test(c)) return q("#saMsg").textContent = "Enter the class, e.g. 7A.";
    call(app, {action:"saveStudentAccount", mno: m, name: n, cls: c}); };
}

/* ---------- Backups, import and settings (leaders) ---------- */
function adminPanel(){
  const st = DATA.settings || {};
  return `<div class="sd-ph"><h2>Backups &amp; settings</h2><span class="small">Download a full backup (accounts, class lists and every student's saved work) whenever you like, e.g. every Friday.</span></div>
    <div class="row"><button class="btn" type="button" id="bkDown">Download full backup</button>
      <label class="btn alt">Restore from a backup<input type="file" id="bkFile" accept=".json,application/json" hidden></label></div>
    <p class="sd-progress" id="bkMsg" role="status"></p>
    <form id="stForm" class="sd-acct"><h3>Settings</h3>
      <div class="grid2"><label>Term 1 starts<input type="date" id="stT1" value="${esc(st.term1)}" required></label><label>Term 2 starts<input type="date" id="stT2" value="${esc(st.term2)}" required></label></div>
      <div class="grid2"><label>Term 3 starts<input type="date" id="stT3" value="${esc(st.term3)}" required></label>
        <label>Forgotten passwords: students contact<input type="text" id="stHelp" value="${esc(st.help)}" maxlength="80"></label></div>
      <label class="chk"><input type="checkbox" id="stZero" ${st.zeroForMissed ? "checked" : ""}> Missed lessons count as 0% in the term average</label>
      <div class="row"><button class="btn sm" type="submit">Save settings</button></div></form>`;
}
function wireAdmin(app){
  const box = app.querySelector("#sdAdmin"); if(!box || !box.querySelector) return;
  const q = s => box.querySelector(s), msg = t => { const m = q("#bkMsg"); if(m) m.textContent = t; };
  q("#bkDown").onclick = async () => {
    const b = q("#bkDown"); b.disabled = true;
    try{
      const out = {edughaf: 1, kind: "backup", created: new Date().toISOString(), site: location.origin};
      for(const t of ["users","roster","progress","settings","log"]){
        out[t] = []; let after = "";
        for(;;){ msg(`Downloading ${t}… ${out[t].length}`);
          const d = await post({action:"backupPage", table: t, after});
          if(!d.ok) throw new Error(d.message);
          out[t] = out[t].concat(d.rows); if(!d.next) break; after = d.next; }
      }
      const name = "EduGhaf-backup-" + new Date().toISOString().slice(0,16).replace(/[:T]/g,"-") + ".json";
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], {type:"application/json"})); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      msg(`Backup downloaded: ${out.users.length} accounts, ${out.progress.length} saved lessons. Keep the file somewhere safe (e.g. your school Google Drive), as it contains student data.`);
    }catch(e){ msg("Backup failed: " + e.message); }
    b.disabled = false;
  };
  q("#bkFile").onchange = async e => {
    const f = e.target.files[0]; if(!f) return;
    let data; try{ data = JSON.parse(await f.text()); }catch(err){ return msg("That file isn't an EduGhaf backup."); }
    if(!data || data.kind !== "backup") return msg(data && data.kind === "accounts" ? "That's an accounts file: use “Import accounts file” under Staff accounts." : "That file isn't an EduGhaf backup.");
    if(!confirm(`Restore the backup from ${new Date(data.created).toLocaleString("en-GB")}? Accounts, class lists and saved lessons from the file are put back. Lessons saved here more recently than the backup are kept, and your own account isn't changed.`)) return;
    try{
      for(const t of ["settings","users","roster","progress"]){
        const rows = data[t] || [];
        for(let i = 0; i < rows.length; i += 100){ msg(`Restoring ${t}… ${Math.min(i + 100, rows.length)} of ${rows.length}`);
          const d = await post({action:"restore", table: t, rows: rows.slice(i, i + 100), last: t === "progress" && i + 100 >= rows.length});
          if(!d.ok) throw new Error(d.message); }
      }
      msg("Backup restored."); ACCTS = null; call(app, {action:"data"});
    }catch(err){ msg("Restore stopped: " + err.message); }
    e.target.value = "";
  };
  q("#stForm").onsubmit = e => { e.preventDefault();
    call(app, {action:"saveSettings", settings: {term1: q("#stT1").value, term2: q("#stT2").value, term3: q("#stT3").value, help: q("#stHelp").value, zeroForMissed: q("#stZero").checked}}); };
}

/* Accounts file (made from the school list): sent in chunks. Existing accounts keep their passwords. */
async function importFile(app, f){
  const m = app.querySelector("#acImportMsg"), say = t => { if(m) m.textContent = t; };
  if(!f) return;
  let data; try{ data = JSON.parse(await f.text()); }catch(e){ return say("That file isn't an EduGhaf accounts file."); }
  if(!data || data.kind !== "accounts" || !Array.isArray(data.users)) return say(data && data.kind === "backup" ? "That's a backup: use “Restore from a backup” below." : "That file isn't an EduGhaf accounts file.");
  if(!confirm(`Import ${data.users.length} accounts and ${data.roster.length} class-list links from this file? New accounts get the temporary passwords from the accounts spreadsheet. Accounts that already exist keep their current password.`)) return;
  try{
    const U = data.users, R = data.roster || [], steps = Math.max(Math.ceil(U.length / 150), Math.ceil(R.length / 400), 1);
    for(let i = 0; i < steps; i++){
      say(`Importing… ${Math.round(i / steps * 100)}%`);
      const d = await post({action:"importAccounts", users: U.slice(i*150, i*150 + 150), roster: R.slice(i*400, i*400 + 400), first: i === 0, last: i === steps - 1, total: U.length});
      if(!d.ok) throw new Error(d.message);
    }
    say(`Imported ${U.length} accounts.`); ACCTS = null; call(app, {action:"data"});
  }catch(e){ say("Import stopped: " + e.message + " You can run it again safely."); }
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

window.Teacher = { show, reset, leave(){ document.body.classList.remove("staff"); } };
})();
