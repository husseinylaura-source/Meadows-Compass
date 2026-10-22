/* Meadows Compass · app logic. Data lives in /data, pictures in js/art.js and /images, videos in data/videos.js. */
(function(){
"use strict";
const SS = window.SS_DATA||{}, MSC = window.MSC_DATA||{}, ME = window.ME_DATA||{}, LIT = window.LIT||{}, LITC = window.LIT_CONTENT||{}, VIDEOS = window.VIDEOS||{}, ART = window.ART||{};

/* ---------- school set-up (EISM Meadows timetable V5.6, 17/09/2026) ---------- */
const YEARS = {
  7:{grade:6, classes:["7A","7B","7C","7D","7E"], subjects:["msc","ss","me","lit"], msc:[
      {classes:["7A","7B","7C"], day:0, when:"Monday · Lesson 9 · 13:50–14:30", teachers:"Sara Ayoub (room 261) · Premraj Loganathan (room 161)"},
      {classes:["7D","7E"], day:1, when:"Tuesday · Lesson 1 · 07:40–08:20", teachers:"Aiman Zein (room 201) · Rasha Khasawneh (room 151)"}], me:"Naveed Qureshi · Rida Zein"},
  8:{grade:7, classes:["8A","8B","8C","8D","8E"], subjects:["msc","ss","me","lit"], msc:[
      {classes:["8A","8B","8C"], day:4, when:"Friday · Lesson 4 · 09:55–10:35", teachers:"Rasha Khasawneh (149) · Laura Husseiny (150) · Emel Punar (244)"},
      {classes:["8D","8E"], day:1, when:"Tuesday · Lesson 7 · 11:55–12:35", teachers:"Abeer Issa (151) · Fardoos Nagi (1A)"}], me:"Rida Zein"},
  9:{grade:8, classes:["9A","9B","9C","9D","9E"], subjects:["msc","ss","me","lit"], msc:[
      {classes:["9A","9B","9C"], day:1, when:"Tuesday · Lesson 3 · 09:00–09:40", teachers:"Laura Husseiny (150) · Amany Elgwely (69)"},
      {classes:["9D","9E"], day:3, when:"Thursday · Lesson 4 · 09:40–10:20", teachers:"Mariam Aldaouk (61) · Rahma Al Louati (145)"}], me:"Marwa Elgamel"},
  10:{grade:9, classes:["10A","10B","10C","10D"], subjects:["msc","ss","me","lit"], msc:[
      {classes:["10A","10B","10C","10D"], day:1, when:"Tuesday · Lesson 4 · 09:40–10:20", teachers:"Sara Ayoub (261) · Ruby Kaur (59) · Ashley New (B19)"}], me:"Marwa Elgamel · Rida Zein"},
  11:{grade:10, classes:["11A","11B","11C","11D","11E"], subjects:["ss","lit","me"], me:"Marwa Elgamel · Rida Zein"},
  12:{grade:11, classes:["12A","12B","12C","12D"], subjects:["me"], me:"Marwa Elgamel · Rida Zein"},
  13:{grade:12, classes:["13A","13B","13C","13D"], subjects:["me"], me:"Marwa Elgamel · Rida Zein"}
};
window.COMPASS_YEARS = YEARS;   /* class lists for the Staff page */
const SUBJECTS = {
  msc:{name:"Moral, Social & Cultural Studies", short:"MSC", lang:"English", who:"For non-Arab students. Taught in English.", art:"globe"},
  ss: {name:"Social Studies", short:"Social Studies", lang:"العربية", who:"For Arab students. Taught in Arabic.", art:"explore"},
  me: {name:"Moral Education", short:"Moral Education", lang:"العربية", who:"For Arab students. Taught in Arabic.", art:"fair"},
  lit:{name:"Literacy", short:"Literacy", lang:"English", who:"READ · WORDS · WRITE. Taught while Islamic Education lessons run.", art:"book"}
};
const MSC_PLAN = {
  8:["Staying Safe at Home and Outside","First Aid","Ways of Protection Against Crimes","The Geography of East Asia","Engineering and Civilization in Ancient China","Chinese Technology, Science and Medicine","Term 1 review and assessment"],
  9:["Understanding Diversity and Equality","How Tolerant Are You?","Being 'Different' is not so Bad","Land and Resources of Africa","Ancient African Civilizations","West African Islamic Civilizations","Term 1 review and assessment"],
  10:["Realising the Value of Money","How Wealth Can Be a Force for Good?","The Development of Entrepreneurship Skills","The UAE Landscape and Jebel Faya","The Bronze Age and Umm an-Nar","Shipbuilding and Trade: Ed-Dur and the Arabian Gulf","Term 1 review and assessment"]
};
const PLAN_WEEKS = ["2026-10-26","2026-11-02","2026-11-09","2026-11-16","2026-11-23","2026-11-30","2026-12-07"];
const SS_PLAN = {7:["Civilization","Civilizational Revolutions","Civilizational Figures","Positive Citizenship","The UAE: Land of Giving","Humanitarian Martyrs","The Map","Atlases and Encyclopedias","Field Study","Term 1 Review and Assessment"]};

/* ---------- helpers ---------- */
let LANG="en";const T=(en,ar)=>LANG==="ar"?ar:en;const LET=k=>T("abcdefgh","أبجدهوزح")[k];
if(!SS["y11-ss"]&&SS["y10-ss"])SS["y11-ss"]=SS["y10-ss"];
const store={get(k,d){try{const v=localStorage.getItem("msc:"+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem("msc:"+k,JSON.stringify(v))}catch(e){}}};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const $=s=>document.querySelector(s);
function toast(t){const e=$("#toast");e.textContent=t;e.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>e.hidden=true,2800)}
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const fmt=d=>d.toLocaleDateString(T("en-GB","ar-u-nu-latn"),{weekday:"short",day:"numeric",month:"short"});
const lc1=s=>s?s.charAt(0).toLowerCase()+s.slice(1):s;
function el(tag,attrs,...kids){const e=document.createElement(tag);if(attrs)for(const[k,v]of Object.entries(attrs)){if(v==null||v===false)continue;if(k==="html")e.innerHTML=v;else if(k.startsWith("on"))e[k]=v;else e.setAttribute(k,v===true?"":v)}kids.flat().forEach(c=>{if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(c))});return e}
function art(key,img){if(img)return `<img class="photo" src="${esc(img)}" alt="" onerror="this.outerHTML=window.ART&&window.ART['${esc(key)}']||''">`;return ART[key]||ART.book||""}

let me=store.get("me",{name:"",cls:""});
function setupMe(){const sel=$("#stuClass"),nm=$("#stuName");const all=Object.values(YEARS).flatMap(y=>y.classes);
  sel.innerHTML='<option value="">Choose</option>'+all.map(c=>`<option ${c===me.cls?"selected":""}>${c}</option>`).join("");
  nm.value=me.name||"";nm.oninput=()=>{me.name=nm.value;store.set("me",me);window.Results&&Results.identityChanged()};
  const mn=$("#stuM");if(mn){const okM=v=>/^M?\d{3,7}$/i.test(String(v||"").replace(/\s+/g,""));mn.value=me.mno||"";mn.classList.toggle("bad",!!mn.value&&!okM(mn.value));
    mn.oninput=()=>{const v=mn.value.toUpperCase().replace(/\s+/g,"");me.mno=okM(v)?"M"+v.replace(/^M/,""):"";store.set("me",me);mn.classList.toggle("bad",!!v&&!okM(v));window.Results&&Results.identityChanged()};
    mn.onblur=()=>{if(me.mno)mn.value=me.mno}}sel.onchange=()=>{me.cls=sel.value;store.set("me",me);window.Results&&Results.identityChanged();route()}}
function lessonDate(year,cls,wc){const g=(YEARS[year].msc||[]).find(g=>g.classes.includes(cls));const d=new Date(wc+"T00:00:00");if(g)d.setDate(d.getDate()+g.day);return {date:d,group:g}}
function currentWeekIdx(list){const now=new Date();let idx=-1;list.forEach((w,i)=>{if(now>=new Date(w+"T00:00:00"))idx=i});return idx}
const words=s=>String(s||"").split(",").map(w=>w.trim()).filter(Boolean);

/* ---------- router ---------- */
window.addEventListener("hashchange",route);
function crumbs(parts){$("#crumbs").innerHTML=`<a class="brand" href="#"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6z" fill="var(--ta)" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>Meadows Compass</a>`+parts.map(p=>`<span class="sep">›</span>`+(p[1]?`<a href="#${p[1]}">${esc(p[0])}</a>`:`<span>${esc(p[0])}</span>`)).join("")}
function route(){
  clearInterval(route._tick);const h=(location.hash||"").slice(1);const app=$("#app");app.removeAttribute("data-unit");LANG="en";app.removeAttribute("dir");app.removeAttribute("lang");window.scrollTo(0,0);let m;
  window.Teacher&&Teacher.leave();
  if(h==="teacher")return window.Teacher?Teacher.show(app,crumbs):home(app);
  if(!h)return home(app);
  if((m=h.match(/^y(\d+)$/)))return yearPage(app,+m[1]);
  if((m=h.match(/^y(\d+)-(msc|ss|me)$/)))return subjectPage(app,+m[1],m[2]);
  if((m=h.match(/^y(\d+)-(msc|ss)-(w\d+)$/)))return mscLesson(app,+m[1],m[3],m[2]);
  if((m=h.match(/^y(\d+)-me-(l\d+)$/)))return meLesson(app,+m[1],m[2]);
  if((m=h.match(/^y(\d+)-lit$/)))return litYear(app,+m[1]);
  if((m=h.match(/^y(\d+)-lit-u(\d)$/)))return litUnit(app,+m[1],+m[2]);
  if((m=h.match(/^y(\d+)-lit-u(\d)-w(\d)-(read|words|write)$/)))return litLesson(app,+m[1],+m[2],+m[3],m[4]);
  home(app);
}

/* ---------- pages ---------- */
function home(app){
  crumbs([]);
  app.innerHTML=`<section class="hero-home"><div><span class="eyebrow">Emirates International School – Meadows · 2026–27</span><h1>Pick your year group</h1>
    <p>Every lesson has a Do Now, pictures, games, a quiz and a hand-in. Download your work at the end and upload it to ManageBac.</p></div>${ART.tolerance}</section>
    <div class="years">${Object.entries(YEARS).map(([y,v])=>`<a class="year" href="#y${y}"><span class="eyebrow">Year</span><span class="big">${y}</span><span class="g">Grade ${v.grade}</span><span class="subs">${v.subjects.map(s=>`<i>${SUBJECTS[s].short==="Moral Education"?"ME":SUBJECTS[s].short==="Social Studies"?"SS":SUBJECTS[s].short}</i>`).join("")}</span></a>`).join("")}</div>`;
}
function ready(y,s){if(s==="msc")return !!MSC["y"+y+"-msc"];if(s==="ss")return !!SS["y"+y+"-ss"];if(s==="me")return !!ME["y"+y+"-me"];if(s==="lit")return !!LIT[y];return false}
function yearPage(app,y){const Y=YEARS[y];if(!Y)return home(app);crumbs([["Year "+y]]);
  app.innerHTML=`<section class="hero-home"><div><span class="eyebrow">Year ${y} · Grade ${Y.grade}</span><h1>Choose your subject</h1>
    <p>Non-Arab students take MSC. Arab students take Social Studies and Moral Education. Literacy runs while Islamic Education lessons run. Ask your teacher if you are not sure.</p></div></section>
    <div class="subjects">${Y.subjects.map(k=>{const s=SUBJECTS[k];const r=ready(y,k);const href=k==="lit"?`#y${y}-lit`:`#y${y}-${k}`;
      return `<a class="subject" href="${href}" data-unit="${k==="lit"?"lit":k==="me"?"me":k==="ss"?"ss":"msc"}"><div class="sart">${art(s.art)}</div><span class="tag ${r?"":"soon"}">${r?"Lessons ready":"Coming soon"}</span><h3>${esc(s.name)}</h3><span class="who">${esc(s.who)}</span><span class="small">Language: ${esc(s.lang)}</span></a>`}).join("")}</div>`;
}
function classFilter(y,sub,extra){const Y=YEARS[y];const cls=Y.classes.includes(me.cls)?me.cls:"";
  let info="";if(cls&&sub==="msc"&&Y.msc){const g=Y.msc.find(g=>g.classes.includes(cls));info=`<div class="classinfo"><div><b>Lesson</b>${esc(g.when)}</div><div><b>Teachers</b>${esc(g.teachers)}</div></div>`}
  const ar=sub==="ss"||sub==="me";
  if(sub==="me"&&Y.me)info=`<div class="classinfo"><div><b>${ar?"المعلمون":"Teachers"}</b>${esc(Y.me)}</div></div>`;
  return `<div class="panel"><div class="row" style="justify-content:space-between"><h3>${ar?"صفّك":"Your class"}</h3><span class="small">${ar?"اختر صفّك":(extra||"Pick your class")}</span></div>
    <div class="filter" role="group" aria-label="Class">${Y.classes.map(c=>`<button type="button" data-c="${c}" aria-pressed="${c===cls}">${c}</button>`).join("")}</div>${info}</div>`}
function wireFilter(app,again){app.querySelectorAll(".filter button").forEach(b=>b.onclick=()=>{me.cls=b.dataset.c;store.set("me",me);window.Results&&Results.identityChanged();setupMe();again()})}
function progressOf(key,total){const s=store.get(key,{});const n=Object.keys(s.done||{}).length;return {n,total,pct:Math.round(n/total*100)}}

function subjectPage(app,y,sub){const Y=YEARS[y];const S=SUBJECTS[sub];if(!Y||!S||!Y.subjects.includes(sub))return yearPage(app,y);
  crumbs([["Year "+y,"y"+y],[S.short]]);
  const AR={ss:"الدراسات الاجتماعية",me:"التربية الأخلاقية"};const head=AR[sub]&&(SS["y"+y+"-ss"]&&sub==="ss"||ME["y"+y+"-me"]&&sub==="me")?`<section class="hero-home sm" data-unit="${sub}"><div><span class="eyebrow">السنة ${y} · ${esc(S.name)}</span><h1>${AR[sub]}</h1></div>${art(S.art)}</section>`:`<section class="hero-home sm" data-unit="${sub}"><div><span class="eyebrow">Year ${y} · ${esc(S.lang)}</span><h1>${esc(S.name)}</h1></div>${art(S.art)}</section>`;
  if((sub==="msc"&&MSC["y"+y+"-msc"])||(sub==="ss"&&SS["y"+y+"-ss"])){
    const data=sub==="ss"?SS["y"+y+"-ss"]:MSC["y"+y+"-msc"];const ar=sub==="ss";if(ar){app.setAttribute("dir","rtl");app.setAttribute("lang","ar")}const cls=Y.classes.includes(me.cls)?me.cls:"";const nowI=currentWeekIdx(data.map(l=>l.wc));
    app.innerHTML=head+classFilter(y,sub,ar?"Pick your class":"Pick your class to see your lesson day")+`<div class="weeks">${data.map((l,i)=>{const p=progressOf(`y${y}-${sub}-${l.id}`,MSC_STEPS.length-1);const ld=cls&&!ar?lessonDate(y,cls,l.wc).date:new Date(l.wc+"T00:00:00");
      return `<a class="wk" data-unit="${l.theme}" href="#y${y}-${sub}-${l.id}" ${ar?'dir="rtl" lang="ar"':""}><span class="thumb">${art(l.art,l.image)}</span><div style="min-width:0"><div class="t">${ar?"الأسبوع "+l.week:"Week "+l.week}: ${esc(l.title)}${i===Math.max(nowI,0)?`<span class="now">${ar?"هذا الأسبوع":"This week"}</span>`:""}</div><div class="s">${esc(l.unit)} · ${esc(l.lesson)} · ${ar?"أسبوع "+new Date(l.wc+"T00:00:00").toLocaleDateString("ar-u-nu-latn",{day:"numeric",month:"long"}):(cls?"Your lesson: ":"Week of ")+fmt(ld)}</div><div class="meter"><i style="width:${p.pct}%"></i></div></div><span class="p">${p.n}/${p.total}</span></a>`}).join("")}</div>`;
    return wireFilter(app,()=>subjectPage(app,y,sub));
  }
  if(sub==="me"&&ME["y"+y+"-me"]){
    const data=ME["y"+y+"-me"];app.setAttribute("dir","rtl");app.setAttribute("lang","ar");
    app.innerHTML=head+classFilter(y,sub)+`<div class="weeks">${data.map(l=>{const p=progressOf(`y${y}-me-${l.id}`,ME_STEPS.length-1);
      return `<a class="wk" data-unit="me" href="#y${y}-me-${l.id}"><span class="thumb">${art(l.art,l.image)}</span><div style="min-width:0"><div class="t">الدرس ${l.lesson}: ${esc(l.title)}</div><div class="s">${esc(l.unit)} · الفصل الأول</div><div class="meter"><i style="width:${p.pct}%"></i></div></div><span class="p">${p.n}/${p.total}</span></a>`}).join("")}</div>`;
    return wireFilter(app,()=>subjectPage(app,y,sub));
  }
  const plan=sub==="msc"?MSC_PLAN[y]:sub==="ss"?SS_PLAN[y]:null;
  app.innerHTML=head+`<p class="notebar">The interactive lessons for ${esc(S.name)} in Year ${y} are being built. Your teacher will tell you when they are ready.</p>`+classFilter(y,sub)+
    (plan?`<div class="panel"><h3>Coming up this term</h3><div class="weeks">${plan.map((t,i)=>`<div class="wk soon"><span class="thumb">${art(S.art)}</span><div><div class="t">${sub==="msc"?"Week "+(i+4)+": ":"Lesson "+(i+1)+": "}${esc(t)}</div><div class="s">${sub==="msc"?"Week commencing "+fmt(new Date(PLAN_WEEKS[i]+"T00:00:00")):"Term 1"}</div></div><span class="p">Soon</span></div>`).join("")}</div></div>`:"");
  wireFilter(app,()=>subjectPage(app,y,sub));
}

/* ---------- shared lesson shell ---------- */
function lessonShell(app,o){
  /* o: {key, unit, steps:[{k,name,min}], render(stepKey, stage, ctx), pdf(state)} */
  const K=o.key;let S=store.get(K,{done:{},step:0});S.done=S.done||{};const save=()=>{store.set(K,S);window.Results&&Results.queue(K,S)};
  if(window.Results&&Results.enabled()&&(!me.mno||!me.cls))setTimeout(()=>toast(T("Add your M Number and class at the top so your teacher can see your progress.","اكتب رقمك المدرسي (M Number) واختر صفّك في الأعلى ليرى معلمك تقدّمك.")),800);
  app.setAttribute("data-unit",o.unit||"msc");
  app.innerHTML=`<div class="lesson"><div class="clock" id="clock"><span class="time" id="ctime">00:00</span><div class="phase"><div id="cphase"></div><div class="bar" id="cbar">${o.steps.filter(s=>s.min).map(s=>`<i class="todo" style="width:${s.min/40*100}%"></i>`).join("")}</div></div><div class="row"><button class="btn sm" id="cgo" type="button">${T("Start","ابدأ")}</button><button class="btn sm alt" id="creset" type="button">${T("Reset","إعادة")}</button></div></div>
    <nav class="steps" id="steps" aria-label="Lesson steps"></nav><section class="stage" id="stage"></section></div>`;
  const timed=o.steps.filter(s=>s.min);const C=store.get(K+":clock",{start:null,acc:0});const elapsed=()=>C.acc+(C.start?Date.now()-C.start:0);
  const quizStep=o.steps.findIndex(s=>s.k==="quiz");
  function tick(){const s=Math.floor(elapsed()/1000);$("#ctime").textContent=String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
    let t=0,cur=timed.length-1;for(let i=0;i<timed.length;i++){if(s<(t+timed[i].min)*60){cur=i;break}t+=timed[i].min}
    [...$("#cbar").children].forEach((b,i)=>b.className=i<cur?"done":i===cur?"cur":"todo");
    const ph=$("#cphase");if(!C.start&&!C.acc)ph.textContent=T("Press Start when your teacher says go.","اضغط «ابدأ» عندما يطلب منك المعلم.");else if(s>=2400)ph.innerHTML=T("<b>40 minutes are up.</b> Finish and download your work.","<b>انتهت الدقائق الأربعون.</b> أكمل عملك ونزّله.");else ph.innerHTML=`${T("Now","الآن")}: <b>${timed[cur].name}</b> · ${timed[cur].min} ${T("min","د")}`;
    if(quizStep>0&&s>=35*60&&C.start&&!C.nudged){C.nudged=true;store.set(K+":clock",C);toast(T("Quiz time! Go to the Quiz step.","حان وقت الاختبار! انتقل إلى خطوة الاختبار."))}
    $("#cgo").textContent=C.start?T("Pause","إيقاف مؤقت"):(C.acc?T("Resume","متابعة"):T("Start","ابدأ"))}
  $("#cgo").onclick=()=>{if(C.start){C.acc=elapsed();C.start=null}else C.start=Date.now();store.set(K+":clock",C);tick()};
  $("#creset").onclick=()=>{C.start=null;C.acc=0;C.nudged=false;store.set(K+":clock",C);tick()};
  tick();route._tick=setInterval(tick,1000);
  const ctx={S,save,K,markDone(k){if(!S.done[k]){S.done[k]=true;save();steps();burst()}},startClock(){if(!C.start&&!C.acc){C.start=Date.now();store.set(K+":clock",C);tick()}},go:show};
  function burst(){const b=el("div",{class:"burst","aria-hidden":"true"},"★");document.body.appendChild(b);setTimeout(()=>b.remove(),900)}
  function steps(){$("#steps").innerHTML=o.steps.map((s,i)=>`<button type="button" data-i="${i}" class="${S.done[s.k]?"done":""}" aria-current="${i===S.step}"><span class="dot">${S.done[s.k]?"✓":i}</span>${s.name}</button>`).join("");$("#steps").querySelectorAll("button").forEach(b=>b.onclick=()=>show(+b.dataset.i))}
  function show(i){S.step=i;save();steps();window.scrollTo({top:0,behavior:"smooth"});const st=$("#stage");st.innerHTML="";const sk=o.steps[i];
    const hd=el("div",{class:"stage-head"},el("h3",null,sk.title||sk.name),sk.min?el("span",{class:"mins"},sk.min+" "+T("min","د")):null);st.append(hd);
    (VIDEOS[K]||[]).filter(v=>(v.at||o.steps[1].k)===sk.k).forEach(v=>st.append(videoBlock(v)));
    o.render(sk.k,st,ctx);
    const nav=el("div",{class:"navrow"});nav.append(i>0?el("button",{class:"btn alt",type:"button",onclick:()=>show(i-1)},T("← ","→ ")+o.steps[i-1].name):el("span"));
    if(i<o.steps.length-1)nav.append(el("button",{class:"btn",type:"button",onclick:()=>{if(i===0)ctx.startClock();show(i+1)}},o.steps[i+1].name+T(" →"," ←")));st.append(nav)}
  steps();show(Math.min(S.step||0,o.steps.length-1));
  return ctx;
}
function videoBlock(v){const url=String(v.url||"");const m=url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);const box=el("div",{class:"video"});
  box.append(el("p",{class:"vt"},el("b",null,T("Watch: ","شاهد: ")),v.title||T("Video","فيديو")));
  if(m){box.append(el("div",{class:"vframe"},el("iframe",{src:`https://www.youtube-nocookie.com/embed/${m[1]}`,title:v.title||"Video",allow:"accelerometer; encrypted-media; picture-in-picture; fullscreen",allowfullscreen:true,loading:"lazy"})))}
  else if(url){box.append(el("video",{src:url,controls:true,preload:"metadata",playsinline:true}))}
  if(url)box.append(el("a",{href:url,target:"_blank",rel:"noopener",class:"small"},T("Video not showing? Open it here.","لا يظهر الفيديو؟ افتحه من هنا.")));return box}

/* ---------- reusable activities ---------- */
function textArea(S,field,save,rows,ph){const t=el("textarea",{rows:rows||3,placeholder:ph||T("Type your answer…","اكتب إجابتك…")});t.value=S[field]||"";t.oninput=()=>{S[field]=t.value;save()};return t}
function qaList(ctx,field,items,o={}){/* items:[[q,model]] */const {S,save}=ctx;S[field]=S[field]||[];S[field+"M"]=S[field+"M"]||[];const box=el("div",{class:"panel"});const ans=[];
  items.forEach((q,j)=>{const t=el("textarea",{rows:o.rows||2,id:field+j,placeholder:T("Type your answer…","اكتب إجابتك…")});t.value=S[field][j]||"";t.oninput=()=>{S[field][j]=t.value;save()};
    const a=el("div",{class:"ans",hidden:true});if(q[1]){a.append(el("div",{class:"green"},el("small",null,o.modelLabel||T("Suggested answer","إجابة مقترحة")),q[1]));
      if(o.selfmark!==false){const sm=el("div",{class:"selfmark"});const y=el("button",{type:"button",class:"y"},T("✓ I got it","✓ أجبت صحيحًا")),n=el("button",{type:"button",class:"n"},T("✗ Not yet","✗ ليس بعد"));
        const set=()=>{y.setAttribute("aria-pressed",S[field+"M"][j]===1);n.setAttribute("aria-pressed",S[field+"M"][j]===0)};set();y.onclick=()=>{S[field+"M"][j]=1;save();set()};n.onclick=()=>{S[field+"M"][j]=0;save();set()};sm.append(y,n);a.append(sm)}}
    ans.push(a);box.append(el("div",{class:"qa"},el("label",{for:field+j},el("span",{class:"num"},o.letters?LET(j):String(j+1)),q[0]),t,a))});
  if(items.some(q=>q[1])){const btn=el("button",{class:"btn",type:"button"},o.checkLabel||T("Check my answers","تحقّق من إجاباتي"));const rv=()=>{ans.forEach(a=>a.hidden=false);S[field+"Shown"]=true;save();o.onCheck&&o.onCheck()};btn.onclick=rv;box.append(el("div",{class:"row"},btn));if(S[field+"Shown"])rv()}
  return box}
function flipCards(items,cls,onAll){/* items:[[front,back,hint]] */const g=el("div",{class:cls||"grid4"});const seen=new Set();
  items.forEach((it,j)=>{const b=el("button",{class:"flip"+(cls==="grid4"?" term":""),type:"button",html:`<span class="in"><span class="f"><span class="big">${esc(it[0])}</span><span class="hint">${esc(it[2]||T("Tap to flip","اضغط للقلب"))}</span></span><span class="b">${it[3]?`<b>${esc(it[0])}</b>`:""}${esc(it[1])}</span></span>`});
    b.onclick=()=>{b.classList.toggle("on");seen.add(j);if(seen.size===items.length&&onAll)onAll()};g.append(b)});return g}
function mcqBlock(ctx,field,quiz,onDone){const {S,save}=ctx;S[field]=S[field]||{};const wrap=el("div",{class:"panel"});const sc=el("span",{class:"big"});
  const upd=()=>{const n=Object.entries(S[field]).filter(([j,a])=>a===quiz[j][2]).length;sc.textContent=n+"/"+quiz.length;S[field+"Score"]=n;save();if(Object.keys(S[field]).length===quiz.length&&onDone)onDone(n)};
  wrap.append(el("div",{class:"score"},sc,el("span",null,T("Choose the correct answer. You get one try per question.","اختر الإجابة الصحيحة. لديك محاولة واحدة لكل سؤال."))));
  quiz.forEach((q,j)=>{const box=el("div",{class:"mcq"});box.append(el("p",null,el("b",null,(j+1)+". "+q[0])));const os=el("div",{class:"opts"});const fb=el("p",{class:"small"});
    const paint=()=>{const a=S[field][j];if(a==null)return;[...os.children].forEach((b,k)=>{b.disabled=true;if(k===q[2])b.classList.add("right");else if(k===a)b.classList.add("wrong")});fb.textContent=a===q[2]?T("Correct!","إجابة صحيحة!"):T("Not quite. The answer is ","ليست صحيحة. الإجابة هي ")+LET(q[2])+"."};
    q[1].forEach((o,k)=>os.append(el("button",{type:"button",onclick:()=>{S[field][j]=k;save();paint();upd()}},LET(k)+") "+o)));paint();box.append(os,fb);wrap.append(box)});
  upd();return wrap}
function sortGame(root,G,onDone){const items=shuffle(G.items);let k=0,good=0;root.innerHTML="";
  const sc=el("div",{class:"sortcard"});const out=el("div",{class:"binsout"});const lists=G.bins.map(b=>{const u=el("ul");out.append(el("div",null,el("h4",null,b),u));return u});root.append(sc,out);
  function next(){sc.innerHTML="";if(k>=items.length){sc.append(el("p",{class:"result"},T(`You sorted ${good} of ${items.length} correctly.`,`صنّفت ${good} من ${items.length} بشكل صحيح.`)),el("div",{class:"bins"},el("button",{class:"bin",type:"button",onclick:()=>sortGame(root,G,onDone)},T("Play again","العب مرة أخرى"))));onDone&&onDone(good,items.length);return}
    const it=items[k];sc.append(el("p",{class:"small"},T(`Card ${k+1} of ${items.length}`,`البطاقة ${k+1} من ${items.length}`)),el("p",{class:"item"},it[0]));const bins=el("div",{class:"bins"});
    G.bins.forEach((b,j)=>bins.append(el("button",{class:"bin",type:"button",onclick:()=>{const ok=j===it[1];if(ok)good++;lists[it[1]].append(el("li",ok?null:{class:"x"},it[0]+(ok?"":T(" (not "," (ليست ")+G.bins[j]+")")));if(!ok){sc.classList.add("shake");setTimeout(()=>sc.classList.remove("shake"),400)}k++;next()}},b)));sc.append(bins)}
  next()}
function orderGame(root,G,onDone){const sorted=G.items.slice();const pool=shuffle(G.items);let placed=0,miss=0;root.innerHTML="";
  const pl=el("div",{class:"pool"}),tl=el("ol",{class:"timeline"}),msg=el("p",{class:"small"},T("Tap the earliest event first.","اضغط على الحدث الأقدم أولًا."));
  root.append(el("div",{class:"grid2"},el("div",{class:"panel"},el("h4",null,T("Events","الأحداث")),pl),el("div",{class:"panel"},el("h4",null,T("Your timeline","خطّك الزمني")),tl,msg)));
  pool.forEach(it=>{const b=el("button",{type:"button"},it[0]);b.onclick=()=>{if(it[0]===sorted[placed][0]){placed++;b.disabled=true;tl.append(el("li",{html:`<b>${esc(it[1])}</b>${esc(it[0])}`}));
      if(placed===sorted.length){msg.innerHTML=`<span class="result">${T(`Timeline complete${miss?`, with ${miss} wrong tap${miss>1?"s":""}`:". No mistakes!"}`,`اكتمل الخط الزمني${miss?` مع ${miss} من المحاولات الخاطئة`:" من دون أخطاء!"}`)}</span>`;onDone&&onDone(Math.max(0,sorted.length-miss),sorted.length)}else msg.textContent=T("Good. What came next?","أحسنت. ماذا حدث بعد ذلك؟")}
    else{miss++;b.classList.add("shake");setTimeout(()=>b.classList.remove("shake"),400);msg.textContent=T("Not yet. Something happened before that.","ليس بعد. هناك حدث وقع قبل ذلك.")}};pl.append(b)})}
function matchGame(root,pairs,onDone){/* pairs [[term,def]] */root.innerHTML="";let sel=null,done=0;const c1=el("div",{class:"col"}),c2=el("div",{class:"col"});
  shuffle(pairs.map((p,i)=>[p[0],i])).forEach(([t,i])=>{const b=el("button",{class:"tile term",type:"button","data-i":i},t);b.onclick=()=>{if(b.classList.contains("ok"))return;c1.querySelectorAll(".sel").forEach(x=>x.classList.remove("sel"));b.classList.add("sel");sel=b};c1.append(b)});
  shuffle(pairs.map((p,i)=>[p[1],i])).forEach(([d,i])=>{const b=el("button",{class:"tile",type:"button","data-i":i},d);b.onclick=()=>{if(!sel||b.classList.contains("ok"))return;
    if(+sel.dataset.i===i){sel.classList.replace("sel","ok");b.classList.add("ok");sel.disabled=b.disabled=true;sel=null;done++;if(done===pairs.length)onDone&&onDone()}else{b.classList.add("no");setTimeout(()=>b.classList.remove("no"),600)}};c2.append(b)});
  root.append(el("p",{class:"small"},T("Tap a word, then tap its meaning.","اضغط على المصطلح، ثم على معناه.")),el("div",{class:"match"},c1,c2))}
function rateBlock(ctx,criteria){const {S,save}=ctx;S.rate=S.rate||[];const lv=LV();const box=el("div",{class:"rate"});
  criteria.forEach((c,j)=>{const seg=el("div",{class:"seg"});lv.forEach((l,k)=>{const b=el("button",{type:"button","aria-pressed":S.rate[j]===k},l);b.onclick=()=>{S.rate[j]=k;save();seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b))};seg.append(b)});
    box.append(el("div",{class:"r"},el("span",{html:Array.isArray(c)?`<span class="chip">${esc(c[0])}</span> ${esc(c[1])}`:esc(c)}),seg))});return box}
function copyBook(o){/* {date,title,lines:[[label,text]],lists:[[label,[items]]]} */const b=el("div",{class:"book"});
  b.append(el("div",{class:"d"},o.date.toLocaleDateString(T("en-GB","ar-u-nu-latn"),{weekday:"long",day:"numeric",month:"long",year:"numeric"})),el("h4",null,o.title));
  (o.lines||[]).forEach(l=>b.append(el("p",{html:`<span class="lbl">${esc(l[0])}:</span> ${esc(l[1])}`})));
  (o.lists||[]).forEach(l=>{b.append(el("p",{class:"lbl"},l[0]));b.append(el("ul",null,l[1].map(x=>el("li",{html:Array.isArray(x)?`<b>${esc(x[0])}</b>: ${esc(x[1])}`:esc(x)}))))});return b}
function copiedBox(ctx){const c=el("input",{type:"checkbox",id:"copied"});c.checked=!!ctx.S.copied;c.onchange=()=>{ctx.S.copied=c.checked;ctx.save();if(c.checked)ctx.markDone("copy")};return el("label",{class:"row",style:"font-weight:700"},c,T(" I have copied this into my book"," نقلت هذا إلى دفتري"))}
function startersBar(starters,target){return el("div",{class:"starters"},el("span",{class:"small"},T("Sentence starters (tap to add):","بدايات جمل (اضغط للإضافة):")),...starters.map(s=>el("button",{type:"button",class:"chip btnchip",onclick:()=>{target.value+=(target.value&&!/\s$/.test(target.value)?" ":"")+s+" ";target.dispatchEvent(new Event("input"));target.focus()}},s)))}
function wordTracker(list,target){const box=el("div",{class:"tracker"});const upd=()=>{const t=target.value.toLowerCase();box.innerHTML="";const used=list.filter(w=>t.includes(w.toLowerCase().split(" ")[0].slice(0,Math.max(4,w.length-2))));
    box.append(el("span",{class:"small"},T(`Words used: ${used.length}/${list.length} · ${t.trim()?t.trim().split(/\s+/).length:0} words written`,`الكلمات المستخدمة: ${used.length}/${list.length} · عدد الكلمات: ${t.trim()?t.trim().split(/\s+/).length:0}`)),...list.map(w=>el("span",{class:"wchip"+(used.includes(w)?" on":"")},w)))};target.addEventListener("input",upd);upd();return box}
function handIn(ctx,meta,sectionsFn){const msg=el("span",{class:"small"});const btn=el("button",{class:"btn",type:"button",onclick:()=>buildPDF(meta,sectionsFn(),msg,ctx)},T("Download my work (PDF)","نزّل عملي (PDF)"));
  return el("div",{class:"handin"},el("h3",null,T("Hand in on ManageBac","التسليم على ManageBac")),el("p",null,T("Download your work as a PDF, then upload it to this lesson's task on ManageBac.","نزّل عملك بصيغة PDF، ثم ارفعه في مهمة هذا الدرس على ManageBac.")),el("div",{class:"row"},btn,msg))}

const LV=()=>T(["Not yet","Nearly there","Confident"],["لم أصل بعد","أقترب","واثق"]);
/* ---------- PDF ---------- */
async function buildPDF(meta,sections,msg,ctx){
  if(!window.jspdf){msg.textContent=T("The PDF tool did not load. Check your internet connection and try again.","لم تُحمَّل أداة PDF. تحقّق من اتصالك بالإنترنت وحاول مرة أخرى.");return}
  const {jsPDF}=window.jspdf;let blob;
  const fname=(meta.file+"_"+(me.name||"Student").replace(/[^\p{L}\p{N}]+/gu,"_")+"_"+(me.cls||"")).replace(/_+$/,"")+".pdf";
  if(LANG==="ar"){msg.textContent="جارٍ تجهيز الملف…";try{blob=await pdfFromHTML(meta,sections)}catch(e){msg.textContent="تعذّر إنشاء الملف. حاول مرة أخرى من متصفح الحاسوب.";return}}
  else{const doc=new jsPDF({unit:"mm",format:"a4"});const W=210,M=16;let yy=18;
  const line=(t,o={})=>{doc.setFont("helvetica",o.b?"bold":"normal");doc.setFontSize(o.s||11);const parts=doc.splitTextToSize(String(t==null||t===""?"-":t),W-2*M-(o.ind||0));parts.forEach(p=>{if(yy>282){doc.addPage();yy=18}doc.text(p,M+(o.ind||0),yy);yy+=(o.s||11)*.48});yy+=o.gap??1.5};
  line(meta.title,{b:true,s:16,gap:2});line(`Name: ${me.name||"-"}    Class: ${me.cls||"-"}    Date: ${new Date().toLocaleDateString("en-GB")}`);if(meta.sub)line(meta.sub,{s:10});
  sections.forEach(sec=>{yy+=2;if(yy>268){doc.addPage();yy=18}doc.setDrawColor(13,110,120);doc.setLineWidth(.6);doc.line(M,yy-4,W-M,yy-4);line(sec.h,{b:true,s:13,gap:2});
    (sec.rows||[]).forEach(r=>{if(r[0])line(r[0],{b:true,s:10.5,gap:.8});line(r[1],{ind:4,s:10.5})})});
  blob=doc.output("blob")}
  const ok=T("Saved. Now upload it to ManageBac.","تم الحفظ. ارفعه الآن على ManageBac.");
  try{const d=window.claude&&await window.claude.use("downloads");if(d){try{await d.save({filename:fname,data:blob});msg.textContent=ok;ctx&&ctx.markDone("reflect")}catch(e){msg.textContent=e&&e.code==="declined"?T("Download cancelled.","أُلغي التنزيل."):T("The download did not work here. Try again in a laptop browser.","لم يعمل التنزيل هنا. حاول من متصفح الحاسوب.")}return}}catch(e){}
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fname;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);msg.textContent=T("Downloaded "+fname+". Now upload it to ManageBac.","نُزّل الملف "+fname+". ارفعه الآن على ManageBac.");ctx&&ctx.markDone("reflect")}
/* Arabic hand-in: the browser lays out the right-to-left text, then each A4 page is placed in the PDF as an image (PDF fonts cannot shape Arabic). */
async function pdfFromHTML(meta,sections){
  if(!window.html2canvas)throw new Error("no html2canvas");
  const {jsPDF}=window.jspdf;const Wpx=760;
  const box=el("div",{dir:"rtl",lang:"ar",style:`position:fixed;left:-10000px;top:0;width:${Wpx}px;padding:36px 40px;box-sizing:border-box;background:#fff;color:#111;font:15px/1.75 "IBM Plex Sans Arabic",Tahoma,sans-serif`});
  box.append(el("h1",{style:"font-size:22px;margin:0 0 6px"},meta.title),el("p",{style:"margin:0 0 4px"},`الاسم: ${me.name||"-"}    الصف: ${me.cls||"-"}    التاريخ: ${new Date().toLocaleDateString("en-GB")}`),meta.sub?el("p",{style:"margin:0 0 6px;color:#555;font-size:13px"},meta.sub):null);
  sections.forEach(sec=>{box.append(el("h2",{style:"font-size:17px;margin:16px 0 6px;padding-top:8px;border-top:2px solid #0d6e78"},sec.h));
    (sec.rows||[]).forEach(r=>{if(r[0])box.append(el("p",{style:"margin:6px 0 1px;font-weight:700"},r[0]));box.append(el("p",{style:"margin:0 14px 0 0;white-space:pre-wrap"},r[1]==null||r[1]===""?"-":String(r[1])))})});
  document.body.append(box);
  try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;
    const pageCss=Math.floor(Wpx*297/210)-60;const bottoms=[...box.children].map(c=>c.offsetTop+c.offsetHeight);const total=box.scrollHeight;
    const cuts=[0];let start=0;while(total-start>pageCss){let cut=start;bottoms.forEach(b=>{if(b>start&&b-start<=pageCss)cut=Math.max(cut,b)});if(cut===start)cut=start+pageCss;cuts.push(cut);start=cut}
    const scale=2;const canvas=await html2canvas(box,{scale,backgroundColor:"#ffffff",windowWidth:Wpx});
    const doc=new jsPDF({unit:"mm",format:"a4"});const mmPerPx=210/(Wpx*scale);
    cuts.forEach((c,i)=>{const end=i+1<cuts.length?cuts[i+1]:total;const h=Math.max(1,(end-c)*scale);const pc=document.createElement("canvas");pc.width=canvas.width;pc.height=h;const g=pc.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,pc.width,h);g.drawImage(canvas,0,c*scale,canvas.width,h,0,0,canvas.width,h);
      if(i)doc.addPage();doc.addImage(pc.toDataURL("image/jpeg",.9),"JPEG",0,i?8:0,210,h*mmPerPx)});
    return doc.output("blob")}finally{box.remove()}}

/* ================= MSC ================= */
const MSC_STEPS=[{k:"start",name:"Start",min:0},{k:"donow",name:"Do Now",min:3},{k:"learn",name:"Learn",min:5,title:"Key idea"},{k:"group",name:"Group task",min:10,title:"Group task: research"},{k:"game",name:"Challenge",min:4},{k:"analyse",name:"Analyse",min:5},{k:"create",name:"Create",min:6},{k:"copy",name:"Copy book",min:2,title:"Copy into your exercise book"},{k:"quiz",name:"Quiz",min:4,title:"End-of-lesson quiz"},{k:"reflect",name:"Reflect & hand in",min:1}];
const SS_STEP_AR={start:["البداية"],donow:["نشاط البداية","نشاط البداية (Do Now)"],learn:["تعلّم","الفكرة الرئيسة"],group:["عمل جماعي","المهمة 1: عمل جماعي (بحث)"],game:["تحدٍّ"],analyse:["حلّل"],create:["أبدِع"],copy:["الدفتر","انقل إلى دفترك"],quiz:["الاختبار","اختبار نهاية الحصة"],reflect:["تأمّل وسلّم"]};
/* MSC (English) and Social Studies (Arabic, right to left) share this lesson engine. */
function mscLesson(app,y,id,sub){sub=sub||"msc";const ar=sub==="ss";const data=ar?SS["y"+y+"-ss"]:MSC["y"+y+"-msc"];const L=data&&data.find(l=>l.id===id);if(!L)return subjectPage(app,y,sub);
  if(ar){LANG="ar";app.setAttribute("dir","rtl");app.setAttribute("lang","ar")}
  const SUBN=ar?"الدراسات الاجتماعية":"MSC";
  crumbs([["Year "+y,"y"+y],[ar?"Social Studies":"MSC","y"+y+"-"+sub],["Week "+L.week]]);const cls=YEARS[y].classes.includes(me.cls)?me.cls:"";const ld=cls&&!ar?lessonDate(y,cls,L.wc).date:null;
  const wcDate=new Date(L.wc+"T00:00:00");const LI=o=>ar?o:"To "+lc1(o);
  const steps=MSC_STEPS.map(s=>{let n=s.name,t=s.title;if(ar){n=SS_STEP_AR[s.k][0];t=SS_STEP_AR[s.k][1]}
    if(s.k==="analyse")t=T("Analyse the problem: ","حلّل الحالة: ")+L.problem.title;if(s.k==="game")t=T("Challenge: ","تحدٍّ: ")+L.game.title;if(s.k==="create")t=T("Create: “"+L.create.title+"”","أبدِع: «"+L.create.title+"»");return {...s,name:n,title:t}});
  lessonShell(app,{key:`y${y}-${sub}-${id}`,unit:L.theme,steps,render(k,st,ctx){const S=ctx.S;
    if(k==="start"){st.append(el("div",{class:"cover",html:`<div style="display:grid;gap:12px"><span class="eyebrow">${ar?"السنة "+y+" · الأسبوع "+L.week:"Year "+y+" · Week "+L.week} · ${esc(L.unit)} · ${esc(L.lesson)}</span><h2>${esc(L.title)}</h2><div class="meta"><span class="chip">${T("Textbook ","كتاب الطالب ")}${esc(String(L.pages).replace(/^كتاب الطالب\s*/,""))}</span><span class="chip">${ld?"Your lesson: "+fmt(ld):T("Week of ","أسبوع ")+fmt(wcDate)}</span>${cls?`<span class="chip">${cls}</span>`:""}</div></div>${art(L.art,L.image)}`}));
      if(L.note)st.append(el("p",{class:"notebar"},L.note));if(!me.name||!cls)st.append(el("p",{class:"notebar",html:T("Type your <b>name</b> and choose your <b>class</b> at the top so your work is labelled when you download it.","اكتب <b>اسمك</b> واختر <b>صفّك</b> في أعلى الصفحة ليظهرا على عملك عند تنزيله.")}));
      st.append(el("div",{class:"grid2"},el("div",{class:"panel"},el("h3",null,T("Learning intentions","أهداف التعلّم")),el("ul",{class:"list"},L.objectives.map(o=>el("li",null,LI(o))))),el("div",{class:"panel"},el("h3",null,T("Success criteria","معايير النجاح")),el("div",{class:"crit"},L.criteria.map(c=>el("div",{html:`<span class="chip">${esc(c[0])}</span> ${esc(c[1])}`}))))));ctx.markDone("start")}
    if(k==="donow"){st.append(el("p",null,T("Answer on your own, silently, without the textbook. Then check your answers.","أجب بمفردك وبصمت ومن دون استخدام الكتاب، ثم تحقّق من إجاباتك.")),qaList(ctx,"dn",L.doNow,{onCheck:()=>ctx.markDone("donow")}))}
    if(k==="learn"){st.append(el("p",{class:"defn",html:ar?`<b>${esc(L.definition[0])}</b>: ${esc(L.definition[1])}`:`<b>${esc(L.definition[0])}</b> is ${esc(L.definition[1])}`}),el("h4",null,T("In numbers ","بالأرقام "),el("span",{class:"small"},T("(tap to flip)","(اضغط للقلب)"))),
        flipCards(L.numbers.map(n=>[n[0],n[0]+": "+n[1],T("What does this number mean? Tap to check.","ماذا يعني هذا الرقم؟ اضغط للتحقّق.")]),"grid2"),el("h4",null,T("Key terms ","مفاهيم ومصطلحات "),el("span",{class:"small"},T("(say the meaning, then flip)","(قل المعنى ثم اقلب البطاقة)"))),
        flipCards(L.terms.map(t=>[t[0],t[1],T("Tap for the meaning","اضغط لمعرفة المعنى"),true]),"grid4",()=>ctx.markDone("learn")),el("div",{class:"uae",html:`${UAE_FLAG}<p><b>${T("UAE link.","رابط بالإمارات.")}</b> ${esc(L.uae)}</p>`}),el("div",{class:"row"},el("span",{class:"small"},T("Values:","القيم:")),L.values.map(v=>el("span",{class:"chip"},v))),
        el("h4",null,T("Quick match: key terms","توصيل سريع: المصطلحات")),(()=>{const r=el("div");matchGame(r,L.terms,()=>ctx.markDone("learn"));return r})())}
    if(k==="group"){S.org=S.org||["","","",""];const qs=ar?["ما الفكرة الرئيسة لموضوعنا (في جملة واحدة)؟","اذكروا ثلاث حقائق أو أمثلة رئيسة.","كيف يرتبط موضوعنا بحياتنا في الإمارات؟",L.organiserQ4]:["What is the main idea of our topic (in one sentence)?","Give three key facts or examples.",L.theme==="history"?"How does our topic link to the Arab world or the UAE?":"How does our topic link to life in the UAE?",L.organiserQ4];
      const G=j=>T("Group ","المجموعة ")+(j+1);
      st.append(el("p",null,T("Your teacher gives each group one topic. Use the textbook pages, then present your findings in one minute.","يعطي المعلم كل مجموعة موضوعًا واحدًا. استخدموا صفحات كتاب الطالب، ثم اعرضوا ما توصّلتم إليه في دقيقة واحدة.")));
      const g=el("div",{class:"groups"});const head=el("h4",null,S.grp!=null?G(S.grp)+": "+L.groups[S.grp][0]:T("Choose your group above","اختر مجموعتك من الأعلى"));const model=el("div",{hidden:true});
      L.groups.forEach((gr,j)=>{const b=el("button",{type:"button",class:"gcard","aria-pressed":S.grp===j,html:`<b>${G(j)}</b><span>${esc(gr[0])}</span><span class="small">${T("Textbook ","كتاب الطالب ")}${esc(String(gr[1]).replace(/^كتاب الطالب\s*/,""))}</span>`});b.onclick=()=>{S.grp=j;ctx.save();g.querySelectorAll(".gcard").forEach(x=>x.setAttribute("aria-pressed",x===b));head.textContent=G(j)+": "+gr[0];model.hidden=true};g.append(b)});
      const ROLES=ar?[["الباحث","يقرأ الصفحات ويجمع المعلومات."],["الكاتب","يدوّن الإجابات في المنظّم."],["المدقّق","يتأكد من صحة المعلومات ومصدرها."],["المقدّم","يعرض النتائج على الصف."]]:[["Researcher","Reads the pages and gathers information."],["Scribe","Records the answers."],["Checker","Checks the facts and sources."],["Presenter","Presents to the class."]];
      const roles=el("div",{class:"roles"});ROLES.forEach(r=>{const b=el("button",{type:"button","aria-pressed":S.role===r[0],html:`<b>${r[0]}</b>${r[1]}`});b.onclick=()=>{S.role=r[0];ctx.save();roles.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b))};roles.append(b)});
      const org=el("div",{class:"panel"},head);qs.forEach((q,j)=>{const t=el("textarea",{rows:2,id:"og"+j});t.value=S.org[j]||"";t.oninput=()=>{S.org[j]=t.value;ctx.save()};org.append(el("div",{class:"qa"},el("label",{for:"og"+j},el("span",{class:"num"},String(j+1)),q),t))});
      org.append(el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>{if(S.grp==null){toast(T("Choose your group first.","اختر مجموعتك أولًا."));return}model.hidden=false;model.innerHTML=`<div class="green"><small>${T("Model answers · ","الإجابات النموذجية · ")}${G(S.grp)}</small>${L.groups[S.grp][2].map(esc).join("<br>")}</div>`;ctx.markDone("group")}},T("Mark with green pen","صحّح بالقلم الأخضر")),el("span",{class:"small"},T("Add anything missing.","أضف ما نقص."))),model);
      st.append(g,el("div",{class:"panel"},el("h4",null,T("Your role","دورك")),roles),org,el("details",{html:`<summary>${T("See every group's model answers","اعرض الإجابات النموذجية لكل المجموعات")}</summary><div class="stack">${L.groups.map((gr,j)=>`<div class="green"><small>${G(j)}: ${esc(gr[0])}</small>${gr[2].map(esc).join("<br>")}</div>`).join("")}</div>`}))}
    if(k==="game"){st.append(el("p",null,L.game.prompt));const r=el("div");st.append(r);(L.game.type==="order"?orderGame:sortGame)(r,L.game,(n,t)=>{S.game=Math.max(S.game||0,n);S.gameMax=t;ctx.save();ctx.markDone("game")})}
    if(k==="analyse"){st.append(el("div",{class:"scenario",html:`<span class="q">“</span>${L.problem.text.map(t=>`<p>${esc(t)}</p>`).join("")}${L.problem.note?`<p class="small">${esc(L.problem.note)}</p>`:""}`}),el("p",{class:"small"},T("Work with the person next to you, but type your own answers.","اعمل مع زميلك المجاور، لكن اكتب إجاباتك بنفسك.")),qaList(ctx,"an",L.problem.qs,{letters:true,modelLabel:T("Check","تحقّق"),selfmark:false,checkLabel:T("Check our answers","تحقّق من إجاباتنا"),onCheck:()=>ctx.markDone("analyse")}))}
    if(k==="create"){const Cr=L.create;S.must=S.must||[];st.append(el("p",{html:T("Choose <b>one</b> task. Make it on A4 paper or in your book, tick off the checklist and describe what you made.","اختر مهمة <b>واحدة</b>. أنجزها على ورقة A4 أو في دفترك، وضع علامة على قائمة التحقّق، ثم صف ما أنجزته.")}));
      const o3=el("div",{class:"opts3"});Cr.options.forEach((op,j)=>{const b=el("button",{type:"button",class:"opt3","aria-pressed":S.opt===j,html:`<b>${esc(op[0])}</b><span>${esc(op[1])}</span>`});b.onclick=()=>{S.opt=j;ctx.save();o3.querySelectorAll(".opt3").forEach(x=>x.setAttribute("aria-pressed",x===b))};o3.append(b)});
      const ch=el("div",{class:"checks"});Cr.must.forEach((m,j)=>{const c=el("input",{type:"checkbox"});c.checked=!!S.must[j];c.onchange=()=>{S.must[j]=c.checked;ctx.save();if(S.must.filter(Boolean).length===Cr.must.length)ctx.markDone("create")};ch.append(el("label",null,c," "+m))});
      st.append(o3,el("div",{class:"grid2"},el("div",{class:"panel"},el("h4",null,T("Your work must include","يجب أن يتضمّن عملك")),ch),el("div",{class:"panel"},el("label",{html:T("<b>My title and plan</b> <span class='small'>(what you will make, your title, your UAE example)</span>","<b>عنواني وخطتي</b> <span class='small'>(ماذا ستنجز، وعنوانك، ومثالك الإماراتي)</span>")}),textArea(S,"crt",ctx.save,6))))}
    if(k==="copy"){st.append(el("p",null,T("Copy this neatly into your MSC book. Underline the title and date with a ruler.","انقل هذا بخط واضح إلى دفتر الدراسات الاجتماعية، وضع خطًا تحت العنوان والتاريخ بالمسطرة.")),copyBook({date:ld||wcDate,title:L.title,lines:[[T("LI","هدف التعلّم"),LI(L.objectives[0])],[T("Definition","التعريف"),ar?L.definition[0]+": "+L.definition[1]:L.definition[0]+" is "+L.definition[1]]],lists:[[T("Key terms","المصطلحات"),L.terms],[T("Key facts","حقائق رئيسة"),L.copy.facts]]}),el("p",{html:`<span class="lbl">${T("Exit question:","السؤال الختامي:")}</span> ${esc(L.exit)}`}),copiedBox(ctx))}
    if(k==="quiz"){st.append(el("h4",null,T("Part A","الجزء الأول")),mcqBlock(ctx,"qa",L.quiz,()=>{if(S.shShown)ctx.markDone("quiz")}),el("h4",null,T("Part B: answer briefly, then check and mark yourself","الجزء الثاني: أجب باختصار، ثم تحقّق وقيّم نفسك")),qaList(ctx,"sh",L.short,{modelLabel:T("Model answer","الإجابة النموذجية"),onCheck:()=>{if(Object.keys(S.qa||{}).length===L.quiz.length)ctx.markDone("quiz")}}))}
    if(k==="reflect"){st.append(el("div",{class:"panel"},el("h4",null,T("How did you do against the success criteria?","ما مستواك في معايير النجاح؟")),rateBlock(ctx,L.criteria),el("label",{html:T("<b>What will move me up a level?</b>","<b>ما الذي سينقلني إلى مستوى أعلى؟</b>")}),textArea(S,"nextStep",ctx.save,2)),
        el("div",{class:"panel"},el("label",{html:`<b>${T("Exit question.","السؤال الختامي.")}</b> ${esc(L.exit)}`}),textArea(S,"exit",ctx.save,4)),
        handIn(ctx,{title:ar?`السنة ${y} · الدراسات الاجتماعية · الأسبوع ${L.week} · ${L.title}`:`Year ${y} MSC · Week ${L.week} · ${L.title}`,sub:`${L.unit} · ${L.lesson} · ${T("Textbook ","")}${L.pages}`,file:`Y${y}_${ar?"SS":"MSC"}_W${String(L.week).padStart(2,"0")}`},()=>{const lv=LV();const yes=T("Yes","نعم"),no=T("Not yet","ليس بعد"),none=T("no answer","لا توجد إجابة");return [
          {h:T("Do Now","نشاط البداية"),rows:L.doNow.map((q,j)=>[`${j+1}. ${q[0]}`,(S.dn||[])[j]])},
          {h:`${T("Group task","العمل الجماعي")}${S.grp!=null?" · "+T("Group ","المجموعة ")+(S.grp+1)+": "+L.groups[S.grp][0]:""}${S.role?" · "+T("Role: ","الدور: ")+S.role:""}`,rows:(ar?["الفكرة الرئيسة","ثلاث حقائق أو أمثلة","الربط بالإمارات",L.organiserQ4]:["Main idea","Three key facts or examples","Link to the UAE / Arab world",L.organiserQ4]).map((q,j)=>[q,(S.org||[])[j]])},
          {h:T("Challenge: ","التحدّي: ")+L.game.title,rows:[["",S.game!=null?T("Score: ","النتيجة: ")+`${S.game}/${S.gameMax}`:T("Not completed","لم يكتمل")]]},
          {h:T("Analyse the problem: ","حلّل الحالة: ")+L.problem.title,rows:L.problem.qs.map((q,j)=>[`${LET(j)}) ${q[0]}`,(S.an||[])[j]])},
          {h:T("Create: ","أبدِع: ")+L.create.title,rows:[[T("Task chosen","المهمة المختارة"),S.opt!=null?L.create.options[S.opt][0]:"-"],[T("Checklist","قائمة التحقّق"),L.create.must.map((m,j)=>((S.must||[])[j]?"[x] ":"[ ] ")+m).join("   ")],[T("My title and plan","عنواني وخطتي"),S.crt]]},
          {h:`${T("Quiz · Part A","الاختبار · الجزء الأول")}: ${S.qaScore??0}/${L.quiz.length}`,rows:L.quiz.map((q,j)=>{const a=(S.qa||{})[j];return [`${j+1}. ${q[0]}`,a!=null?q[1][a]+(a===q[2]?T(" (correct)"," (صحيحة)"):T(" (answer: "," (الإجابة: ")+q[1][q[2]]+")"):none]}).concat(L.short.map((q,j)=>[`${T("B","ب")}${j+1}. ${q[0]}`,(S.sh||[])[j]]))},
          {h:T("Reflection","التأمّل"),rows:L.criteria.map((c,j)=>[c[0]+": "+c[1],(S.rate||[])[j]!=null?lv[S.rate[j]]:"-"]).concat([[T("What will move me up a level?","ما الذي سينقلني إلى مستوى أعلى؟"),S.nextStep],[T("Exit question: ","السؤال الختامي: ")+L.exit,S.exit],[T("Copied notes into book","نقلت الملاحظات إلى الدفتر"),S.copied?yes:no]])}]}))}
  }});
}
const UAE_FLAG=`<svg viewBox="0 0 44 30" aria-hidden="true"><rect width="12" height="30" fill="#c8102e"/><rect x="12" width="32" height="10" fill="#00843d"/><rect x="12" y="10" width="32" height="10" fill="#ffffff"/><rect x="12" y="20" width="32" height="10" fill="#000000"/><rect x=".5" y=".5" width="43" height="29" fill="none" stroke="var(--line)"/></svg>`;

/* ================= Moral Education ================= */
const ME_STEPS=[{k:"start",name:"البداية",min:0},{k:"dna",name:"نشاط البداية",min:4,title:"نشاط البداية (DNA)"},{k:"words",name:"بنك الكلمات",min:5,title:"بنك الكلمات"},{k:"task1",name:"المهمة 1",min:8},{k:"task2",name:"المهمة 2",min:10},{k:"task3",name:"المهمة 3",min:3},{k:"game",name:"تحدٍّ",min:3},{k:"copy",name:"الدفتر",min:2,title:"انقل إلى دفترك"},{k:"quiz",name:"الاختبار",min:4,title:"اختبار نهاية الحصة"},{k:"reflect",name:"تأمّل وسلّم",min:1}];
/* Moral Education is taught in Arabic: right-to-left pages, Arabic labels and an Arabic hand-in PDF. */
function meLesson(app,y,id){const data=ME["y"+y+"-me"];const L=data&&data.find(l=>l.id===id);if(!L)return subjectPage(app,y,"me");
  LANG="ar";app.setAttribute("dir","rtl");app.setAttribute("lang","ar");
  crumbs([["Year "+y,"y"+y],["Moral Education","y"+y+"-me"],["Lesson "+L.lesson]]);
  const steps=ME_STEPS.map(s=>s.k==="task1"?{...s,title:"المهمة 1: "+L.task1.title}:s.k==="task2"?{...s,title:"المهمة 2: "+L.task2.title}:s.k==="task3"?{...s,title:"المهمة 3: "+(L.task3.name||L.task3.title)}:s.k==="game"?{...s,title:"تحدٍّ: "+L.game.title}:s);
  const termsList=L.words.map(w=>String(w[0]).replace(/\s*\(.*?\)\s*/g,"").trim());const mins=X=>`${esc(String(X.mins||""))}${typeof X.mins==="number"?" دقيقة":""}`;
  lessonShell(app,{key:`y${y}-me-${id}`,unit:"me",steps,render(k,st,ctx){const S=ctx.S;
    if(k==="start"){st.append(el("div",{class:"cover",html:`<div style="display:grid;gap:12px"><span class="eyebrow">السنة ${y} · الفصل الأول · التربية الأخلاقية · ${esc(L.unit)}</span><h2>${esc(L.title)}</h2><div class="meta"><span class="chip">الدرس ${L.lesson}</span>${L.concept&&L.concept.key?`<span class="chip">المفهوم الرئيس: ${esc(L.concept.key)}</span>`:""}</div></div>${art(L.art,L.image)}`}));
      if(!me.name||!me.cls)st.append(el("p",{class:"notebar",html:"اكتب <b>اسمك</b> واختر <b>صفّك</b> في أعلى الصفحة ليظهرا على عملك عند تنزيله."}));
      st.append(el("div",{class:"grid2"},el("div",{class:"panel"},el("h3",null,"أهداف التعلّم"),el("ul",{class:"list"},L.intentions.map(o=>el("li",null,o)))),el("div",{class:"panel"},el("h3",null,"معايير النجاح"),el("ul",{class:"list"},L.criteria.map(o=>el("li",null,o))))));
      if(L.concept)st.append(el("div",{class:"panel soi",html:`<h4>عبارة البحث</h4><p class="big-q">${esc(L.concept.soi)}</p><div class="classinfo">${L.concept.related?`<div><b>المفهوم ذو الصلة</b>${esc(L.concept.related)}</div>`:""}${L.concept.context?`<div><b>السياق العالمي</b>${esc(L.concept.context)}</div>`:""}${L.concept.uae?`<div><b>رابط بالإمارات</b>${esc(L.concept.uae)}</div>`:""}</div>`}));ctx.markDone("start")}
    if(k==="dna"){st.append(el("div",{class:"scenario",html:`<span class="q">؟</span><p>${esc(L.dna)}</p>`}),qaList(ctx,"dna",(L.dnaQs&&L.dnaQs.length?L.dnaQs:["إجابتك"]).map((q,j,a)=>[q,j===a.length-1?L.dnaHint:""]),{modelLabel:"ما تتضمّنه الإجابة الجيدة",selfmark:false,onCheck:()=>ctx.markDone("dna")}));
      if(!L.dnaHint)ctx.markDone("dna")}
    if(k==="words"){st.append(el("p",null,"تعلّم الكلمات الرئيسة، فستستخدمها في المهمة 2."),flipCards(L.words.map(w=>[w[0],w[1],"اضغط لمعرفة المعنى",true]),"grid3"),el("h4",null,"صِل الكلمات بمعانيها"),(()=>{const r=el("div");matchGame(r,L.words,()=>{S.wordsDone=true;ctx.save();ctx.markDone("words")});return r})())}
    if(k==="task1"){const X=L.task1;st.append(el("div",{class:"criterion",html:`<span class="chip">${esc(X.criterion||"")}</span><span class="chip">${mins(X)}</span>`}),el("ol",{class:"steps-list"},X.steps.map(s=>el("li",null,s))));
      st.append(qaList(ctx,"t1",(X.prompts||[]).map(p=>[p,""]),{rows:3}));if(X.success)st.append(el("details",{html:`<summary>ما تتضمّنه الإجابة القوية</summary><div class="green"><small>معيار النجاح</small>${esc(X.success)}</div>`}));
      st.append(el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("task1")},"أنهيت بحثي")))}
    if(k==="task2"){const X=L.task2;st.append(el("div",{class:"criterion",html:`<span class="chip">${esc(X.criterion||"")}</span><span class="chip">${mins(X)}</span>`}));
      if(X.extract)st.append(el("div",{class:"scenario",html:`<span class="q">“</span><p>${esc(X.extract)}</p>`}));st.append(el("ol",{class:"steps-list"},X.steps.map(s=>el("li",null,s))));
      const t=textArea(S,"t2",ctx.save,8,"اكتب فقرتك هنا…");st.append(el("div",{class:"panel"},X.starters&&X.starters.length?startersBar(X.starters,t):null,t,wordTracker(termsList,t)));
      const mod=el("div",{hidden:true,class:"stack"},el("div",{class:"green"},el("small",null,"الإجابة النموذجية"),X.model||""),X.rubric?el("div",{class:"rubric"},X.rubric.map(r=>el("div",null,el("b",null,r[0]),el("span",null,r[1])))):null);
      st.append(el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>{mod.hidden=false;ctx.markDone("task2")}},"قارن بالإجابة النموذجية")),mod);
      if(X.rubric){S.t2band=S.t2band??null;const seg=el("div",{class:"seg"});X.rubric.forEach((r,j)=>{const b=el("button",{type:"button","aria-pressed":S.t2band===j},r[0]);b.onclick=()=>{S.t2band=j;ctx.save();seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b))};seg.append(b)});
        st.append(el("div",{class:"panel"},el("h4",null,"قيّم نفسك: في أي مستوى تقع فقرتي؟"),el("div",{class:"rate"},el("div",{class:"r"},el("span",null,"مستواي"),seg))))}}
    if(k==="task3"){const X=L.task3;S.t3=S.t3||[];st.append(el("div",{class:"criterion",html:`<span class="chip">${esc(X.criterion||"")}</span><span class="chip">${mins(X)}</span>`}),el("p",null,"مشروع جماعي. ضع علامة على كل خطوة تنجزها مجموعتك، وخطّط لدورك في الأسفل."));
      const ch=el("div",{class:"checks"});X.steps.forEach((s,j)=>{const c=el("input",{type:"checkbox"});c.checked=!!S.t3[j];c.onchange=()=>{S.t3[j]=c.checked;ctx.save()};ch.append(el("label",null,c," "+s))});
      st.append(el("div",{class:"panel"},ch),el("div",{class:"panel"},el("label",{html:"<b>خطتنا ودوري فيها</b>"}),textArea(S,"t3plan",ctx.save,5)));
      if(X.rubric)st.append(el("details",{html:`<summary>كيف يُقيَّم المشروع</summary><div class="rubric">${X.rubric.map(r=>`<div><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join("")}</div>`}));
      st.append(el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("task3")},"احفظ خطتنا")))}
    if(k==="game"){st.append(el("p",null,L.game.prompt));const r=el("div");st.append(r);(L.game.type==="order"?orderGame:sortGame)(r,L.game,(n,t)=>{S.game=Math.max(S.game||0,n);S.gameMax=t;ctx.save();ctx.markDone("game")})}
    if(k==="copy"){st.append(el("p",null,"انقل هذا بخط واضح إلى دفتر التربية الأخلاقية."),copyBook({date:new Date(),title:L.title,lines:[["هدف التعلّم",L.intentions[0]]],lists:[["الكلمات الرئيسة",L.words],["حقائق رئيسة",(L.copy&&L.copy.facts)||[]]]}),el("p",{html:`<span class="lbl">بطاقة الخروج:</span> ${esc(L.exit)}`}),copiedBox(ctx))}
    if(k==="quiz"){st.append(mcqBlock(ctx,"qa",L.quiz,()=>ctx.markDone("quiz")))}
    if(k==="reflect"){st.append(el("div",{class:"panel"},el("h4",null,"قيّم نفسك وفق معايير النجاح"),rateBlock(ctx,L.criteria)),el("div",{class:"panel"},el("label",{html:`<b>بطاقة الخروج.</b> ${esc(L.exit)}`}),textArea(S,"exit",ctx.save,4)));
      if(L.next)st.append(el("p",{class:"notebar"},"الدرس القادم: "+String(L.next).replace(/^\s*(الحصة القادمة|الدرس القادم|الدرس التالي|الحصة التالية)\s*[:：]\s*/,"")));
      st.append(handIn(ctx,{title:`السنة ${y} · التربية الأخلاقية · الدرس ${L.lesson} · ${L.title}`,sub:L.unit+" · الفصل الأول",file:`Y${y}_ME_L${L.lesson}`},()=>{const lv=LV();return [
        {h:"نشاط البداية (DNA)",rows:[["",L.dna]].concat((L.dnaQs&&L.dnaQs.length?L.dnaQs:["إجابتك"]).map((q,j)=>[q,(S.dna||[])[j]]))},
        {h:"المهمة 1: "+L.task1.title,rows:(L.task1.prompts||[]).map((p,j)=>[p,(S.t1||[])[j]])},
        {h:"المهمة 2: "+L.task2.title,rows:[["فقرتي",S.t2],["مستواي",S.t2band!=null&&L.task2.rubric?L.task2.rubric[S.t2band][0]:"-"]]},
        {h:"المهمة 3: "+(L.task3.name||L.task3.title),rows:[["الخطوات المنجزة",L.task3.steps.map((s,j)=>((S.t3||[])[j]?"☑ ":"☐ ")+s).join("\n")],["خطتنا ودوري فيها",S.t3plan]]},
        {h:"التحدّي والاختبار",rows:[["التحدّي: "+L.game.title,S.game!=null?`${S.game}/${S.gameMax}`:"لم يكتمل"],["الاختبار",`${S.qaScore??0}/${L.quiz.length}`]]},
        {h:"التأمّل",rows:L.criteria.map((c,j)=>[c,(S.rate||[])[j]!=null?lv[S.rate[j]]:"-"]).concat([["بطاقة الخروج: "+L.exit,S.exit],["نقلت الملاحظات إلى الدفتر",S.copied?"نعم":"ليس بعد"]])}]}))}
  }});
}

/* ================= Literacy ================= */
const LIT_STEPS=[{k:"retrieve",name:"Retrieve",min:5},{k:"consolidate",name:"Consolidate",min:9},{k:"practise",name:"Practise",min:11},{k:"apply",name:"Apply",min:12},{k:"reflect",name:"Reflect & hand in",min:3}];
const UNIT_ART=[["community|place|belong","community"],["adventure|survival","adventure"],["natural|environment|sustainab","nature"],["invent|idea|innovation","invent"],["hero|voice","hero"],["future|pathway","future"],["identity|influence","tolerance"],["conflict|resolution","respect"],["explor","explore"],["technology","tech"],["choice","applyrules"],["power|leadership","power"],["media","media"],["justice|ethic","fair"],["global|modern","globe"],["culture","reason"],["science","science"],["enterprise","business"],["toolkit","toolkit"],["research","prejudice"],["perspective","eye"],["change","megaphone"]];
const unitArt=n=>{const l=n.toLowerCase();const m=UNIT_ART.find(([re])=>new RegExp(re).test(l));return m?m[1]:"book"};
const TYPE={read:{name:"READ",art:"book",tag:"Comprehension and critical reading"},words:{name:"WORDS",art:"words",tag:"Vocabulary, morphology and precise language"},write:{name:"WRITE",art:"pen",tag:"Purposeful writing for an audience"}};

const READ_SKILLS=[
 [/infer/i,{name:"Inference",steps:["Find a clue in the text (a word, action or detail).","Ask: what does this clue suggest?","Explain your idea and back it up with the clue."],starters:["This suggests that…","The word “…” implies…","I can infer that… because…","This shows the writer feels…"],prompts:["One clue I found in the text:","What it suggests:","My inference, with evidence:"]}],
 [/summar|synthes|main idea|key ideas|key details/i,{name:"Summarising",steps:["Read the whole text once for the gist.","Underline the main idea of each paragraph.","Join the main ideas in your own words. Leave out examples and small details."],starters:["The main idea is…","Overall, the text explains…","The key points are…","In short,…"],prompts:["Main idea of the text (one sentence):","Three key details:","My summary in my own words:"]}],
 [/compar|viewpoints|interpretations|contrast/i,{name:"Comparing",steps:["Find what each text or viewpoint says about the same idea.","Note one similarity and one difference.","Use comparison words: similarly, whereas, however, in contrast."],starters:["Both texts…","Similarly,…","Whereas the first…, the second…","In contrast,…"],prompts:["Viewpoint / text 1 says:","Viewpoint / text 2 says:","One similarity and one difference:"]}],
 [/purpose|audience|tone|register|persuasive|rhetoric|repetition|address/i,{name:"Purpose and audience",steps:["Ask: who is this for? (audience)","Ask: why was it written? (purpose: inform, persuade, entertain, advise)","Find two language choices that suit that audience and purpose."],starters:["The audience is…","The purpose of the text is to…","The writer uses … to…","This choice makes the reader…"],prompts:["Audience:","Purpose:","Two language choices and their effect:"]}],
 [/fact|opinion|claim|reason|evidence|argument/i,{name:"Claims and evidence",steps:["Find the writer's claim (what they want you to believe).","Find the reasons or evidence they give.","Decide: is it fact (can be checked) or opinion (a belief)? Is the evidence strong?"],starters:["The writer claims that…","One piece of evidence is…","This is a fact because…","This is an opinion because…"],prompts:["The main claim:","Evidence given:","Fact or opinion? How strong is it?"]}],
 [/credib|reliab|bias|source|methodolog|authority/i,{name:"Evaluating sources",steps:["Who wrote it, and what do they know?","When was it written, and why?","Is it balanced, or does it leave things out? Can you check it elsewhere?"],starters:["This source is reliable because…","A limitation of this source is…","The writer may be biased because…","I would check this by…"],prompts:["Who / when / why:","One strength of the source:","One limitation or sign of bias:"]}],
 [/cause|effect|sequence|chronolog|process|procedur/i,{name:"Sequence, cause and effect",steps:["Put the main events or steps in order.","Look for signal words: first, then, because, as a result, so.","Explain how one thing leads to the next."],starters:["First,…","This caused…","As a result,…","Finally,…"],prompts:["The steps or events in order:","One cause and its effect:","Signal words I found:"]}],
 [/navigat|heading|caption|diagram|feature|infographic|visual|data|map|multimodal|two formats/i,{name:"Using text features",steps:["Look at the title, headings, captions, pictures and diagrams first.","Predict what each section is about.","Use the features to find information quickly, then read closely."],starters:["The heading tells me…","The diagram shows…","The caption explains…","The data suggests…"],prompts:["Three text features I used:","What one feature told me:","Information I found quickly:"]}],
 [/retriev|locat|select|explicit|qualities/i,{name:"Retrieval",steps:["Read the question and underline its key words.","Scan the text for those key words.","Read around them and answer in a full sentence, using the text's evidence."],starters:["The text states that…","According to the text,…","One example is…","The writer mentions…"],prompts:["Key words from the question:","Where I found the answer (paragraph):","My answer, with evidence:"]}]
];
const WRITE_SKILLS=[
 [/compar/i,{name:"Comparison writing",features:["Name both things you are comparing","Use similarly / whereas / however / in contrast","Give evidence for each side","End with what the comparison shows"],plan:["Point of comparison","Text / side 1","Text / side 2"],starters:["Both…","Similarly,…","Whereas…,…","In contrast,…"]}],
 [/persuas|pitch|campaign|speech|call to action|advocacy|rhetoric|tone|register|audience/i,{name:"Writing for an audience",features:["A clear message for your audience","Direct address (you, we)","At least one persuasive technique (question, repetition, rule of three)","A strong ending that asks for action"],plan:["Audience and purpose","Three key points","My strong ending"],starters:["Imagine…","We all know that…","That is why…","Together, we can…"]}],
 [/instruction|process|precise verbs|sequenc/i,{name:"Clear instructions and processes",features:["A clear title and goal","Numbered or ordered steps","Precise command verbs (place, check, measure)","Time words: first, next, finally"],plan:["Goal","Steps in order","Safety or tips"],starters:["First,…","Next,…","Make sure you…","Finally,…"]}],
 [/argument|for\/against|balanced|counter|concession|rebut|judgement|conclusion|recommend|evaluat|justif/i,{name:"Argument and evaluation",features:["A clear claim or judgement","Reasons with evidence","A counterargument and your reply","A conclusion that weighs both sides"],plan:["My claim","Reasons and evidence","Counterargument and reply"],starters:["I believe that…","One reason is…","Some people argue that…; however,…","On balance,…"]}],
 [/email|letter|report|proposal|formal|professional|summary|executive/i,{name:"Formal writing",features:["Formal greeting, title or headings","Formal tone (no slang or contractions)","Clear, short paragraphs with one purpose each","A polite, clear close or recommendation"],plan:["Purpose","Main points","Request or recommendation"],starters:["I am writing to…","Firstly,…","I would therefore recommend…","Thank you for…"]}],
 [/paraphras|notes|summar/i,{name:"Paraphrase and summary",features:["Your own words, not copied","Only the main ideas","Shorter than the original","Accurate meaning"],plan:["Main idea","Key points","My version"],starters:["The text explains that…","In other words,…","The main point is…","Overall,…"]}],
 [/plan|edit|revise|refine|improve|portfolio|deliver/i,{name:"Plan, write, improve",features:["A plan before writing","Clear paragraphs","Checked spelling and punctuation","At least one improvement after feedback"],plan:["Plan","Draft key points","What I will improve"],starters:["To begin with,…","Another important point is…","For example,…","In conclusion,…"]}],
 [/./,{name:"Developed paragraph",features:["A clear topic sentence","Evidence or a detail","An explanation (because / this shows)","Accurate sentences with full stops and capital letters"],plan:["Topic sentence","Evidence or detail","Explanation"],starters:["One reason is…","For example,…","This shows that…","Therefore,…"]}]
];
const skillOf=(list,text)=>(list.find(([re])=>re.test(text))||list[list.length-1])[1];
const MORPH=[["con","together, with"],["com","together, with"],["contra","against"],["dis","not, apart"],["di","apart"],["en","make, put into"],["ex","out"],["in","not, or into"],["im","not, or into"],["inter","between"],["pre","before"],["re","again, back"],["sub","under"],["trans","across"],["per","through"],["pro","forward"],["un","not"]];
const SUFF=[["tion","noun: the act of"],["sion","noun: the act of"],["ment","noun: the result of"],["ity","noun: the state of"],["ance","noun: the state of"],["ence","noun: the state of"],["ive","adjective: tending to"],["able","adjective: can be"],["ible","adjective: can be"],["ful","adjective: full of"],["less","adjective: without"],["ous","adjective: full of"],["al","adjective: relating to"],["ate","verb: to make"],["ise","verb: to make"],["ly","adverb: how"],["er","noun: a person who"],["ist","noun: a person who"]];
function morphHint(w){const x=w.toLowerCase();const p=MORPH.find(([m])=>x.startsWith(m)&&x.length>m.length+3);const s=SUFF.find(([m])=>x.endsWith(m)&&x.length>m.length+3);
  return [p?`${p[0]}- (${p[1]})`:null,s?`-${s[0]} (${s[1]})`:null].filter(Boolean).join(" + ")||"Look for a base word you already know inside it."}

function litYear(app,y){const Y=LIT[y];if(!Y)return yearPage(app,y);crumbs([["Year "+y,"y"+y],["Literacy"]]);
  app.setAttribute("data-unit","lit");
  app.innerHTML=`<section class="hero-home sm"><div><span class="eyebrow">Year ${y} Literacy · ${esc(Y.emphasis)}</span><h1>Literacy</h1><p>${esc(Y.journey)} Six units, each with six weeks of READ, WORDS and WRITE lessons. Your teacher tells you which lesson you are on.</p></div>${ART.book}</section>
    <div class="units">${Y.units.map((u,i)=>{const ready=Object.keys(LITC).some(k=>k.startsWith(`${y}-${i+1}-`));return `<a class="unit" href="#y${y}-lit-u${i+1}"><span class="uart">${art(unitArt(u.name))}</span><span class="eyebrow">Unit ${i+1}${ready?' · <b class="readyb">Texts ready</b>':""}</span><h3>${esc(u.name)}</h3><span class="small">${u.weeks.slice(0,5).map(w=>esc(w[0])).join(" · ")}</span></a>`}).join("")}</div>`;
}
function litUnit(app,y,u){const U=LIT[y]&&LIT[y].units[u-1];if(!U)return litYear(app,y);crumbs([["Year "+y,"y"+y],["Literacy","y"+y+"-lit"],["Unit "+u]]);app.setAttribute("data-unit","lit");
  app.innerHTML=`<section class="hero-home sm"><div><span class="eyebrow">Year ${y} Literacy · Unit ${u}</span><h1>${esc(U.name)}</h1><p>Each week has three lessons. Each one can be done on its own.</p></div>${art(unitArt(U.name))}</section>
    <div class="litweeks">${U.weeks.map((w,i)=>`<div class="litweek"><div class="lwhead"><span class="n">${i+1}</span><div><div class="t">Week ${i+1}: ${esc(w[0])}</div><div class="s">Outcome: ${esc(w[4])}</div></div></div>
      <div class="lw3">${["read","words","write"].map((t,j)=>{const p=progressOf(`y${y}-lit-u${u}-w${i+1}-${t}`,LIT_STEPS.length);return `<a class="lwl ${t}" href="#y${y}-lit-u${u}-w${i+1}-${t}"><b>${TYPE[t].name}</b><span>${esc(t==="read"?w[1]:t==="words"?(words(w[2]).length>1?words(w[2]).join(", "):w[2]):w[3])}</span><span class="meter"><i style="width:${p.pct}%"></i></span></a>`}).join("")}</div></div>`).join("")}</div>`;
}
function litLesson(app,y,u,w,type){const U=LIT[y]&&LIT[y].units[u-1];const W=U&&U.weeks[w-1];if(!W)return litYear(app,y);
  crumbs([["Year "+y,"y"+y],["Literacy","y"+y+"-lit"],["Unit "+u,`y${y}-lit-u${u}`],[`Week ${w} ${TYPE[type].name}`]]);
  const C=(LITC[`${y}-${u}-${w}`]||{})[type];const ctxName=W[0];
  let wl=words(W[2]);if(wl.length<3){wl=U.weeks.slice(0,5).flatMap(x=>words(x[2]).slice(0,2)).filter((x,i,a)=>a.indexOf(x)===i).slice(0,10)}
  if(C&&type==="words"&&C.list)wl=C.list.map(x=>x[0]);
  const prevW=w>1?words(U.weeks[w-2][2]):(u>1?words(LIT[y].units[u-2].weeks[4][2]):[]);
  const rs=skillOf(READ_SKILLS,W[1]),ws=skillOf(WRITE_SKILLS,W[3]+" "+W[4]);
  const criteria=type==="read"?[["Recall",`I can use ${rs.name.toLowerCase()} strategies on a text about ${ctxName.toLowerCase()}.`],["Explain","I can explain my answers using evidence from the text."],["Apply","I can apply the skill on my own to a new question."]]
    :type==="words"?[["Recall",`I know what this week's words mean.`],["Explain","I can break words into parts (prefix, root, suffix) to work out meaning."],["Apply","I can use at least three of the words accurately in my own writing."]]
    :[["Recall",`I know the features of ${ws.name.toLowerCase()}.`],["Explain","I can plan my writing before I start."],["Apply",`I can write a ${W[4].toLowerCase()} using this week's words.`]];
  const intention=type==="read"?W[1]:type==="words"?"Revisit and use: "+wl.join(", "):W[3];
  lessonShell(app,{key:`y${y}-lit-u${u}-w${w}-${type}`,unit:"lit",steps:LIT_STEPS,render(k,st,ctx){const S=ctx.S;
    if(k==="retrieve"){st.append(el("div",{class:"cover",html:`<div style="display:grid;gap:10px"><span class="eyebrow">Year ${y} Literacy · Unit ${u}: ${esc(U.name)} · Week ${w}</span><h2><span class="ltype ${type}">${TYPE[type].name}</span> ${esc(ctxName)}</h2><div class="meta"><span class="chip">${esc(TYPE[type].tag)}</span><span class="chip">Outcome: ${esc(W[4])}</span></div></div>${art(TYPE[type].art==="book"?unitArt(U.name):TYPE[type].art)}`}),
        el("div",{class:"grid2"},el("div",{class:"panel"},el("h3",null,"Learning intention"),el("p",null,intention)),el("div",{class:"panel"},el("h3",null,"Success criteria"),el("div",{class:"crit"},criteria.map(c=>el("div",{html:`<span class="chip">${esc(c[0])}</span> ${esc(c[1])}`}))))),
        el("p",{class:"notebar",html:`<b>Previously this week:</b> this week's context is <b>${esc(ctxName)}</b>. READ practises ${esc(lc1(W[1]))}; WORDS revisits ${esc(words(W[2]).join(", ")||W[2])}; WRITE practises ${esc(lc1(W[3]))}.`}));
      if(type==="words"){S.know=S.know||{};const g=el("div",{class:"know"});st.append(el("h4",null,"How well do you know these words?"));wl.forEach(wd=>{const seg=el("div",{class:"seg"});["New to me","Seen it","Know it"].forEach((l,j)=>{const b=el("button",{type:"button","aria-pressed":S.know[wd]===j},l);b.onclick=()=>{S.know[wd]=j;ctx.save();seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));if(Object.keys(S.know).length>=wl.length)ctx.markDone("retrieve")};seg.append(b)});g.append(el("div",{class:"r"},el("b",null,wd),seg))});st.append(el("div",{class:"panel rate"},g))}
      else{const items=(prevW.length?prevW.slice(0,3):wl.slice(0,3)).map(x=>[`What does “${x}” mean? Use it in a sentence.`,""]);st.append(el("h4",null,prevW.length?"Retrieve: words from last week":"Retrieve: this week's words"),qaList(ctx,"ret",items,{rows:2}),el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("retrieve")},"Done")))}}
    if(k==="consolidate"){
      if(type==="read"){st.append(el("div",{class:"skill",html:`<span class="eyebrow">Reading strategy</span><h4>${esc(rs.name)}</h4><ol>${rs.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol><div class="row">${rs.starters.map(s=>`<span class="chip">${esc(s)}</span>`).join("")}</div>`}));
        if(C&&C.text){st.append(el("h4",null,"Read the text"),readText(C,ctx))}else st.append(el("p",{class:"notebar"},"Read the text your teacher gives you, using the strategy above."));
        st.append(el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("consolidate")},"I have read the text")))}
      if(type==="words"){const L=C&&C.list;st.append(el("p",null,"Tap each card to see its meaning, word parts and an example."),flipCards(wl.map(wd=>{const d=L&&L.find(x=>x[0]===wd);return [wd,d?`(${d[1]}) ${d[2]} — e.g. ${d[3]} · Parts: ${d[4]}`:`Word parts: ${morphHint(wd)}. Write your own definition below.`,"Tap to flip"]}),"grid3",()=>ctx.markDone("consolidate")));
        if(!L){S.def=S.def||{};const box=el("div",{class:"panel"},el("h4",null,"My definitions"));wl.forEach(wd=>{const t=el("input",{type:"text",placeholder:`${wd} means…`});t.value=S.def[wd]||"";t.oninput=()=>{S.def[wd]=t.value;ctx.save()};box.append(el("label",{class:"qa"},el("b",null,wd),t))});st.append(box)}
        if(C&&C.family)st.append(el("h4",null,"Word families"),el("div",{class:"grid3"},C.family.map(f=>el("div",{class:"panel fam"},el("b",null,f[0]),el("span",null,f[1])))))}
      if(type==="write"){st.append(el("div",{class:"skill",html:`<span class="eyebrow">Writing focus</span><h4>${esc(ws.name)}</h4><p class="small">Success features:</p><ul>${ws.features.map(s=>`<li>${esc(s)}</li>`).join("")}</ul>`}));
        if(C&&C.model){S.spot=S.spot||[];const feats=(C.checklist||ws.features);st.append(el("h4",null,"Read the model, then tick the features you can spot"),el("div",{class:"scenario",html:`<span class="q">“</span><p>${esc(C.model)}</p>`}));const ch=el("div",{class:"checks"});feats.forEach((f,j)=>{const c=el("input",{type:"checkbox"});c.checked=!!S.spot[j];c.onchange=()=>{S.spot[j]=c.checked;ctx.save();if(S.spot.filter(Boolean).length===feats.length)ctx.markDone("consolidate")};ch.append(el("label",null,c," "+f))});st.append(el("div",{class:"panel"},ch))}
        else st.append(el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("consolidate")},"I know the features")))}}
    if(k==="practise"){
      if(type==="read"){if(C&&C.mcq){st.append(mcqBlock(ctx,"rq",C.mcq,()=>ctx.markDone("practise")));if(C.highlight)st.append(el("h4",null,"Evidence hunt"),evidenceHunt(C,ctx))}
        else st.append(el("p",null,"Use the strategy on your teacher's text."),qaList(ctx,"pr",rs.prompts.map(p=>[p,""]),{rows:3}),el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("practise")},"Done")))}
      if(type==="words"){if(C&&C.cloze){S.cz=S.cz||{};const box=el("div",{class:"panel"});let right=0;C.cloze.forEach((c,j)=>{const parts=c[0].split("___");const inp=el("input",{type:"text",class:"cz","aria-label":"missing word"});inp.value=S.cz[j]||"";const mark=el("span",{class:"czm"});
            const chk=()=>{const ok=inp.value.trim().toLowerCase()===c[1].toLowerCase();mark.textContent=inp.value?ok?"✓":"✗":"";mark.className="czm "+(inp.value?ok?"ok":"no":"");S.cz[j]=inp.value;ctx.save();right=C.cloze.filter((x,i)=>(S.cz[i]||"").trim().toLowerCase()===x[1].toLowerCase()).length;if(right===C.cloze.length)ctx.markDone("practise")};inp.oninput=chk;chk();
            box.append(el("p",{class:"clz"},(j+1)+". "+parts[0],inp,parts[1]||"",mark))});st.append(el("p",null,"Type the missing word. Choose from: "+C.cloze.map(c=>c[1]).filter((x,i,a)=>a.indexOf(x)===i).join(", ")),box)}
        else{S.sent=S.sent||{};const box=el("div",{class:"panel"},el("h4",null,`Write one sentence about ${ctxName.toLowerCase()} using each word`));wl.forEach(wd=>{const t=el("input",{type:"text",placeholder:`A sentence with “${wd}”…`});const m=el("span",{class:"czm"});t.value=S.sent[wd]||"";
            const chk=()=>{const ok=t.value.toLowerCase().includes(wd.toLowerCase().slice(0,Math.max(4,wd.length-2)));m.textContent=t.value?ok?"✓":"use the word":"";m.className="czm "+(t.value?ok?"ok":"no":"");S.sent[wd]=t.value;ctx.save();if(wl.every(x=>(S.sent[x]||"").toLowerCase().includes(x.toLowerCase().slice(0,Math.max(4,x.length-2)))))ctx.markDone("practise")};t.oninput=chk;chk();box.append(el("label",{class:"qa"},el("b",null,wd),t,m))});st.append(box)}}
      if(type==="write"){const labels=(C&&C.plan)||ws.plan;S.plan=S.plan||[];st.append(el("p",null,"Plan before you write."),qaList(ctx,"plan",labels.map(l=>[l,""]),{rows:3}),el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("practise")},"My plan is ready")))}}
    if(k==="apply"){
      if(type==="read"){if(C&&C.short)st.append(el("p",null,"Answer on your own, then check against the model answers."),qaList(ctx,"ap",C.short,{rows:3,modelLabel:"Model answer",onCheck:()=>ctx.markDone("apply")}));
        else{const t=textArea(S,"ap1",ctx.save,6,"Write your answer…");st.append(el("p",null,`Answer independently: use ${rs.name.toLowerCase()} on the text and explain your answer with evidence.`),el("div",{class:"panel"},startersBar(rs.starters,t),t),el("div",{class:"row"},el("button",{class:"btn",type:"button",onclick:()=>ctx.markDone("apply")},"Done")))}}
      if(type==="words"){const t=textArea(S,"para",ctx.save,7,"Write your paragraph…");t.addEventListener("input",()=>{const n=wl.filter(x=>t.value.toLowerCase().includes(x.toLowerCase().slice(0,Math.max(4,x.length-2)))).length;if(n>=3)ctx.markDone("apply")});
        st.append(el("p",null,`Write a short paragraph about ${ctxName.toLowerCase()} using at least three of this week's words.`),el("div",{class:"panel"},t,wordTracker(wl,t)))}
      if(type==="write"){const task=(C&&C.task)||`${W[3]}. Write a ${W[4].toLowerCase()} about ${ctxName.toLowerCase()}.`;const t=textArea(S,"draft",ctx.save,12,"Write here…");const ch=el("div",{class:"checks"});S.self=S.self||[];
        ((C&&C.checklist)||ws.features).forEach((f,j)=>{const c=el("input",{type:"checkbox"});c.checked=!!S.self[j];c.onchange=()=>{S.self[j]=c.checked;ctx.save()};ch.append(el("label",null,c," "+f))});
        t.addEventListener("input",()=>{if(t.value.trim().split(/\s+/).length>=40)ctx.markDone("apply")});
        st.append(el("p",{class:"task",html:`<b>Task:</b> ${esc(task)}`}),el("div",{class:"panel"},startersBar((C&&C.starters)||ws.starters,t),t,wordTracker(words(W[2]).length>1?words(W[2]):wl,t)),el("div",{class:"panel"},el("h4",null,"Check your writing"),ch))}}
    if(k==="reflect"){st.append(el("div",{class:"panel"},el("h4",null,"How did you do?"),rateBlock(ctx,criteria)),el("div",{class:"panel"},el("label",{html:"<b>Exit check.</b> What is one thing you can now do better, and where else could you use it (another subject)?"}),textArea(S,"exit",ctx.save,3)));
      st.append(handIn(ctx,{title:`Year ${y} Literacy · Unit ${u} ${U.name} · Week ${w} ${TYPE[type].name}: ${ctxName}`,sub:intention,file:`Y${y}_LIT_U${u}W${w}_${TYPE[type].name}`},()=>{const lv=["Not yet","Nearly there","Confident"];const out=[];
        if(type==="read"){out.push({h:"Retrieve",rows:(prevW.length?prevW.slice(0,3):wl.slice(0,3)).map((x,j)=>[x,(S.ret||[])[j]])});if(C&&C.mcq)out.push({h:`Practise: ${S.rqScore??0}/${C.mcq.length}`,rows:C.mcq.map((q,j)=>[q[0],(S.rq||{})[j]!=null?q[1][S.rq[j]]:"-"])});else out.push({h:"Practise",rows:rs.prompts.map((p,j)=>[p,(S.pr||[])[j]])});
          out.push({h:"Apply",rows:C&&C.short?C.short.map((q,j)=>[q[0],(S.ap||[])[j]]):[["My answer",S.ap1]]})}
        if(type==="words"){out.push({h:"Word knowledge",rows:wl.map(x=>[x,["New to me","Seen it","Know it"][(S.know||{})[x]]||"-"])});if(C&&C.cloze)out.push({h:"Practise: missing words",rows:C.cloze.map((c,j)=>[c[0],(S.cz||{})[j]])});else out.push({h:"Practise: sentences",rows:wl.map(x=>[x,(S.sent||{})[x]])});out.push({h:"Apply: my paragraph",rows:[["",S.para]]})}
        if(type==="write"){out.push({h:"Plan",rows:((C&&C.plan)||ws.plan).map((l,j)=>[l,(S.plan||[])[j]])},{h:"My writing",rows:[["",S.draft]]},{h:"Self-check",rows:[["",((C&&C.checklist)||ws.features).map((f,j)=>((S.self||[])[j]?"[x] ":"[ ] ")+f).join("\n")]]})}
        out.push({h:"Reflection",rows:criteria.map((c,j)=>[c[0]+": "+c[1],(S.rate||[])[j]!=null?lv[S.rate[j]]:"-"]).concat([["Exit check",S.exit]])});return out}))}
  }});
}
function sentencesOf(C){return C.text.join(" ").split(/(?<=[.!?])\s+/)}
function readText(C,ctx){const box=el("article",{class:"text"});box.append(el("h4",null,C.title),C.kind?el("span",{class:"small"},C.kind):null);C.text.forEach(p=>{const m=p.match(/^(Viewpoint [AB][^:]*:)(.*)$/);box.append(m?el("p",{html:`<b>${esc(m[1])}</b>${esc(m[2])}`}):el("p",null,p))});return box}
function evidenceHunt(C,ctx){const S=ctx.S;S.ev=S.ev||[];const sents=sentencesOf(C);const box=el("div",{class:"panel"},el("p",{html:`<b>${esc(C.highlight)}</b>`}));const tx=el("div",{class:"hunt"});const fb=el("p",{class:"small"});
  sents.forEach((s,i)=>{const b=el("button",{type:"button",class:"sent"+(S.ev.includes(i)?" on":"")},s+" ");b.onclick=()=>{S.ev=S.ev.includes(i)?S.ev.filter(x=>x!==i):S.ev.concat(i);ctx.save();b.classList.toggle("on")};tx.append(b)});
  const chk=el("button",{class:"btn",type:"button",onclick:()=>{const want=C.evidence||[];const hit=S.ev.filter(i=>want.includes(i)).length;tx.querySelectorAll(".sent").forEach((b,i)=>{b.classList.toggle("good",want.includes(i));b.classList.toggle("bad",S.ev.includes(i)&&!want.includes(i))});fb.textContent=`You found ${hit} of ${want.length} pieces of evidence. Green shows the best evidence.`}},"Check my evidence");
  box.append(tx,el("div",{class:"row"},chk),fb);return box}

/* ---------- boot ---------- */
setupMe();route();window.Results&&Results.syncAll();
})();
