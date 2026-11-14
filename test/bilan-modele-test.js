// Modèle du Bilan (14 nov. 2026) : seuls les 3 tableaux Chrono sont visibles d'office ; le reste s'ajoute par « + Ajouter une information » et se retire. Usage : node test/bilan-modele-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').split('\r\n').join('\n');
const bb = rd('public/js/bilan-blocs.js'), sa = rd('public/js/stats-avance.js'), app = rd('public/app.js');
const section = (name) => { const i = bb.indexOf('    ' + name + ': ['); return bb.slice(i, bb.indexOf('\n    ]', i)); };
const keysOf = (txt) => (txt.match(/key: '[a-z]+'/g) || []).map((x) => x.slice(6, -1));
assert(keysOf(section('all')).join() === 'advance,capacity,weekdays,urgent', 'menu « Toutes » : Avancement, Capacité par jour, Jours où tu travailles vraiment, Tâches urgentes');
assert(keysOf(section('act')).join() === 'avg,prop,graph,rec', 'menu d’une activité : Moyenne, Proportion, Graphique des tâches et objectifs, Tâches récurrentes');
assert(bb.includes("'cmpAdd'") && bb.includes('cmpRemove cmpRemove--corner') && bb.includes('tmt.bilanInfo.'), '+ Ajouter une information, croix rouge officielle, choix mémorisé par vue');
assert(bb.includes("function loadAdded() { try { var a = JSON.parse(localStorage.getItem(storeKey()) || '[]')"), 'aucune information affichée d’office hors Chrono (liste ajoutée vide par défaut)');
assert(bb.includes('TMT.bilanCategoryStats.open(chronoHost') && bb.includes('TMT.bilanPage1(true)'), 'Chrono d’office : page de statistiques (Toutes) ; contenu de la fenêtre Chrono (une activité)');
assert(app.includes('TMT.bilanCategoryStats = {') && sa.includes('TMT.bilanCardInstance = function'), 'ponts app.js et stats-avance.js présents');
assert(bb.includes("tr(jourMode ? 'Jour' : 'Semaine')") && bb.includes("['1', '2', '3', '4']") && bb.includes("'Moyenne des tâches réalisées'"), 'Moyenne des tâches réalisées : UN bouton Jour / Semaine, colonnes 1 à 4');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-modele-test OK'); process.exit(failed ? 1 : 0);
