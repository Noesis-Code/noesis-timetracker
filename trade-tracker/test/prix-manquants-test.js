// Prix en retard / marché fermé / symbole inconnu / vente à découvert : l'affichage reste cohérent (dernier prix connu + horodatage existant).
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const { createDemoConnector, EXPERT_FIXTURE } = require('../server/lib/connectors/demo');
const { syncAll } = require('../server/lib/sync');
const A = require('../server/lib/auth');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'tmt-e', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const l = await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'tmt-e', name: 'e', email: 'e@ex.test', ua: 'node' }, secret), { redirect: 'manual' });
    const cookie = (await require('./mfa-helper').enrollAndVerify(base, l.headers.get('set-cookie').split(';')[0])).cookie;
    const get = async (p) => (await fetch(base + p, { headers: { cookie } })).json();
    const find = (list, sym) => list.positions.find((p) => p.symbol === sym);

    const fx = { 'tmt-e': JSON.parse(JSON.stringify(EXPERT_FIXTURE)) };
    const acc = fx['tmt-e'].accounts[0];
    acc.positions.push({ symbol: 'SHRT.TO', name: 'Court', sector: 'Or', currency: 'CAD', quantity: -100, avgCost: 50, lastPrice: 40 }); // gagnant : +1000
    acc.positions.push({ symbol: 'INCONNU', name: 'Inconnu', sector: 'Or', currency: 'CAD', quantity: 10, avgCost: 5, lastPrice: null }); // jamais coté
    const connector = createDemoConnector({ fixtures: fx });
    const T1 = Date.parse('2026-10-20T15:00:00Z'), T2 = Date.parse('2026-10-20T22:00:00Z');
    await syncAll(db, { connector, now: T1 });

    let pos = await get('/api/positions');

    const aaa = pos.positions.filter((p) => p.symbol === 'AAA.TO')[0];
    assert.strictEqual(aaa.lastPrice, 15.2);
    // vente à découvert : visible, valeur négative, gain positif +1000 (20 %)
    const sh = find(pos, 'SHRT.TO');
    assert(sh, 'la position courte est affichée');
    assert.deepStrictEqual([sh.valueCad, sh.costCad, sh.pnlCad, sh.pnlPct], [-4000, -5000, 1000, 20]);
    // symbole jamais coté : valeur au coût, gain 0, pas d'horodatage
    const unk = find(pos, 'INCONNU');
    assert.deepStrictEqual([unk.lastPrice, unk.priceUpdatedAt, unk.valueCad, unk.pnlCad], [null, null, 50, 0]);

    // marché fermé / symbole sans cote à la synchro suivante : le dernier prix connu et son horodatage restent
    for (const p of acc.positions) if (p.symbol === 'AAA.TO') p.lastPrice = null;
    await syncAll(db, { connector, now: T2 });
    pos = await get('/api/positions');
    const aaa2 = pos.positions.filter((p) => p.symbol === 'AAA.TO')[0];
    assert.strictEqual(aaa2.lastPrice, 15.2, 'dernier prix connu conservé');
    assert.strictEqual(aaa2.priceUpdatedAt, new Date(T1).toISOString(), 'horodatage du dernier prix reçu (mention « Prix mis à jour »)');
    assert.strictEqual(aaa2.valueCad, 6080, 'valeur sur le dernier prix connu, pas sur le coût'); // 400 x 15,2
    // un prix reçu de nouveau remplace l'ancien
    for (const p of acc.positions) if (p.symbol === 'AAA.TO') p.lastPrice = 16;
    await syncAll(db, { connector, now: T2 + 60e3 });
    const aaa3 = (await get('/api/positions')).positions.filter((p) => p.symbol === 'AAA.TO')[0];
    assert.deepStrictEqual([aaa3.lastPrice, aaa3.priceUpdatedAt], [16, new Date(T2 + 60e3).toISOString()]);

    // portefeuille : le total inclut la position courte (valeur négative), le gain % reste du bon signe
    const pf = await get('/api/portfolio');
    assert(pf.pnlCad > 0 && Number.isFinite(pf.pnlPct));
    assert.strictEqual(pf.asOf, new Date(T2 + 60e3).toISOString());

    // taux USD manquant : montants CAD nuls signalés (fxMissing), jamais inventés
    db.prepare('DELETE FROM fx_rates').run();
    const pf2 = await get('/api/portfolio');
    assert.strictEqual(pf2.fxMissing, true);
    const lit = (await get('/api/positions')).positions.find((p) => p.symbol === 'LIT');
    assert.deepStrictEqual([lit.valueCad, lit.pnlCad], [null, null]);
  } finally { server.close(); }
  console.log('prix-manquants-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
