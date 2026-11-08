// Page 3 (Calendrier) : semaines encadrées, jour sélectionné (cercle plein) + barre « Nouvelle tâche… » (dock commun) + panneau, échange mois / objectif périodique.
const fs = require('fs'), path = require('path');
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-page3.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'objectifs-page3.css'), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
assert(/\.goalsCalWeek \{[^}]*border: 1px solid var\(--glass-border\)[^}]*border-radius: var\(--radius-lg\)/.test(css), 'chaque semaine est encadrée (bordure fine, coins arrondis, jetons existants)');
assert(!/Ajouter un objectif hebdomadaire/.test(js) && !/goalsCalWeekAdd/.test(js) && !/openGoalEdit/.test(js), 'le calendrier n'ajoute ni ne modifie aucun objectif hebdomadaire (arbre périodique, mode modifier)');
assert(/selDay/.test(js) && /goalsCalDay\.sel \{[^}]*background: var\(--purple\)/.test(css) && /\.goalsCalDay\.today \{ box-shadow/.test(css), 'jour touché : cercle plein ; le contour violet reste pour aujourd\'hui');
assert(/tasksPopAdd tasksDock goalsDayDock/.test(js) && /TMT\.ui\.dockKeyboard\(dayDock, dayText\)/.test(js), 'barre d\'ajout = dock de la page 1 + positionnement clavier commun');
assert(/tasksPopRow/.test(js) && /tasksPopCheck/.test(js) && !/openGoalsDayPop/.test(js), 'panneau des tâches du jour en lignes .tasksPop* ; l\'ancien pop-up du jour est remplacé');
const add = (js.match(/function addGoalsDayTask[\s\S]*?\r?\n  \}\r?\n/) || [''])[0];
assert(/goals\/categories\/' \+ encodeURIComponent\(TMT\.currentGoalsCategory\) \+ '\/tasks'/.test(add) && !/capture|classif|propose/i.test(add), 'ajout manuel direct dans le secteur / pôle de la page (aucun tri IA, aucun pop-up de placement)');
assert(/goalsMainBig/.test(js) && !/goalsMainAdd/.test(js) && !/Ajouter un objectif périodique/.test(js), 'ligne de période : titre de l’objectif périodique seulement, sinon rien');
if (failed) { console.log('\ncalendrier-page3-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\ncalendrier-page3-test : OK');
