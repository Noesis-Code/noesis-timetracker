// Les plafonds IA par jour utilisent TOUS le jour de Montréal (pas UTC) : aucun ne se remet à zéro deux fois en 24 h.
// Horloge simulée : 19 h 30 puis 20 h 30 à Montréal (minuit UTC passé), puis 1 h le lendemain. Usage : node test/ia-plafonds-jour-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-plafjour-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.SPELLFIX_MAX_PER_DAY = '2'; process.env.CROSS_MAX_PER_ACTIVITY_DAY = '2'; process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY = '2';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const RealDate = Date; let fixed = null;
global.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0 && fixed !== null) super(fixed); else super(...a); }
  static now() { return fixed !== null ? fixed : RealDate.now(); }
};
const at = (iso) => { fixed = RealDate.parse(iso); };
const spell = require('../server/lib/silentspellfix');
const cross = require('../server/lib/crosssectorinference');
const drive = require('../server/lib/drivesync');
const db = require('../server/db');
db.prepare('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)').run('u-plaf', 'Test');
const cases = [
  ['orthographe', () => spell.takeCall('u-plaf')],
  ['inter-secteurs', () => cross.takeDayCall('act-plaf')],
  ['Drive', () => drive.takeCall('u-plaf')],
];
for (const [name, take] of cases) {
  at('2026-10-20T23:30:00Z'); // 19 h 30 à Montréal
  const a = take(), b = take(), c = take();
  assert(a && b && !c, name + ' : plafond de 2 atteint à 19 h 30');
  at('2026-10-21T00:30:00Z'); // 20 h 30 à Montréal : minuit UTC passé, même jour de Montréal
  assert(take() === false, name + ' : minuit UTC ne remet pas le compteur à zéro');
  at('2026-10-21T05:00:00Z'); // 1 h à Montréal, lendemain
  assert(take() === true, name + ' : minuit de Montréal remet le compteur à zéro');
}
process.exit(failed ? 1 : 0);
