// Bilan : le graphique « Chemin parcouru et à parcourir » est visible par défaut quand UNE activité est sélectionnée (jamais en vue Toutes), retirable. Usage : node test/bilan-graphique-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync('public/js/bilan-blocs.js', 'utf8').replace(/\r\n/g, '\n');
const sec = (n) => { const i = js.indexOf('    ' + n + ': ['); return js.slice(i, js.indexOf('\n    ]', i)); };
assert(!sec('all').includes("key: 'graph'") && /key: 'graph'[^\n]*def: true/.test(sec('act')), 'graphique par défaut en activité, absent de « Toutes »');
const store = {}; const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
const a = js.indexOf('  function storeKey()'), b = js.indexOf('  // ---------- Page : informations ajoutées');
const lib = (scope) => new Function('localStorage', 'scope', js.slice(a, b) + '\nreturn { loadAdded, saveAdded };')(localStorage, scope);
let L = lib('5');
assert(JSON.stringify(L.loadAdded()) === '["graph"]', 'activité : graphique seul par défaut');
L.saveAdded(['rec']); assert(JSON.stringify(L.loadAdded()) === '["rec"]', 'retiré par la croix : choix mémorisé');
store['tmt.bilanInfo.7'] = '["rec"]';
assert(JSON.stringify(lib('7').loadAdded()) === '["graph","rec"]', 'ancien choix gardé, graphique en plus');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-graphique-test OK'); process.exit(failed ? 1 : 0);
