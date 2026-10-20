// Purge des cles d'idempotence de plus de 7 jours (20 oct. 2026) : au demarrage puis une fois par jour.
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function purgeIdempotencyKeys(db, now = Date.now()) {
  const limite = new Date(now - MAX_AGE_MS).toISOString();
  return db.prepare('DELETE FROM idempotency_keys WHERE createdAt < ?').run(limite).changes;
}

function startIdempotencyPurge(db) {
  try { purgeIdempotencyKeys(db); } catch (e) { console.error('[idempotence] purge :', e.message); }
  const t = setInterval(() => {
    try { purgeIdempotencyKeys(db); } catch (e) { console.error('[idempotence] purge :', e.message); }
  }, 24 * 3600 * 1000);
  if (t.unref) t.unref();
}

module.exports = { purgeIdempotencyKeys, startIdempotencyPurge };
