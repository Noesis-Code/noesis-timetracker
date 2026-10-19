// Tests limitation de débit + rétention des sauvegardes. Usage : node test/debit-sauvegardes-test.js
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { createLimiter } = require('../server/lib/ratelimit');
let t = 1000000;
const lim = createLimiter({ userMax: 3, ipMax: 5, now: () => t });
assert(!lim.check('1.1.1.1', 'u1') && !lim.check('1.1.1.1', 'u1') && !lim.check('1.1.1.1', 'u1'), '3 écritures utilisateur passent');
const r = lim.check('1.1.1.1', 'u1');
assert(r >= 1 && r <= 60, '4e utilisateur bloquée avec retryAfter');
assert(!lim.check('1.1.1.1', 'u2'), 'autre utilisateur même IP passe (IP 5/5)');
assert(lim.check('1.1.1.1', 'u3') > 0, 'limite IP atteinte');
assert(lim.check("2.2.2.2", "u1") > 0, 'u1 reste bloqué depuis une autre IP');
t += 61000;
assert(!lim.check('1.1.1.1', 'u1'), 'fenêtre écoulée : de nouveau permis');

const { planRetention, applyRetention } = require('../server/lib/backupretention');
const now = Date.UTC(2026, 9, 19, 12, 0, 0);
const objs = [];
for (let i = 0; i < 400; i++) { // une par jour + doublon le même jour
  const d = new Date(now - i * 86400000);
  const st = d.toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  objs.push({ key: 'p/' + st + '.db.gz.enc' });
}
objs.push({ key: 'p/2026-10-19T03-00-00Z.db.gz.enc' }, { key: 'p/inconnu.txt' });
const plan = planRetention(objs, now);
assert(plan.remove.length > 200, 'purge des anciennes');
assert(plan.keep.includes('p/2026-10-19T12-00-00Z.db.gz.enc'), 'plus récente gardée');
assert(plan.remove.includes('p/2026-10-19T03-00-00Z.db.gz.enc'), 'doublon du même jour purgé');
assert(!plan.remove.includes('p/inconnu.txt'), 'clé illisible jamais supprimée');
assert(plan.keep.includes('p/2026-10-06T12-00-00Z.db.gz.enc'), 'quotidienne dans 14 j gardée');
const nKeep = plan.keep.filter((k) => k.startsWith('p/2026')).length;
assert(nKeep >= 14 + 7 && nKeep <= 14 + 8 + 12, 'nombre conservé plausible (' + nKeep + ')');
(async () => {
  const del = [];
  const client = { listObjects: async () => objs, deleteObject: async (k) => del.push(k) };
  const quiet = { log() {}, error() {} };
  const sim = await applyRetention(client, 'p/', quiet, { now, apply: false });
  assert(del.length === 0 && sim.wouldRemove.length > 0, 'simulation : rien supprimé');
  const real = await applyRetention(client, 'p/', quiet, { now, apply: true });
  assert(del.length === real.removed.length && del.length > 0, 'apply : suppression réelle');
  assert(!del.includes('p/2026-10-19T12-00-00Z.db.gz.enc'), 'la plus récente jamais supprimée');
  process.exit(failed ? 1 : 0);
})();
