/* EduGhaf API · Cloudflare Pages Functions + D1 (binding name: DB)
 *
 *   POST /api/login      {user, pass}            → session token (students: M Number, staff: username)
 *   POST /api/password   {pass, newPass}         → change own password (forced on first sign-in)
 *   POST /api/logout
 *   GET  /api/me
 *   GET  /api/work                               → a student's saved lessons
 *   POST /api/work       {items:[{k,state,result}]}  → save lesson work + score
 *   POST /api/staff      {action, ...}           → staff dashboard (same actions as the old Google Sheet)
 *
 * Environment variables (Cloudflare → Pages project → Settings → Variables and secrets):
 *   ADMIN_PASSWORD   your first / recovery password for the admin login (username: laura)
 *   ADMIN_USER       optional, default "laura"
 *   STUDENT_PASSWORD optional starting class password for students (changeable on the Staff page)
 */

const SUBJECTS = ["MSC", "Social Studies", "Moral Education", "Literacy"];
const COL = { "MSC": "msc", "Social Studies": "ss", "Moral Education": "me", "Literacy": "lit" };
const SUB_OF_KEY = { msc: "MSC", ss: "Social Studies", me: "Moral Education", lit: "Literacy" };
const KNOWN_NAMES = { SAY: "Sara Ayoub", PLO: "Premraj Loganathan", AZE: "Aiman Zein", RKH: "Rasha Khasawneh",
  LHU: "Laura Husseiny", EPU: "Emel Punar", AIS: "Abeer Issa", FNA: "Fardoos Nagi", AEL: "Amany Elgwely",
  MAL: "Mariam Aldaouk", RAL: "Rahma Al Louati", RKA: "Ruby Kaur", ANE: "Ashley New", NQU: "Naveed Qureshi",
  RZE: "Rida Zein", MEL: "Marwa Elgamel", CYO: "Chelsea Young", RRA: "Raj Rahman" };
const SHARED = { 12: { "Moral Education": ["MEL", "RZE"] }, 13: { "Moral Education": ["MEL", "RZE"] } };
const SHARED_SOURCE = "Shared list";
const DEFAULT_TERMS = { "Term 1": "2026-08-17", "Term 2": "2027-01-04", "Term 3": "2027-04-05" };
const STAFF_HOURS = 12, STUDENT_DAYS = 30, ITER = 10000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT, code TEXT, classes TEXT, pass TEXT, must_change INTEGER DEFAULT 1, created TEXT)`,
  `CREATE TABLE IF NOT EXISTS roster(id INTEGER PRIMARY KEY AUTOINCREMENT, mno TEXT, name TEXT, cls TEXT, section TEXT, msc TEXT, ss TEXT, me TEXT, lit TEXT, source TEXT, added_on TEXT)`,
  `CREATE INDEX IF NOT EXISTS roster_m ON roster(mno)`,
  `CREATE TABLE IF NOT EXISTS work(mno TEXT, k TEXT, state TEXT, updated TEXT, PRIMARY KEY(mno, k))`,
  `CREATE TABLE IF NOT EXISTS results(mno TEXT, k TEXT, year INTEGER, cls TEXT, subject TEXT, lesson_id TEXT, title TEXT, lesson_date TEXT, steps_done INTEGER, steps_total INTEGER, auto_correct INTEGER, auto_total INTEGER, pct INTEGER, complete INTEGER, term TEXT, updated TEXT, PRIMARY KEY(mno, k))`,
  `CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, username TEXT, expires INTEGER)`,
  `CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS fails(username TEXT PRIMARY KEY, n INTEGER, until INTEGER)`
];
let ready = false;
async function init(db) { if (ready) return; await db.batch(SCHEMA.map(s => db.prepare(s))); ready = true; }

/* ---------- helpers ---------- */
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (error, message, status = 200) => json({ ok: false, error, message }, status);
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const mNumber = v => { const m = String(v == null ? "" : v).trim().toUpperCase().replace(/\s+/g, "").match(/^M?(\d{3,7})$/); return m ? "M" + m[1] : ""; };
const tidyName = s => String(s || "").replace(/\s+/g, " ").trim().split(" ").map(w => /^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(" ");
const unique = a => a.filter((v, i) => v !== "" && a.indexOf(v) === i);
const codes = v => unique(String(v || "").toUpperCase().split(/[\/,;&+\s]+/).map(x => x.trim()).filter(x => /^[A-Z]{2,4}$/.test(x) && x !== "NA"));
const classSort = (a, b) => parseInt(a) - parseInt(b) || String(a).localeCompare(String(b));
const classList = v => unique(String(v || "").toUpperCase().split(/[,;\s]+/).map(x => x.trim()).filter(x => /^\d{1,2}[A-Z]$/.test(x))).sort(classSort);
const now = () => new Date().toISOString();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");

async function hashPass(pass, salt) {
  salt = salt || randHex(16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: ITER }, key, 256);
  return `pbkdf2$${ITER}$${salt}$${b64(bits)}`;
}
async function checkPass(stored, pass) {
  if (!stored || !pass) return false;
  const p = String(stored).split("$");
  if (p[0] !== "pbkdf2") return false;
  const h = await hashPass(pass, p[2]);
  return h === stored;
}

async function settings(db) {
  const r = await db.prepare("SELECT k, v FROM settings").all();
  const s = {}; (r.results || []).forEach(x => s[x.k] = x.v);
  return s;
}
const setSetting = (db, k, v) => db.prepare("INSERT INTO settings(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(k, String(v)).run();
function terms(s) { const t = {}; Object.keys(DEFAULT_TERMS).forEach(k => t[k] = s[k + " starts"] || DEFAULT_TERMS[k]); return t; }
function termOf(s, date) { const t = terms(s); let term = "Term 1"; Object.keys(t).forEach(k => { if (date >= t[k]) term = k; }); return term; }
const studentPassword = (s, env) => s["Student password"] || env.STUDENT_PASSWORD || "Meadows2026";

/* ---------- sessions ---------- */
async function newSession(db, username, staff) {
  const token = randHex(32), exp = Date.now() + (staff ? STAFF_HOURS * 3600e3 : STUDENT_DAYS * 86400e3);
  await db.prepare("INSERT INTO sessions(token, username, expires) VALUES(?, ?, ?)").bind(token, username, exp).run();
  if (Math.random() < 0.05) await db.prepare("DELETE FROM sessions WHERE expires < ?").bind(Date.now()).run();
  return token;
}
async function who(db, request, body) {
  const h = request.headers.get("Authorization") || "";
  const token = (h.match(/^Bearer\s+(\w+)$/) || [])[1] || (body && /^\w{64}$/.test(body.token || "") ? body.token : "");
  if (!token) return null;
  const s = await db.prepare("SELECT username, expires FROM sessions WHERE token = ?").bind(token).first();
  if (!s || s.expires < Date.now()) return null;
  const u = await db.prepare("SELECT * FROM users WHERE username = ?").bind(s.username).first();
  if (!u) return null;
  return { token, user: u.username, role: u.role, name: u.name || u.username, code: codes(u.code)[0] || "",
    classes: classList(u.classes), mustChange: !!u.must_change, hasOwnPass: !!u.pass };
}

async function tooMany(db, user) {
  const f = await db.prepare("SELECT n, until FROM fails WHERE username = ?").bind(user).first();
  return f && f.n >= 8 && f.until > Date.now();
}
async function addFail(db, user) {
  await db.prepare("INSERT INTO fails(username, n, until) VALUES(?, 1, ?) ON CONFLICT(username) DO UPDATE SET n = CASE WHEN until < ? THEN 1 ELSE n + 1 END, until = ?")
    .bind(user, Date.now() + 900e3, Date.now(), Date.now() + 900e3).run();
  await new Promise(r => setTimeout(r, 600));
}
const clearFails = (db, user) => db.prepare("DELETE FROM fails WHERE username = ?").bind(user).run();

/* ---------- roster ---------- */
async function rosterIndex(db) {
  const rows = (await db.prepare("SELECT * FROM roster ORDER BY id").all()).results || [];
  const idx = {};
  rows.forEach(r => {
    const m = mNumber(r.mno); if (!m) return;
    const src = String(r.source || ""), isMaster = /^master/i.test(src), isShared = src === SHARED_SOURCE;
    const st = idx[m] = idx[m] || { m, name: "", cls: "", section: "", subj: {}, added: [], has: {}, shared: {} };
    if (isMaster || !st.name) { st.name = tidyName(r.name) || st.name; st.cls = String(r.cls || st.cls).toUpperCase(); st.section = String(r.section || st.section); }
    SUBJECTS.forEach(s => {
      const v = r[COL[s]], c = codes(v);
      if (c.length) { st.subj[s] = unique((st.subj[s] || []).concat(c)); st.has[s] = true; }
      if (isShared && v) { st.has[s] = true; st.shared[s] = true; }
      else if (!isMaster && c.length) st.added.push({ subject: s, by: src.replace(/^added by\s*/i, "").toLowerCase(), codes: c });
    });
  });
  return idx;
}
function rosterRow(db, m, name, cls, section, subj, source) {
  return db.prepare("INSERT INTO roster(mno, name, cls, section, msc, ss, me, lit, source, added_on) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(m, name, cls, section || "", subj.MSC || "", subj["Social Studies"] || "", subj["Moral Education"] || "", subj.Literacy || "", source, now());
}
const sharedCodes = (cls, subject) => ((SHARED[parseInt(cls, 10)] || {})[subject]) || null;

/* ---------- handlers ---------- */
export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return fail("setup", "The database isn't connected yet: add a D1 binding called DB (see CLOUDFLARE.md).", 500);
  const db = env.DB; await init(db);
  const path = (params.path || []).join("/");
  let body = {};
  if (request.method === "POST") { try { body = await request.json(); } catch (e) { body = {}; } }
  try {
    if (path === "login" && request.method === "POST") return await login(db, env, body);
    const w = await who(db, request, body);
    if (path === "logout") { if (w) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(w.token).run(); return json({ ok: true }); }
    if (!w) return fail("expired", "Please sign in again.", 401);
    if (path === "me") return json({ ok: true, ...(await profile(db, w)) });
    if (path === "password" && request.method === "POST") return await changePass(db, env, w, body);
    if (w.mustChange) return fail("change", "Choose your own password first.", 403);
    if (path === "work") return w.role === "student" ? (request.method === "POST" ? await saveWork(db, w, body) : await loadWork(db, w)) : fail("denied", "Students only.", 403);
    if (path === "staff" && request.method === "POST") return w.role === "student" ? fail("denied", "Staff only.", 403) : await staff(db, env, w, body);
    return fail("missing", "Not found.", 404);
  } catch (err) {
    return fail("bad", "Something went wrong: " + String(err && err.message || err), 500);
  }
}

async function profile(db, w) {
  const out = { user: w.user, role: w.role, name: w.name, code: w.code, mustChange: w.mustChange };
  if (w.role === "student") {
    const st = (await rosterIndex(db))[w.user] || {};
    out.mno = w.user; out.name = st.name || w.name; out.cls = st.cls || "";
    out.subjects = SUBJECTS.filter(s => st.has && st.has[s]);
  }
  return out;
}

async function login(db, env, d) {
  const raw = clean(d.user, 60), pass = String(d.pass || "");
  if (!raw || !pass) return fail("wrong", "Enter your M Number (or staff username) and password.");
  const m = mNumber(raw);
  const user = m || raw.toLowerCase();
  if (await tooMany(db, user)) return fail("locked", "Too many wrong passwords. Try again in 15 minutes.");
  const s = await settings(db);
  let u = await db.prepare("SELECT * FROM users WHERE username = ?").bind(user).first();

  if (m) {   // student
    if (u && u.role !== "student") return fail("wrong", "That M Number or password isn't right.");
    const st = (await rosterIndex(db))[m];
    if (!u && !st) { await addFail(db, user); return fail("wrong", "This M Number isn't on the school list yet. Ask your teacher to add you."); }
    let ok = false, must = 1;
    if (u && u.pass && !u.must_change) ok = await checkPass(u.pass, pass);
    else ok = pass === studentPassword(s, env);
    if (ok && u && u.pass && !u.must_change) must = 0;
    if (!ok) { await addFail(db, user); return fail("wrong", u && u.pass && !u.must_change ? "That password isn't right. If you've forgotten it, ask your teacher to reset it." : "That password isn't right. Use the class password your teacher gave you."); }
    if (!u) await db.prepare("INSERT INTO users(username, role, name, must_change, created) VALUES(?, 'student', ?, 1, ?)").bind(m, st ? st.name : m, now()).run();
    await clearFails(db, user);
    const token = await newSession(db, m, false);
    return json({ ok: true, token, ...(await profile(db, { user: m, role: "student", name: st ? st.name : m, code: "", mustChange: !!must })) });
  }

  // staff
  const admin = String(env.ADMIN_USER || "laura").toLowerCase();
  if (user === admin && env.ADMIN_PASSWORD && pass === env.ADMIN_PASSWORD) {   // first sign-in or recovery
    if (!u) await db.prepare("INSERT INTO users(username, role, name, code, classes, pass, must_change, created) VALUES(?, 'leader', 'Laura Husseiny', 'LHU', '', '', 1, ?)").bind(user, now()).run();
    else await db.prepare("UPDATE users SET role = 'leader', must_change = 1 WHERE username = ?").bind(user).run();
    await clearFails(db, user);
    const token = await newSession(db, user, true);
    const w = await who(db, new Request("https://x", { headers: { Authorization: "Bearer " + token } }));
    return json({ ok: true, token, ...(await profile(db, w)) });
  }
  if (!u || u.role === "student" || !(await checkPass(u.pass, pass))) { await addFail(db, user); return fail("wrong", "That username or password isn't right."); }
  await clearFails(db, user);
  const token = await newSession(db, user, true);
  return json({ ok: true, token, user, role: u.role, name: u.name || user, code: codes(u.code)[0] || "", mustChange: !!u.must_change });
}

async function changePass(db, env, w, d) {
  const np = String(d.newPass || "");
  const min = w.role === "student" ? 6 : 8;
  if (np.length < min) return fail("bad", `Your new password needs at least ${min} characters.`);
  if (np.length > 100) return fail("bad", "That password is too long.");
  if (!w.mustChange) {
    const u = await db.prepare("SELECT pass FROM users WHERE username = ?").bind(w.user).first();
    if (!(await checkPass(u && u.pass, String(d.pass || "")))) return fail("wrong", "Your current password isn't right.");
  }
  const s = await settings(db);
  if (w.role === "student" && np === studentPassword(s, env)) return fail("bad", "Choose a password that's different from the class password.");
  if (env.ADMIN_PASSWORD && np === env.ADMIN_PASSWORD) return fail("bad", "Choose a new password, not the setup password.");
  await db.prepare("UPDATE users SET pass = ?, must_change = 0 WHERE username = ?").bind(await hashPass(np), w.user).run();
  await db.prepare("DELETE FROM sessions WHERE username = ? AND token != ?").bind(w.user, w.token).run();
  return json({ ok: true, message: "Password changed." });
}

/* ---------- student work ---------- */
const KEY_RE = /^y\d{1,2}-[\w-]{1,60}(:[\w-]{1,20})?$/;
async function loadWork(db, w) {
  const r = (await db.prepare("SELECT k, state FROM work WHERE mno = ?").bind(w.user).all()).results || [];
  return json({ ok: true, items: r.map(x => ({ k: x.k, state: x.state })) });
}
async function saveWork(db, w, d) {
  const items = Array.isArray(d.items) ? d.items.slice(0, 40) : [];
  const st = (await rosterIndex(db))[w.user] || {};
  const s = await settings(db);
  const ops = [];
  for (const it of items) {
    const k = String(it.k || "");
    if (!KEY_RE.test(k)) continue;
    const state = typeof it.state === "string" ? it.state : JSON.stringify(it.state);
    if (!state || state.length > 200000) continue;
    ops.push(db.prepare("INSERT INTO work(mno, k, state, updated) VALUES(?,?,?,?) ON CONFLICT(mno, k) DO UPDATE SET state = excluded.state, updated = excluded.updated").bind(w.user, k, state, now()));
    const r = it.result;
    if (r && !k.includes(":") && SUBJECTS.includes(r.subjectName)) {
      const num = (v, lo, hi) => { const x = Math.round(Number(v)); return isNaN(x) ? lo : Math.min(hi, Math.max(lo, x)); };
      const date = /^\d{4}-\d{2}-\d{2}$/.test(r.lessonDate || "") ? r.lessonDate : "";
      const cls = st.cls || "";
      ops.push(db.prepare(`INSERT INTO results(mno, k, year, cls, subject, lesson_id, title, lesson_date, steps_done, steps_total, auto_correct, auto_total, pct, complete, term, updated)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mno, k) DO UPDATE SET year=excluded.year, cls=excluded.cls, subject=excluded.subject, lesson_id=excluded.lesson_id, title=excluded.title,
        lesson_date=excluded.lesson_date, steps_done=excluded.steps_done, steps_total=excluded.steps_total, auto_correct=excluded.auto_correct, auto_total=excluded.auto_total, pct=excluded.pct,
        complete=excluded.complete, term=excluded.term, updated=excluded.updated`)
        .bind(w.user, k, num(r.year, 1, 13), cls, r.subjectName, clean(r.lessonId, 40), clean(r.title, 160), date,
          num(r.stepsDone, 0, 50), num(r.stepsTotal, 0, 50), num(r.autoCorrect, 0, 500), num(r.autoTotal, 0, 500),
          num(r.lessonPct, 0, 100), r.complete ? 1 : 0, termOf(s, date || now().slice(0, 10)), now()));
      const sc = sharedCodes(cls, r.subjectName);
      if (sc && !(st.has && st.has[r.subjectName])) { const subj = {}; subj[r.subjectName] = sc.join(", "); ops.push(rosterRow(db, w.user, st.name || w.name, cls, "", subj, SHARED_SOURCE)); st.has = st.has || {}; st.has[r.subjectName] = true; }
    }
  }
  if (ops.length) await db.batch(ops);
  return json({ ok: true, saved: items.length });
}

/* ---------- staff dashboard ---------- */
function sees(w, st, cls, subject) {
  if (w.role === "leader") return true;
  if (w.classes.includes(cls)) return true;
  return !!(w.code && st && (st.subj[subject] || []).includes(w.code));
}

async function staff(db, env, w, d) {
  let r = null;
  const a = d.action;
  if (a === "addStudent" || a === "removeStudent") r = await studentChange(db, w, d);
  else if (a === "saveStaff" || a === "deleteStaff") r = await staffAdmin(db, w, d);
  else if (a === "importRoster") r = w.role === "leader" ? await importRoster(db, d) : { error: "denied", message: "Only leaders can import the lists." };
  else if (a === "resetStudent") r = await resetStudent(db, w, d);
  else if (a === "saveSettings") r = w.role === "leader" ? await saveSettings(db, d) : { error: "denied", message: "Only leaders can change settings." };
  else if (a === "studentWork") return await studentWork(db, w, d);
  else if (a === "backup") return w.role === "leader" ? await backup(db) : fail("denied", "Only leaders can download backups.");
  else if (a !== "data") return fail("bad", "Unknown action.");
  if (r && r.error) return json({ ok: false, ...r });
  return json(Object.assign(await dataFor(db, env, w), r || {}));
}

async function studentChange(db, w, d) {
  const m = mNumber(d.mno), subject = SUBJECTS.includes(d.subject) ? d.subject : "";
  if (!m) return { error: "bad", message: "Enter the student's M Number (e.g. M9093)." };
  if (!subject) return { error: "bad", message: "Choose the subject." };
  const code = w.role === "leader" ? (codes(d.code)[0] || w.code) : w.code;
  if (!code) return { error: "bad", message: w.role === "leader" ? "Choose the teacher code to add the student to." : "Your account has no teacher code yet. Ask a leader." };
  const idx = await rosterIndex(db), known = idx[m];
  if (d.action === "addStudent") {
    if (known && (known.subj[subject] || []).includes(code)) return { error: "bad", message: (known.name || m) + " is already on " + code + "'s " + subject + " list." };
    const name = known ? known.name : tidyName(clean(d.name, 80));
    const cls = known && known.cls ? known.cls : clean(d.cls, 4).toUpperCase();
    if (!name) return { error: "bad", message: "This M Number isn't on the school list yet, so enter the student's full name too." };
    if (!/^\d{1,2}[A-Z]$/.test(cls)) return { error: "bad", message: "Choose the student's class." };
    const subj = {}; subj[subject] = code;
    await rosterRow(db, m, name, cls, "", subj, "Added by " + w.user).run();
    return { message: name + " added to " + (w.role === "leader" && code !== w.code ? code + "'s " : "your ") + subject + " list." };
  }
  const rows = (await db.prepare("SELECT * FROM roster WHERE mno = ? ORDER BY id DESC").bind(m).all()).results || [];
  const col = COL[subject];
  for (const r of rows) {
    const src = String(r.source || "");
    if (src === SHARED_SOURCE && codes(r[col]).includes(code)) {
      const left = codes(r[col]).filter(c => c !== code);
      await db.prepare(`UPDATE roster SET ${col} = ? WHERE id = ?`).bind(left.length ? left.join(", ") : "—", r.id).run();
      return { message: (known && known.name || m) + " removed from " + (w.role === "leader" && code !== w.code ? code + "'s " : "your ") + subject + " list." };
    }
    if (/^master/i.test(src) || !codes(r[col]).includes(code)) continue;
    if (w.role !== "leader" && src.replace(/^added by\s*/i, "").toLowerCase() !== w.user) continue;
    await db.prepare("DELETE FROM roster WHERE id = ?").bind(r.id).run();
    return { message: (known && known.name || m) + " removed from the " + subject + " list." };
  }
  return { error: "denied", message: "Only students added on the website can be removed here. Students from the school list change when the list is imported again." };
}

async function staffAdmin(db, w, d) {
  if (w.role !== "leader") return { error: "denied", message: "Only leaders can manage staff accounts." };
  if (d.action === "deleteStaff") {
    const u = String(d.username || "").trim().toLowerCase();
    if (u === w.user) return { error: "bad", message: "You can't delete your own account." };
    const ex = await db.prepare("SELECT role FROM users WHERE username = ?").bind(u).first();
    if (!ex || ex.role === "student") return { error: "bad", message: "That account doesn't exist." };
    await db.batch([db.prepare("DELETE FROM users WHERE username = ?").bind(u), db.prepare("DELETE FROM sessions WHERE username = ?").bind(u)]);
    return { message: "Account " + u + " deleted." };
  }
  const a = d.account || {};
  const user = String(a.user || "").trim().toLowerCase(), orig = String(a.orig || "").trim().toLowerCase();
  const name = clean(a.name, 80), code = codes(a.code)[0] || "", classes = classList((a.classes || []).join(","));
  const role = a.role === "Leader" ? "leader" : "teacher", pass = String(a.pass || "");
  if (!/^[a-z0-9._-]{2,40}$/.test(user) || /^m\d+$/.test(user)) return { error: "bad", message: "Username: 2–40 letters, numbers, dots or dashes, no spaces (and not an M Number)." };
  if (!name) return { error: "bad", message: "Enter the teacher's name." };
  if (pass && pass.length < 8) return { error: "bad", message: "Passwords need at least 8 characters." };
  const existing = orig ? await db.prepare("SELECT * FROM users WHERE username = ? AND role != 'student'").bind(orig).first() : null;
  if (orig && !existing) return { error: "bad", message: "That account no longer exists. Refresh and try again." };
  if (user !== orig && await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(user).first()) return { error: "bad", message: "The username " + user + " is already taken." };
  if (!existing && !pass) return { error: "bad", message: "Set a starting password for the new account." };
  if (orig === w.user && (role !== "leader" || user !== w.user)) return { error: "bad", message: "You can't change your own username or role here." };
  if (role === "teacher" && !code && !classes.length) return { error: "bad", message: "Choose the teacher's code, or tick at least one whole class." };
  const hashed = pass ? await hashPass(pass) : existing.pass;
  const must = pass ? (orig === w.user ? 0 : 1) : existing.must_change;
  if (existing) {
    await db.batch([
      db.prepare("UPDATE users SET username = ?, role = ?, name = ?, code = ?, classes = ?, pass = ?, must_change = ? WHERE username = ?").bind(user, role, name, code, classes.join(", "), hashed, must, orig),
      db.prepare("UPDATE sessions SET username = ? WHERE username = ?").bind(user, orig)]);
    if (pass) await db.prepare("DELETE FROM sessions WHERE username = ?").bind(user).run();
  } else await db.prepare("INSERT INTO users(username, role, name, code, classes, pass, must_change, created) VALUES(?,?,?,?,?,?,?,?)").bind(user, role, name, code, classes.join(", "), hashed, must, now()).run();
  return { message: (existing ? "Saved " : "Created ") + name.replace(/\.$/, "") + (pass ? ". They'll choose their own password when they first sign in." : ".") };
}

async function resetStudent(db, w, d) {
  const m = mNumber(d.mno); if (!m) return { error: "bad", message: "Enter the student's M Number." };
  const st = (await rosterIndex(db))[m];
  if (w.role !== "leader" && !(st && SUBJECTS.some(s => sees(w, st, st.cls, s) && (st.subj[s] || []).length))) return { error: "denied", message: "You can only reset passwords for your own students." };
  await db.batch([db.prepare("UPDATE users SET pass = '', must_change = 1 WHERE username = ? AND role = 'student'").bind(m), db.prepare("DELETE FROM sessions WHERE username = ?").bind(m)]);
  return { message: (st && st.name || m) + " can now sign in with the class password and choose a new one." };
}

async function saveSettings(db, d) {
  const x = d.settings || {};
  const ops = [];
  if (x.studentPassword != null) {
    const p = String(x.studentPassword).trim();
    if (p.length < 6) return { error: "bad", message: "The class password needs at least 6 characters." };
    ops.push(setSetting(db, "Student password", p));
  }
  ["Term 1", "Term 2", "Term 3"].forEach(t => { const v = x.terms && x.terms[t]; if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ops.push(setSetting(db, t + " starts", v)); });
  if (x.zeroForMissed != null) ops.push(setSetting(db, "Missed lessons count as 0%", x.zeroForMissed ? "Yes" : "No"));
  await Promise.all(ops);
  if (x.terms) {   // re-file results under the new term dates
    const s = await settings(db), rows = (await db.prepare("SELECT mno, k, lesson_date, updated FROM results").all()).results || [];
    const upd = rows.map(r => db.prepare("UPDATE results SET term = ? WHERE mno = ? AND k = ?").bind(termOf(s, r.lesson_date || String(r.updated).slice(0, 10)), r.mno, r.k));
    for (let i = 0; i < upd.length; i += 80) await db.batch(upd.slice(i, i + 80));
  }
  return { message: "Settings saved." };
}

/* Students come from the master list file, read in the browser: [[m, name, cls, section, msc, ss, me, lit], …] */
async function importRoster(db, d) {
  const list = Array.isArray(d.students) ? d.students : [];
  const rows = list.map(r => [mNumber(r[0]), tidyName(clean(r[1], 80)), clean(r[2], 4).toUpperCase(), clean(r[3], 12), ...[4, 5, 6, 7].map(i => codes(r[i]).join(", "))])
    .filter(r => r[0] && r[1] && /^\d{1,2}[A-Z]$/.test(r[2]));
  if (!rows.length) return { error: "bad", message: "No students found in that file. Each year tab needs M Number, Name and Section headings." };
  const kept = (await db.prepare("SELECT * FROM roster WHERE source NOT LIKE 'Master%'").all()).results || [];
  const haveShared = {}; kept.forEach(r => { if (r.source === SHARED_SOURCE) SUBJECTS.forEach(x => { if (r[COL[x]]) haveShared[r.mno + "|" + x] = 1; }); });
  const ops = [db.prepare("DELETE FROM roster WHERE source LIKE 'Master%'")];
  rows.forEach(r => {
    const subj = { MSC: r[4], "Social Studies": r[5], "Moral Education": r[6], Literacy: r[7] };
    ops.push(rosterRow(db, r[0], r[1], r[2], r[3], subj, "Master list"));
    SUBJECTS.forEach(x => { const sc = sharedCodes(r[2], x);
      if (sc && !codes(subj[x]).length && !haveShared[r[0] + "|" + x]) { const o = {}; o[x] = sc.join(", "); ops.push(rosterRow(db, r[0], r[1], r[2], "", o, SHARED_SOURCE)); } });
  });
  // one teacher login per code (no password yet – a leader sets a starting password)
  const users = (await db.prepare("SELECT username, code FROM users WHERE role != 'student'").all()).results || [];
  const have = {}; users.forEach(u => { have[u.username] = 1; codes(u.code).forEach(c => have["#" + c] = 1); });
  const used = {}; rows.forEach(r => [4, 5, 6, 7].forEach(i => codes(r[i]).forEach(c => used[c] = 1)));
  Object.keys(KNOWN_NAMES).forEach(c => used[c] = 1);
  const legend = d.legend || {};
  Object.keys(used).sort().forEach(c => { if (!have["#" + c] && !have[c.toLowerCase()])
    ops.push(db.prepare("INSERT INTO users(username, role, name, code, classes, pass, must_change, created) VALUES(?, 'teacher', ?, ?, '', '', 1, ?)").bind(c.toLowerCase(), KNOWN_NAMES[c] || clean(legend[c], 80) || c, c, now())); });
  for (let i = 0; i < ops.length; i += 90) await db.batch(ops.slice(i, i + 90));
  await setSetting(db, "Last import", new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " · " + rows.length + " students");
  return { message: "Imported " + rows.length + " students from the master list." };
}

async function studentWork(db, w, d) {
  const m = mNumber(d.mno), k = String(d.k || "");
  if (!m || !KEY_RE.test(k)) return fail("bad", "Unknown lesson.");
  const sub = SUB_OF_KEY[(k.match(/^y\d+-(msc|ss|me|lit)-/) || [])[1]];
  const st = (await rosterIndex(db))[m];
  if (!sees(w, st, st && st.cls, sub)) return fail("denied", "You can only see your own students' work.");
  const r = await db.prepare("SELECT state, updated FROM work WHERE mno = ? AND k = ?").bind(m, k).first();
  return json({ ok: true, mno: m, name: st ? st.name : m, cls: st ? st.cls : "", k, state: r ? r.state : null, updated: r ? r.updated : null });
}

async function backup(db) {
  const out = { app: "EduGhaf", made: now() };
  for (const t of ["users", "roster", "work", "results", "settings"]) out[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results || [];
  return json({ ok: true, backup: out });
}

async function dataFor(db, env, w) {
  const s = await settings(db), idx = await rosterIndex(db);
  const zero = /^y/i.test(s["Missed lessons count as 0%"] || "No");
  const res = (await db.prepare("SELECT * FROM results").all()).results || [];
  const groups = {};
  res.forEach(r => {
    const m = r.mno, known = idx[m], cls = known && known.cls ? known.cls : r.cls, subj = r.subject;
    if (!cls || !subj) return;
    const gk = [r.term, cls, subj].join("|");
    const g = groups[gk] = groups[gk] || { term: r.term, year: "Year " + parseInt(cls), cls, subj, lessons: {}, students: {} };
    const lid = String(r.lesson_id);
    if (!g.lessons[lid]) g.lessons[lid] = { id: lid, title: r.title, date: r.lesson_date || "", key: r.k };
    const st = g.students[m] = g.students[m] || { m, name: known ? known.name : m, known: !!known, done: {} };
    st.done[lid] = [r.pct, r.complete ? 1 : 0, r.steps_done + "/" + r.steps_total];
  });
  Object.values(groups).forEach(g => Object.keys(idx).forEach(m => { const st = idx[m];
    if (st.cls === g.cls && (st.subj[g.subj] || []).length && !g.students[m]) g.students[m] = { m, name: st.name, known: true, done: {} }; }));

  const teaches = {};
  Object.keys(idx).forEach(m => SUBJECTS.forEach(sb => { if (w.role === "leader" || (sees(w, idx[m], idx[m].cls, sb) && (idx[m].subj[sb] || []).length)) teaches[idx[m].cls + "|" + sb] = 1; }));
  w.classes.forEach(c => SUBJECTS.forEach(sb => teaches[c + "|" + sb] = 1));
  const out = [];
  Object.values(groups).sort((a, b) => a.term.localeCompare(b.term) || classSort(a.cls, b.cls) || SUBJECTS.indexOf(a.subj) - SUBJECTS.indexOf(b.subj)).forEach(g => {
    if (w.role !== "leader" && !teaches[g.cls + "|" + g.subj]) return;
    const students = Object.values(g.students).filter(st => st.known ? sees(w, idx[st.m], g.cls, g.subj) : true).sort((a, b) => a.name.localeCompare(b.name));
    if (!students.length) return;
    const lessons = Object.values(g.lessons).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    out.push({ term: g.term, year: g.year, cls: g.cls, subject: g.subj, lessons, students: students.map(st => ({ m: st.m, name: st.name, onRoster: st.known, done: st.done })) });
  });

  const users = (await db.prepare("SELECT username, role, pass, must_change FROM users WHERE role = 'student'").all()).results || [];
  const account = {}; users.forEach(u => account[u.username] = u.pass && !u.must_change ? "own" : "class");
  const mine = [];
  Object.keys(idx).forEach(m => { const st = idx[m];
    SUBJECTS.forEach(sb => {
      if (!(st.subj[sb] || []).length || !sees(w, st, st.cls, sb)) return;
      const add = st.added.filter(a => a.subject === sb);
      mine.push({ m, name: st.name, cls: st.cls, subject: sb, teachers: st.subj[sb], addedBy: add.length ? add[0].by : "", shared: !!st.shared[sb], login: account[m] || "none" });
    }); });
  mine.sort((a, b) => classSort(a.cls, b.cls) || SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject) || a.name.localeCompare(b.name));
  const mySubjects = unique(mine.map(x => x.subject));

  const data = { ok: true, updated: now(), zeroForMissed: zero, terms: terms(s),
    me: { user: w.user, name: w.name, role: w.role, code: w.code, classes: unique(mine.map(x => x.cls).concat(w.classes)).sort(classSort),
      subjects: mySubjects.length ? SUBJECTS.filter(x => mySubjects.includes(x)) : SUBJECTS.slice() },
    students: mine, groups: out };
  if (w.role === "leader") {
    const count = {}; Object.keys(idx).forEach(m => SUBJECTS.forEach(sb => (idx[m].subj[sb] || []).forEach(c => { count[c] = count[c] || {}; count[c][m] = 1; })));
    const st = (await db.prepare("SELECT username, role, name, code, classes, pass, must_change FROM users WHERE role != 'student'").all()).results || [];
    data.staff = st.map(u => { const code = codes(u.code)[0] || "";
      return { user: u.username, name: u.name || "", code, classes: classList(u.classes), role: u.role === "leader" ? "Leader" : "Teacher",
        hasPass: !!u.pass, waiting: !!u.pass && !!u.must_change, students: code && count[code] ? Object.keys(count[code]).length : 0 }; })
      .sort((a, b) => (a.role === b.role ? 0 : a.role === "Leader" ? -1 : 1) || a.name.localeCompare(b.name));
    data.lastImport = s["Last import"] || "";
    data.settings = { studentPassword: studentPassword(s, env), terms: terms(s), zeroForMissed: zero };
  }
  return data;
}
