/**
 * Meadows Compass – Teacher Dashboard (Google Sheets + Apps Script)
 *
 * Students identify themselves on the website with their M Number. Each lesson result is sent here.
 * The student and teacher lists are read from the school's master Sheet (Settings → Student list Sheet):
 * every student's section and, per subject, their teacher's code (e.g. PLO, SAY).
 *
 *   Dashboard   – pick Term, Year, Class and Subject; four-band breakdown and every student
 *   Completion  – one grid per class and subject: who has / hasn't done each lesson, with %
 *   Report      – one row per student, subject and term (term average + band)
 *   Results     – one row per student per lesson (raw data sent by the website)
 *   Roster      – students with their teacher codes per subject (imported from the master list,
 *                 plus students teachers add on the website)
 *   Teachers    – staff logins: username, password (stored scrambled), code, extra classes, role
 *   Settings    – term dates, term average rule, link to the master student list
 *
 * Website Staff page (#teacher): each teacher signs in and sees only the students linked to her code;
 * leaders see everyone and manage logins.
 *
 * Setup: Extensions → Apps Script → paste this file → Run "setup" → Deploy as Web app.
 * Full steps are in teacher-dashboard/SETUP.md.
 */

const SH = { dash: "Dashboard", comp: "Completion", report: "Report", results: "Results",
             roster: "Roster", settings: "Settings", lists: "Lists", teachers: "Teachers" };

const SUBJECTS = ["MSC", "Social Studies", "Moral Education", "Literacy"];

const RESULT_HEAD = ["Updated", "Term", "Year", "Class", "M Number", "Student", "Subject", "Lesson", "Lesson date",
  "Steps done", "Steps total", "Auto-marked correct", "Auto-marked total", "Steps %", "Auto-marked %",
  "Lesson %", "Band", "Status", "Lesson ID", "Key"];
const R = {}; RESULT_HEAD.forEach((h, i) => R[h] = i);

const ROSTER_HEAD = ["M Number", "Student", "Class", "Section"].concat(SUBJECTS, ["Source", "Added on"]);
const RO = {}; ROSTER_HEAD.forEach((h, i) => RO[h] = i);

const TEACHER_HEAD = ["Username", "Password", "Name", "Code", "Whole classes", "Role"];
const TE = {}; TEACHER_HEAD.forEach((h, i) => TE[h] = i);

const REPORT_HEAD = ["Term", "Year", "Class", "Subject", "Teacher", "M Number", "Student", "On list", "Lessons set",
  "Lessons attempted", "Lessons completed", "Completion %", "Term average %", "Band", "Not attempted yet"];

const BANDS = [
  { name: "Below",           min: 0,  bg: "#f4c7c3", fg: "#7a1c12" },
  { name: "Working towards", min: 40, bg: "#fce8b2", fg: "#6b4e00" },
  { name: "Meeting",         min: 60, bg: "#b7e1cd", fg: "#0d5132" },
  { name: "Exceeding",       min: 80, bg: "#a4c2f4", fg: "#123a7a" }
];
const NONE = { name: "No work yet", bg: "#eeeeee", fg: "#555555" };
/* Full names for teacher codes (the master list's key gives "Ms. Ayoub" style names or none). Edit freely. */
const KNOWN_NAMES = { SAY: "Sara Ayoub", PLO: "Premraj Loganathan", AZE: "Aiman Zein", RKH: "Rasha Khasawneh",
  LHU: "Laura Husseiny", EPU: "Emel Punar", AIS: "Abeer Issa", FNA: "Fardoos Nagi", AEL: "Amany Elgwely",
  MAL: "Mariam Aldaouk", RAL: "Raj Alrahman", RKA: "Ruby Kaur", ANE: "Ashley New", NQU: "Naveed Qureshi",
  RZE: "Rida Zein", MEL: "Marwa Elgamel" };
/* Classes a teacher sees whole, when the master list doesn't cover them (from the 2026–27 timetable:
   Years 12–13 Moral Education is taught by MEL and RZE). Used when their login is first created. */
const WHOLE_CLASSES = { MEL: "12A, 12B, 12C, 12D, 13A, 13B, 13C, 13D", RZE: "12A, 12B, 12C, 12D, 13A, 13B, 13C, 13D" };
const MASTER_DEFAULT = "https://docs.google.com/spreadsheets/d/1RL6aYKfV2GdSI9vmed7Gw8RHkB2K6mKLxcW3NQpJtGc/edit";

function band(pct) {
  if (pct === "" || pct == null || isNaN(pct)) return NONE.name;
  const p = Math.round(Number(pct));
  let b = BANDS[0];
  BANDS.forEach(x => { if (p >= x.min) b = x; });
  return b.name;
}

/* ================= web endpoints ================= */

function doGet() {
  return ContentService.createTextOutput("Meadows Compass results endpoint is running.");
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_("bad json"); }
  if (d && d.action) return json_(staffAction_(d));   // Staff page
  const clean = validate_(d);
  if (!clean) return out_("rejected");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const known = rosterIndex_()[clean.mno];
    const cls = known ? known.cls : clean.cls;
    const name = known ? known.name : clean.student;
    const sh = sheet_(SH.results);
    const key = clean.mno + "|" + clean.lessonKey;
    const date = clean.lessonDate ? new Date(clean.lessonDate + "T00:00:00") : "";
    const row = [new Date(), termOf_(date || new Date()), "Year " + clean.year, cls, clean.mno, name, clean.subjectName,
      clean.title, date, clean.stepsDone, clean.stepsTotal, clean.autoCorrect, clean.autoTotal,
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
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

const cleanText_ = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
function mNumber_(v) {
  const s = String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "");
  const m = s.match(/^M?(\d{3,7})$/);
  return m ? "M" + m[1] : "";
}

function validate_(d) {
  if (!d || typeof d !== "object") return null;
  const num = (v, lo, hi) => { const x = Math.round(Number(v)); return isNaN(x) ? lo : Math.min(hi, Math.max(lo, x)); };
  const mno = mNumber_(d.mno);
  const cls = cleanText_(d.cls, 4).toUpperCase();
  const lessonKey = cleanText_(d.lessonKey, 60);
  if (!mno || !/^\d{1,2}[A-Z]$/.test(cls) || !/^y\d{1,2}-[\w-]+$/.test(lessonKey)) return null;
  if (SUBJECTS.indexOf(d.subjectName) < 0) return null;
  const date = cleanText_(d.lessonDate, 10);
  return {
    mno, cls, lessonKey, subjectName: d.subjectName, student: tidyName_(cleanText_(d.student, 80)) || mno,
    year: num(d.year, 1, 13), title: cleanText_(d.title, 160), lessonId: cleanText_(d.lessonId, 40),
    lessonDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    stepsDone: num(d.stepsDone, 0, 50), stepsTotal: num(d.stepsTotal, 0, 50),
    autoCorrect: num(d.autoCorrect, 0, 500), autoTotal: num(d.autoTotal, 0, 500),
    stepsPct: num(d.stepsPct, 0, 100), autoPct: d.autoPct === "" ? "" : num(d.autoPct, 0, 100),
    lessonPct: num(d.lessonPct, 0, 100), complete: !!d.complete
  };
}

/* "  mohammed   ali " → "Mohammed Ali" (Arabic and other scripts are left as typed). */
function tidyName_(s) {
  return String(s || "").replace(/\s+/g, " ").trim().split(" ")
    .map(w => /^[a-z]/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
}
const codes_ = v => unique_(String(v || "").toUpperCase().split(/[\/,;&+\s]+/).map(x => x.trim()).filter(x => /^[A-Z]{2,4}$/.test(x) && x !== "NA"));

/* ================= roster ================= */

/* M Number → { m, name, cls, section, subj: {MSC:[codes]...}, added:[{subject, by}] }.
   Master rows and teacher-added rows for the same M Number are merged. */
function rosterIndex_() {
  const idx = {};
  rows_(SH.roster).forEach(r => {
    const m = mNumber_(r[RO["M Number"]]); if (!m) return;
    const src = String(r[RO.Source] || "");
    const isMaster = /^master/i.test(src);
    const st = idx[m] = idx[m] || { m, name: "", cls: "", section: "", subj: {}, added: [] };
    if (isMaster || !st.name) { st.name = tidyName_(r[RO.Student]) || st.name; st.cls = String(r[RO.Class] || st.cls).toUpperCase(); st.section = String(r[RO.Section] || st.section); }
    SUBJECTS.forEach(s => {
      const c = codes_(r[RO[s]]);
      if (c.length) st.subj[s] = unique_((st.subj[s] || []).concat(c));
      if (!isMaster && c.length) st.added.push({ subject: s, by: src.replace(/^added by\s*/i, "").toLowerCase(), codes: c });
    });
  });
  return idx;
}

/* Section "Y7AA" → class "7A" (the website's class names). */
function classOfSection_(sec) {
  const m = String(sec || "").toUpperCase().replace(/\s+/g, "").match(/^Y?(\d{1,2})([A-Z])/);
  return m ? m[1] + m[2] : "";
}

/* Read the master Sheet: one tab per year ("Year 7" … "Year 11"). Columns are found by their headings. */
function importLists() {
  const url = String(settings_()["Student list Sheet"] || "").trim();
  if (!url) throw new Error("Add the master student list link on the Settings tab first.");
  const src = /^https?:/.test(url) ? SpreadsheetApp.openByUrl(url) : SpreadsheetApp.openById(url);
  const students = [], legend = {};
  src.getSheets().forEach(sh => {
    if (!/year\s*\d+/i.test(sh.getName())) return;
    const v = sh.getDataRange().getDisplayValues();
    const hr = v.findIndex(r => r.some(c => /^name$/i.test(c.trim())) && r.some(c => /^section$/i.test(c.trim())));
    if (hr < 0) return;
    const H = v[hr].map(c => c.replace(/\s+/g, "").toLowerCase());
    const col = re => H.findIndex(h => re.test(h));
    let cM = col(/^mnumber$/), cName = col(/^name$/), cSec = col(/^section$/), cMel = col(/^me\/?lit$/), cSsm = col(/^ss\/?msc$/), cLi = col(/^literacy\/?islamicteacher$/);
    if (cM < 0) cM = 0;
    for (let i = hr + 1; i < v.length; i++) {
      const r = v[i];
      // teacher key: a code followed by "Ms./Mr. Name" anywhere in the row
      for (let c = 0; c < r.length - 1; c++) {
        const code = r[c].trim().toUpperCase(), nm = r[c + 1].trim();
        if (/^[A-Z]{2,4}$/.test(code) && /^(ms|mr|mrs|miss|dr)\b/i.test(nm)) legend[code] = nm.replace(/\s+/g, " ").replace(/^(Ms|Mr|Mrs|Dr)\s*\.\s*/i, "$1. ");
      }
      const m = mNumber_(r[cM]); if (!m) continue;
      const subj = {}; SUBJECTS.forEach(s => subj[s] = []);
      const mel = cMel >= 0 ? r[cMel].trim().toLowerCase() : "", melT = cMel >= 0 ? codes_(r[cMel + 1]) : [];
      if (mel === "lit") subj.Literacy = subj.Literacy.concat(melT); else if (mel === "me") subj["Moral Education"] = melT;
      const ssm = cSsm >= 0 ? r[cSsm].trim().toLowerCase() : "", ssmT = cSsm >= 0 ? codes_(r[cSsm + 1]) : [];
      if (ssm === "msc") subj.MSC = ssmT; else if (ssm === "ss") subj["Social Studies"] = ssmT;
      if (cLi >= 0) subj.Literacy = unique_(subj.Literacy.concat(codes_(r[cLi])));   // both Literacy teachers see the student
      const sec = r[cSec].trim();
      students.push([m, tidyName_(r[cName]), classOfSection_(sec), sec].concat(SUBJECTS.map(s => subj[s].join(", ")), ["Master list", ""]));
    }
  });
  if (!students.length) throw new Error("No students found in the master Sheet. Check the link and that each year tab has M Number, Name and Section headings.");

  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    // Keep students that teachers added, replace master rows
    const kept = rows_(SH.roster).filter(r => !/^master/i.test(String(r[RO.Source] || ""))).map(r => ROSTER_HEAD.map((h, i) => r[i] == null ? "" : r[i]));
    const all = students.concat(kept);
    const sh = sheet_(SH.roster);
    sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), ROSTER_HEAD.length).clearContent();
    header_(SH.roster, ROSTER_HEAD);
    sh.getRange(2, 1, all.length, ROSTER_HEAD.length).setValues(all);

    // One teacher login per code (no password yet); existing logins are left alone
    const tch = sheet_(SH.teachers), have = {};
    rows_(SH.teachers).forEach(r => { have[String(r[TE.Username]).trim().toLowerCase()] = 1; codes_(r[TE.Code]).forEach(c => have["#" + c] = 1); });
    const used = {}; students.forEach(s => SUBJECTS.forEach((x, i) => codes_(s[4 + i]).forEach(c => used[c] = 1)));
    const add = Object.keys(used).concat(Object.keys(legend)).filter((c, i, a) => a.indexOf(c) === i && !have["#" + c] && !have[c.toLowerCase()]).sort()
      .map(c => [c.toLowerCase(), "", KNOWN_NAMES[c] || legend[c] || c, c, WHOLE_CLASSES[c] || "", "Teacher"]);
    if (add.length) tch.getRange(tch.getLastRow() + 1, 1, add.length, TEACHER_HEAD.length).setValues(add);
  } finally { lock.releaseLock(); }
  setSetting_("Last import", Utilities.formatDate(new Date(), "Asia/Dubai", "d MMM yyyy, HH:mm") + " · " + students.length + " students");
  return students.length;
}

/* ================= staff (Teachers tab) ================= */

function staffAction_(d) {
  const who = auth_(d);
  if (who.error) return who;
  const lock = LockService.getScriptLock();
  let r = null;
  if (["addStudent", "removeStudent", "saveStaff", "deleteStaff", "importLists"].indexOf(d.action) >= 0) {
    lock.waitLock(20000);
    try {
      if (d.action === "addStudent" || d.action === "removeStudent") r = studentChange_(who, d);
      else if (d.action === "importLists") r = who.role === "leader" ? { message: "Imported " + importLists() + " students from the master list." } : { error: "denied", message: "Only leaders can import the lists." };
      else r = staffAdmin_(who, d);
    } catch (err) { r = { error: "bad", message: String(err.message || err) }; }
    finally { lock.releaseLock(); }
    if (r.error) return r;
  }
  return Object.assign(dataFor_(who), r || {});
}

/* A teacher adds a student to one of her subjects (or removes one she added). */
function studentChange_(who, d) {
  const m = mNumber_(d.mno), subject = SUBJECTS.indexOf(d.subject) >= 0 ? d.subject : "";
  if (!m) return { error: "bad", message: "Enter the student's M Number (e.g. M9093)." };
  if (!subject) return { error: "bad", message: "Choose the subject." };
  const code = who.role === "leader" ? (codes_(d.code)[0] || who.code) : who.code;
  if (!code) return { error: "bad", message: who.role === "leader" ? "Choose the teacher code to add the student to." : "Your account has no teacher code yet. Ask a leader." };
  const sh = sheet_(SH.roster), idx = rosterIndex_(), known = idx[m];
  if (d.action === "addStudent") {
    if (known && (known.subj[subject] || []).indexOf(code) >= 0) return { error: "bad", message: (known.name || m) + " is already on " + code + "'s " + subject + " list." };
    const name = known ? known.name : tidyName_(cleanText_(d.name, 80));
    const cls = known ? known.cls : cleanText_(d.cls, 4).toUpperCase();
    if (!name) return { error: "bad", message: "This M Number isn't on the school list yet, so enter the student's full name too." };
    if (!/^\d{1,2}[A-Z]$/.test(cls)) return { error: "bad", message: "Choose the student's class." };
    const row = ROSTER_HEAD.map(() => "");
    row[RO["M Number"]] = m; row[RO.Student] = name; row[RO.Class] = cls; row[RO[subject]] = code;
    row[RO.Source] = "Added by " + who.user; row[RO["Added on"]] = new Date();
    sh.appendRow(row);
    return { message: name + " added to your " + subject + " list" + (who.role === "leader" && code !== who.code ? " for " + code : "") + "." };
  }
  // remove: only rows added on the website; teachers only their own
  const v = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), ROSTER_HEAD.length).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    const r = v[i], src = String(r[RO.Source] || "");
    if (mNumber_(r[RO["M Number"]]) !== m || /^master/i.test(src) || codes_(r[RO[subject]]).indexOf(code) < 0) continue;
    if (who.role !== "leader" && src.replace(/^added by\s*/i, "").toLowerCase() !== who.user) continue;
    sh.deleteRow(i + 2);
    return { message: (known && known.name || m) + " removed from the " + subject + " list." };
  }
  return { error: "denied", message: "Only students added on the website can be removed here. Students from the school list change when the school list changes." };
}

function auth_(d) {
  const user = String(d.user || "").trim().toLowerCase(), pass = String(d.pass || "");
  if (!user || !pass) return { error: "wrong", message: "Enter your username and password." };
  const cache = CacheService.getScriptCache(), ck = "fails:" + user;
  const fails = Number(cache.get(ck) || 0);
  if (fails >= 8) return { error: "locked", message: "Too many wrong passwords for this username. Try again in 15 minutes." };
  const row = rows_(SH.teachers).find(r => String(r[TE.Username]).trim().toLowerCase() === user);
  if (!row || !checkPass_(row[TE.Password], pass)) {
    cache.put(ck, String(fails + 1), 900);
    Utilities.sleep(800);
    return { error: "wrong", message: "That username or password isn't right." };
  }
  cache.remove(ck);
  if (String(row[TE.Password]).indexOf("sha256$") !== 0)   // typed into the Sheet: store it scrambled
    sheet_(SH.teachers).getRange(staffRange_(user).getRow(), TE.Password + 1).setValue(hashPass_(pass));
  return { user, name: String(row[TE.Name] || user), role: isLeader_(row[TE.Role]) ? "leader" : "teacher",
    code: codes_(row[TE.Code])[0] || "", classes: classList_(row[TE["Whole classes"]]) };
}
const isLeader_ = v => /leader|admin|slt/i.test(String(v || ""));
const classList_ = v => unique_(String(v || "").toUpperCase().split(/[,;\s]+/).map(x => x.trim()).filter(x => /^\d{1,2}[A-Z]$/.test(x))).sort(classSort_);

/* Passwords are stored as sha256$salt$hash. A password typed straight into the Sheet works once, then is scrambled. */
function hashPass_(pass, salt) {
  salt = salt || Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + "|" + pass, Utilities.Charset.UTF_8);
  return "sha256$" + salt + "$" + Utilities.base64Encode(bytes);
}
function checkPass_(stored, pass) {
  stored = String(stored == null ? "" : stored);
  if (!stored || !pass) return false;
  if (stored.indexOf("sha256$") === 0) return hashPass_(pass, stored.split("$")[1]) === stored;
  return stored === pass;
}
function staffRange_(user) {
  const sh = sheet_(SH.teachers), n = Math.max(1, sh.getLastRow() - 1), v = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < v.length; i++) if (String(v[i][0]).trim().toLowerCase() === user) return sh.getRange(i + 2, 1);
  return null;
}

/* Leaders manage staff logins from the website. */
function staffAdmin_(who, d) {
  if (who.role !== "leader") return { error: "denied", message: "Only leaders can manage staff accounts." };
  const sh = sheet_(SH.teachers);
  if (d.action === "deleteStaff") {
    const u = String(d.username || "").trim().toLowerCase();
    if (u === who.user) return { error: "bad", message: "You can't delete your own account." };
    const r = staffRange_(u); if (!r) return { error: "bad", message: "That account doesn't exist." };
    sh.deleteRow(r.getRow());
    return { message: "Account " + u + " deleted." };
  }
  const a = d.account || {};
  const user = String(a.user || "").trim().toLowerCase(), orig = String(a.orig || "").trim().toLowerCase();
  const name = cleanText_(a.name, 80), code = codes_(a.code)[0] || "";
  const classes = classList_((a.classes || []).join(","));
  const role = a.role === "Leader" ? "Leader" : "Teacher", pass = String(a.pass || "");
  if (!/^[a-z0-9._-]{2,40}$/.test(user)) return { error: "bad", message: "Username: 2–40 letters, numbers, dots or dashes, no spaces." };
  if (!name) return { error: "bad", message: "Enter the teacher's name." };
  if (pass && pass.length < 8) return { error: "bad", message: "Passwords need at least 8 characters." };
  const existing = orig ? staffRange_(orig) : null;
  if (orig && !existing) return { error: "bad", message: "That account no longer exists. Refresh and try again." };
  if (user !== orig && staffRange_(user)) return { error: "bad", message: "The username " + user + " is already taken." };
  if (!existing && !pass) return { error: "bad", message: "Set a password for the new account." };
  if (orig === who.user && (role !== "Leader" || user !== who.user)) return { error: "bad", message: "You can't change your own username or role here." };
  if (role === "Teacher" && !code && !classes.length) return { error: "bad", message: "Choose the teacher's code, or tick at least one whole class." };
  const stored = pass ? hashPass_(pass) : sh.getRange(existing.getRow(), TE.Password + 1).getValue();
  const row = [user, stored, name, code, classes.join(", "), role];
  if (existing) sh.getRange(existing.getRow(), 1, 1, TEACHER_HEAD.length).setValues([row]); else sh.appendRow(row);
  return { message: (existing ? "Saved " : "Created ") + name.replace(/\.$/, "") + (pass ? " with the new password." : ".") };
}

function staffList_(idx) {
  const count = {};
  Object.keys(idx).forEach(m => SUBJECTS.forEach(s => (idx[m].subj[s] || []).forEach(c => { count[c] = count[c] || {}; count[c][m] = 1; })));
  return rows_(SH.teachers).filter(r => String(r[TE.Username]).trim()).map(r => {
    const code = codes_(r[TE.Code])[0] || "";
    return { user: String(r[TE.Username]).trim().toLowerCase(), name: String(r[TE.Name] || ""), code,
      classes: classList_(r[TE["Whole classes"]]), role: isLeader_(r[TE.Role]) ? "Leader" : "Teacher",
      hasPass: String(r[TE.Password] || "") !== "", students: code && count[code] ? Object.keys(count[code]).length : 0 };
  }).sort((a, b) => (a.role === b.role ? 0 : a.role === "Leader" ? -1 : 1) || a.name.localeCompare(b.name));
}

/* Can this teacher see this student in this subject? */
function sees_(who, st, cls, subject) {
  if (who.role === "leader") return true;
  if (who.classes.indexOf(cls) >= 0) return true;
  return !!(who.code && st && (st.subj[subject] || []).indexOf(who.code) >= 0);
}

/* Everything the signed-in teacher may see. */
function dataFor_(who) {
  const d = computeData_(), idx = d.idx;
  const iso = v => v instanceof Date ? Utilities.formatDate(v, "Asia/Dubai", "yyyy-MM-dd") : (v || "");
  // groups (class + subject + term) she teaches at least one student in
  const teaches = {};
  Object.keys(idx).forEach(m => SUBJECTS.forEach(s => { if (sees_(who, idx[m], idx[m].cls, s) && (idx[m].subj[s] || []).length || who.role === "leader") teaches[idx[m].cls + "|" + s] = 1; }));
  who.classes.forEach(c => SUBJECTS.forEach(s => teaches[c + "|" + s] = 1));
  const groups = [];
  Object.keys(d.groups).sort(groupSort_).forEach(k => {
    const g = d.groups[k];
    if (!teaches[g.cls + "|" + g.subj]) return;
    const students = g.studentList.filter(st => st.known ? sees_(who, idx[st.m], g.cls, g.subj) : true);   // unknown M Numbers: shown to that class's teachers to sort out
    if (!students.length) return;
    groups.push({ term: g.term, year: g.year, cls: g.cls, subject: g.subj,
      lessons: g.lessonList.map(l => ({ id: String(l.id), title: l.title, date: iso(l.date) })),
      students: students.map(st => ({ m: st.m, name: st.name, onRoster: st.known,
        done: Object.keys(st.done).reduce((o, id) => { const x = st.done[id]; o[id] = [Math.round(x.pct), x.complete ? 1 : 0, x.steps]; return o; }, {}) })) });
  });
  // her students (class lists)
  const mine = [];
  Object.keys(idx).forEach(m => {
    const st = idx[m];
    SUBJECTS.forEach(s => {
      if (!(st.subj[s] || []).length && who.classes.indexOf(st.cls) < 0) return;
      if (!(st.subj[s] || []).length) return;
      if (!sees_(who, st, st.cls, s)) return;
      const add = st.added.filter(a => a.subject === s);
      mine.push({ m, name: st.name, cls: st.cls, subject: s, teachers: st.subj[s],
        addedBy: add.length ? add[0].by : "" });
    });
  });
  mine.sort((a, b) => classSort_(a.cls, b.cls) || SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.name.localeCompare(b.name));
  const mySubjects = unique_(mine.map(x => x.subject));
  const s = settings_();
  return { ok: true, updated: new Date().toISOString(), zeroForMissed: d.zeroForMissed, terms: settingsTerms_(),
    me: { user: who.user, name: who.name, role: who.role, code: who.code, classes: unique_(mine.map(x => x.cls).concat(who.classes)).sort(classSort_),
      subjects: mySubjects.length ? SUBJECTS.filter(x => mySubjects.indexOf(x) >= 0) : SUBJECTS.slice() },
    students: mine, staff: who.role === "leader" ? staffList_(idx) : undefined,
    lastImport: who.role === "leader" ? String(s["Last import"] || "") : undefined, groups };
}

function settingsTerms_() {
  const s = settings_(), out = {};
  ["Term 1", "Term 2", "Term 3"].forEach(t => { const v = s[t + " starts"]; out[t] = v instanceof Date ? Utilities.formatDate(v, "Asia/Dubai", "yyyy-MM-dd") : ""; });
  return out;
}

/* ================= settings ================= */

function settings_() {
  const v = sheet_(SH.settings).getRange("A2:B12").getValues();
  const s = {}; v.forEach(r => { if (r[0]) s[String(r[0]).trim()] = r[1]; });
  return s;
}
function setSetting_(name, value) {
  const sh = sheet_(SH.settings), v = sh.getRange("A2:A12").getValues();
  let i = v.findIndex(r => String(r[0]).trim() === name);
  if (i < 0) i = v.findIndex(r => !r[0]);
  sh.getRange(i + 2, 1, 1, 2).setValues([[name, value]]);
}

function termOf_(date) {
  const s = settings_();
  let term = "Term 1";
  ["Term 1", "Term 2", "Term 3"].forEach(t => { const v = s[t + " starts"]; if (v instanceof Date && date >= v) term = t; });
  return term;
}

/* ================= building the dashboard ================= */

function computeData_() {
  const s = settings_();
  const zeroForMissed = String(s["Missed lessons count as 0%"] || "No").toLowerCase().indexOf("y") === 0;
  const idx = rosterIndex_();

  // Results grouped by term + class + subject, students by M Number
  const groups = {};
  rows_(SH.results).forEach(r => {
    const term = r[R.Term], subj = r[R.Subject], m = mNumber_(r[R["M Number"]]);
    if (!term || !subj || !m) return;
    const known = idx[m];
    const cls = known && known.cls ? known.cls : String(r[R.Class]);
    const gk = [term, cls, subj].join("|");
    const g = groups[gk] = groups[gk] || { term, year: "Year " + parseInt(cls), cls, subj, lessons: {}, students: {} };
    const lid = String(r[R["Lesson ID"]]);
    if (!g.lessons[lid]) g.lessons[lid] = { id: lid, title: r[R.Lesson], date: r[R["Lesson date"]] };
    const st = g.students[m] = g.students[m] || { m, name: known ? known.name : String(r[R.Student]), known: !!known, done: {} };
    st.done[lid] = { pct: Number(r[R["Lesson %"]]) * 100, complete: r[R.Status] === "Completed",
      steps: r[R["Steps done"]] + "/" + r[R["Steps total"]] };
  });

  // Every listed student who takes that subject in that class appears, even with no work yet
  const report = [];
  Object.keys(groups).sort(groupSort_).forEach(gk => {
    const g = groups[gk];
    Object.keys(idx).forEach(m => { const st = idx[m];
      if (st.cls === g.cls && (st.subj[g.subj] || []).length && !g.students[m]) g.students[m] = { m, name: st.name, known: true, done: {} }; });
    g.lessonList = Object.values(g.lessons).sort((a, b) => (a.date || 0) - (b.date || 0) || String(a.id).localeCompare(String(b.id)));
    g.studentList = Object.values(g.students).sort((a, b) => a.name.localeCompare(b.name));
    g.studentList.forEach(st => {
      const done = g.lessonList.filter(l => st.done[l.id]);
      const sum = done.reduce((a, l) => a + st.done[l.id].pct, 0);
      const set = g.lessonList.length;
      const avg = zeroForMissed ? (set ? sum / set : "") : (done.length ? sum / done.length : "");
      st.avg = avg === "" ? "" : Math.round(avg);
      const teachers = st.known && idx[st.m] ? (idx[st.m].subj[g.subj] || []).join(", ") : "";
      report.push([g.term, g.year, g.cls, g.subj, teachers, st.m, st.name, st.known ? "Yes" : "Check M Number",
        set, done.length, done.filter(l => st.done[l.id].complete).length,
        set ? done.length / set : 0, st.avg === "" ? "" : st.avg / 100, band(st.avg),
        g.lessonList.filter(l => !st.done[l.id]).map(l => l.title).join(" · ")]);
    });
  });
  return { groups, report, idx, zeroForMissed };
}

function refresh() {
  const ss = SpreadsheetApp.getActive();
  const data = computeData_(), groups = data.groups, report = data.report;
  writeTable_(SH.report, REPORT_HEAD, report);
  const rs = sheet_(SH.report);
  if (report.length) rs.getRange(2, 12, report.length, 2).setNumberFormat("0%");
  rs.setColumnWidth(7, 220); rs.setColumnWidth(15, 420); rs.setColumnWidth(4, 130);

  const classes = unique_(report.map(r => r[2])).sort(classSort_);
  const years = unique_(report.map(r => r[1])).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
  const teachers = unique_(report.map(r => String(r[4])).join(", ").split(", ").filter(Boolean)).sort();
  const lists = sheet_(SH.lists); lists.clear();
  const col = (c, vals) => lists.getRange(1, c, vals.length, 1).setValues(vals.map(v => [v]));
  col(1, ["Term 1", "Term 2", "Term 3"]);
  col(2, ["All"].concat(years));
  col(3, ["All"].concat(classes));
  col(4, ["All"].concat(SUBJECTS));
  col(5, ["All"].concat(teachers));
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
  const width = Math.max.apply(null, keys.map(k => groups[k].lessonList.length)) + 5;
  const vals = [], bgs = [], fgs = [], notes = [], styles = [], weights = [], heads = [];
  const pad = (row, fill) => { while (row.length < width) row.push(fill); return row; };
  const push = (v, bg, fg, note, st, w) => { vals.push(pad(v, "")); bgs.push(pad(bg, null)); fgs.push(pad(fg, null));
    notes.push(pad(note, "")); styles.push(pad(st, "normal")); weights.push(pad(w, "normal")); };
  keys.forEach(k => {
    const g = groups[k], L = g.lessonList;
    heads.push(vals.length + 4);
    push([g.cls + " · " + g.subj + "  (" + g.year + ")"], [], [], [], [], ["bold"]);
    push(["Student", "M Number"].concat(L.map((l, i) => "L" + (i + 1) + " " + l.title), ["Done", "Term avg", "Band"]),
      Array(L.length + 5).fill("#e8eaed"), [], ["", ""].concat(L.map(l => l.title)), [], Array(L.length + 5).fill("bold"));
    g.studentList.forEach(st => {
      const v = [st.name, st.m], bg = [null, st.known ? null : "#fbe3e1"], fg = [null, null], nt = ["", st.known ? "" : "Not on the school list – check the M Number"], sty = ["normal", "normal"];
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
  sh.getRange(4, 1, vals.length, 2).setHorizontalAlignment("left").setNumberFormat("@");
  heads.forEach(r => sh.getRange(r + 1, 3, 1, width - 2).setWrap(true));
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 90); if (width > 2) sh.setColumnWidths(3, width - 2, 110);
  sh.setFrozenColumns(2);
}

/* ================= one-time setup ================= */

function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone("Asia/Dubai");

  const st = sheet_(SH.settings);
  if (!st.getRange("A1").getValue()) {
    st.getRange("A1:C1").setValues([["Setting", "Value", "Notes"]]).setFontWeight("bold");
    st.getRange("A2:C8").setValues([
      ["Term 1 starts", new Date(2026, 7, 17), "Results are placed in a term by the lesson's date (or the day they were sent)."],
      ["Term 2 starts", new Date(2027, 0, 4), "Change these to your school calendar."],
      ["Term 3 starts", new Date(2027, 3, 5), ""],
      ["Missed lessons count as 0%", "No", "No = term average of lessons attempted. Yes = missed lessons count as 0%."],
      ["Bands", "Below 0–39% · Working towards 40–59% · Meeting 60–79% · Exceeding 80–100%", ""],
      ["Student list Sheet", MASTER_DEFAULT, "The school's master list (one tab per year: M Number, Name, Section, ME/ Lit + Teacher, SS/MSC + Teacher, Literacy/ Islamic Teacher). Read every hour."],
      ["Last import", "", "Filled in automatically."]]);
    st.getRange("B2:B4").setNumberFormat("d mmm yyyy");
    st.getRange("B5").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["No", "Yes"]).build());
    st.setColumnWidth(1, 220); st.setColumnWidth(2, 360); st.setColumnWidth(3, 560);
  }
  const s = settings_();
  if (!("Student list Sheet" in s)) setSetting_("Student list Sheet", MASTER_DEFAULT);

  header_(SH.results, RESULT_HEAD);
  const res = sheet_(SH.results);
  res.getRange("A:A").setNumberFormat("d mmm yyyy HH:mm"); res.getRange("I:I").setNumberFormat("d mmm yyyy");
  res.getRange("N:P").setNumberFormat("0%"); res.hideColumns(R.Key + 1);
  header_(SH.roster, ROSTER_HEAD);
  sheet_(SH.roster).getRange("J:J").setNumberFormat("d mmm yyyy");

  const tch = sheet_(SH.teachers);
  if (!tch.getRange("A1").getValue()) {
    header_(SH.teachers, TEACHER_HEAD.concat(["", "How it works"]));
    tch.getRange(2, 1, 1, TEACHER_HEAD.length).setValues([["laura", "", "Laura Husseiny", "LHU", "", "Leader"]]);
    tch.getRange("H2:H6").setValues([["Type your own password in B2 (it's scrambled after your first sign-in), then manage everyone else on the website's Staff page."],
      ["A login is created for every teacher code in the master list (username = code). They can't sign in until a password is set."],
      ["Teacher: sees the students linked to their Code, for each subject. Whole classes (optional, e.g. 8A, 8B) adds every student in those classes."],
      ["Leader: sees every class and manages logins on the website."],
      ["Keep this Sheet shared with leaders only."]]);
    tch.setColumnWidth(8, 620);
    tch.getRange("F2:F").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Teacher", "Leader"]).build());
  }
  header_(SH.report, REPORT_HEAD);
  const old = ss.getSheetByName("Name fixes"); if (old) ss.deleteSheet(old);   // replaced by M Numbers

  buildDashboard_();
  sheet_(SH.comp);
  bandFormatting_();

  [SH.dash, SH.comp, SH.report, SH.results, SH.roster, SH.teachers, SH.settings].forEach((n, i) => {
    ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
  const def = ss.getSheetByName("Sheet1"); if (def && def.getLastRow() === 0) ss.deleteSheet(def);
  ss.setActiveSheet(ss.getSheetByName(SH.dash));

  ScriptApp.getProjectTriggers().filter(t => ["refresh", "hourlyImport"].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("refresh").timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger("hourlyImport").timeBased().everyHours(1).create();
  try { importLists(); } catch (err) { setSetting_("Last import", "Failed: " + err.message); }
  refresh();
}

function hourlyImport() { try { importLists(); } catch (err) { setSetting_("Last import", "Failed: " + err.message); } }

function buildDashboard_() {
  const d = sheet_(SH.dash);
  d.clear();
  d.getRange("A1").setValue("Meadows Compass · Teacher Dashboard").setFontSize(16).setFontWeight("bold");
  d.getRange("A2").setValue("Choose a term, year group, class, subject and teacher. Results update every 10 minutes.").setFontColor("#555555");
  d.getRange("A4:A8").setValues([["Term"], ["Year group"], ["Class"], ["Subject"], ["Teacher"]]).setFontWeight("bold");
  d.getRange("B4:B8").setValues([["Term 1"], ["All"], ["All"], ["All"], ["All"]]).setBackground("#fff8e1").setFontWeight("bold");
  const list = (a1) => SpreadsheetApp.newDataValidation().requireValueInRange(sheet_(SH.lists).getRange(a1), true).build();
  d.getRange("B4").setDataValidation(list("A1:A3"));
  d.getRange("B5").setDataValidation(list("B1:B20"));
  d.getRange("B6").setDataValidation(list("C1:C80"));
  d.getRange("B7").setDataValidation(list("D1:D5"));
  d.getRange("B8").setDataValidation(list("E1:E60"));

  // Report columns: A Term · B Year · C Class · D Subject · E Teacher · F M · G Student · H On list · I set · J attempted
  //                 K completed · L completion % · M term % · N band · O not attempted
  const f = () => `(Report!A2:A=$B$4)*(($B$5="All")+(Report!B2:B=$B$5)>0)*(($B$6="All")+(Report!C2:C=$B$6)>0)*(($B$7="All")+(Report!D2:D=$B$7)>0)*(($B$8="All")+ISNUMBER(SEARCH($B$8,Report!E2:E))>0)`;

  d.getRange("D4").setValue("Achievement bands (students)").setFontWeight("bold");
  d.getRange("D5:G5").setValues([["Band", "Range", "Students", "% of students"]]).setFontWeight("bold").setBackground("#e8eaed");
  d.getRange("D6:E9").setValues([["Below", "0–39%"], ["Working towards", "40–59%"], ["Meeting", "60–79%"], ["Exceeding", "80–100%"]]);
  for (let i = 0; i < 4; i++) {
    const r = 6 + i;
    d.getRange("F" + r).setFormula(`=SUMPRODUCT(${f()}*(Report!N2:N=D${r}))`);
    d.getRange("G" + r).setFormula(`=IFERROR(F${r}/SUM($F$6:$F$9),0)`);
  }
  d.getRange("D10:G10").setValues([["Meeting or above", "60–100%", "=F8+F9", "=IFERROR(F10/SUM($F$6:$F$9),0)"]]).setFontWeight("bold");
  d.getRange("D11:G11").setValues([["No work yet", "", `=SUMPRODUCT(${f()}*(Report!N2:N="No work yet"))`, ""]]).setFontColor("#555555");
  d.getRange("G6:G10").setNumberFormat("0%");

  d.getRange("I4").setValue("Lesson completion").setFontWeight("bold");
  d.getRange("I5:J8").setValues([
    ["Average completion", `=IFERROR(SUMPRODUCT(${f()}*Report!L2:L)/SUMPRODUCT(${f()}),0)`],
    ["Average term %", `=IFERROR(SUMPRODUCT(${f()}*(Report!M2:M<>"")*Report!M2:M)/SUMPRODUCT(${f()}*(Report!M2:M<>"")),0)`],
    ["Students who have missed a lesson", `=SUMPRODUCT(${f()}*(Report!J2:J<Report!I2:I))`],
    ["M Numbers to check", `=SUMPRODUCT(${f()}*(Report!H2:H="Check M Number"))`]]);
  d.getRange("J5:J6").setNumberFormat("0%");

  d.getRange("A13").setValue("Students").setFontWeight("bold").setFontSize(12);
  d.getRange("A14:J14").setValues([["Class", "Subject", "Teacher", "Student", "M Number", "Attempted", "Completion",
    "Term average", "Band", "Not attempted yet"]]).setFontWeight("bold").setBackground("#e8eaed");
  d.getRange("A15").setFormula(`=IFERROR(SORT(FILTER({Report!C2:C,Report!D2:D,Report!E2:E,Report!G2:G,Report!F2:F,Report!J2:J,Report!L2:L,Report!M2:M,Report!N2:N,Report!O2:O},${f()}),1,TRUE,2,TRUE,4,TRUE),"No results yet for this choice.")`);
  d.getRange("G15:H").setNumberFormat("0%");
  [110, 130, 90, 220, 90, 90, 100, 110, 130, 320].forEach((w, i) => d.setColumnWidth(i + 1, w));
}

function bandFormatting_() {
  [[SH.dash, "D6:D11"], [SH.dash, "I15:I"], [SH.report, "N2:N"], [SH.results, "Q2:Q"]].forEach(([n, a1]) => {
    const sh = sheet_(n), rng = sh.getRange(a1);
    const rules = sh.getConditionalFormatRules().filter(r => !r.getRanges().some(x => x.getA1Notation() === rng.getA1Notation()));
    BANDS.concat([NONE]).forEach(b => rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(b.name).setBackground(b.bg).setFontColor(b.fg).setRanges([rng]).build()));
    sh.setConditionalFormatRules(rules);
  });
}

/* ================= menu ================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Meadows Compass")
    .addItem("Refresh dashboard", "refresh")
    .addItem("Import students and teachers now", "importLists")
    .addItem("Rebuild layout (keeps all data)", "setup")
    .addToUi();
}

/* ================= helpers ================= */

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
