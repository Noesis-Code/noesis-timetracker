// Verrouillage progressif anti-force brute (par compte ET par adresse IP), persistant (survit aux redémarrages).
// Après `threshold` échecs, délai = 30 s, 60 s, 120 s ... plafonné à 1 h. Pendant un verrouillage on NE VÉRIFIE PAS le code (un bon code ne passe pas non plus).
// Le compteur d'un compte retombe à zéro après un succès ou 24 h sans échec. Les réponses ne disent jamais si un compte existe.
const iso = (ms) => new Date(ms).toISOString();
const BASE_S = 30, MAX_S = 3600, DECAY_MS = 24 * 3600 * 1000;

function delaySeconds(fails, threshold) { return fails < threshold ? 0 : Math.min(MAX_S, BASE_S * 2 ** (fails - threshold)); }

function read(db, key, now) {
  const r = db.prepare('SELECT fails, lastFailAt, lockedUntil FROM auth_lockouts WHERE key = ?').get(key);
  if (!r) return { fails: 0, lockedUntil: null };
  if (Date.parse(r.lastFailAt) < now - DECAY_MS) { db.prepare('DELETE FROM auth_lockouts WHERE key = ?').run(key); return { fails: 0, lockedUntil: null }; }
  return r;
}
// { locked, retryAfter (s) }
function status(db, key, now = Date.now()) {
  const r = read(db, key, now);
  const until = r.lockedUntil ? Date.parse(r.lockedUntil) : 0;
  return until > now ? { locked: true, retryAfter: Math.ceil((until - now) / 1000), fails: r.fails } : { locked: false, retryAfter: 0, fails: r.fails };
}
// Enregistre un échec ; retourne { fails, locked, retryAfter }.
function fail(db, key, { threshold = 5, now = Date.now() } = {}) {
  const r = read(db, key, now), fails = r.fails + 1, d = delaySeconds(fails, threshold);
  db.prepare(`INSERT INTO auth_lockouts (key, fails, lastFailAt, lockedUntil) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, lastFailAt = excluded.lastFailAt, lockedUntil = excluded.lockedUntil`)
    .run(key, fails, iso(now), d ? iso(now + d * 1000) : null);
  if (Math.random() < 0.02) db.prepare('DELETE FROM auth_lockouts WHERE lastFailAt < ?').run(iso(now - 7 * DECAY_MS));
  return { fails, locked: d > 0, retryAfter: d };
}
function clear(db, key) { db.prepare('DELETE FROM auth_lockouts WHERE key = ?').run(key); }

// Seuil d'échecs par adresse IP : large, car une IP partagée (NAT d'entreprise) réunit plusieurs comptes ; le seuil par compte (5) reste le garde ciblé.
const IP_THRESHOLD = 30;
module.exports = { delaySeconds, status, fail, clear, IP_THRESHOLD };
