/* EduGhaf · every MSC, Social Studies and Moral Education lesson fits one 40-minute lesson.
   No group work: the MSC/SS group research task and the ME group project (task 3) are removed,
   and longer activities are trimmed. Loaded after the data files, before results.js and app.js. */
(function(){
"use strict";
const cap = (a, n) => Array.isArray(a) && a.length > n ? a.slice(0, n) : a;
[window.MSC_DATA, window.SS_DATA].forEach(src => Object.values(src || {}).forEach(list => list.forEach(L => {
  delete L.groups; delete L.organiserQ4;
  L.doNow = cap(L.doNow, 3);
  if(L.problem) L.problem.qs = cap(L.problem.qs, 3);
  L.quiz = cap(L.quiz, 6);
  L.short = cap(L.short, 2);
})));
Object.values(window.ME_DATA || {}).forEach(list => list.forEach(L => {
  delete L.task3;
  if(Array.isArray(L.dnaQs) && L.dnaQs.length > 2) L.dnaQs = [L.dnaQs[0], L.dnaQs[L.dnaQs.length - 1]];
  if(L.task1) L.task1.prompts = cap(L.task1.prompts, 3);
  L.quiz = cap(L.quiz, 6);
}));
})();
