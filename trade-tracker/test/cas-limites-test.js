// Cas limites du portefeuille : import vide, positions à zéro, devises mixtes CAD/USD (avec et sans taux), prix manquant :
// aucun NaN/Infinity dans les données, aucun plantage, formats d'affichage sûrs.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { importSheet, ensureUser } = require('../server/lib/importsheet');
const { buildPortfolio } = require('../server/lib/portfolio');
const { takeSnapshot } = require('../server/lib/snapshot');
const C = require('../server/lib/calc');

function bad(v, p = '') { // premier nombre non fini rencontré
  if (typeof v === 'number') return Number.isFinite(v) ? null : p || 'racine';
  if (v && typeof v === 'object') for (const k of Object.keys(v)) { const r = bad(v[k], p + '.' + k); if (r) return r; }
  return null;
}
function view(db, uid) {
  const pf = buildPortfolio(db, uid);
  const all = { pf, sec: C.allocationBySector(pf.positions, pf.cashCad), acc: C.allocationByAccount(pf.accounts) };
  assert.strictEqual(bad(all), null, 'nombre non fini : ' + bad(all));
  return all;
}
const fresh = () => { const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db); return { db, u: ensureUser(db, 'tmt-x', 'expert') }; };

// 1. Import vide (aucun fichier / fichiers sans lignes) : rien d'importé, portefeuille vide cohérent
{
  const { db, u } = fresh();
  for (const files of [{}, { comptes: '', positions: '', transactions: '', soldes: '' }, { comptes: 'compte,type\n', positions: 'compte,symbole\n' }]) {
    const r = importSheet(db, u, files);
    assert.strictEqual(r.accounts + r.positions + r.transactions + r.balances, 0, 'rien importé');
    const { pf, sec, acc } = view(db, u.id);
    assert.deepStrictEqual([pf.totalValueCad, pf.pnlPct, pf.positions.length, pf.accounts.length], [0, 0, 0, 0]);
    assert.deepStrictEqual([sec.items.length, acc.items.length], [0, 0]);
  }
  assert.strictEqual(takeSnapshot(db, u.id, '2026-10-20').ok, false, 'instantané vide : refusé proprement');
}

// 2. Positions à zéro, prix manquant, USD sans taux, puis avec taux
{
  const { db, u } = fresh();
  const comptes = 'compte,type\nA1,CELI\nA2,REER';
  const positions = [
    'compte,symbole,nom,secteur,devise,quantite,prix_moyen,prix_actuel',
    'A1,ZERO.TO,Zéro,Or,CAD,0,10,12',          // quantité 0 : non affichée
    'A1,ZERO2.TO,Zéro bis,Or,CAD,0,0,0',
    'A1,NOPRICE.TO,Sans prix,Or,CAD,10,5,',    // prix manquant : valeur au coût
    'A1,NOCOST.TO,Sans coût,Cuivre,CAD,10,0,8', // coût nul : pas de division par zéro
    'A2,USD1,Titre US,Or,USD,4,10,12',
  ].join('\n');
  const soldes = 'compte,devise,encaisse\nA1,CAD,100\nA2,USD,50\nA2,CAD,0';
  importSheet(db, u, { comptes, positions, soldes });
  let { pf, sec } = view(db, u.id);
  assert.strictEqual(pf.positions.some((p) => p.quantity === 0), false, 'positions à zéro masquées');
  assert.strictEqual(pf.fxMissing, true, 'USD sans taux : signalé');
  assert.strictEqual(pf.positions.find((p) => p.symbol === 'USD1').valueCad, null, 'USD sans taux : valeur CAD inconnue, pas NaN');
  const np = pf.positions.find((p) => p.symbol === 'NOPRICE.TO');
  assert.deepStrictEqual([np.priced, np.valueCad, np.pnlCad], [false, 50, 0], 'prix manquant : au coût, gain 0');
  const nc = pf.positions.find((p) => p.symbol === 'NOCOST.TO');
  assert.deepStrictEqual([nc.costCad, nc.pnlPct], [0, 0], 'coût nul : pourcentage 0');
  assert.strictEqual(takeSnapshot(db, u.id, '2026-10-20').reason, 'fx_missing', 'instantané refusé sans taux');
  // Avec taux : devises mixtes
  db.prepare("INSERT INTO fx_rates (date, pair, rate) VALUES ('2026-10-19','USDCAD',1.4)").run();
  ({ pf, sec } = view(db, u.id));
  assert.strictEqual(pf.fxMissing, false);
  assert.strictEqual(pf.positions.find((p) => p.symbol === 'USD1').valueCad, 67.2, '4 x 12 x 1,4');
  assert.strictEqual(pf.cashCad, 170, 'encaisse 100 CAD + 50 USD x 1,4');
  assert.ok(Math.abs(sec.items.reduce((s, i) => s + i.weightPct, 0) - 100) < 0.011, 'répartition : somme 100');
  assert.strictEqual(takeSnapshot(db, u.id, '2026-10-20').ok, true);
  // Tout à zéro : total 0, aucune division par zéro
  db.exec('UPDATE positions SET quantity = 0; UPDATE balances SET cash = 0');
  const z = view(db, u.id);
  assert.deepStrictEqual([z.pf.totalValueCad, z.pf.pnlPct, z.sec.items.length], [0, 0, 0], 'tout à zéro');
}

// 3. Formats d'affichage : null / NaN / undefined ne produisent jamais « NaN »
{
  const ctx = { window: {}, Intl, Math, Date, String, Number }; ctx.TTI = { locale: 'fr-CA' }; ctx.window.TTI = ctx.TTI; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'format.js'), 'utf8'), ctx);
  const F = ctx.window.TTF;
  for (const v of [null, undefined, NaN, 0]) for (const fn of ['money', 'money0', 'num', 'signedMoney']) assert.ok(!/NaN|Infinity/.test(F[fn](v)), fn + '(' + v + ')');
  for (const v of [null, undefined, NaN, 0]) assert.ok(!/NaN|Infinity/.test(F.pct(v, true)) && !/NaN/.test(F.pct(v)), 'pct(' + v + ')');
}
console.log('cas-limites-test OK');
