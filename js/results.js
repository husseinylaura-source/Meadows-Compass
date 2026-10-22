/* Meadows Compass – lesson results for the teacher dashboard.
   Works out each lesson's % and sends it (with the student's M Number, name and class) to the Google Sheet
   set in js/config.js. Answers stay on the student's device; only scores are sent.

   Lesson % = autoWeight × (auto-marked score) + stepsWeight × (lesson steps completed)
   Auto-marked: quiz multiple choice, Challenge sort/order games, Literacy reading quiz,
   evidence hunt and missing-word gap-fills. Lessons with nothing auto-marked use steps only. */
(function(){
"use strict";
const CFG = window.COMPASS_CONFIG || {};
const PREFIX = "msc:";
const STEP_KEYS = {
  msc: ["start","donow","learn","group","game","analyse","create","copy","quiz","reflect"],
  me:  ["start","dna","words","task1","task2","task3","game","copy","quiz","reflect"],
  lit: ["retrieve","consolidate","practise","apply","reflect"]
};
STEP_KEYS.ss = STEP_KEYS.msc;
const SUBJECT_NAMES = {msc:"MSC", ss:"Social Studies", me:"Moral Education", lit:"Literacy"};
const TYPE_NAMES = {read:"READ", words:"WORDS", write:"WRITE"};

function get(k, d){ try{ const v = localStorage.getItem(PREFIX+k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } }
function set(k, v){ try{ localStorage.setItem(PREFIX+k, JSON.stringify(v)); }catch(e){} }
const norm = s => String(s||"").trim().toLowerCase();

/* Score helpers: each returns [correct, total] */
function mcq(answers, quiz){ quiz = quiz || []; answers = answers || {};
  return [quiz.filter((q,j) => answers[j] === q[2]).length, quiz.length]; }
function game(S, G){ if(!G || !G.items) return [0,0]; const t = G.items.length; return [Math.min(t, S.game || 0), t]; }

/* Read a lesson key and return what it is plus how to score it. */
function lessonInfo(key){
  let m = key.match(/^y(\d+)-(msc|ss|me)-([\w-]+)$/);
  if(m){
    const year = +m[1], sub = m[2], id = m[3];
    const src = sub === "msc" ? window.MSC_DATA : sub === "ss" ? window.SS_DATA : window.ME_DATA;
    const list = src && src["y"+year+"-"+sub];
    const L = list && list.find(l => l.id === id);
    if(!L) return null;
    return { year, subject: sub, id, title: L.title || id, date: L.wc || "",
      steps: STEP_KEYS[sub],
      auto(S){ const parts = [mcq(S.qa, L.quiz), game(S, L.game)];
        return parts.reduce((a,p) => [a[0]+p[0], a[1]+p[1]], [0,0]); } };
  }
  m = key.match(/^y(\d+)-lit-u(\d+)-w(\d+)-(read|words|write)$/);
  if(m){
    const year = +m[1], u = +m[2], w = +m[3], type = m[4];
    const Y = window.LIT && window.LIT[year]; const U = Y && Y.units[u-1]; const W = U && U.weeks[w-1];
    if(!W) return null;
    const C = ((window.LIT_CONTENT || {})[`${year}-${u}-${w}`] || {})[type];
    return { year, subject: "lit", id: `u${u}-w${w}-${type}`,
      title: `Unit ${u} Week ${w} ${TYPE_NAMES[type]}: ${W[0]}`, date: "",
      steps: STEP_KEYS.lit,
      auto(S){
        const parts = [];
        if(C && type === "read"){
          if(C.mcq) parts.push(mcq(S.rq, C.mcq));
          if(C.evidence && C.evidence.length){ const ev = S.ev || [];
            const hit = ev.filter(i => C.evidence.includes(i)).length, wrong = ev.length - hit;
            parts.push([Math.max(0, hit - wrong), C.evidence.length]); }
        }
        if(C && type === "words" && C.cloze){ const cz = S.cz || {};
          parts.push([C.cloze.filter((c,j) => norm(cz[j]) === norm(c[1])).length, C.cloze.length]); }
        return parts.reduce((a,p) => [a[0]+p[0], a[1]+p[1]], [0,0]);
      } };
  }
  return null;
}

/* Work out one lesson's result from its saved state. */
function score(key, S){
  const info = lessonInfo(key); if(!info || !S) return null;
  const done = info.steps.filter(k => S.done && S.done[k]).length, total = info.steps.length;
  const [got, of] = info.auto(S);
  const stepsPct = total ? done/total*100 : 0;
  const autoPct = of ? got/of*100 : null;
  const aw = CFG.autoWeight != null ? CFG.autoWeight : 0.7, sw = CFG.stepsWeight != null ? CFG.stepsWeight : 0.3;
  const pct = autoPct == null ? stepsPct : (aw*autoPct + sw*stepsPct) / (aw + sw);
  return { year: info.year, subject: info.subject, subjectName: SUBJECT_NAMES[info.subject],
    lessonId: info.id, lessonKey: key, title: info.title, lessonDate: info.date,
    stepsDone: done, stepsTotal: total, autoCorrect: got, autoTotal: of,
    stepsPct: Math.round(stepsPct), autoPct: autoPct == null ? "" : Math.round(autoPct),
    lessonPct: Math.round(pct), complete: done === total };
}

/* A lesson counts once the student has done something in it (beyond opening it). */
function started(S){ return S && ((S.done && Object.keys(S.done).length) ||
  Object.keys(S).some(k => !["done","step"].includes(k))); }

function student(){ const me = get("me", {});
  const m = String(me.mno||"").toUpperCase().replace(/\s+/g,"").match(/^M?(\d{3,7})$/);
  return { name: String(me.name||"").trim().replace(/\s+/g," "), cls: me.cls || "", mno: m ? "M" + m[1] : "" }; }

function send(payload){
  const url = CFG.resultsUrl; if(!url) return false;
  const body = JSON.stringify(payload);
  try{ if(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], {type:"text/plain;charset=utf-8"}))) return true; }catch(e){}
  try{ fetch(url, {method:"POST", mode:"no-cors", keepalive:true, headers:{"Content-Type":"text/plain;charset=utf-8"}, body}).catch(() => {}); return true; }catch(e){ return false; }
}

/* Send a lesson's result if it changed since the last send for this student. */
function report(key, S){
  if(!CFG.resultsUrl) return;
  const me = student(); if(!me.mno || !me.cls || !started(S)) return;
  const r = score(key, S); if(!r) return;
  // Only send for the student's own year group (a Year 8 class doing a Year 8 lesson).
  const clsYear = parseInt(me.cls, 10); if(clsYear && clsYear !== r.year) return;
  const payload = Object.assign({ v: 2, mno: me.mno, student: me.name, cls: me.cls }, r);
  const sig = JSON.stringify(payload);
  const sent = get("sent", {});
  if(sent[key] === sig) return;
  if(send(Object.assign({ sentAt: new Date().toISOString() }, payload))){ sent[key] = sig; set("sent", sent); }
}

const timers = {};
function queue(key, S){ clearTimeout(timers[key]); timers[key] = setTimeout(() => { delete timers[key]; report(key, S); }, 2500); }
function flush(){ Object.keys(timers).forEach(k => { clearTimeout(timers[k]); delete timers[k]; report(k, get(k, null)); }); }

/* Send every lesson saved on this device (catches up lessons done before sending was switched on). */
function syncAll(){
  if(!CFG.resultsUrl) return;
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i); if(!k || k.indexOf(PREFIX) !== 0) continue;
      const key = k.slice(PREFIX.length); if(!/^y\d+-/.test(key) || key.indexOf(":") >= 0) continue;
      report(key, get(key, null));
    }
  }catch(e){}
}

/* When a student changes name or class, resend everything under the new details. */
let idTimer = null;
function identityChanged(){ set("sent", {}); clearTimeout(idTimer); idTimer = setTimeout(syncAll, 3000); }

window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") flush(); });

window.Results = { queue, flush, syncAll, identityChanged, score, lessonInfo, enabled: () => !!CFG.resultsUrl, student };
})();
