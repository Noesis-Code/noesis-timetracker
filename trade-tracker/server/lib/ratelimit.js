// Limiteur de débit en mémoire (fenêtre fixe, par clé). Suffisant pour un seul réplica.
function createLimiter({ max, windowMs = 60000, now = () => Date.now() }) {
  const hits = new Map();
  return function limit(keyOf) {
    return (req, res, next) => {
      const t = now(), k = keyOf(req);
      let h = hits.get(k);
      if (!h || h.reset <= t) { h = { n: 0, reset: t + windowMs }; hits.set(k, h); }
      h.n++;
      if (hits.size > 5000) for (const [key, v] of hits) if (v.reset <= t) hits.delete(key);
      if (h.n > max) {
        res.setHeader('Retry-After', String(Math.ceil((h.reset - t) / 1000)));
        return res.status(429).json({ error: 'rate_limited', message: 'Trop de requêtes, réessayez plus tard.' });
      }
      next();
    };
  };
}
module.exports = { createLimiter };
