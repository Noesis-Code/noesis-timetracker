// Au moins 8 propositions (modifications + ajouts, 17 nov. 2026) : le trou est complété par des cases libres du même niveau, jamais d'erreur.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-trou-min-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const T = require('../server/lib/objectifs-trou');
const today = '2026-11-17';
// périodique : trou de 3 cases ; 5 modifications déjà proposées => 3 ajouts minimum au total 8 : lignes portées à 3 (le trou) ; sans modification : 8 lignes.
const base = T.planTrou('periodique', '2027-09-15', '2027-04-15', today); // trou P5 à P9 (5 lignes), P1 à P4 libres avant
const gap = base.lines.length;
const full = T.completer(base, 'periodique', '2027-09-15', today, new Set(), 8);
assert(gap === 5 && full.lines.length === 8, 'trou de ' + gap + ' cases complété jusqu’à 8 lignes (' + full.lines.length + ') par des cases libres AVANT l’objectif');
assert(full.lines.every((c, i, a) => i === 0 || a[i - 1].ord < c.ord), 'lignes triées par case, sans doublon');
const occ = new Set(T.beforeCells('periodique', '2027-09-15', today).map((c) => c.ord));
assert(T.completer(base, 'periodique', '2027-09-15', today, occ, 8).lines.length === gap, 'cases occupées : jamais proposées, aucune erreur');
const aucun = T.planTrou('annuel', '2027-09-15', '2026-12-31', today);
const c2 = T.completer(aucun, 'annuel', '2027-09-15', today, new Set(), 8);
assert(aucun.mode === 'aucun' && c2.mode === 'ajouts' && c2.lines.length >= 1 && c2.lines.every((c) => c.endDate >= today), 'sans trou : ajouts AVANT l’objectif (étapes vers lui), jamais dans le passé (' + c2.lines.length + ')');
const dessous = T.planTrou('periodique', '2026-12-20', null, today);
assert(T.completer(dessous, 'periodique', '2026-12-20', today, new Set(), 8) === dessous || dessous.mode !== 'dessous', 'lignes du dessous : niveau différent, non mélangées');
assert(T.completer(base, 'periodique', '2027-09-15', today, new Set(), 0) === base, 'minimum 0 : rien ne change');
console.log(failed ? '\nobjectifs-trou-minimum-test : ' + failed + ' ÉCHEC(S)' : '\nobjectifs-trou-minimum-test : OK');
process.exit(failed ? 1 : 0);
