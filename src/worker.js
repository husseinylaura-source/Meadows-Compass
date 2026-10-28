/* EduGhaf on Cloudflare – logins, lesson progress, teacher dashboard and backups.
 *
 * The website (index.html, js/, data/ …) is served as static files. Everything under /api/ runs here and
 * uses the D1 database bound as DB. Tables are created automatically the first time the site runs.
 *
 * Roles: admin (leader) · teacher · student.
 *   Students sign in with their M Number, teachers with their code (e.g. PLO). Everyone gets a
 *   temporary password and has to choose their own the first time they sign in.
 *   Teachers see the students linked to their code (school list) or whole classes given to them.
 *   Admins see everything, manage accounts, reset passwords and download backups.
 *
 * Lesson progress is saved here (so it follows the student to any device) and, if MIRROR_URL is set,
 * each lesson result is also copied to the Google Sheet as a second, independent backup.
 */

const SUBJECTS = ["MSC", "Social Studies", "Moral Education", "Literacy"];
const SHARED = { 12: { "Moral Education": ["MEL", "RZE"] }, 13: { "Moral Education": ["MEL", "RZE"] } };
const ITER = 10000;                         // PBKDF2 iterations (kept low enough for the free plan's CPU limit)
const SESSION_DAYS = 14;
const MAX_FAILS = 8, LOCK_MIN = 15;
const WORDS = ["falcon", "oryx", "camel", "palm", "dune", "pearl", "dhow", "oasis", "gazelle", "ghaf", "lotus", "cedar",
  "olive", "amber", "coral", "river", "comet", "planet", "maple", "tiger", "eagle", "zebra", "panda", "orbit", "harbor",
  "meadow", "summit", "breeze", "canyon", "island", "lantern", "marble", "compass", "rocket", "garden", "violet", "silver"];
const DEFAULT_SETTINGS = { "Term 1 starts": "2026-08-17", "Term 2 starts": "2027-01-04", "Term 3 starts": "2027-04-05",
  "Missed lessons count as 0%": "No", "Help contact": "Ms Laura Husseiny" };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (u TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '',
     cls TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '', classes TEXT NOT NULL DEFAULT '', hash TEXT NOT NULL DEFAULT '',
     must_change INTEGER NOT NULL DEFAULT 1, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
     created TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL DEFAULT '', last_login TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS roster (m TEXT NOT NULL, subject TEXT NOT NULL, code TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Master list',
     hidden INTEGER NOT NULL DEFAULT 0, added_on TEXT NOT NULL DEFAULT '', PRIMARY KEY (m, subject, code))`,
  `CREATE TABLE IF NOT EXISTS progress (m TEXT NOT NULL, k TEXT NOT NULL, state TEXT NOT NULL DEFAULT '{}', term TEXT NOT NULL DEFAULT '',
     year INTEGER NOT NULL DEFAULT 0, cls TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', lesson_id TEXT NOT NULL DEFAULT '',
     title TEXT NOT NULL DEFAULT '', lesson_date TEXT NOT NULL DEFAULT '', steps TEXT NOT NULL DEFAULT '[]', steps_done INTEGER NOT NULL DEFAULT 0,
     steps_total INTEGER NOT NULL DEFAULT 0, auto_correct INTEGER NOT NULL DEFAULT 0, auto_total INTEGER NOT NULL DEFAULT 0,
     pct INTEGER, complete INTEGER NOT NULL DEFAULT 0, updated TEXT NOT NULL DEFAULT '', PRIMARY KEY (m, k))`,
  `CREATE INDEX IF NOT EXISTS progress_group ON progress (term, cls, subject)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, u TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS log (at TEXT NOT NULL, who TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')`
];
let schemaReady = false;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (!env.DB) return json({ ok: false, error: "setup", message: "The database isn't connected yet (D1 binding DB)." }, 500);
      await ensureSchema(env);
      return await api(request, env, ctx, url);
    } catch (err) {
      return json({ ok: false, error: "server", message: "Something went wrong on the server: " + String(err && err.message || err) }, 500);
    }
  }
};

/* ================= routing ================= */

async function api(request, env, ctx, url) {
  const path = url.pathname.replace(/\/+$/, "");
  if (request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: "denied", message: "Not allowed." }, 403);
  }
  const body = request.method === "POST" ? await readJson(request) : {};
  if (body === null) return json({ ok: false, error: "bad", message: "Bad request." }, 400);

  if (path === "/api/login" && request.method === "POST") return login(env, body, request);
  if (path === "/api/info") return json({ ok: true, help: (await settings(env))["Help contact"] });

  const me = await session(env, request);
  if (path === "/api/logout") {
    if (me) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(me.sid).run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
  }
  if (path === "/api/me") return json(me ? { ok: true, me: publicMe(me) } : { ok: false, error: "signin" });
  if (!me) return json({ ok: false, error: "signin", message: "Please sign in." }, 401);
  if (path === "/api/password" && request.method === "POST") return changePassword(env, me, body);
  if (me.must_change) return json({ ok: false, error: "change", message: "Choose a new password first." }, 403);

  if (path === "/api/progress") {
    if (me.role !== "student") return json({ ok: true, items: {} });
    if (request.method === "GET") return loadProgress(env, me);
    return saveProgress(env, ctx, me, body);
  }
  if (path === "/api/staff" && request.method === "POST") {
    if (me.role === "student") return json({ ok: false, error: "denied", message: "This page is for staff." }, 403);
    return staff(env, me, body);
  }
  return json({ ok: false, error: "bad", message: "Unknown request." }, 404);
}

/* ================= sign in ================= */

async function login(env, body, request) {
  const u = normUser(body.user), pass = String(body.pass || "");
  if (!u || !pass) return json({ ok: false, error: "wrong", message: "Type your M Number (or staff code) and your password." });
  const row = await env.DB.prepare("SELECT * FROM users WHERE u = ?").bind(u).first();
  const now = Date.now();
  if (row && row.locked_until > now) {
    const mins = Math.ceil((row.locked_until - now) / 60000);
    return json({ ok: false, error: "locked", message: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` });
  }
  if (!row || !(await checkPass(pass, row.hash))) {
    if (row) {
      const fails = row.fails + 1;
      await env.DB.prepare("UPDATE users SET fails = ?, locked_until = ? WHERE u = ?")
        .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MIN * 60000 : 0, u).run();
    }
    await sleep(600);
    return json({ ok: false, error: "wrong", message: "That M Number or password isn't right." });
  }
  const token = randomToken();
  const expires = now + SESSION_DAYS * 864e5;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (id, u, expires) VALUES (?, ?, ?)").bind(await sha256(token), u, expires),
    env.DB.prepare("UPDATE users SET fails = 0, locked_until = 0, last_login = ? WHERE u = ?").bind(iso(), u),
    env.DB.prepare("DELETE FROM sessions WHERE expires < ?").bind(now)
  ]);
  return json({ ok: true, me: publicMe(row) }, 200, { "Set-Cookie": cookie(token, SESSION_DAYS * 86400, request) });
}

async function session(env, request) {
  const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)eg_s=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const sid = await sha256(m[1]);
  const row = await env.DB.prepare("SELECT s.expires, u.* FROM sessions s JOIN users u ON u.u = s.u WHERE s.id = ?").bind(sid).first();
  if (!row || row.expires < Date.now()) return null;
  row.sid = sid;
  row.codes = row.code ? [row.code] : [];
  row.classList = splitList(row.classes);
  return row;
}

async function changePassword(env, me, body) {
  const old = String(body.old || ""), pw = String(body.pass || "");
  const min = me.role === "student" ? 6 : 8;
  if (!(await checkPass(old, me.hash))) return json({ ok: false, error: "bad", message: "Your current password isn't right." });
  if (pw.length < min) return json({ ok: false, error: "bad", message: `Your new password needs at least ${min} characters.` });
  if (pw === old) return json({ ok: false, error: "bad", message: "Choose a password that's different from the one you were given." });
  if (pw.length > 100) return json({ ok: false, error: "bad", message: "That password is too long." });
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET hash = ?, must_change = 0, updated = ? WHERE u = ?").bind(await hashPass(pw), iso(), me.u),
    env.DB.prepare("DELETE FROM sessions WHERE u = ? AND id != ?").bind(me.u, me.sid)
  ]);
  return json({ ok: true, me: publicMe(Object.assign({}, me, { must_change: 0 })), message: "Password changed." });
}

function publicMe(r) {
  return { user: r.u, display: r.role === "student" ? r.u.toUpperCase() : r.u.toUpperCase(), role: r.role, name: r.name,
    cls: r.cls, code: r.code, mustChange: !!r.must_change };
}

/* ================= students: lesson progress ================= */

async function loadProgress(env, me) {
  const rs = await env.DB.prepare("SELECT k, state FROM progress WHERE m = ?").bind(me.u).all();
  const items = {};
  for (const r of rs.results) { try { items[r.k] = JSON.parse(r.state); } catch (e) {} }
  return json({ ok: true, items });
}

async function saveProgress(env, ctx, me, body) {
  const list = Array.isArray(body.items) ? body.items : [body];
  const stmts = [], mirror = [];
  const set = await settings(env);
  const clsYear = parseInt(me.cls, 10) || 0;
  for (const it of list.slice(0, 50)) {
    const k = String(it.key || "");
    if (!/^y\d{1,2}-[a-z0-9-]{2,60}$/.test(k)) continue;
    const stateText = JSON.stringify(it.state || {});
    if (stateText.length > 200000) continue;
    const r = it.result || null;
    const subject = r && SUBJECTS.includes(r.subjectName) ? r.subjectName : "";
    const year = r ? parseInt(r.year, 10) || 0 : 0;
    const counts = !!(r && subject && (!clsYear || year === clsYear));
    const now = iso();
    const date = counts && /^\d{4}-\d{2}-\d{2}$/.test(r.lessonDate || "") ? r.lessonDate : "";
    const term = counts ? termOf(set, date || now.slice(0, 10)) : "";
    const steps = JSON.stringify(Object.keys((it.state && it.state.done) || {}).filter(x => it.state.done[x]).slice(0, 40));
    stmts.push(env.DB.prepare(`INSERT INTO progress (m, k, state, term, year, cls, subject, lesson_id, title, lesson_date, steps, steps_done,
        steps_total, auto_correct, auto_total, pct, complete, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (m, k) DO UPDATE SET state = excluded.state, term = excluded.term, year = excluded.year, cls = excluded.cls,
        subject = excluded.subject, lesson_id = excluded.lesson_id, title = excluded.title, lesson_date = excluded.lesson_date,
        steps = excluded.steps, steps_done = excluded.steps_done, steps_total = excluded.steps_total, auto_correct = excluded.auto_correct,
        auto_total = excluded.auto_total, pct = excluded.pct, complete = excluded.complete, updated = excluded.updated`)
      .bind(me.u, k, stateText, term, counts ? year : 0, me.cls, counts ? subject : "", counts ? clip(r.lessonId, 60) : "",
        counts ? clip(r.title, 200) : "", date, steps, counts ? int(r.stepsDone) : 0, counts ? int(r.stepsTotal) : 0,
        counts ? int(r.autoCorrect) : 0, counts ? int(r.autoTotal) : 0, counts && r.started !== false ? clampPct(r.lessonPct) : null,
        counts && r.complete ? 1 : 0, now));
    if (counts) {
      const shared = (SHARED[clsYear] || {})[subject];
      if (shared) for (const c of shared)
        stmts.push(env.DB.prepare(`INSERT INTO roster (m, subject, code, source, added_on) SELECT ?, ?, ?, 'Shared list', ?
          WHERE NOT EXISTS (SELECT 1 FROM roster WHERE m = ? AND subject = ?)`).bind(me.u, subject, c, now, me.u, subject));
      if (env.MIRROR_URL && r.started !== false)
        mirror.push(Object.assign({ v: 2, mno: me.u.toUpperCase(), student: me.name, cls: me.cls, sentAt: now }, r));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (mirror.length && ctx && ctx.waitUntil) ctx.waitUntil(Promise.all(mirror.map(p =>
    fetch(env.MIRROR_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p) }).catch(() => {}))));
  return json({ ok: true, saved: stmts.length });
}

/* ================= staff ================= */

async function staff(env, me, d) {
  const who = { user: me.u, name: me.name, role: me.role === "admin" ? "leader" : "teacher", code: me.code, classes: me.classList };
  const leader = who.role === "leader";
  let r = null;
  const a = d.action;
  const leaderOnly = ["saveStaff", "deleteStaff", "importAccounts", "resetPassword", "saveStudentAccount", "deleteStudentAccount",
    "backupPage", "restore", "saveSettings", "accounts"];
  if (leaderOnly.includes(a) && !leader) return json({ ok: false, error: "denied", message: "Only leaders can do that." });
  if (a === "addStudent" || a === "removeStudent") r = await studentChange(env, who, d);
  else if (a === "saveStaff" || a === "deleteStaff") r = await staffAdmin(env, me, who, d);
  else if (a === "resetPassword") r = await resetPassword(env, me, d);
  else if (a === "saveStudentAccount") r = await saveStudentAccount(env, me, d);
  else if (a === "deleteStudentAccount") r = await deleteStudentAccount(env, me, d);
  else if (a === "importAccounts") return json(await importAccounts(env, me, d));
  else if (a === "restore") return json(await restore(env, me, d));
  else if (a === "backupPage") return json(await backupPage(env, d));
  else if (a === "accounts") return json(await accountsList(env));
  else if (a === "lessonDetail") return json(await lessonDetail(env, who, d));
  else if (a === "saveSettings") r = await saveSettings(env, me, d);
  else if (a !== "data") return json({ ok: false, error: "bad", message: "Unknown action." });
  if (r && r.error) return json(Object.assign({ ok: false }, r));
  const out = await dataFor(env, who, d.term);
  return json(Object.assign(out, r || {}));
}

/* Every student with their teacher codes per subject (visible links only, plus what has been hidden). */
async function rosterIndex(env) {
  const [st, ro] = await env.DB.batch([
    env.DB.prepare("SELECT u, name, cls, section FROM users WHERE role = 'student'"),
    env.DB.prepare("SELECT m, subject, code, source, hidden FROM roster")
  ]);
  const idx = {};
  for (const s of st.results) idx[s.u] = { m: s.u, name: s.name, cls: s.cls, section: s.section, subj: {}, added: [], has: {}, shared: {} };
  for (const r of ro.results) {
    const x = idx[r.m]; if (!x) continue;
    x.has[r.subject] = true;
    if (r.hidden) continue;
    (x.subj[r.subject] = x.subj[r.subject] || []).push(r.code);
    if (r.source === "Shared list") x.shared[r.subject] = true;
    else if (/^added by/i.test(r.source)) x.added.push({ subject: r.subject, by: r.source.replace(/^added by\s*/i, "").toLowerCase(), code: r.code });
  }
  return idx;
}

function sees(who, st, cls, subject) {
  if (who.role === "leader") return true;
  if (who.classes.includes(cls)) return true;
  return !!(who.code && st && (st.subj[subject] || []).includes(who.code));
}

async function dataFor(env, who, termWanted) {
  const set = await settings(env);
  const terms = { "Term 1": set["Term 1 starts"], "Term 2": set["Term 2 starts"], "Term 3": set["Term 3 starts"] };
  const term = ["Term 1", "Term 2", "Term 3"].includes(termWanted) ? termWanted : termOf(set, iso().slice(0, 10));
  const zeroForMissed = /^y/i.test(set["Missed lessons count as 0%"] || "");
  const idx = await rosterIndex(env);
  const rs = await env.DB.prepare(`SELECT m, cls, subject, lesson_id, title, lesson_date, steps_done, steps_total, pct, complete
    FROM progress WHERE term = ? AND subject != '' AND pct IS NOT NULL`).bind(term).all();

  const groups = {};
  for (const r of rs.results) {
    const st = idx[r.m]; const cls = st ? st.cls : r.cls;
    const gk = cls + "|" + r.subject;
    const g = groups[gk] = groups[gk] || { term, year: "Year " + parseInt(cls, 10), cls, subject: r.subject, lessons: {}, students: {} };
    if (!g.lessons[r.lesson_id]) g.lessons[r.lesson_id] = { id: r.lesson_id, title: r.title, date: r.lesson_date };
    const s = g.students[r.m] = g.students[r.m] || { m: r.m.toUpperCase(), name: st ? st.name : r.m, known: !!st, key: r.m, done: {} };
    s.done[r.lesson_id] = [r.pct, r.complete ? 1 : 0, r.steps_done + "/" + r.steps_total];
  }
  const teaches = {};
  for (const m in idx) for (const s of SUBJECTS) {
    if (who.role === "leader" || ((idx[m].subj[s] || []).length && sees(who, idx[m], idx[m].cls, s))) teaches[idx[m].cls + "|" + s] = 1;
  }
  who.classes.forEach(c => SUBJECTS.forEach(s => teaches[c + "|" + s] = 1));
  const out = [];
  Object.keys(groups).sort(groupSort).forEach(k => {
    const g = groups[k];
    if (!teaches[g.cls + "|" + g.subject]) return;
    for (const m in idx) { const st = idx[m];
      if (st.cls === g.cls && (st.subj[g.subject] || []).length && !g.students[m]) g.students[m] = { m: m.toUpperCase(), name: st.name, known: true, key: m, done: {} }; }
    const students = Object.values(g.students).filter(s => sees(who, idx[s.key], g.cls, g.subject))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!students.length) return;
    const lessons = Object.values(g.lessons).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    out.push({ term: g.term, year: g.year, cls: g.cls, subject: g.subject, lessons,
      students: students.map(s => ({ m: s.m, name: s.name, onRoster: s.known, done: s.done })) });
  });

  const mine = [];
  for (const m in idx) { const st = idx[m];
    for (const s of SUBJECTS) {
      if (!(st.subj[s] || []).length || !sees(who, st, st.cls, s)) continue;
      const add = st.added.filter(x => x.subject === s);
      mine.push({ m: m.toUpperCase(), name: st.name, cls: st.cls, subject: s, teachers: st.subj[s],
        addedBy: add.length ? add[0].by : "", shared: !!st.shared[s] });
    }
  }
  mine.sort((a, b) => classSort(a.cls, b.cls) || SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.name.localeCompare(b.name));
  const mySubjects = [...new Set(mine.map(x => x.subject))];
  const res = { ok: true, updated: iso(), term, zeroForMissed, terms,
    me: { user: who.user, name: who.name, role: who.role, code: who.code,
      classes: [...new Set(mine.map(x => x.cls).concat(who.classes))].sort(classSort),
      subjects: mySubjects.length ? SUBJECTS.filter(x => mySubjects.includes(x)) : SUBJECTS.slice() },
    students: mine, groups: out };
  if (who.role === "leader") {
    res.staff = await staffList(env, idx);
    res.lastImport = set["Last import"] || "";
    res.settings = { term1: terms["Term 1"], term2: terms["Term 2"], term3: terms["Term 3"], zeroForMissed, help: set["Help contact"] };
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN must_change = 0 THEN 1 ELSE 0 END) AS active FROM users WHERE role = 'student'`).first();
    res.studentCount = c.n || 0; res.studentActive = c.active || 0;
  }
  return res;
}

/* Each part of one lesson, for every student the teacher sees in that class. */
async function lessonDetail(env, who, d) {
  const cls = String(d.cls || ""), subject = String(d.subject || ""), lessonId = String(d.lessonId || ""), term = String(d.term || "");
  if (!SUBJECTS.includes(subject) || !lessonId) return { ok: false, error: "bad", message: "Choose a lesson." };
  const idx = await rosterIndex(env);
  const rs = await env.DB.prepare(`SELECT m, steps, steps_done, steps_total, auto_correct, auto_total, pct, complete, updated
    FROM progress WHERE subject = ? AND lesson_id = ? AND term = ?`).bind(subject, lessonId, term).all();
  const got = {};
  for (const r of rs.results) if (idx[r.m] && idx[r.m].cls === cls) got[r.m] = r;
  const list = [];
  for (const m in idx) { const st = idx[m];
    if (st.cls !== cls) continue;
    if (!got[m] && !(st.subj[subject] || []).length) continue;
    if (!sees(who, st, cls, subject)) continue;
    const r = got[m];
    list.push({ m: m.toUpperCase(), name: st.name, steps: r ? safeParse(r.steps, []) : [], stepsDone: r ? r.steps_done : 0,
      stepsTotal: r ? r.steps_total : 0, autoCorrect: r ? r.auto_correct : 0, autoTotal: r ? r.auto_total : 0,
      pct: r ? r.pct : null, complete: r ? !!r.complete : false, updated: r ? r.updated : "" });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, cls, subject, lessonId, students: list };
}

async function studentChange(env, who, d) {
  const m = mNumber(d.mno), subject = SUBJECTS.includes(d.subject) ? d.subject : "";
  if (!m) return { error: "bad", message: "Enter the student's M Number (e.g. M9093)." };
  if (!subject) return { error: "bad", message: "Choose the subject." };
  const code = who.role === "leader" ? (codesOf(d.code)[0] || who.code) : who.code;
  if (!code) return { error: "bad", message: "Your account has no teacher code yet. Ask a leader." };
  const u = m.toLowerCase();
  const st = await env.DB.prepare("SELECT u, name, cls FROM users WHERE u = ? AND role = 'student'").bind(u).first();
  if (d.action === "addStudent") {
    if (!st) return { error: "bad", message: `${m} doesn't have an EduGhaf account yet. Ask ${(await settings(env))["Help contact"]} to create it.` };
    const ex = await env.DB.prepare("SELECT hidden FROM roster WHERE m = ? AND subject = ? AND code = ?").bind(u, subject, code).first();
    if (ex && !ex.hidden) return { error: "bad", message: `${st.name} is already on ${code}'s ${subject} list.` };
    if (ex) await env.DB.prepare("UPDATE roster SET hidden = 0 WHERE m = ? AND subject = ? AND code = ?").bind(u, subject, code).run();
    else await env.DB.prepare("INSERT INTO roster (m, subject, code, source, added_on) VALUES (?, ?, ?, ?, ?)")
      .bind(u, subject, code, "Added by " + who.user, iso()).run();
    return { message: `${st.name} added to ${who.role === "leader" && code !== who.code ? code + "'s" : "your"} ${subject} list.` };
  }
  const row = await env.DB.prepare("SELECT source FROM roster WHERE m = ? AND subject = ? AND code = ? AND hidden = 0").bind(u, subject, code).first();
  if (!row) return { error: "bad", message: "That student isn't on this list." };
  if (row.source === "Shared list") {
    await env.DB.prepare("UPDATE roster SET hidden = 1 WHERE m = ? AND subject = ? AND code = ?").bind(u, subject, code).run();
  } else if (/^added by/i.test(row.source) && (who.role === "leader" || row.source.toLowerCase() === "added by " + who.user)) {
    await env.DB.prepare("DELETE FROM roster WHERE m = ? AND subject = ? AND code = ?").bind(u, subject, code).run();
  } else if (who.role === "leader") {
    await env.DB.prepare("UPDATE roster SET hidden = 1 WHERE m = ? AND subject = ? AND code = ?").bind(u, subject, code).run();
  } else return { error: "denied", message: "Only students added on the website can be removed here. Ask a leader to change the school list." };
  return { message: `${st ? st.name : m} removed from the ${subject} list.` };
}

async function staffList(env, idx) {
  const count = {};
  for (const m in idx) for (const s of SUBJECTS) for (const c of (idx[m].subj[s] || [])) (count[c] = count[c] || new Set()).add(m);
  const rs = await env.DB.prepare("SELECT u, name, code, classes, role, hash, must_change, last_login FROM users WHERE role != 'student'").all();
  return rs.results.map(r => ({ user: r.u, name: r.name, code: r.code, classes: splitList(r.classes),
    role: r.role === "admin" ? "Leader" : "Teacher", hasPass: !!r.hash, mustChange: !!r.must_change, lastLogin: r.last_login,
    students: r.code && count[r.code] ? count[r.code].size : 0 }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "Leader" ? -1 : 1) || a.name.localeCompare(b.name));
}

async function staffAdmin(env, me, who, d) {
  if (d.action === "deleteStaff") {
    const u = normUser(d.username);
    if (u === me.u) return { error: "bad", message: "You can't delete your own account." };
    const r = await env.DB.prepare("SELECT u FROM users WHERE u = ? AND role != 'student'").bind(u).first();
    if (!r) return { error: "bad", message: "That account doesn't exist." };
    await env.DB.batch([env.DB.prepare("DELETE FROM users WHERE u = ?").bind(u), env.DB.prepare("DELETE FROM sessions WHERE u = ?").bind(u)]);
    await log(env, me, "deleteStaff", u);
    return { message: "Account " + u + " deleted." };
  }
  const a = d.account || {};
  const user = normUser(a.user), orig = normUser(a.orig);
  const name = clip(a.name, 80).trim(), code = codesOf(a.code)[0] || "";
  const classes = classList(a.classes || []);
  const role = a.role === "Leader" ? "admin" : "teacher", pass = String(a.pass || "");
  if (!/^[a-z0-9._-]{2,40}$/.test(user) || /^m\d{3,7}$/.test(user)) return { error: "bad", message: "Username: 2–40 letters, numbers, dots or dashes, no spaces (and not an M Number)." };
  if (!name) return { error: "bad", message: "Enter the teacher's name." };
  if (pass && pass.length < 8) return { error: "bad", message: "Passwords need at least 8 characters." };
  const existing = orig ? await env.DB.prepare("SELECT * FROM users WHERE u = ? AND role != 'student'").bind(orig).first() : null;
  if (orig && !existing) return { error: "bad", message: "That account no longer exists. Refresh and try again." };
  if (user !== orig && await env.DB.prepare("SELECT u FROM users WHERE u = ?").bind(user).first()) return { error: "bad", message: "The username " + user + " is already taken." };
  if (!existing && !pass) return { error: "bad", message: "Set a password for the new account." };
  if (orig === me.u && (role !== "admin" || user !== me.u)) return { error: "bad", message: "You can't change your own username or role here." };
  if (role === "teacher" && !code && !classes.length) return { error: "bad", message: "Choose the teacher's code, or tick at least one whole class." };
  const hash = pass ? await hashPass(pass) : existing.hash;
  const mustChange = pass ? (orig === me.u ? 0 : 1) : existing.must_change;
  if (existing) {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET u = ?, name = ?, code = ?, classes = ?, role = ?, hash = ?, must_change = ?, updated = ? WHERE u = ?")
        .bind(user, name, code, classes.join(", "), role, hash, mustChange, iso(), orig),
      env.DB.prepare(pass || user !== orig ? "DELETE FROM sessions WHERE u = ?" : "SELECT 1").bind(...(pass || user !== orig ? [orig] : []))
    ]);
  } else {
    await env.DB.prepare("INSERT INTO users (u, role, name, code, classes, hash, must_change, created, updated) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(user, role, name, code, classes.join(", "), hash, 1, iso(), iso()).run();
  }
  await log(env, me, existing ? "saveStaff" : "createStaff", user + (pass ? " (new password)" : ""));
  return { message: (existing ? "Saved " : "Created ") + name + (pass ? " with the new password." : "."),
    issued: pass ? { name, user, pass } : undefined };
}

/* Leaders: every student account, for password resets. */
async function accountsList(env) {
  const rs = await env.DB.prepare("SELECT u, name, cls, must_change, last_login, locked_until FROM users WHERE role = 'student'").all();
  const now = Date.now();
  const list = rs.results.map(r => ({ m: r.u.toUpperCase(), name: r.name, cls: r.cls, waiting: !!r.must_change,
    lastLogin: r.last_login, locked: r.locked_until > now }))
    .sort((a, b) => classSort(a.cls, b.cls) || a.name.localeCompare(b.name));
  return { ok: true, accounts: list };
}

async function resetPassword(env, me, d) {
  const u = normUser(d.user);
  const r = await env.DB.prepare("SELECT u, name, role FROM users WHERE u = ?").bind(u).first();
  if (!r) return { error: "bad", message: "That account doesn't exist." };
  if (u === me.u) return { error: "bad", message: "Change your own password with “Change password” at the top." };
  const pass = r.role === "student" ? studentPass() : staffPass();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET hash = ?, must_change = 1, fails = 0, locked_until = 0, updated = ? WHERE u = ?").bind(await hashPass(pass), iso(), u),
    env.DB.prepare("DELETE FROM sessions WHERE u = ?").bind(u)
  ]);
  await log(env, me, "resetPassword", u);
  return { message: "New password for " + r.name + ".", issued: { name: r.name, user: r.role === "student" ? u.toUpperCase() : u, pass } };
}

async function saveStudentAccount(env, me, d) {
  const m = mNumber(d.mno), name = tidyName(clip(d.name, 100)), cls = String(d.cls || "").toUpperCase().trim();
  if (!m) return { error: "bad", message: "Enter the M Number, e.g. M9093." };
  if (!name) return { error: "bad", message: "Enter the student's full name." };
  if (!/^\d{1,2}[A-Z]$/.test(cls)) return { error: "bad", message: "Choose the student's class, e.g. 7A." };
  const u = m.toLowerCase();
  const ex = await env.DB.prepare("SELECT role FROM users WHERE u = ?").bind(u).first();
  if (ex && ex.role !== "student") return { error: "bad", message: "That username belongs to a staff account." };
  if (ex) {
    await env.DB.prepare("UPDATE users SET name = ?, cls = ?, updated = ? WHERE u = ?").bind(name, cls, iso(), u).run();
    await log(env, me, "editStudent", u);
    return { message: `Saved ${name} (${m}, ${cls}).` };
  }
  const pass = studentPass();
  await env.DB.prepare("INSERT INTO users (u, role, name, cls, hash, must_change, created, updated) VALUES (?, 'student', ?, ?, ?, 1, ?, ?)")
    .bind(u, name, cls, await hashPass(pass), iso(), iso()).run();
  await log(env, me, "createStudent", u);
  return { message: `Account created for ${name}.`, issued: { name, user: m, pass } };
}

async function deleteStudentAccount(env, me, d) {
  const u = normUser(d.user);
  const r = await env.DB.prepare("SELECT name FROM users WHERE u = ? AND role = 'student'").bind(u).first();
  if (!r) return { error: "bad", message: "That account doesn't exist." };
  // Results stay (they are part of the record); the login and class-list links go.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM users WHERE u = ?").bind(u),
    env.DB.prepare("DELETE FROM sessions WHERE u = ?").bind(u),
    env.DB.prepare("DELETE FROM roster WHERE m = ?").bind(u)
  ]);
  await log(env, me, "deleteStudent", u);
  return { message: `Deleted the account for ${r.name}. Their saved work stays in the backups.` };
}

async function saveSettings(env, me, d) {
  const s = d.settings || {}, date = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
  const t1 = date(s.term1), t2 = date(s.term2), t3 = date(s.term3);
  if (!t1 || !t2 || !t3 || !(t1 < t2 && t2 < t3)) return { error: "bad", message: "Enter the three term start dates in order." };
  const help = clip(s.help, 80).trim() || DEFAULT_SETTINGS["Help contact"];
  const stmts = [["Term 1 starts", t1], ["Term 2 starts", t2], ["Term 3 starts", t3],
    ["Missed lessons count as 0%", s.zeroForMissed ? "Yes" : "No"], ["Help contact", help]]
    .map(([k, v]) => env.DB.prepare("INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").bind(k, v));
  // Results move to the right term if the dates changed
  stmts.push(env.DB.prepare(`UPDATE progress SET term = CASE
      WHEN COALESCE(NULLIF(lesson_date, ''), substr(updated, 1, 10)) >= ? THEN 'Term 3'
      WHEN COALESCE(NULLIF(lesson_date, ''), substr(updated, 1, 10)) >= ? THEN 'Term 2' ELSE 'Term 1' END WHERE subject != ''`).bind(t3, t2));
  await env.DB.batch(stmts);
  await log(env, me, "saveSettings", JSON.stringify(s));
  return { message: "Settings saved." };
}

/* ================= import, backup, restore ================= */

/* Accounts file made from the school list. Sent in chunks by the browser.
   Existing accounts keep their password; names, classes and codes are updated. */
async function importAccounts(env, me, d) {
  const users = Array.isArray(d.users) ? d.users.slice(0, 300) : [];
  const roster = Array.isArray(d.roster) ? d.roster.slice(0, 500) : [];
  const now = iso(), stmts = [];
  if (d.first) stmts.push(env.DB.prepare("DELETE FROM roster WHERE source = 'Master list'"));
  for (const x of users) {
    const u = normUser(x.u), role = ["admin", "teacher", "student"].includes(x.role) ? x.role : "";
    if (!u || !role || !/^pbkdf2\$\d+\$/.test(String(x.hash || ""))) continue;
    if (u === me.u) continue;
    stmts.push(env.DB.prepare(`INSERT INTO users (u, role, name, code, cls, section, hash, must_change, created, updated) VALUES (?,?,?,?,?,?,?,1,?,?)
      ON CONFLICT (u) DO UPDATE SET name = excluded.name, code = excluded.code, cls = excluded.cls, section = excluded.section, updated = excluded.updated`)
      .bind(u, role, clip(x.name, 100), codesOf(x.code)[0] || "", String(x.cls || "").toUpperCase().slice(0, 4), clip(x.section, 10), x.hash, now, now));
  }
  for (const r of roster) {
    const m = normUser(r.m), code = codesOf(r.code)[0];
    if (!m || !code || !SUBJECTS.includes(r.subject)) continue;
    stmts.push(env.DB.prepare(`INSERT INTO roster (m, subject, code, source, added_on) VALUES (?, ?, ?, 'Master list', ?)
      ON CONFLICT (m, subject, code) DO UPDATE SET source = 'Master list'`).bind(m, r.subject, code, now));
  }
  if (d.last) stmts.push(env.DB.prepare("INSERT INTO settings (k, v) VALUES ('Last import', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
    .bind(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " · " + (d.total || "") + " accounts"));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  if (d.last) await log(env, me, "importAccounts", String(d.total || ""));
  return { ok: true, done: stmts.length };
}

const TABLES = { users: "u", roster: "m || '|' || subject || '|' || code", progress: "m || '|' || k", settings: "k", log: "at || who" };
async function backupPage(env, d) {
  const t = String(d.table || ""); if (!TABLES[t]) return { ok: false, error: "bad", message: "Unknown table." };
  const limit = Math.min(t === "progress" ? 400 : 2000, Math.max(1, int(d.limit) || 1000));
  const after = String(d.after || "");
  const rs = await env.DB.prepare(`SELECT *, ${TABLES[t]} AS _key FROM ${t} WHERE ${TABLES[t]} > ? ORDER BY ${TABLES[t]} LIMIT ?`).bind(after, limit).all();
  const rows = rs.results.map(r => { const k = r._key; delete r._key; return [k, r]; });
  return { ok: true, table: t, rows: rows.map(x => x[1]), next: rows.length === limit ? rows[rows.length - 1][0] : null };
}

/* Restore from a backup file: rows are put back (newer rows already here are kept). Sent in chunks. */
async function restore(env, me, d) {
  const t = String(d.table || ""), rows = Array.isArray(d.rows) ? d.rows.slice(0, 300) : [];
  const cols = { users: ["u", "role", "name", "code", "cls", "section", "classes", "hash", "must_change", "fails", "locked_until", "created", "updated", "last_login"],
    roster: ["m", "subject", "code", "source", "hidden", "added_on"],
    progress: ["m", "k", "state", "term", "year", "cls", "subject", "lesson_id", "title", "lesson_date", "steps", "steps_done", "steps_total",
      "auto_correct", "auto_total", "pct", "complete", "updated"],
    settings: ["k", "v"] }[t];
  if (!cols) return { ok: false, error: "bad", message: "Unknown table." };
  const keep = t === "progress" ? " WHERE excluded.updated > progress.updated" : t === "users" ? " WHERE users.u != '" + me.u.replace(/'/g, "") + "'" : "";
  const pk = { users: "u", roster: "m, subject, code", progress: "m, k", settings: "k" }[t];
  const upd = cols.filter(c => !pk.split(", ").includes(c)).map(c => `${c} = excluded.${c}`).join(", ");
  const sql = `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT (${pk}) DO UPDATE SET ${upd}${keep}`;
  const stmts = rows.filter(r => r && typeof r === "object").map(r => env.DB.prepare(sql).bind(...cols.map(c => r[c] == null ? (c === "pct" ? null : "") : r[c])));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  if (d.last) await log(env, me, "restore", t);
  return { ok: true, done: stmts.length };
}

/* ================= helpers ================= */

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)));
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first();
  if (!n.n && env.ADMIN_BOOTSTRAP) {
    // First run: the leader account from wrangler.jsonc (username:passwordhash). The password must be changed on first sign in.
    const [u, hash] = String(env.ADMIN_BOOTSTRAP).split(":");
    if (u && hash) await env.DB.prepare(`INSERT INTO users (u, role, name, code, hash, must_change, created, updated) VALUES (?, 'admin', ?, ?, ?, 1, ?, ?)
      ON CONFLICT (u) DO NOTHING`).bind(normUser(u), env.ADMIN_NAME || u, u.toUpperCase(), hash, iso(), iso()).run();
  }
  schemaReady = true;
}

let settingsCache = null, settingsAt = 0;
async function settings(env) {
  if (settingsCache && Date.now() - settingsAt < 5000) return settingsCache;
  const rs = await env.DB.prepare("SELECT k, v FROM settings").all();
  const s = Object.assign({}, DEFAULT_SETTINGS);
  for (const r of rs.results) s[r.k] = r.v;
  settingsCache = s; settingsAt = Date.now();
  return s;
}
function termOf(set, day) {
  let t = "Term 1";
  ["Term 1", "Term 2", "Term 3"].forEach(x => { if (set[x + " starts"] && day >= set[x + " starts"]) t = x; });
  return t;
}
async function log(env, me, action, detail) {
  settingsCache = null;
  await env.DB.prepare("INSERT INTO log (at, who, action, detail) VALUES (?, ?, ?, ?)").bind(iso(), me.u, action, clip(detail, 500)).run();
}

const enc = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pbkdf2(pass, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}
async function hashPass(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(pass, salt, ITER))}`;
}
async function checkPass(pass, stored) {
  const p = String(stored || "").split("$");
  if (p[0] !== "pbkdf2" || p.length !== 4 || !pass) return false;
  const got = new Uint8Array(await pbkdf2(pass, unb64(p[2]), Math.min(100000, parseInt(p[1], 10) || ITER)));
  const want = unb64(p[3]);
  if (got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
async function sha256(s) { return b64(await crypto.subtle.digest("SHA-256", enc.encode(s))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c])); }
function randomToken() { return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c])); }
function rnd(n) { return crypto.getRandomValues(new Uint32Array(1))[0] % n; }
function studentPass() { return WORDS[rnd(WORDS.length)] + "-" + (100 + rnd(900)); }
function staffPass() { const w = WORDS[rnd(WORDS.length)]; return w[0].toUpperCase() + w.slice(1) + "-" + WORDS[rnd(WORDS.length)] + "-" + (1000 + rnd(9000)); }

function cookie(token, maxAge, request) {
  const secure = !request || new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `eg_s=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function json(o, status = 200, headers = {}) {
  return new Response(JSON.stringify(o), { status, headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers) });
}
async function readJson(request) {
  const t = await request.text();
  if (t.length > 2000000) return null;
  if (!t) return {};
  try { const o = JSON.parse(t); return o && typeof o === "object" ? o : null; } catch (e) { return null; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const iso = () => new Date().toISOString();
const int = v => Math.max(0, Math.min(1000, parseInt(v, 10) || 0));
const clampPct = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);
const safeParse = (s, d) => { try { return JSON.parse(s); } catch (e) { return d; } };
const normUser = v => String(v || "").trim().toLowerCase().replace(/\s+/g, "");
const splitList = v => String(v || "").split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
const classList = a => [...new Set((Array.isArray(a) ? a : splitList(a)).map(x => String(x).toUpperCase().trim()).filter(x => /^\d{1,2}[A-Z]$/.test(x)))].sort(classSort);
const codesOf = v => [...new Set(String(v || "").toUpperCase().split(/[\/,;&+\s]+/).map(x => x.trim()).filter(x => /^[A-Z]{2,4}$/.test(x) && x !== "NA"))];
function mNumber(v) { const m = String(v || "").toUpperCase().replace(/\s+/g, "").match(/^M?(\d{3,7})$/); return m ? "M" + m[1] : ""; }
function tidyName(s) { return String(s || "").replace(/\s+/g, " ").trim().split(" ").map(w => /^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" "); }
function classSort(a, b) { return parseInt(a, 10) - parseInt(b, 10) || String(a).localeCompare(String(b)); }
function groupSort(a, b) { const [ca, sa] = a.split("|"), [cb, sb] = b.split("|"); return classSort(ca, cb) || SUBJECTS.indexOf(sa) - SUBJECTS.indexOf(sb); }
