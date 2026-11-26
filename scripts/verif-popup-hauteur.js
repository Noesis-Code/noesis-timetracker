// Génère les étapes de mesure de la hauteur des pop-ups de l'arbre (19 nov. 2026) pour scripts/verif-navigateur-cdp.js.
// usage : node scripts/verif-popup-hauteur.js etapes.json && node scripts/verif-navigateur-cdp.js 3998 <id> sortie/pop <W> <H> @etapes.json
// Attendu : replié => scroll:false (sauf étape 1 en paysage, signalée) ; déplié => panelH plus grand tant que le plafond (H - 76 en bas, 16 en haut) n'est pas atteint.
const M = '(function(){var p=document.querySelector(".objDock .tasksPropose");if(!p||p.classList.contains("hidden"))return "nopanel";var b=p.querySelector(".tasksProposeBody"),pg=p.querySelector(".tasksPages");function s(e){return e?e.scrollHeight+"/"+e.clientHeight:"-"}return JSON.stringify({H:innerHeight,panelH:Math.round(p.getBoundingClientRect().height),body:s(b),pages:s(pg),scroll:[b,pg].some(function(e){return e&&e.scrollHeight>e.clientHeight+1})})})()';
const T = '(function(){var e=[...document.querySelectorAll(".objDock .objAdvHead")].filter(function(x){var q=x.getBoundingClientRect();return q.width>0&&q.left>0&&q.left<innerWidth})[0];var r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()';
const NEXT = 'var b=document.querySelector(".objDock .objStepBtn");b.disabled=false;b.click();"next"';
const MODAL = 'var o=document.createElement("div");o.className="goalTaskEditModal goalsPlacementModal aiModeModal objModal";var c=document.createElement("div");c.className="goalTaskEditCard";c.innerHTML="<div class=goalTaskEditHeader>Test</div>"+"<p>ligne</p>".repeat(60);o.appendChild(c);document.body.appendChild(o);var r=c.getBoundingClientRect();"MODAL H="+innerHeight+" card="+Math.round(r.height)+" top="+Math.round(r.top)+" bottom="+Math.round(r.bottom)';
const steps = [
  { js: 'document.querySelector(".tabBtn[data-tab=objectives]").click()', wait: 1500 },
  { js: '(document.getElementById("aiNoticeAck")||{click(){}}).click();(document.getElementById("marketingInviteNo")||{click(){}}).click();document.querySelector("#goalsPage1Switch .periodBtn[data-view=activities]").click()', wait: 2500 },
  { js: 'TMT.objectifsView.createAt({endDate:"2026-12-31",type:"annuel",ctx:{}})', wait: 2500, shot: 'etape1' },
  { js: '"ETAPE1 replie "+' + M },
  { js: 'var i=document.querySelector(".objDock input");i.value="Objectif test";i.dispatchEvent(new Event("input",{bubbles:true}));"titre"', wait: 300 },
  { js: NEXT, wait: 1500, shot: 'etape2' },
  { js: '"ETAPE2 replie "+' + M },
  { tap: T, wait: 800, shot: 'etape2-deplie' },
  { js: '"ETAPE2 deplie "+' + M },
  { js: NEXT, wait: 1500, shot: 'etape3' },
  { js: '"ETAPE3 replie "+' + M },
  { js: MODAL, wait: 300, shot: 'modal' }
];
require('fs').writeFileSync(process.argv[2], JSON.stringify(steps));
