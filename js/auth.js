/* EduGhaf – sign in, passwords and saving lesson progress to the school's EduGhaf database.
   Students sign in with their M Number, staff with their teacher code. Everyone chooses their own
   password the first time. Lesson work is kept on this device while you work and saved to your account,
   so it follows you to any computer. Signing out clears it from this device. */
(function(){
"use strict";
const API = "/api";
const PREFIX = "msc:";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let ME = null, HELP = "Ms Laura Husseiny", online = true;

async function req(path, body){
  const r = await fetch(API + path, body === undefined ? {credentials:"same-origin", cache:"no-store"}
    : {method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  let d = null; try{ d = await r.json(); }catch(e){}
  if(!d) throw new Error("Couldn't reach EduGhaf. Check the internet connection.");
  return d;
}

/* Lesson data on this device */
function localKeys(){ const out = []; try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(k && k.indexOf(PREFIX) === 0) out.push(k); } }catch(e){} return out; }
function wipeLocal(){ localKeys().forEach(k => { try{ localStorage.removeItem(k); }catch(e){} }); }
function setLocal(k, v){ try{ localStorage.setItem(PREFIX + k, JSON.stringify(v)); }catch(e){} }
function getLocal(k, d){ try{ const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } }

/* After signing in: this device belongs to this person, with their saved lessons. */
async function adopt(me){
  ME = me;
  if(getLocal("owner", "") !== me.user){ wipeLocal(); setLocal("owner", me.user); }
  const local = getLocal("me", {});
  setLocal("me", Object.assign(local, {name: me.name, cls: me.role === "student" ? me.cls : (local.cls || ""), mno: me.role === "student" ? me.display : ""}));
  if(me.role === "student" && !me.mustChange){
    try{
      const d = await req("/progress");
      if(d.ok) Object.keys(d.items || {}).forEach(k => {
        const here = getLocal(k, null);
        // keep whichever copy has more done (a lesson may have been worked on offline on this device)
        const n = s => s ? Object.keys(s.done || {}).length + Object.keys(s).length / 100 : -1;
        if(n(d.items[k]) >= n(here)) setLocal(k, d.items[k]);
      });
      if(d.ok && window.Results && Results.markSaved) Results.markSaved(d.items);
    }catch(e){}
  }
}

async function init(){
  try{ const i = await req("/info"); if(i && i.help) HELP = i.help; }catch(e){ online = false; }
  try{ const d = await req("/me"); if(d.ok) await adopt(d.me); else if(getLocal("owner", "")) wipeLocal(); }catch(e){}
  paintBar();
}

function paintBar(){
  const bar = document.getElementById("meBar"); if(!bar) return;
  if(!ME){ bar.innerHTML = `<a class="btn sm" href="#login">Sign in</a>`; return; }
  bar.innerHTML = `<span class="me-who"><b>${esc(ME.name)}</b><span class="small">${ME.role === "student" ? esc(ME.display) + " · " + esc(ME.cls) : esc(ME.display) + " · Staff"}</span></span>
    ${ME.role !== "student" ? `<a class="btn sm alt" href="#teacher">Dashboard</a>` : ""}
    <a class="btn sm alt" href="#password">Change password</a><button class="btn sm alt" type="button" id="meOut">Sign out</button>`;
  bar.querySelector("#meOut").onclick = signOut;
}

async function signOut(){
  if(window.Results) Results.flush();
  await new Promise(r => setTimeout(r, 300));
  try{ await req("/logout", {}); }catch(e){}
  wipeLocal(); ME = null; paintBar();
  location.hash = "#login"; if(window.Teacher && Teacher.reset) Teacher.reset();
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function forgotLine(){ return `Forgot your M Number or password? Contact <b>${esc(HELP)}</b> to reset it.`; }

/* Sign in page. next = where to go afterwards (hash without #). */
function page(app, next, note){
  document.body.classList.remove("staff");
  app.removeAttribute("data-unit");
  app.innerHTML = `<section class="panel gate auth">
    <span class="eyebrow">EduGhaf · Emirates International School – Meadows</span>
    <h1>Sign in</h1>
    ${note ? `<p class="notebar">${esc(note)}</p>` : ""}
    <p class="small">Students: use your <b>M Number</b> (on your ID card or ManageBac, e.g. M9093). Staff: use your teacher code (e.g. PLO).<br>
      <span lang="ar" dir="rtl">الطلاب: اكتب رقمك المدرسي (M Number) وكلمة المرور.</span></p>
    <form id="auForm" class="gate-form" novalidate>
      <label>M Number or staff code<input id="auUser" type="text" autocomplete="username" autocapitalize="characters" spellcheck="false" maxlength="40" required></label>
      <label>Password<span class="pw"><input id="auPass" type="password" autocomplete="current-password" maxlength="100" required><button class="btn sm alt" type="button" id="auShow" aria-label="Show password">Show</button></span></label>
      <p class="gate-msg" id="auMsg" role="alert"></p>
      <button class="btn" type="submit" id="auGo">Sign in →</button>
    </form>
    <p class="small forgot">${forgotLine()}<br><span lang="ar" dir="rtl">نسيت رقمك أو كلمة المرور؟ تواصل مع ${esc(HELP)} لإعادة تعيينها.</span></p>
    ${online ? "" : `<p class="small">EduGhaf can't reach its server right now. Check the internet connection and refresh.</p>`}
  </section>`;
  const f = app.querySelector("#auForm"), u = app.querySelector("#auUser"), p = app.querySelector("#auPass"), msg = app.querySelector("#auMsg");
  app.querySelector("#auShow").onclick = e => { const on = p.type === "password"; p.type = on ? "text" : "password"; e.target.textContent = on ? "Hide" : "Show"; };
  u.focus();
  f.onsubmit = async e => {
    e.preventDefault();
    const user = u.value.trim(), pass = p.value;
    if(!user){ msg.textContent = "Type your M Number (students) or teacher code (staff)."; return u.focus(); }
    if(!pass){ msg.textContent = "Type your password."; return p.focus(); }
    const go = app.querySelector("#auGo"); go.disabled = true; msg.textContent = "Signing in…";
    try{
      const d = await req("/login", {user, pass});
      if(!d.ok){ msg.innerHTML = esc(d.message) + (d.error === "wrong" || d.error === "locked" ? "<br>" + forgotLine() : ""); go.disabled = false; p.select(); return; }
      await adopt(d.me); paintBar();
      if(d.me.mustChange) return passwordPage(app, next, true);
      after(next);
    }catch(err){ msg.textContent = err.message; go.disabled = false; }
  };
}

function after(next){
  const want = "#" + (next || (ME && ME.role !== "student" ? "teacher" : ""));
  if(location.hash === want) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = want;
}

/* Change password (required the first time). */
function passwordPage(app, next, first){
  if(!ME) return page(app, "password");
  const min = ME.role === "student" ? 6 : 8;
  app.removeAttribute("data-unit");
  app.innerHTML = `<section class="panel gate auth">
    <span class="eyebrow">${esc(ME.name)} · ${esc(ME.display)}</span>
    <h1>${first || ME.mustChange ? "Choose your own password" : "Change your password"}</h1>
    <p class="small">${first || ME.mustChange ? "Welcome to EduGhaf! Before you start, swap the password you were given for one only you know." : ""}
      Use at least ${min} characters. Don't share it with anyone.</p>
    <form id="pwForm" class="gate-form" novalidate>
      <label>${first || ME.mustChange ? "Password you were given" : "Current password"}<input id="pwOld" type="password" autocomplete="current-password" maxlength="100" required></label>
      <label>New password<input id="pwNew" type="password" autocomplete="new-password" maxlength="100" required></label>
      <label>Type the new password again<input id="pwNew2" type="password" autocomplete="new-password" maxlength="100" required></label>
      <label class="chk"><input type="checkbox" id="pwShow"> Show passwords</label>
      <p class="gate-msg" id="pwMsg" role="alert"></p>
      <div class="row"><button class="btn" type="submit">Save my password</button>${ME.mustChange ? "" : `<a class="btn alt" href="#${esc(next || "")}">Cancel</a>`}</div>
    </form>
    <p class="small forgot">${forgotLine()}</p></section>`;
  const q = s => app.querySelector(s), msg = q("#pwMsg");
  q("#pwShow").onchange = e => ["#pwOld","#pwNew","#pwNew2"].forEach(s => q(s).type = e.target.checked ? "text" : "password");
  q("#pwOld").focus();
  q("#pwForm").onsubmit = async e => {
    e.preventDefault();
    const old = q("#pwOld").value, pass = q("#pwNew").value;
    if(!old){ msg.textContent = "Type the password you signed in with."; return; }
    if(pass.length < min){ msg.textContent = `Your new password needs at least ${min} characters.`; return; }
    if(pass !== q("#pwNew2").value){ msg.textContent = "The two new passwords don't match."; return; }
    msg.textContent = "Saving…";
    try{
      const d = await req("/password", {old, pass});
      if(!d.ok){ msg.textContent = d.message; return; }
      await adopt(d.me); paintBar();
      toast("Password saved.");
      after(next === "password" ? "" : next);
    }catch(err){ msg.textContent = err.message; }
  };
}
function toast(t){ const e = document.getElementById("toast"); if(!e) return; e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2800); }

/* Save lesson progress to the student's account. */
const pending = {};
function save(key, state, result){
  if(!ME || ME.role !== "student" || ME.mustChange) return;
  pending[key] = {key, state, result};
}
async function push(useBeacon){
  const items = Object.values(pending).slice(0, 40); if(!items.length) return true;
  items.forEach(i => delete pending[i.key]);
  const body = JSON.stringify({items});
  if(useBeacon && navigator.sendBeacon){
    try{ if(navigator.sendBeacon(API + "/progress", new Blob([body], {type:"application/json"}))) return true; }catch(e){}
  }
  try{
    const r = await fetch(API + "/progress", {method:"POST", credentials:"same-origin", keepalive: body.length < 60000,
      headers:{"Content-Type":"application/json"}, body});
    if(r.status === 401){ toast("You've been signed out. Sign in again to keep saving your work."); return false; }
    if(!r.ok) throw new Error();
    return Object.keys(pending).length ? push(false) : true;
  }catch(e){ items.forEach(i => { if(!pending[i.key]) pending[i.key] = i; }); return false; }
}

window.Auth = { init, page, passwordPage, signOut, save, push, paintBar, forgotLine,
  get me(){ return ME; }, get help(){ return HELP; } };
})();
