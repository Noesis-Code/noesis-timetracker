// Limitation de débit des routes d'écriture (POST/PUT/PATCH/DELETE sous /api).
// Fenêtre glissante en mémoire, par utilisateur (si session) et par IP.
// Seuils généreux : jamais gênants pour un usage normal. Aucune dépendance.
//   NOESIS_RATE_LIMIT_OFF=1        désactive (aussi si NODE_ENV=test)
//   NOESIS_RATE_USER_PER_MIN       défaut 120 écritures/min par utilisateur
//   NOESIS_RATE_IP_PER_MIN         défaut 300 écritures/min par IP
// L'IP vient de req.ip ('trust proxy' = 1 dans index.js : X-Forwarded-For de Railway).
// La connexion (verify-pin) garde sa limite propre (loginIpLimited, routes/profile.js).
const WINDOW_MS = 60 * 1000;
const EXCLUDED = [/^\/api\/stripe\//, /^\/api\/webhooks\//, /^\/api\/trade-events(\/|$)/];

function num(v, d) { const n = Number(v); return n > 0 ? n : d; }

function createLimiter(opts = {}) {
  const userMax = opts.userMax || 120;
  const ipMax = opts.ipMax || 300;
  const windowMs = opts.windowMs || WINDOW_MS;
  const now = opts.now || Date.now;
  const hits = new Map(); // clé -> timestamps (ms) dans la fenêtre
  let lastSweep = now();

  function sweep(t) {
    lastSweep = t;
    for (const [k, arr] of hits) {
      if (!arr.length || t - arr[arr.length - 1] >= windowMs) hits.delete(k);
    }
  }
  // Enregistre un coup ; renvoie 0 si permis, sinon les secondes avant réessai.
  function hit(key, max, t) {
    let arr = hits.get(key);
    if (!arr) { arr = []; hits.set(key, arr); }
    while (arr.length && t - arr[0] >= windowMs) arr.shift();
    if (arr.length >= max) return Math.max(1, Math.ceil((arr[0] + windowMs - t) / 1000));
    arr.push(t);
    return 0;
  }
  function check(ip, userId) {
    const t = now();
    if (t - lastSweep > windowMs) sweep(t);
    const r = Math.max(
      hit('ip:' + (ip || 'inconnu'), ipMax, t),
      userId ? hit('u:' + userId, userMax, t) : 0
    );
    return r;
  }
  return { check, _size: () => hits.size };
}

function middleware(opts = {}) {
  const off = () => process.env.NOESIS_RATE_LIMIT_OFF === '1' || process.env.NODE_ENV === 'test';
  const lim = createLimiter({
    userMax: num(process.env.NOESIS_RATE_USER_PER_MIN, 120),
    ipMax: num(process.env.NOESIS_RATE_IP_PER_MIN, 300),
    ...opts,
  });
  return (req, res, next) => {
    if (off()) return next();
    if (!/^(POST|PUT|PATCH|DELETE)$/.test(req.method)) return next();
    const p = req.originalUrl.split('?')[0];
    if (!p.startsWith('/api/') || EXCLUDED.some((re) => re.test(p))) return next();
    const retryAfter = lim.check(req.ip, req.userId);
    if (!retryAfter) return next();
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Trop d’essais. Réessaie dans quelques minutes.`, retryAfter });
  };
}

module.exports = { createLimiter, middleware };
