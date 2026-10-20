// Aide aux tests de volume (pas un test : le lanceur ne prend que *-test.js).
// Gros portefeuille déterministe : 3 comptes, 200 positions, 5 000 transactions, 1 500 jours d'historique.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function seedBig(db, { accounts = 3, positions = 200, transactions = 5000, days = 1500 } = {}) {
  const r = rng(42);
  const ins = (sql) => db.prepare(sql);
  db.exec('BEGIN');
  ins("INSERT INTO tt_users (tmtUserId,name,role) VALUES ('e','Expert','expert')").run();
  const types = ['CELI', 'REER', 'CELIAPP'];
  for (let a = 0; a < accounts; a++) ins('INSERT INTO accounts (userId,type,label) VALUES (1,?,?)').run(types[a % 3], 'Compte ' + a);
  for (let s = 0; s < 12; s++) ins('INSERT INTO sectors (name) VALUES (?)').run('Secteur ' + s);
  ins("INSERT INTO fx_rates (date,rate) VALUES ('2026-10-20',1.3787)").run();
  const symbols = [];
  for (let i = 0; i < positions; i++) {
    const acc = 1 + (i % accounts), cur = r() < 0.4 ? 'USD' : 'CAD', sym = 'S' + String(i).padStart(3, '0');
    symbols.push([acc, sym, cur]);
    const q = Math.round(r() * 5000) / 7, avg = Math.round(r() * 30000) / 137;
    ins('INSERT INTO positions (accountId,symbol,name,sectorId,currency,quantity,avgCost,lastPrice) VALUES (?,?,?,?,?,?,?,?)')
      .run(acc, sym, 'Titre ' + i, 1 + (i % 12), cur, q, avg + 0.0137, avg * (0.8 + r() * 0.5) + 0.0073);
  }
  for (let a = 1; a <= accounts; a++) for (const cur of ['CAD', 'USD']) ins('INSERT INTO balances (accountId,currency,cash) VALUES (?,?,?)').run(a, cur, Math.round(r() * 1e7) / 1000 + 0.003);
  const kinds = ['ACHAT', 'ACHAT', 'ACHAT', 'VENTE', 'DIVIDENDE', 'APPORT', 'RETRAIT'];
  for (let i = 0; i < transactions; i++) {
    const [acc, sym, cur] = symbols[Math.floor(r() * symbols.length)], t = kinds[Math.floor(r() * kinds.length)];
    const d = new Date(Date.UTC(2022, 0, 1) + Math.floor(r() * days) * 86400000).toISOString().slice(0, 10);
    const q = Math.round(r() * 900) / 9 + 1, p = Math.round(r() * 20000) / 113 + 0.01;
    const trade = t === 'ACHAT' || t === 'VENTE';
    ins('INSERT INTO transactions (accountId,date,type,symbol,quantity,price,amount,currency,externalId) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(acc, d, t, trade || t === 'DIVIDENDE' ? sym : null, trade ? q : null, trade ? p : null, trade ? q * p : Math.round(r() * 1e6) / 1000 + 0.004, cur, 'x' + i);
  }
  let v = 500000;
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2022, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    v *= 1 + (r() - 0.48) / 50;
    ins('INSERT INTO history (userId,date,valueCad,netFlowCad) VALUES (1,?,?,?)').run(d, v, i % 30 === 0 ? 1000.37 : 0);
  }
  for (let i = 0; i < 300; i++) ins("INSERT INTO sync_log (userId,accountId,kind,status) VALUES (1,1,'sync','OK')").run();
  db.exec('COMMIT');
}
module.exports = { seedBig, rng };
