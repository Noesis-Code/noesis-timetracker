// Trade Tracker — instantané quotidien de l'historique (idempotent : un seul point par jour et par utilisateur).
const C = require('./calc');
const { buildPortfolio, latestUsdCad } = require('./portfolio');

function montrealDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

function takeSnapshot(db, userId, date = montrealDate()) {
  const pf = buildPortfolio(db, userId);
  if (pf.fxMissing) {
    db.prepare("INSERT INTO sync_log (userId, kind, status, message) VALUES (?, 'snapshot', 'ECHEC', ?)").run(userId, 'Taux USD/CAD manquant : instantané du ' + date + ' non enregistré');
    return { ok: false, reason: 'fx_missing' };
  }
  if (!pf.accounts.length) return { ok: false, reason: 'empty' };
  const txs = db.prepare('SELECT t.type, t.amount, t.currency FROM transactions t JOIN accounts a ON a.id = t.accountId WHERE a.userId = ? AND t.date = ?').all(userId, date);
  const netFlow = C.netFlowCad(txs, latestUsdCad(db, date));
  const prev = db.prepare('SELECT valueCad, idx FROM history WHERE userId = ? AND date < ? ORDER BY date DESC LIMIT 1').get(userId, date);
  const r = prev ? C.dailyReturn(prev.valueCad, pf.totalValueCad, netFlow) : 0;
  const idx = prev ? prev.idx * (1 + r) : 100;
  db.prepare(`INSERT INTO history (userId, date, valueCad, netFlowCad, returnPct, idx) VALUES (?,?,?,?,?,?)
    ON CONFLICT(userId, date) DO UPDATE SET valueCad=excluded.valueCad, netFlowCad=excluded.netFlowCad, returnPct=excluded.returnPct, idx=excluded.idx`)
    .run(userId, date, C.round2(pf.totalValueCad), netFlow, r * 100, idx);
  return { ok: true, date, valueCad: C.round2(pf.totalValueCad) };
}

function snapshotAll(db, date = montrealDate()) {
  return db.prepare('SELECT id FROM tt_users').all().map((u) => ({ userId: u.id, ...takeSnapshot(db, u.id, date) }));
}

// Tâche planifiée : vérifie toutes les heures qu'il existe un point pour aujourd'hui.
function startSnapshotScheduler(db, { intervalMs = 3600e3, log = console.log } = {}) {
  const tick = () => { try { snapshotAll(db); } catch (e) { log('snapshot : ' + e.message); } };
  const t = setInterval(tick, intervalMs);
  t.unref();
  setTimeout(tick, 5000).unref();
  return t;
}

module.exports = { montrealDate, takeSnapshot, snapshotAll, startSnapshotScheduler };
