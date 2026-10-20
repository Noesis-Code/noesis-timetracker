// Tenue en charge de la synchro simulée (sans réseau) : 150 utilisateurs x 2 comptes x 60 positions + 100 transactions.
// Vérifie : durée bornée, une panne isolée ne bloque pas les autres, re-synchro idempotente, aucun doublon d'événement.
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { syncAll } = require('../server/lib/sync');

const N = 150, POS = 60, TX = 100;
const fixture = (u, extraBuy) => ({
  broker: 'simule', usdCad: 1.37,
  accounts: [0, 1].map((a) => ({
    externalId: `${u}-A${a}`, type: a ? 'CELI' : 'REER', label: '', balances: [{ currency: 'CAD', cash: 100 }],
    positions: Array.from({ length: POS }, (_, i) => ({ symbol: `S${i}.TO`, name: 'Titre ' + i, sector: 'Sec' + (i % 8), currency: 'CAD', quantity: 10 + i, avgCost: 5, lastPrice: 6 })),
    transactions: Array.from({ length: TX + (a === 0 && extraBuy ? 1 : 0) }, (_, i) => ({ externalId: `${u}-${a}-T${i}`, date: '2026-06-01', type: i === TX ? 'ACHAT' : 'DIVIDENDE', symbol: `S${i % POS}.TO`, quantity: 1, price: 6, amount: 6, currency: 'CAD' })),
  })),
});

(async () => {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const ins = db.prepare('INSERT INTO tt_users (tmtUserId,name,role) VALUES (?,?,?)');
  for (let i = 0; i < N; i++) ins.run('u' + i, 'U' + i, i === 0 ? 'expert' : 'client');
  let extra = false; const down = new Set(['u7', 'u42']);
  const connector = { name: 'simule', async fetchPortfolio(u) { if (down.has(u.tmtUserId)) throw new Error('503 courtier indisponible'); return fixture(u.tmtUserId, extra); } };

  let t0 = Date.now();
  let r = await syncAll(db, { connector, now: Date.parse('2026-06-01T12:00:00Z') });
  const d1 = Date.now() - t0;
  assert.strictEqual(r.length, N);
  assert.strictEqual(r.filter((x) => !x.ok).length, 2, 'seules les 2 pannes simulées échouent');
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM sync_log WHERE status='ECHEC'").get().n, 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM positions').get().n, (N - 2) * 2 * POS);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, 0, 'première synchro : aucun événement');

  // re-synchro (pannes levées) + un nouvel achat chez chacun : un seul événement par achat, ré-exécution sans doublon
  down.clear(); extra = true;
  t0 = Date.now(); r = await syncAll(db, { connector, now: Date.parse('2026-06-02T12:00:00Z') }); const d2 = Date.now() - t0;
  assert(r.every((x) => x.ok));
  const ev = db.prepare('SELECT COUNT(*) n FROM events').get().n;
  assert.strictEqual(ev, N - 2, 'un événement par achat, sauf les 2 dont la 1re synchro avait échoué (historique de départ)');
  await syncAll(db, { connector, now: Date.parse('2026-06-02T13:00:00Z') });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM events').get().n, ev, 'idempotent');
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM positions').get().n, N * 2 * POS);
  assert(d1 < 20000 && d2 < 20000, `durée excessive : ${d1} ms / ${d2} ms`);
  console.log(`sync-charge-test OK (${N} utilisateurs : ${d1} ms puis ${d2} ms)`);
})().catch((e) => { console.error(e); process.exit(1); });
