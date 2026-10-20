// Tâche proposée par l'IA avec une catégorie inconnue : écartée (jamais affichée), comptée. Usage : node test/categorie-inconnue-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-ci-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const dt = require('../server/lib/documenttasks');
const ctx = { candidates: [{ key: 'prod', label: 'Production' }, { key: 'vente', label: 'Ventes' }], weeks: ['2026-10-19'] };
const fakeAi = JSON.stringify({ t: [['Bonne tâche', 'prod', null, 30], ['Catégorie fantôme', 'zzz', null, 10], ['Sans clé', null, null, 5], ['Clé approchée', 'Ventes', null, 15]] });
const r = dt.parseDetailed(fakeAi, ctx);
assert(r.tasks.length === 2 && r.found === 4, 'tâches à catégorie inconnue écartées');
assert(r.dropped.categorieInconnue === 2, 'compteur categorieInconnue incrémenté');
assert(!r.tasks.some((t) => /fantôme|Sans clé/.test(t.title)), 'aucune tâche inconnue dans le résultat');
assert(r.tasks[1].key === 'vente' && r.tasks[1].toChoose === true, 'clé reconnue de près conservée');
process.exit(failed ? 1 : 0);
