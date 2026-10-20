// Fournisseur en erreur (429 / 500 / JSON invalide) : dernier prix conservé, délai croissant entre essais, aucun plantage.
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { syncAll } = require('../server/lib/sync');

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  db.prepare("INSERT INTO tt_users (tmtUserId, role) VALUES ('e','expert')").run();
  const T = Date.parse('2026-10-20T12:00:00Z'), MIN = 60e3;
  const base = 15 * MIN;
  let mode = 'ok'; let calls = 0;
  const connector = {
    name: 'test',
    async fetchPortfolio(u) {
      calls++;
      if (mode === '429') throw new Error('Questrade indisponible après 4 essai(s) (HTTP 429)');
      if (mode === '500') throw new Error('Questrade indisponible après 4 essai(s) (HTTP 500)');
      if (mode === 'json') throw new SyntaxError('Unexpected token < in JSON at position 0');
      if (mode === 'null') return null; // réponse vide : ne doit pas planter non plus
      return { broker: 'test', accounts: [{ externalId: 'A', type: 'CELI', positions: [{ symbol: 'AAA.TO', currency: 'CAD', quantity: 1, avgCost: 1, lastPrice: 10 }] }] };
    },
  };
  const price = () => db.prepare('SELECT lastPrice, priceUpdatedAt FROM positions').get();
  let r = await syncAll(db, { connector, now: T });
  assert(r[0].ok); const p0 = price(); assert.strictEqual(p0.lastPrice, 10);

  // échecs consécutifs : le délai double (15, 30, 60 min), la valeur reste, aucune exception
  let t = T + base, expected = base;
  for (const m of ['429', '500', 'json', 'null']) {
    mode = m;
    r = await syncAll(db, { connector, now: t });
    assert.strictEqual(r[0].ok, false, m); assert.strictEqual(calls > 0, true);
    assert.deepStrictEqual(price(), p0, m + ' : dernier prix conservé');
    const c = calls;
    const early = await syncAll(db, { connector, now: t + expected - MIN });
    assert(early[0].backoff && calls === c, m + ' : pas de nouvel appel avant le délai (' + expected / MIN + ' min)');
    t += expected; expected = Math.min(expected * 2, 6 * 3600e3);
  }
  // reprise : un succès remet le délai à zéro
  mode = 'ok';
  r = await syncAll(db, { connector, now: t });
  assert(r[0].ok, 'reprise'); mode = '429';
  await syncAll(db, { connector, now: t + base });
  const c2 = calls; await syncAll(db, { connector, now: t + base + base });
  assert.strictEqual(calls, c2 + 1, 'après reprise, le délai repart de la base');
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM sync_log WHERE status='ECHEC'").get().n >= 5, true);
  console.log('price-resilience-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
