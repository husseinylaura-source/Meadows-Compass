/* Meadows Compass – Staff dashboard (#teacher)
   Reads lesson results from the Google Sheet (js/config.js → resultsUrl) after a staff passcode.
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

let DATA = null, F = null, sortBy = {col:"cls", dir:1}, query = "", onlyMissed = false, loading = false;

function show(app, crumbs){
  crumbs([["Staff dashboard"]]);
  document.body.classList.add("staff");
  app.setAttribute("data-unit","msc");
  if(!CFG.resultsUrl && !DATA){ app.innerHTML = `<section class="panel staff-lock"><span class="eyebrow">Staff only</span><h1>Staff dashboard</h1><p>The results Sheet isn't connected yet. Add its web app address to <code>js/config.js</code> (steps in <code>teacher-dashboard/SETUP.md</code>).</p><div class="row"><button class="btn alt" id="sdDemo" type="button">Preview with sample data</button></div></section>`;
    app.querySelector("#sdDemo").onclick = () => { DATA = sample(); F = defaults(DATA); render(app); }; return; }
  if(DATA) return render(app);
  const code = ss.get("code");
  if(code) return load(app, code);
  lock(app);
}

function lock(app, msg){
  app.innerHTML = `<section class="panel staff-lock">
    <span class="eyebrow">Staff only</span><h1>Staff dashboard</h1>
    <p class="small">Lesson completion, term averages and achievement bands for every class.</p>
    <form id="sdForm" class="row"><label class="sr" for="sdCode">Staff passcode</label>
      <input id="sdCode" type="password" placeholder="Staff passcode" autocomplete="current-password" required>
      <button class="btn" type="submit">Open dashboard</button></form>
    <p class="sd-msg" id="sdMsg" role="status">${esc(msg||"")}</p></section>`;
  const f = app.querySelector("#sdForm");
  f.onsubmit = e => { e.preventDefault(); load(app, app.querySelector("#sdCode").value.trim()); };
  app.querySelector("#sdCode").focus();
}

async function load(app, code){
  if(loading) return; loading = true;
  const m = app.querySelector("#sdMsg"); if(m) m.textContent = "Loading…";
  if(DATA) setBusy(app, true);
  try{
    const r = await fetch(CFG.resultsUrl + (CFG.resultsUrl.indexOf("?") >= 0 ? "&" : "?") + "code=" + encodeURIComponent(code), {cache:"no-store"});
    const d = await r.json();
    if(!d.ok){ ss.set("code", null); DATA = null; loading = false; return lock(app, d.message || "Couldn't open the dashboard."); }
    ss.set("code", code); DATA = d; loading = false;
    if(!F) F = defaults(d);
    render(app);
  }catch(e){
    loading = false;
    if(DATA){ setBusy(app, false); toast("Couldn't refresh. Check the connection."); }
    else lock(app, "Couldn't reach the results Sheet. Check the connection, or that the web app is deployed for Anyone.");
  }
}
function setBusy(app, on){ const b = app.querySelector("#sdRefresh"); if(b){ b.disabled = on; b.textContent = on ? "Refreshing…" : "Refresh"; } }
function toast(t){ const e = document.getElementById("toast"); if(!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2800); }

function currentTerm(terms){
  const today = new Date().toISOString().slice(0,10); let t = "Term 1";
  ["Term 1","Term 2","Term 3"].forEach(x => { if(terms && terms[x] && today >= terms[x]) t = x; });
  return t;
}
function defaults(d){ return {term: currentTerm(d.terms), year:"All", cls:"All", subject:"All"}; }

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
      out.push({ g, cls:g.cls, year:g.year, subject:g.subject, name:s.name, onRoster:s.onRoster, set,
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
      <p class="small" id="sdScope">${esc(scope)} · updated ${upd.toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p></div>
    <div class="row sd-actions">
      <button class="btn sm alt" id="sdRefresh" type="button">Refresh</button>
      <button class="btn sm alt" id="sdCsv" type="button">Download CSV</button>
      <button class="btn sm" id="sdPrint" type="button">Print report</button>
      <button class="btn sm alt" id="sdLock" type="button" title="Sign out of the staff dashboard">Lock</button>
    </div>
  </section>

  <section class="panel sd-filters" aria-label="Filters">
    <label>Term<select id="fTerm">${options(["Term 1","Term 2","Term 3"], F.term)}</select></label>
    <label>Year group<select id="fYear">${options(years, F.year, "All year groups")}</select></label>
    <label>Class<select id="fCls">${options(classes, F.cls, "All classes")}</select></label>
    <label>Subject<select id="fSub">${options(SUBJECTS, F.subject, "All subjects")}</select></label>
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

  <section class="panel">
    <div class="sd-ph"><h2>Students</h2>
      <div class="row"><input id="sdQ" type="search" placeholder="Search a name" value="${esc(query)}" aria-label="Search a student">
        <label class="chk"><input id="sdMissed" type="checkbox" ${onlyMissed?"checked":""}> Missed a lesson</label></div></div>
    <div class="tscroll"><table class="sd-table" id="sdTable"></table></div>
  </section>` : `
  <section class="panel sd-empty"><h2>No results yet for ${esc(scope)}</h2><p class="small">Results appear once students in these classes work through a lesson with their name and class filled in. Try another term or class.</p></section>`}`;

  const $ = s => app.querySelector(s);
  $("#fTerm").onchange = e => { F.term = e.target.value; render(app); };
  $("#fYear").onchange = e => { F.year = e.target.value; F.cls = "All"; render(app); };
  $("#fCls").onchange = e => { F.cls = e.target.value; render(app); };
  $("#fSub").onchange = e => { F.subject = e.target.value; render(app); };
  $("#sdRefresh").onclick = () => DATA.sample ? render(app) : load(app, ss.get("code") || "");
  $("#sdLock").onclick = () => { ss.set("code", null); const wasSample = DATA.sample; DATA = null; F = null; wasSample ? show(app, () => {}) : lock(app); };
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
    return `<tr><td class="nm">${esc(s.name)}${s.onRoster ? "" : ` <span class="flag" title="Not on the Roster tab – check the spelling">check name</span>`}</td>${L.map(l => {
      const d = s.done[l.id]; if(!d) return `<td class="c miss" title="Not attempted">—</td>`;
      const bb = bandOf(d[0]); return `<td class="c b-${bb.k}${d[1] ? "" : " prog"}" title="${d[1] ? "Completed" : "In progress · steps " + esc(d[2])}">${d[0]}%</td>`;
    }).join("")}<td class="c">${done.length}/${L.length}</td><td class="c ${b ? "b-"+b.k : "miss"}">${avg === "" ? "–" : Math.round(avg)+"%"}</td></tr>`;
  }).join("");
  return `<div class="sd-ph"><h2>Lesson by lesson · ${esc(F.cls)} ${esc(F.subject)}</h2><span class="small">— not attempted · <i>italic</i> started, not finished</span></div>
    <div class="tscroll"><table class="sd-grid">${head}${body}</table></div>`;
}

function table(app, R){
  const q = query.trim().toLowerCase();
  let list = R.filter(r => (!q || r.name.toLowerCase().includes(q)) && (!onlyMissed || r.attempted < r.set));
  const key = {cls: r => [parseInt(r.cls), r.cls, SUBJECTS.indexOf(r.subject), r.name],
    name: r => [r.name], subject: r => [SUBJECTS.indexOf(r.subject), r.name], completion: r => [r.completion],
    avg: r => [r.avg === "" ? -1 : r.avg]}[sortBy.col];
  list.sort((a,b) => { const x = key(a), y = key(b); for(let i = 0; i < x.length; i++){ if(x[i] < y[i]) return -sortBy.dir; if(x[i] > y[i]) return sortBy.dir; } return 0; });
  const th = (col, label) => `<th${col ? ` data-col="${col}" aria-sort="${sortBy.col===col ? (sortBy.dir>0?"ascending":"descending") : "none"}" tabindex="0"` : ""}>${label}${sortBy.col===col ? (sortBy.dir>0 ? " ▲" : " ▼") : ""}</th>`;
  const t = app.querySelector("#sdTable");
  t.innerHTML = `<thead><tr>${th("cls","Class")}${th("subject","Subject")}${th("name","Student")}${th("completion","Completion")}${th("avg","Term %")}${th("","Band")}${th("","Not attempted yet")}</tr></thead><tbody>${
    list.map(r => { const b = bandOf(r.avg); return `<tr>
      <td>${esc(r.cls)}</td><td>${esc(r.subject)}</td>
      <td class="nm">${esc(r.name)}${r.onRoster ? "" : ` <span class="flag" title="Not on the Roster tab – check the spelling">check name</span>`}</td>
      <td><span class="meter" aria-hidden="true"><i style="width:${Math.round(r.completion)}%"></i></span> ${r.attempted}/${r.set}</td>
      <td class="num">${pct(r.avg)}</td>
      <td>${b ? `<span class="bchip b-${b.k}">${b.name}</span>` : `<span class="bchip b-none">No work yet</span>`}</td>
      <td class="missed">${r.missed.length ? r.missed.map(l => esc(l.title)).join(" · ") : `<span class="small">All done</span>`}</td></tr>`; }).join("")
    || `<tr><td colspan="7" class="small">No students match.</td></tr>`}</tbody>`;
  t.querySelectorAll("th[data-col]").forEach(h => { const go = () => { const c = h.dataset.col; sortBy = {col:c, dir: sortBy.col === c ? -sortBy.dir : (c === "avg" || c === "completion" ? -1 : 1)}; table(app, R); };
    h.onclick = go; h.onkeydown = e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); go(); } }; });
}

function csv(R){
  const head = ["Term","Year","Class","Subject","Student","On roster","Lessons set","Lessons attempted","Lessons completed","Completion %","Term %","Band","Not attempted yet"];
  const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
  const lines = [head].concat(R.map(r => [F.term, r.year, r.cls, r.subject, r.name, r.onRoster ? "Yes" : "Check name", r.set, r.attempted, r.completed,
    Math.round(r.completion), r.avg, bandOf(r.avg) ? bandOf(r.avg).name : "No work yet", r.missed.map(l => l.title).join(" · ")])).map(r => r.map(q).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], {type:"text/csv;charset=utf-8"});
  const name = ["Meadows-Compass", F.term, F.cls === "All" ? (F.year === "All" ? "all-years" : F.year) : F.cls, F.subject === "All" ? "all-subjects" : F.subject].join("_").replace(/\s+/g,"-") + ".csv";
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* Made-up classes for the preview button (shown only before the Sheet is connected). */
function sample(){
  const first = ["Aisha","Omar","Lina","Yousef","Maya","Khalid","Sara","Adam","Noor","Hamad","Layla","Rayan","Fatima","Zaid","Hana","Ibrahim","Mariam","Sami"];
  const last = ["A.","B.","C.","D.","H.","K.","M.","N.","R.","S."];
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const mk = (cls, subject, titles, n) => { const year = "Year " + parseInt(cls);
    const lessons = titles.map((t,i) => ({id:"l"+i, title:t, date:""}));
    const students = Array.from({length:n}, (_,i) => { const lvl = 25 + rnd()*75, done = {};
      lessons.forEach(l => { if(rnd() < 0.82){ const p = Math.max(5, Math.min(100, Math.round(lvl + (rnd()-0.5)*30))); done[l.id] = [p, rnd() < 0.8 ? 1 : 0, "7/10"]; } });
      return {name: first[(i*5 + cls.charCodeAt(1)) % first.length] + " " + last[(i*3 + parseInt(cls)) % last.length], onRoster: true, done}; });
    return {term:"Term 1", year, cls, subject, lessons, students}; };
  const msc = ["Healthy lifestyles","Media and me","Rights and duties","Giving in the UAE","Community heroes"];
  const lit = ["Unit 1 Week 1 READ","Unit 1 Week 1 WORDS","Unit 1 Week 1 WRITE","Unit 1 Week 2 READ"];
  return {ok:true, sample:true, updated:new Date().toISOString(), zeroForMissed:false,
    terms:{"Term 1":"2000-01-01","Term 2":"2999-01-01","Term 3":"2999-06-01"},
    groups:[mk("7A","MSC",msc,16), mk("7B","MSC",msc,15), mk("7A","Literacy",lit,16), mk("8A","MSC",msc.slice(0,4),17), mk("8B","Literacy",lit,14)]};
}

window.Teacher = { show, leave(){ document.body.classList.remove("staff"); } };
})();
