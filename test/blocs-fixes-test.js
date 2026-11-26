// Blocs de 5 ans FIXES sur le calendrier (18 nov. 2026) : 26/30 reste affiché jusqu'à la fin de 2030, puis 31/35 ; plus d'ancrage sur l'année courante. Usage : node test/blocs-fixes-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-blocs-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
// horloge figée en février 2027 : l'ancien calcul (ancré sur l'année courante) donnait 2027–2031 ; le bloc fixe donne 2026–2030
const RealDate = Date, FAKE = '2027-02-01T12:00:00.000Z';
global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(FAKE); } static now() { return new RealDate(FAKE).getTime(); } };
const O = require('../server/lib/objectifs');
assert(O.blockYearOf('2026-05-01') === 2026 && O.blockYearOf('2030-12-31') === 2026, '2026 reste visible en 2027 : une échéance 2026 ou fin 2030 est dans le bloc 26/30');
assert(O.blockYearOf('2031-01-01') === 2031 && O.blockYearOf('2035-12-31') === 2031, 'le bloc suivant est 31/35, fixe');
assert(O.blockYearOf('2025-06-01') === 2021, 'avant 2026 : 21/25');
global.Date = RealDate;
const js = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8').replace(/\r\n/g, '\n'), cr = fs.readFileSync('public/js/objectifs-creer.js', 'utf8');
assert(js.includes('BLOCK0 = 2026') && js.includes('function blockStart(iso) { var y = Number(iso.slice(0, 4)); return BLOCK0 + 5 * Math.floor((y - BLOCK0) / 5); }') && js.includes('var s0 = BLOCK0 + 5 * Math.floor((x.y - BLOCK0) / 5);') && !js.includes('var y0 = new Date().getFullYear(), s0 ='), 'arbre : blocs fixes (rowKey et blockStart)');
assert(cr.includes('return 2026 + 5 * Math.floor((y - 2026) / 5);'), 'création : même bloc fixe');
assert(js.includes('here = rowKey(today), lo = here.rank'), 'en 2031 le bloc 26/30 a disparu : la première ligne est le bloc du présent (fixe), un bloc entièrement terminé n\'a plus de ligne');
const red = fs.readFileSync('server/lib/objectifs-redessin.js', 'utf8');
assert(red.includes('const y0 = O.blockYearOf(parent.endDate);'), 'redessin : les 5 années d\'un pluriannuel sont celles de son bloc fixe');
console.log(failed ? '\n' + failed + ' échec(s)' : 'blocs-fixes-test OK'); process.exit(failed ? 1 : 0);
