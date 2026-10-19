// Trade Tracker — lecture/assemblage du portefeuille d'un utilisateur à partir de la base.
const C = require('./calc');

function latestUsdCad(db, date) {
  const r = date
    ? db.prepare("SELECT rate FROM fx_rates WHERE pair='USDCAD' AND date <= ? ORDER BY date DESC LIMIT 1").get(date)
    : db.prepare("SELECT rate FROM fx_rates WHERE pair='USDCAD' ORDER BY date DESC LIMIT 1").get();
  return r ? r.rate : null;
}

function loadAccounts(db, userId) {
  return db.prepare('SELECT id, type, label, broker FROM accounts WHERE userId = ? ORDER BY id').all(userId);
}

function loadPositions(db, userId, usdCad) {
  const rows = db.prepare(`SELECT p.*, a.type AS accountType, s.name AS sector
    FROM positions p JOIN accounts a ON a.id = p.accountId LEFT JOIN sectors s ON s.id = p.sectorId
    WHERE a.userId = ? AND p.quantity > 0`).all(userId);
  const list = rows.map((p) => ({
    id: p.id, accountId: p.accountId, accountType: p.accountType, symbol: p.symbol, name: p.name, sector: p.sector,
    currency: p.currency, quantity: p.quantity, avgCost: p.avgCost, lastPrice: p.lastPrice, priceUpdatedAt: p.priceUpdatedAt,
    ...C.positionMetrics(p, usdCad),
  }));
  return list;
}

function cashByAccount(db, userId, usdCad) {
  const rows = db.prepare('SELECT b.accountId, b.currency, b.cash FROM balances b JOIN accounts a ON a.id = b.accountId WHERE a.userId = ?').all(userId);
  const m = new Map();
  let missing = false;
  for (const r of rows) {
    const c = C.toCad(r.cash, r.currency, usdCad);
    if (c == null) { missing = true; continue; }
    m.set(r.accountId, (m.get(r.accountId) || 0) + c);
  }
  return { byAccount: m, missing };
}

// Vue complète : totaux, comptes, positions (avec poids).
function buildPortfolio(db, userId) {
  const usdCad = latestUsdCad(db);
  const positions = loadPositions(db, userId, usdCad);
  const accounts = loadAccounts(db, userId);
  const cash = cashByAccount(db, userId, usdCad);
  let fxMissing = cash.missing || positions.some((p) => p.valueCad == null);

  const accOut = accounts.map((a) => {
    const ps = positions.filter((p) => p.accountId === a.id);
    const invested = ps.reduce((s, p) => s + (p.valueCad || 0), 0);
    const cost = ps.reduce((s, p) => s + (p.costCad || 0), 0);
    const cashCad = cash.byAccount.get(a.id) || 0;
    return { id: a.id, type: a.type, label: a.label, valueCad: invested + cashCad, cashCad, investedCad: invested, costCad: cost, count: ps.length };
  });
  const investedCad = accOut.reduce((s, a) => s + a.investedCad, 0);
  const cashCad = accOut.reduce((s, a) => s + a.cashCad, 0);
  const costCad = accOut.reduce((s, a) => s + a.costCad, 0);
  const total = investedCad + cashCad;
  for (const p of positions) p.weightPct = C.round2(total ? ((p.valueCad || 0) / total) * 100 : 0);
  const last = db.prepare('SELECT at, status FROM sync_log WHERE userId = ? ORDER BY id DESC LIMIT 1').get(userId);
  return {
    usdCad, fxMissing, positions, accounts: accOut,
    totalValueCad: total, cashCad, investedCad, costCad, pnlCad: investedCad - costCad,
    pnlPct: costCad ? ((investedCad - costCad) / costCad) * 100 : 0,
    lastSync: last || null,
  };
}

module.exports = { latestUsdCad, buildPortfolio, loadPositions };
