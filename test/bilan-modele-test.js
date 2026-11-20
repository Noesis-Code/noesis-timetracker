// Modèle du Bilan (14 nov. 2026) : seuls les 3 tableaux Chrono sont visibles d'office ; le reste s'ajoute par « + Ajouter une information » et se retire. Usage : node test/bilan-modele-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');
const bb = rd('public/js/bilan-blocs.js'), sa = rd('public/js/stats-avance.js'), app = rd('public/app.js');
const keysOf = (txt) => (txt.match(/key: '[a-z]+'/g) || []).map((x) => x.slice(6, -1));
const defsTxt = bb.slice(bb.indexOf('  var DEFS = ['), bb.indexOf('  function defs()'));
assert(keysOf(defsTxt).join() === 'timesheet,repart,chart,tchart,trepart,weekdays,capacity,urgent,avg,prop,rec,graph,advance', 'ordre de la page par sujet : temps, puis travail, puis objectifs');
assert(!/key: 'capacity'[^\n]*levels: \[[^\]]*'all'/.test(defsTxt), 'Capacité par jour : jamais en vue Toutes');
assert(bb.includes("'cmpAdd'") && bb.includes('cmpRemove cmpRemove--corner') && bb.includes('tmt.bilanInfo4.'), '+ Ajouter une information, croix rouge officielle, choix mémorisé par niveau');
assert(bb.includes('TMT.bilanCategoryStats.open(chronoHost') && bb.includes('TMT.bilanPage1(any)'), 'Chrono : page de statistiques (Toutes) ; contenu de la fenêtre Chrono (une activité)');
assert(app.includes('TMT.bilanCategoryStats = {') && sa.includes('TMT.bilanCardInstance = function'), 'ponts app.js et stats-avance.js présents');
assert(bb.includes("tr(jourMode ? 'Jour' : 'Semaine')") && bb.includes("['1', '2', '3', '4']") && bb.includes("'Moyenne des tâches réalisées'"), 'Moyenne des tâches réalisées : UN bouton Jour / Semaine, colonnes 1 à 4');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-modele-test OK'); process.exit(failed ? 1 : 0);
