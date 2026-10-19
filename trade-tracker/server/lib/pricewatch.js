// Surveillance de la fraîcheur des prix : si la dernière synchro réussie d'un expert (qui a des positions cotées) date de plus de
// TRADE_PRICE_STALE_MIN minutes (défaut 120), une alerte « prices_stale » part vers TMT (push) — au plus une par 24 h et par expert.
// Appelée par /health et par un minuteur : aucune donnée financière dans l'alerte, aucun réseau ici.
const DEFAULT_MIN = 120, REPEAT_MS = 24 * 3600e3;

function thresholdMin(env = process.env) {
  const n = Number(env.TRADE_PRICE_STALE_MIN);
  return n > 0 ? n : DEFAULT_MIN;
}

// Experts dont les prix sont en retard : [{ userId, lastAt }]
function staleExperts(db, { env = process.env, now = Date.now() } = {}) {
  const limit = now - thresholdMin(env) * 60e3;
  const rows = db.prepare(`SELECT u.id AS userId, MAX(p.priceUpdatedAt) AS lastAt
    FROM tt_users u JOIN accounts a ON a.userId = u.id JOIN positions p ON p.accountId = a.id
    WHERE u.role = 'expert' AND p.lastPrice IS NOT NULL GROUP BY u.id`).all();
  return rows.filter((r) => !r.lastAt || Date.parse(r.lastAt) < limit);
}

// Alerte (dédupliquée) pour chaque expert en retard ; retourne la liste des experts en retard.
function checkAndAlert(db, { onAlert, env = process.env, now = Date.now() } = {}) {
  const stale = staleExperts(db, { env, now });
  for (const s of stale) {
    if (typeof onAlert !== 'function') continue;
    const since = new Date(now - REPEAT_MS).toISOString();
    const recent = db.prepare("SELECT 1 FROM events WHERE type = 'security' AND userId = ? AND payload LIKE '%\"kind\":\"prices_stale\"%' AND json_extract(payload, '$.occurredAt') > ? LIMIT 1").get(s.userId, since);
    if (!recent) onAlert(s.userId, 'prices_stale');
  }
  return stale;
}

function startPriceWatch(db, { onAlert, env = process.env, intervalMin = 10, log = console.warn } = {}) {
  const t = setInterval(() => { try { checkAndAlert(db, { onAlert, env }); } catch (e) { log('[trade-tracker] veille des prix : ' + e.message); } }, intervalMin * 60e3);
  t.unref();
  return t;
}

module.exports = { staleExperts, checkAndAlert, startPriceWatch, thresholdMin };
