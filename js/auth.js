/* EduGhaf · sign-in and saving work to the school's EduGhaf database (Cloudflare).
   Students sign in with their M Number. First time: the class password, then they choose their own.
   Staff sign in with their username (teachers choose their own password on first sign-in).
   Every change a student makes in a lesson is saved to their account, so their work follows them to any device,
   and their teacher sees the lesson % and the work itself on the Staff page. */
(function(){
"use strict";
const CFG = window.COMPASS_CONFIG || {};
const API = (CFG.api || "/api").replace(/\/$/, "");
const PREFIX = "msc:";
const LS = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k,v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} } };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $ = s => document.querySelector(s);

let S = null; try{ S = JSON.parse(LS.get("eg:session") || "null"); }catch(e){}
let offline = false;

async function api(path, body, opts){
  const o = { method: body ? "POST" : "GET", headers: {} };
  if(body){ o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
  if(S && S.token) o.headers.Authorization = "Bearer " + S.token;
  if(opts && opts.keepalive) o.keepalive = true;
  const r = await fetch(API + "/" + path, o);
  const type = r.headers.get("Content-Type") || "";
  if(!type.includes("json")) throw new Error("noapi");
  const d = await r.json();
  if(d && d.error === "expired"){ clear(); }
  return d;
}

function clearLessonData(){
  try{ const ks = []; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(k && k.indexOf(PREFIX) === 0) ks.push(k); } ks.forEach(k => localStorage.removeItem(k)); }catch(e){}
}
function clear(){ S = null; LS.set("eg:session", null); }
function store(sess){ S = sess; LS.set("eg:session", JSON.stringify(sess)); }
const isStaff = () => !!(S && (S.role === "teacher" || S.role === "leader"));
const isStudent = () => !!(S && S.role === "student");

/* ---------- sign-in screens ---------- */
function frame(inner){
  document.body.classList.add("signin");
  const c = $("#crumbs"); if(c) c.innerHTML = `<span class="brand"><img src="images/logo.svg" alt=""><span><span class="b-edu">Edu</span><span class="b-ghaf">Ghaf</span></span></span>`;
  $("#app").innerHTML = `<section class="panel signin-card"><div class="lockup"><img src="images/logo.svg" alt="EduGhaf logo"><div><div class="wm"><span>Edu</span><b>Ghaf</b></div><span class="tagline">Empowering every learner · <span lang="ar">تمكين كل متعلّم</span></span></div></div>${inner}</section>`;
}

function loginForm(done, opts){
  opts = opts || {};
  frame(`<h1>${opts.staff ? "Staff sign in" : "Sign in"}</h1>
    <p class="small">${opts.staff ? "Use your EduGhaf username and password." : "Students: your M Number (e.g. M9093). First time? Use the class password your teacher gives you, then choose your own.<br><span lang=\"ar\" dir=\"rtl\">الطلاب: اكتب رقمك المدرسي (M Number). أول مرة؟ استخدم كلمة مرور الصف التي يعطيك إياها المعلم، ثم اختر كلمة مرورك.</span>"}</p>
    <form id="auForm" class="gate-form" novalidate>
      <label>${opts.staff ? "Username" : "M Number <span class=\"small\">or staff username</span>"}<input id="auUser" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60" required></label>
      <label>Password<input id="auPass" type="password" autocomplete="current-password" maxlength="100" required></label>
      <p class="gate-msg" id="auMsg" role="alert">${esc(opts.msg || "")}</p>
      <button class="btn" type="submit">Sign in →</button></form>
    ${opts.staff ? "" : `<p class="small">Forgotten your password? Ask your teacher to reset it. · <a href="#teacher">Staff</a></p>`}`);
  $("#auUser").focus();
  $("#auForm").onsubmit = async e => { e.preventDefault();
    const msg = $("#auMsg"), btn = e.target.querySelector("button"); msg.textContent = ""; btn.disabled = true; btn.textContent = "Signing in…";
    try{
      const d = await api("login", { user: $("#auUser").value, pass: $("#auPass").value });
      btn.disabled = false; btn.textContent = "Sign in →";
      if(!d.ok){ msg.textContent = d.message || "Couldn't sign in."; return; }
      const prev = LS.get("eg:owner");
      if(prev !== d.user){ clearLessonData(); LS.set("eg:owner", d.user); }
      store({ token: d.token, user: d.user, role: d.role, name: d.name, code: d.code || "", mno: d.mno || "", cls: d.cls || "", mustChange: d.mustChange });
      if(d.mustChange) return changeForm(done, true);
      if(d.role === "student"){ try{ await pull(); }catch(x){} }
      done();
    }catch(err){ btn.disabled = false; btn.textContent = "Sign in →"; msg.textContent = "Couldn't reach EduGhaf. Check your internet connection."; }
  };
}

function changeForm(done, first){
  const student = isStudent(), min = student ? 6 : 8;
  frame(`<h1>${first ? "Choose your own password" : "Change your password"}</h1>
    <p class="small">${first ? `Welcome, <b>${esc(S.name)}</b>. Choose a password only you know. You'll use it every time you sign in.` : "Type your current password, then your new one."}
    ${student ? `<br><span lang="ar" dir="rtl">اختر كلمة مرور خاصة بك لا يعرفها غيرك.</span>` : ""}</p>
    <form id="cpForm" class="gate-form" novalidate>
      ${first ? "" : `<label>Current password<input id="cpOld" type="password" autocomplete="current-password" required></label>`}
      <label>New password <span class="small">at least ${min} characters</span><input id="cpNew" type="password" autocomplete="new-password" minlength="${min}" maxlength="100" required></label>
      <label>Type it again<input id="cpNew2" type="password" autocomplete="new-password" maxlength="100" required></label>
      <p class="gate-msg" id="cpMsg" role="alert"></p>
      <div class="row"><button class="btn" type="submit">Save my password</button>${first ? `<button class="btn alt" type="button" id="cpOut">Sign out</button>` : `<button class="btn alt" type="button" id="cpBack">Cancel</button>`}</div></form>`);
  (first ? $("#cpNew") : $("#cpOld")).focus();
  const out = $("#cpOut"); if(out) out.onclick = () => logout();
  const back = $("#cpBack"); if(back) back.onclick = () => { document.body.classList.remove("signin"); done(); };
  $("#cpForm").onsubmit = async e => { e.preventDefault();
    const msg = $("#cpMsg"), a = $("#cpNew").value, b = $("#cpNew2").value;
    if(a.length < min){ msg.textContent = `Your new password needs at least ${min} characters.`; return; }
    if(a !== b){ msg.textContent = "The two passwords don't match."; return; }
    try{
      const d = await api("password", { pass: first ? "" : $("#cpOld").value, newPass: a });
      if(!d.ok){ if(d.error === "expired") return loginForm(done, {msg: d.message}); msg.textContent = d.message; return; }
      S.mustChange = false; store(S); toast("Password saved.");
      document.body.classList.remove("signin");
      if(first && isStudent()) await pull();
      done();
    }catch(err){ msg.textContent = "Couldn't reach EduGhaf. Check your internet connection."; }
  };
}

async function logout(){
  await flush();
  try{ await api("logout", {}); }catch(e){}
  clear(); clearLessonData(); LS.set("eg:owner", null);
  location.hash = ""; location.reload();
}

/* ---------- saving work ---------- */
const pending = {}; let timer = null;
function loadPending(){ try{ Object.assign(pending, JSON.parse(LS.get("eg:pending") || "{}")); }catch(e){} }
function keepPending(){ LS.set("eg:pending", Object.keys(pending).length ? JSON.stringify(pending) : null); }
function changed(k, v){
  if(!isStudent() || S.mustChange || window.EG_VIEW) return;
  if(!/^y\d+-/.test(k)) return;
  pending[k] = v; keepPending();
  clearTimeout(timer); timer = setTimeout(flush, 1500);
}
async function flush(keepalive){
  clearTimeout(timer);
  const keys = Object.keys(pending); if(!keys.length || !isStudent()) return;
  const items = keys.slice(0, 40).map(k => { const state = pending[k];
    const result = !k.includes(":") && window.Results ? Results.score(k, state) : null;
    return { k, state: JSON.stringify(state), result }; });
  try{
    const d = await api("work", { items, token: S.token }, { keepalive: !!keepalive });
    if(d && d.ok){ items.forEach(it => { if(JSON.stringify(pending[it.k]) === it.state) delete pending[it.k]; }); keepPending(); setSaved(true); if(Object.keys(pending).length) timer = setTimeout(flush, 500); }
    else setSaved(false);
  }catch(e){ setSaved(false); timer = setTimeout(flush, 15000); }
}
function setSaved(ok){ const e = $("#egSaved"); if(e){ e.textContent = ok ? "✓ Saved" : "Not saved yet: will retry"; e.classList.toggle("warn", !ok); } }
window.addEventListener("pagehide", () => flush(true));
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") flush(true); });
window.addEventListener("online", () => flush());

/* Bring the student's saved work onto this device. */
async function pull(){
  const d = await api("work");
  if(!d || !d.ok) return false;
  d.items.forEach(it => { if(!pending[it.k]) LS.set(PREFIX + it.k, it.state); });
  const me = { name: S.name || "", cls: S.cls || "", mno: S.mno || "" };
  LS.set(PREFIX + "me", JSON.stringify(me));
  return true;
}

/* ---------- top bar ---------- */
function bar(){
  const box = document.querySelector(".topbar .me"); if(!box) return;
  if(!S){ box.innerHTML = offline ? `<span class="small">Saved on this device only</span>` : ""; return; }
  box.innerHTML = `<span class="who"><b>${esc(S.name)}</b>${S.cls ? " · " + esc(S.cls) : ""}${S.mno ? " · " + esc(S.mno) : ""}${isStaff() ? " · Staff" : ""}</span>
    ${isStudent() ? `<span class="small saved" id="egSaved">✓ Saved</span>` : ""}
    <button class="btn sm alt" type="button" id="egPass">Password</button><button class="btn sm alt" type="button" id="egOut">Sign out</button>`;
  $("#egOut").onclick = () => logout();
  $("#egPass").onclick = () => changeForm(() => { window.dispatchEvent(new HashChangeEvent("hashchange")); }, false);
}
function toast(t){ const e = $("#toast"); if(!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2800); }

/* ---------- start ---------- */
async function boot(start){
  loadPending();
  const go = () => { document.body.classList.remove("signin"); bar(); start(); };
  const staffPage = /^#(teacher|view\/)/.test(location.hash);
  if(!S){
    try{ const r = await fetch(API + "/me"); offline = !(r.headers.get("Content-Type") || "").includes("json"); }catch(e){ offline = true; }
    if(offline){ bar(); return start(); }   // e.g. the old GitHub Pages copy: no accounts, work stays on the device
    if(staffPage) return go();               // the Staff page shows its own sign-in
    return loginForm(go);
  }
  try{
    const d = await api("me");
    if(!d.ok){ clear(); return staffPage ? go() : loginForm(go, {msg: "Please sign in again."}); }
    Object.assign(S, { name: d.name, cls: d.cls || "", mno: d.mno || "", role: d.role, code: d.code || "", mustChange: d.mustChange }); store(S);
    if(d.mustChange) return changeForm(go, true);
    if(isStudent()){ await flush(); await pull(); }
    go();
  }catch(e){ offline = true; go(); }   // no connection: carry on with what's on this device; saving retries later
}

/* Teachers: open a student's saved lesson (read-only) */
async function viewWork(mno, k){ return api("staff", { action: "studentWork", mno, k }); }

window.Auth = { boot, api, changed, flush, logout, loginForm, changeForm, viewWork, bar,
  get session(){ return S; }, isStaff, isStudent, get offline(){ return offline; },
  signIn(store_){ store(store_); } };
})();
