// Parcours « + » (modifier l'activité) : états connecté / déconnecté / erreur réseau / hors ligne / refus serveur, et page Trade.
// Chaque état a un message clair, rien ne bloque. DOM et fetch simulés (vm).
const fs = require('fs'), path = require('path'), vm = require('vm');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('  ✗ ' + m); } };
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');

function el() { const e = { classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } }, attrs: {}, textContent: '', addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; }, querySelector() { return null; }, querySelectorAll() { return []; } }; return e; }
function base(fetchImpl, online) {
  const root = el(), els = {};
  const ctx = { console, JSON, Promise, Date, setTimeout, encodeURIComponent, Object, Array, Error, TypeError, String,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { onLine: online !== false },
    CustomEvent: function () {}, fetch: fetchImpl,
    document: { getElementById: (id) => els[id] || null, documentElement: root, querySelector: () => null, dispatchEvent() {}, addEventListener() {} } };
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.TMT = {};
  ctx.window.TMT = ctx.TMT; ctx.TMT.getProfile = () => ({ id: 'p1' });
  ctx.els = els; ctx.root = root;
  return vm.createContext(ctx);
}
const json = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
const okMods = (trade) => json(200, { modules: { stats: true, roadmap: true, community: true, trade }, tradeAllowed: true });

(async () => {
  // --- modules.js : setTrade ---
  let mode = 'ok';
  const f = (url, o) => {
    if (!o || o.method !== 'PUT') return okMods(false);
    if (mode === 'net') return Promise.reject(new TypeError('Failed to fetch'));
    if (mode === 'refus') return json(403, { error: 'Trade Tracker n\'est pas disponible pour ce compte.' });
    if (mode === 'mute') return Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('html')) });
    return okMods(JSON.parse(o.body).modules.trade);
  };
  let ctx = base(f);
  vm.runInContext(src('modules.js'), ctx);
  await new Promise((r) => setTimeout(r, 20));
  const M = ctx.TMT.modules;
  ok(M.tradeAllowed() === true && M.tradeOn() === false, 'déconnecté : « + » proposé');
  let r = await M.setTrade(true);
  ok(r.ok === true && M.tradeOn() === true, 'connecté après « + »');
  ok(ctx.root.attrs['data-trade-on'] !== undefined, 'volet Trade affiché une fois connecté');
  r = await M.setTrade(false);
  ok(r.ok === true && M.tradeOn() === false, 'retrait : déconnecté');
  mode = 'net'; r = await M.setTrade(true);
  ok(r.ok === false && /indisponible/.test(r.message) && !/fetch/i.test(r.message) && M.tradeOn() === false, 'erreur réseau : message clair, état inchangé, pas de message technique');
  ctx.navigator.onLine = false; r = await M.setTrade(true);
  ok(r.ok === false && /Hors ligne/.test(r.message), 'hors ligne : message hors ligne');
  ctx.navigator.onLine = true; mode = 'refus'; r = await M.setTrade(true);
  ok(r.ok === false && /pas disponible/.test(r.message), 'refus serveur : son message');
  mode = 'mute'; r = await M.setTrade(true);
  ok(r.ok === false && r.message && M.tradeOn() === false, 'réponse serveur illisible : message présent');
  mode = 'ok'; r = await M.setTrade(true);
  ok(r.ok === true, 'réessai après erreur : fonctionne (rien de bloqué)');

  // --- trade.js : ouverture ---
  async function openWith(fetchImpl, online) {
    const c = base(fetchImpl, online);
    ['tradePage', 'tradeFrame', 'tradeState', 'tradeOpenExternal', 'tradePageClose'].forEach((id) => { c.els[id] = el(); });
    vm.runInContext(src('trade.js'), c);
    c.TMT.openTrade(); await new Promise((r2) => setTimeout(r2, 20));
    return c.els.tradeState;
  }
  let st = await openWith(() => json(200, { configured: true, url: 'https://t.example/link' }));
  ok(st.classList.contains('hidden'), 'Trade configuré : iframe affichée');
  st = await openWith(() => json(200, { configured: false }));
  ok(/pas configuré/.test(st.textContent), 'non configuré : message');
  st = await openWith(() => json(403, { error: 'Module désactivé : « Trade Tracker ».' }));
  ok(/Module désactivé/.test(st.textContent), 'module retiré : message serveur');
  st = await openWith(() => Promise.reject(new TypeError('Failed to fetch')));
  ok(/indisponible/.test(st.textContent) && !/fetch/i.test(st.textContent), 'erreur réseau : message clair');
  st = await openWith(() => Promise.reject(new TypeError('Failed to fetch')), false);
  ok(/Hors ligne/.test(st.textContent), 'hors ligne : message clair');
  st = await openWith(() => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('x')) }));
  ok(st.textContent && !/undefined/.test(st.textContent), 'réponse illisible : message présent');

  // --- app.js : le clic « + » affiche le message dans le formulaire ---
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  ok(/tradeMsg\(r\)/.test(app) && /plus\.disabled = true/.test(app), 'app.js : message affiché dans l\'activité, double appui évité');

  console.log(bad ? '✗ ' + bad + ' échec(s)' : '✓ connexion Trade (états + / retrait / réseau / hors ligne) OK');
  process.exit(bad ? 1 : 0);
})();
