// Bilan : le graphique « Chemin parcouru et à parcourir » est affiché d'office pour une activité, un pôle et un secteur (jamais en vue Toutes), retirable ; choix mémorisé par niveau. Usage : node test/bilan-graphique-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync('public/js/bilan-blocs.js', 'utf8').replace(/\r\n/g, '\n');
assert(/key: 'graph'[^\n]*levels: \['act', 'cat'\][^\n]*def: \['act', 'cat'\]/.test(js), 'graphique : niveaux activité, pôle et secteur, d\'office à ces niveaux, absent de « Toutes »');
const store = {}; const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
const a = js.indexOf('  function voletOn('), b = js.indexOf('  // ---------- Les tableaux de temps');
const lib = (scope, pole) => new Function('localStorage', 'scope', 'pole', 'TMT', 'var rWeekdays, rCapacity, rUrgent, rAvg, rProp, rRec, rGraph, rAdvance; function level() { return scope === "all" ? "all" : (pole == null ? "act" : "cat"); }\n' + js.slice(a, b) + '\nreturn { loadAdded, saveAdded };')(localStorage, scope, pole, {});
let L = lib('5', null);
assert(JSON.stringify(L.loadAdded()) === '["repart","graph"]', 'activité : répartition du temps et graphique par défaut');
L.saveAdded(['rec']); assert(JSON.stringify(L.loadAdded()) === '["rec"]', 'retiré par la croix : choix mémorisé');
assert(JSON.stringify(lib('5', 'c1').loadAdded()) === '["prop","graph"]', 'pôle ou secteur : proportion et graphique par défaut');
assert(JSON.stringify(lib('all', null).loadAdded()) === '["repart","chart","advance"]', 'Toutes : répartition, graphique du temps et avancement ; ni graphique des tâches ni capacité');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-graphique-test OK'); process.exit(failed ? 1 : 0);
