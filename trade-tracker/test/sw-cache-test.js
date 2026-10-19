// Service worker : l'API (données financières) ne passe JAMAIS par le cache ; anciens caches de données supprimés ; aucun stockage navigateur de données financières.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const stores = new Map(); const handlers = {};
  const cacheOf = (n) => { if (!stores.has(n)) stores.set(n, new Map()); const m = stores.get(n); return { put: async (r, v) => { m.set(r.url, v); }, match: async (r) => m.get(r.url), add: async () => {} }; };
  stores.set('tt-v1-data', new Map([['https://t.test/api/portfolio', 'ancienne copie']]));
  const ctx = {
    self: { addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: 'https://t.test' }, skipWaiting() {}, clients: { claim() {} } },
    location: { origin: 'https://t.test' }, URL, Headers, Response, Promise,
    caches: { open: async (n) => cacheOf(n), delete: async (n) => stores.delete(n), keys: async () => [...stores.keys()] },
    fetch: async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8'), ctx);
  // activation : tout cache hors « shell » disparaît (anciennes copies de données)
  await new Promise((resolve) => handlers.activate({ waitUntil: (p) => p.then(resolve) }));
  assert(![...stores.keys()].some((k) => /data/.test(k)), 'ancien cache de données supprimé');
  // l'API n'est pas interceptée (pas de respondWith => requête directe au réseau) et rien n'est mis en cache
  const intercepted = [];
  const call = (p) => handlers.fetch({ request: { method: 'GET', url: 'https://t.test' + p, mode: 'cors' }, respondWith: (pr) => intercepted.push(p) });
  for (const p of ['/api/me', '/api/portfolio', '/api/positions', '/api/history', '/api/compare', '/api/purchases', '/api/security/audit', '/api/broker/status', '/api/invitations']) call(p);
  assert.deepStrictEqual(intercepted, [], 'aucune réponse /api fournie par le service worker');
  assert(![...stores.keys()].some((k) => /data/.test(k)) && [...stores.values()].every((m) => ![...m.keys()].some((u) => u.includes('/api/'))), 'aucune entrée /api en cache');
  call('/styles.css'); assert.deepStrictEqual(intercepted, ['/styles.css'], 'le shell (CSS/JS) reste servi par le service worker');

  // aucune donnée financière dans le stockage du navigateur : seuls la langue et les préférences d'affichage sont gardées
  const dir = path.join(__dirname, '..', 'public', 'js');
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert(!/indexedDB|sessionStorage|caches\.(open|put)|cookieStore/.test(src), f + ' : stockage navigateur interdit');
    for (const m of src.matchAll(/localStorage\.(setItem)\(([^,)]*)/g)) assert(['KEY', "'tt_lang'"].includes(m[2].trim()), f + ' : localStorage hors langue/préférences : ' + m[2]);
  }
  const prefs = fs.readFileSync(path.join(dir, 'prefs.js'), 'utf8');
  assert(/KEY = 'tt\.view\.v1'/.test(prefs) && /DEF = \{ unit: 'value', chart: 'donut', minPct: 0 \}/.test(prefs), 'préférences = affichage seulement');
  console.log('sw-cache-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
