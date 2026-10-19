// Données de démonstration FICTIVES. Usage :
//   TRADE_LINK_SECRET=<au moins 16 car.> NOESIS_DATA_DIR=<dossier> node trade-tracker/seed-demo.js
// Crée un expert et un client fictifs, synchronise le connecteur de démo, génère 60 jours
// d'historique et affiche des liens d'entrée à usage unique (valables 5 min).
const crypto = require('node:crypto');
const { openDb } = require('./server/db');
const { syncAll } = require('./server/lib/sync');
const { takeSnapshot, montrealDate } = require('./server/lib/snapshot');
const { signLinkToken, getSecret } = require('./server/lib/auth');

(async () => {
  const db = openDb();
  const ins = db.prepare('INSERT OR IGNORE INTO tt_users (tmtUserId, name, email, role) VALUES (?,?,?,?)');
  ins.run('demo-expert', 'Expert Démo', 'expert@demo.invalid', 'expert');
  ins.run('demo-client', 'Client Démo', 'client@demo.invalid', 'client');
  await syncAll(db);
  // historique fictif : marche aléatoire reproductible autour de la valeur actuelle
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const u of db.prepare('SELECT id FROM tt_users').all()) {
    const base = takeSnapshot(db, u.id, montrealDate());
    if (!base.ok) continue;
    let v = base.valueCad * 0.85;
    for (let d = 60; d >= 1; d--) {
      const date = montrealDate(Date.now() - d * 86400e3);
      const flow = d === 30 ? 1000 : 0;
      v = v * (1 + (rnd() - 0.45) * 0.03) + flow;
      db.prepare('INSERT OR REPLACE INTO history (userId, date, valueCad, netFlowCad, returnPct, idx) VALUES (?,?,?,?,0,100)').run(u.id, date, Math.round(v * 100) / 100, flow);
    }
    // recalcule rendements et indice depuis les points
    const C = require('./server/lib/calc');
    const rows = db.prepare('SELECT date, valueCad, netFlowCad FROM history WHERE userId = ? ORDER BY date').all(u.id);
    const s = C.indexSeries(rows);
    const up = db.prepare('UPDATE history SET returnPct = ?, idx = ? WHERE userId = ? AND date = ?');
    for (const p of s.points) up.run(p.returnPct, p.index, u.id, p.date);
  }
  console.log('Démo prête. Base : ' + (process.env.NOESIS_DATA_DIR || 'trade-tracker/data'));
  const secret = getSecret();
  if (!secret) return console.log('TRADE_LINK_SECRET absent (>= 16 car.) : aucun lien généré.');
  const port = process.env.PORT || 3980;
  for (const [sub, label] of [['demo-expert', 'expert'], ['demo-client', 'client']]) {
    console.log(`${label} : http://localhost:${port}/link?token=${signLinkToken({ sub, name: label + ' démo' }, secret)}`);
  }
})();
