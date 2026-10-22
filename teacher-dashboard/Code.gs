/**
 * Meadows Compass – Teacher Dashboard (Google Sheets + Apps Script)
 *
 * Receives lesson results from the student website and builds:
 *   Dashboard   – pick Term, Class and Subject; see the four-band breakdown and every student
 *   Completion  – one grid per class and subject: who has / hasn't done each lesson, with %
 *   Report      – one row per student, class, subject and term (term average + band)
 *   Results     – one row per student per lesson (raw data sent by the website)
 *   Roster      – paste your class lists here (Class | Student)
 *   Name fixes  – correct names students typed differently from the roster
 *   Settings    – term start dates and how the term average is worked out
 *
 * Setup: Extensions → Apps Script → paste this file → Run "setup" → Deploy as Web app.
 * Full steps are in teacher-dashboard/SETUP.md.
 */

const SH = { dash: "Dashboard", comp: "Completion", report: "Report", results: "Results",
             roster: "Roster", fixes: "Name fixes", settings: "Settings", lists: "Lists" };

const RESULT_HEAD = ["Updated", "Term", "Year", "Class", "Student", "Subject", "Lesson", "Lesson date",
  "Steps done", "Steps total", "Auto-marked correct", "Auto-marked total", "Steps %", "Auto-marked %",
  "Lesson %", "Band", "Status", "Lesson ID", "Key"];
const R = {}; RESULT_HEAD.forEach((h, i) => R[h] = i);   // column index by heading

const REPORT_HEAD = ["Term", "Year", "Class", "Subject", "Student", "On roster", "Lessons set",
  "Lessons attempted", "Lessons completed", "Completion %", "Term average %", "Band", "Not attempted yet"];

const BANDS = [
  { name: "Below",           min: 0,  bg: "#f4c7c3", fg: "#7a1c12" },
  { name: "Working towards", min: 40, bg: "#fce8b2", fg: "#6b4e00" },
  { name: "Meeting",         min: 60, bg: "#b7e1cd", fg: "#0d5132" },
  { name: "Exceeding",       min: 80, bg: "#a4c2f4", fg: "#123a7a" }
];
const NONE = { name: "No work yet", bg: "#eeeeee", fg: "#555555" };
const SUBJECTS = ["MSC", "Social Studies", "Moral Education", "Literacy"];

function band(pct) {
  if (pct === "" || pct == null || isNaN(pct)) return NONE.name;
  const p = Math.round(Number(pct));
  let b = BANDS[0];
  BANDS.forEach(x => { if (p >= x.min) b = x; });
  return b.name;
}

/* ---------------- receiving results from the website ---------------- */

function doGet() {
  return ContentService.createTextOutput("Meadows Compass results endpoint is running.");
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_("bad json"); }
  const clean = validate_(d);
  if (!clean) return out_("rejected");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SH.results);
    const key = [clean.student.toLowerCase(), clean.cls, clean.lessonKey].join("|");
    const row = [new Date(), termOf_(clean.lessonDate ? new Date(clean.lessonDate + "T00:00:00") : new Date()),
      "Year " + clean.year, clean.cls, clean.student, clean.subjectName, clean.title,
      clean.lessonDate ? new Date(clean.lessonDate + "T00:00:00") : "",
      clean.stepsDone, clean.stepsTotal, clean.autoCorrect, clean.autoTotal,
      clean.stepsPct / 100, clean.autoPct === "" ? "" : clean.autoPct / 100, clean.lessonPct / 100,
      band(clean.lessonPct), clean.complete ? "Completed" : "In progress", clean.lessonId, key];
    const hit = sh.getRange(2, R.Key + 1, Math.max(1, sh.getLastRow() - 1), 1)
      .createTextFinder(key).matchEntireCell(true).matchCase(true).findNext();
    if (hit) sh.getRange(hit.getRow(), 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
  } finally { lock.releaseLock(); }
  return out_("ok");
}

function out_(t) { return ContentService.createTextOutput(t); }

function validate_(d) {
  if (!d || typeof d !== "object") return null;
  const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const num = (v, lo, hi) => { const x = Math.round(Number(v)); return isNaN(x) ? lo : Math.min(hi, Math.max(lo, x)); };
  const student = tidyName_(str(d.student, 80));
  const cls = str(d.cls, 4).toUpperCase();
  const lessonKey = str(d.lessonKey, 60);
  if (!student || !/^\d{1,2}[A-Z]$/.test(cls) || !/^y\d{1,2}-[\w-]+$/.test(lessonKey)) return null;
  const subjectName = SUBJECTS.indexOf(d.subjectName) >= 0 ? d.subjectName : null;
  if (!subjectName) return null;
  const date = str(d.lessonDate, 10);
  return {
    student, cls, lessonKey, subjectName,
    year: num(d.year, 1, 13), title: str(d.title, 160), lessonId: str(d.lessonId, 40),
    lessonDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    stepsDone: num(d.stepsDone, 0, 50), stepsTotal: num(d.stepsTotal, 0, 50),
    autoCorrect: num(d.autoCorrect, 0, 500), autoTotal: num(d.autoTotal, 0, 500),
    stepsPct: num(d.stepsPct, 0, 100), autoPct: d.autoPct === "" ? "" : num(d.autoPct, 0, 100),
    lessonPct: num(d.lessonPct, 0, 100), complete: !!d.complete
  };
}

/* "  mohammed   ali " → "Mohammed Ali" (Arabic and other scripts are left as typed). */
function tidyName_(s) {
  return s.replace(/\s+/g, " ").trim().split(" ")
    .map(w => /^[a-z]/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
}
const nameKey_ = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

/* ---------------- settings ---------------- */

function settings_() {
  const v = sheet_(SH.settings).getRange("A2:B10").getValues();
  const s = {}; v.forEach(r => { if (r[0]) s[String(r[0]).trim()] = r[1]; });
  return s;
}

function termOf_(date) {
  const s = settings_();
  const starts = [["Term 1", s["Term 1 starts"]], ["Term 2", s["Term 2 starts"]], ["Term 3", s["Term 3 starts"]]]
    .filter(t => t[1] instanceof Date);
  let term = "Term 1";
  starts.forEach(t => { if (date >= t[1]) term = t[0]; });
  return term;
}

/* ---------------- building the dashboard ---------------- */

function refresh() {
  const ss = SpreadsheetApp.getActive();
  const s = settings_();
  const zeroForMissed = String(s["Missed lessons count as 0%"] || "No").toLowerCase().indexOf("y") === 0;

  // Roster and name fixes
  const roster = {}; // class -> [names]
  rows_(SH.roster).forEach(r => {
    const c = String(r[0]).trim().toUpperCase(), n = tidyName_(String(r[1] || ""));
    if (c && n) (roster[c] = roster[c] || []).push(n);
  });
  const fix = {};
  rows_(SH.fixes).forEach(r => {
    const typed = nameKey_(r[0]), c = String(r[1]).trim().toUpperCase(), right = tidyName_(String(r[2] || ""));
    if (typed && right) fix[c + "|" + typed] = right;
  });
  const realName = (c, n) => fix[c + "|" + nameKey_(n)] || n;
  const onRoster = {}; Object.keys(roster).forEach(c => roster[c].forEach(n => onRoster[c + "|" + nameKey_(n)] = n));

  // Results grouped by term + class + subject
  const groups = {};
  rows_(SH.results).forEach(r => {
    const term = r[R.Term], cls = String(r[R.Class]), subj = r[R.Subject];
    if (!term || !cls || !subj) return;
    const gk = [term, cls, subj].join("|");
    const g = groups[gk] = groups[gk] || { term, year: r[R.Year], cls, subj, lessons: {}, students: {} };
    const lid = r[R["Lesson ID"]];
    if (!g.lessons[lid]) g.lessons[lid] = { id: lid, title: r[R.Lesson], date: r[R["Lesson date"]] };
    let name = realName(cls, r[R.Student]);
    name = onRoster[cls + "|" + nameKey_(name)] || name;
    const st = g.students[nameKey_(name)] = g.students[nameKey_(name)] || { name, done: {} };
    st.done[lid] = { pct: Number(r[R["Lesson %"]]) * 100, complete: r[R.Status] === "Completed",
      steps: r[R["Steps done"]] + "/" + r[R["Steps total"]] };
  });

  // Report: every roster student in a class that has lessons that term, plus anyone who sent results
  const report = [];
  Object.keys(groups).sort(groupSort_).forEach(gk => {
    const g = groups[gk];
    (roster[g.cls] || []).forEach(n => { if (!g.students[nameKey_(n)]) g.students[nameKey_(n)] = { name: n, done: {} }; });
    g.lessonList = Object.values(g.lessons).sort((a, b) => (a.date || 0) - (b.date || 0) || String(a.id).localeCompare(String(b.id)));
    g.studentList = Object.values(g.students).sort((a, b) => a.name.localeCompare(b.name));
    g.studentList.forEach(st => {
      const done = g.lessonList.filter(l => st.done[l.id]);
      const sum = done.reduce((a, l) => a + st.done[l.id].pct, 0);
      const set = g.lessonList.length;
      const avg = zeroForMissed ? (set ? sum / set : "") : (done.length ? sum / done.length : "");
      st.avg = avg === "" ? "" : Math.round(avg);
      report.push([g.term, g.year, g.cls, g.subj, st.name, onRoster[g.cls + "|" + nameKey_(st.name)] ? "Yes" : "Check name",
        set, done.length, done.filter(l => st.done[l.id].complete).length,
        set ? done.length / set : 0, st.avg === "" ? "" : st.avg / 100, band(st.avg),
        g.lessonList.filter(l => !st.done[l.id]).map(l => l.title).join(" · ")]);
    });
  });
  writeTable_(SH.report, REPORT_HEAD, report);
  const rs = sheet_(SH.report);
  if (report.length) {
    rs.getRange(2, 10, report.length, 2).setNumberFormat("0%");
  }
  rs.setColumnWidth(5, 190); rs.setColumnWidth(13, 420); rs.setColumnWidth(4, 130);

  // Dropdown lists for the Dashboard
  const terms = unique_(report.map(r => r[0])).sort();
  const classes = unique_(report.map(r => r[2])).sort(classSort_);
  const years = unique_(report.map(r => r[1])).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const lists = sheet_(SH.lists); lists.clear();
  const col = (c, vals) => lists.getRange(1, c, vals.length, 1).setValues(vals.map(v => [v]));
  col(1, ["Term 1", "Term 2", "Term 3"]);
  col(2, ["All"].concat(years));
  col(3, ["All"].concat(classes));
  col(4, ["All"].concat(SUBJECTS));
  lists.hideSheet();

  buildCompletion_(groups);
  ss.getSheetByName(SH.dash).getRange("F2").setValue("Last refreshed: " +
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "d MMM yyyy, HH:mm"));
}

/* Completion: one block per class + subject for the term chosen on the Dashboard. */
function buildCompletion_(groups) {
  const term = String(SpreadsheetApp.getActive().getSheetByName(SH.dash).getRange("B4").getValue() || "Term 1");
  const sh = sheet_(SH.comp);
  sh.clear(); sh.clearNotes();
  sh.getRange(1, 1).setValue("Lesson completion · " + term + "  (change the term on the Dashboard, then Meadows Compass → Refresh dashboard)")
    .setFontWeight("bold").setFontSize(12);
  sh.getRange(2, 1).setValue("Each cell is the lesson %. — means not attempted yet. Italic means started but not finished (hover for steps done).")
    .setFontColor("#555555");
  const keys = Object.keys(groups).filter(k => groups[k].term === term).sort(groupSort_);
  if (!keys.length) { sh.getRange(4, 1).setValue("No results for " + term + " yet."); return; }
  const width = Math.max.apply(null, keys.map(k => groups[k].lessonList.length)) + 4;
  const vals = [], bgs = [], fgs = [], notes = [], styles = [], weights = [], heads = [];
  const pad = (row, fill) => { while (row.length < width) row.push(fill); return row; };
  const push = (v, bg, fg, note, st, w) => { vals.push(pad(v, "")); bgs.push(pad(bg, null)); fgs.push(pad(fg, null));
    notes.push(pad(note, "")); styles.push(pad(st, "normal")); weights.push(pad(w, "normal")); };
  keys.forEach(k => {
    const g = groups[k], L = g.lessonList;
    heads.push(vals.length + 4);
    push([g.cls + " · " + g.subj + "  (" + g.year + ")"], [], [], [], [], ["bold"]);
    push(["Student"].concat(L.map((l, i) => "L" + (i + 1) + " " + l.title), ["Done", "Term avg", "Band"]),
      Array(L.length + 4).fill("#e8eaed"), [], [""].concat(L.map(l => l.title)), [], Array(L.length + 4).fill("bold"));
    g.studentList.forEach(st => {
      const v = [st.name], bg = [null], fg = [null], nt = [""], sty = ["normal"];
      L.forEach(l => {
        const d = st.done[l.id];
        if (!d) { v.push("—"); bg.push("#fbe3e1"); fg.push("#9a2a1f"); nt.push("Not attempted"); sty.push("normal"); return; }
        const b = BANDS.filter(x => x.name === band(d.pct))[0];
        v.push(Math.round(d.pct) / 100); bg.push(b.bg); fg.push(b.fg);
        nt.push(d.complete ? "Completed" : "In progress · steps " + d.steps); sty.push(d.complete ? "normal" : "italic");
      });
      const n = L.filter(l => st.done[l.id]).length, bn = band(st.avg), b = BANDS.filter(x => x.name === bn)[0] || NONE;
      v.push(n + " of " + L.length, st.avg === "" ? "" : st.avg / 100, bn);
      bg.push(null, b.bg, b.bg); fg.push(null, b.fg, b.fg); nt.push("", "", ""); sty.push("normal", "normal", "normal");
      push(v, bg, fg, nt, sty, []);
    });
    push([], [], [], [], [], []);
  });
  const rng = sh.getRange(4, 1, vals.length, width);
  rng.setValues(vals).setBackgrounds(bgs).setFontColors(fgs).setNotes(notes).setFontStyles(styles).setFontWeights(weights)
    .setNumberFormat("0%").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sh.getRange(4, 1, vals.length, 1).setHorizontalAlignment("left");
  heads.forEach(r => sh.getRange(r + 1, 2, 1, width - 1).setWrap(true));
  sh.setColumnWidth(1, 200); if (width > 1) sh.setColumnWidths(2, width - 1, 110);
  sh.setFrozenColumns(1);
}

/* ---------------- one-time setup ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone("Asia/Dubai");

  // Settings
  const st = sheet_(SH.settings);
  if (!st.getRange("A1").getValue()) {
    st.getRange("A1:C1").setValues([["Setting", "Value", "Notes"]]).setFontWeight("bold");
    st.getRange("A2:C6").setValues([
      ["Term 1 starts", new Date(2026, 7, 17), "Results are placed in a term by the lesson's date (or the day they were sent)."],
      ["Term 2 starts", new Date(2027, 0, 4), "Change these to your school calendar."],
      ["Term 3 starts", new Date(2027, 3, 5), ""],
      ["Missed lessons count as 0%", "No", "No = term average of lessons attempted. Yes = missed lessons count as 0%."],
      ["Bands", "Below 0–39% · Working towards 40–59% · Meeting 60–79% · Exceeding 80–100%", ""]]);
    st.getRange("B2:B4").setNumberFormat("d mmm yyyy");
    st.getRange("B5").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["No", "Yes"]).build());
    st.setColumnWidth(1, 220); st.setColumnWidth(2, 220); st.setColumnWidth(3, 520);
  }

  // Raw tables
  header_(SH.results, RESULT_HEAD);
  const res = sheet_(SH.results);
  res.getRange("A:A").setNumberFormat("d mmm yyyy HH:mm"); res.getRange("H:H").setNumberFormat("d mmm yyyy");
  res.getRange("M:O").setNumberFormat("0%"); res.hideColumns(R.Key + 1);
  header_(SH.roster, ["Class", "Student", "", "Paste each class list here: class in column A (e.g. 8A), full name in column B."]);
  header_(SH.fixes, ["Name the student typed", "Class", "Correct name (as on Roster)", "",
    "Use when a student typed their name differently. Their results then join the right row."]);
  header_(SH.report, REPORT_HEAD);

  buildDashboard_();
  sheet_(SH.comp);
  bandFormatting_();

  // Order the tabs
  [SH.dash, SH.comp, SH.report, SH.results, SH.roster, SH.fixes, SH.settings].forEach((n, i) => {
    ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
  const def = ss.getSheetByName("Sheet1"); if (def && def.getLastRow() === 0) ss.deleteSheet(def);
  ss.setActiveSheet(ss.getSheetByName(SH.dash));

  // Refresh every 10 minutes
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "refresh").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("refresh").timeBased().everyMinutes(10).create();
  refresh();
}

function buildDashboard_() {
  const d = sheet_(SH.dash);
  d.clear();
  d.getRange("A1").setValue("Meadows Compass · Teacher Dashboard").setFontSize(16).setFontWeight("bold");
  d.getRange("A2").setValue("Choose a term, year group, class and subject. Student results update every 10 minutes.").setFontColor("#555555");
  const labels = [["Term"], ["Year group"], ["Class"], ["Subject"]];
  d.getRange("A4:A7").setValues(labels).setFontWeight("bold");
  d.getRange("B4:B7").setValues([["Term 1"], ["All"], ["All"], ["All"]]).setBackground("#fff8e1").setFontWeight("bold");
  const list = (a1) => SpreadsheetApp.newDataValidation().requireValueInRange(sheet_(SH.lists).getRange(a1), true).build();
  d.getRange("B4").setDataValidation(list("A1:A3"));
  d.getRange("B5").setDataValidation(list("B1:B20"));
  d.getRange("B6").setDataValidation(list("C1:C80"));
  d.getRange("B7").setDataValidation(list("D1:D5"));

  // Matching rows of the Report as a reusable condition
  const f = () => `(Report!A2:A=$B$4)*(($B$5="All")+(Report!B2:B=$B$5)>0)*(($B$6="All")+(Report!C2:C=$B$6)>0)*(($B$7="All")+(Report!D2:D=$B$7)>0)`;

  d.getRange("D4").setValue("Achievement bands (students)").setFontWeight("bold");
  d.getRange("D5:G5").setValues([["Band", "Range", "Students", "% of students"]]).setFontWeight("bold").setBackground("#e8eaed");
  const rows = [["Below", "0–39%"], ["Working towards", "40–59%"], ["Meeting", "60–79%"], ["Exceeding", "80–100%"]];
  d.getRange("D6:E9").setValues(rows);
  for (let i = 0; i < 4; i++) {
    const r = 6 + i;
    d.getRange("F" + r).setFormula(`=SUMPRODUCT(${f()}*(Report!L2:L=D${r}))`);
    d.getRange("G" + r).setFormula(`=IFERROR(F${r}/SUM($F$6:$F$9),0)`);
  }
  d.getRange("D10:G10").setValues([["Meeting or above", "60–100%", "=F8+F9", "=IFERROR(F10/SUM($F$6:$F$9),0)"]]).setFontWeight("bold");
  d.getRange("D11:G11").setValues([["No work yet", "", `=SUMPRODUCT(${f()}*(Report!L2:L="No work yet"))`, ""]]).setFontColor("#555555");
  d.getRange("G6:G10").setNumberFormat("0%");

  d.getRange("I4").setValue("Lesson completion").setFontWeight("bold");
  d.getRange("I5:J8").setValues([
    ["Average completion", `=IFERROR(SUMPRODUCT(${f()}*Report!J2:J)/SUMPRODUCT(${f()}),0)`],
    ["Average term %", `=IFERROR(SUMPRODUCT(${f()}*(Report!K2:K<>"")*Report!K2:K)/SUMPRODUCT(${f()}*(Report!K2:K<>"")),0)`],
    ["Students who have missed a lesson", `=SUMPRODUCT(${f()}*(Report!H2:H<Report!G2:G))`],
    ["Names to check against Roster", `=SUMPRODUCT(${f()}*(Report!F2:F="Check name"))`]]);
  d.getRange("J5:J6").setNumberFormat("0%");

  d.getRange("A13").setValue("Students").setFontWeight("bold").setFontSize(12);
  d.getRange("A14:I14").setValues([["Class", "Subject", "Student", "Lessons set", "Attempted", "Completion",
    "Term average", "Band", "Not attempted yet"]]).setFontWeight("bold").setBackground("#e8eaed");
  d.getRange("A15").setFormula(`=IFERROR(SORT(FILTER({Report!C2:C,Report!D2:D,Report!E2:E,Report!G2:G,Report!H2:H,Report!J2:J,Report!K2:K,Report!L2:L,Report!M2:M},${f()}),1,TRUE,2,TRUE,3,TRUE),"No results yet for this choice.")`);
  d.getRange("F15:G").setNumberFormat("0%");
  d.setColumnWidth(1, 130); d.setColumnWidth(2, 130); d.setColumnWidth(3, 190); d.setColumnWidth(4, 150);
  d.setColumnWidth(5, 90); d.setColumnWidth(9, 210); d.setColumnWidth(10, 120); d.setColumnWidth(6, 90); d.setColumnWidth(7, 110); d.setColumnWidth(8, 130);
}

function bandFormatting_() {
  [[SH.dash, "D6:D11"], [SH.dash, "H15:H"], [SH.report, "L2:L"], [SH.results, "P2:P"]].forEach(([n, a1]) => {
    const sh = sheet_(n), rng = sh.getRange(a1);
    const rules = sh.getConditionalFormatRules().filter(r => !r.getRanges().some(x => x.getA1Notation() === rng.getA1Notation()));
    BANDS.concat([NONE]).forEach(b => rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(b.name).setBackground(b.bg).setFontColor(b.fg).setRanges([rng]).build()));
    sh.setConditionalFormatRules(rules);
  });
}

/* ---------------- menu ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Meadows Compass")
    .addItem("Refresh dashboard", "refresh")
    .addItem("Rebuild layout (keeps all data)", "setup")
    .addToUi();
}

/* ---------------- helpers ---------------- */

function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function header_(name, head) {
  const sh = sheet_(name);
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#e8eaed");
  sh.setFrozenRows(1);
}
function rows_(name) {
  const sh = sheet_(name), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, Math.max(1, sh.getLastColumn())).getValues().filter(r => r.some(c => c !== ""));
}
function writeTable_(name, head, rows) {
  const sh = sheet_(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#e8eaed");
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
}
function unique_(a) { return a.filter((v, i) => v !== "" && a.indexOf(v) === i); }
function classSort_(a, b) { return parseInt(a) - parseInt(b) || String(a).localeCompare(String(b)); }
function groupSort_(a, b) {
  const x = a.split("|"), y = b.split("|");
  return x[0].localeCompare(y[0]) || classSort_(x[1], y[1]) || SUBJECTS.indexOf(x[2]) - SUBJECTS.indexOf(y[2]);
}
