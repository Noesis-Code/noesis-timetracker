// Usage : node test/trade-e2e-test.js — bout en bout TMT <-> Trade Tracker : DEUX serveurs réels (ports 3968 et 3969),
// bases séparées (mktemp), secrets de test, aucun réseau externe. Les envois push de TMT sont interceptés (web-push remplacé
// par un enregistreur de fichier via --require) : aucune vraie notification.
const os = require('os'), fs = require('fs'), path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// Ports libres choisis dynamiquement (jamais de collision avec un serveur orphelin ou un autre chantier).
const [TMT_PORT, TRADE_PORT] = JSON.parse(execFileSync('node', ['-e', `
const net = require('net'); const get = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
Promise.all([get(), get()]).then((p) => console.log(JSON.stringify(p)));`], { encoding: 'utf8' }));
try { require.resolve('@simplewebauthn/server', { paths: [path.join(ROOT, 'trade-tracker')] }); }
catch (e) { console.error('Dépendances de Trade absentes. Exécuter une fois : cd trade-tracker && npm ci  (ou scripts/new-worktree.sh, qui lie node_modules)'); process.exit(1); }
const TMT = 'http://localhost:' + TMT_PORT, TRADE = 'http://localhost:' + TRADE_PORT;
const tmtDir = require('./lib/tmpdir').mkTmp('e2e-tmt-');
const tradeDir = require('./lib/tmpdir').mkTmp('e2e-trade-');
const pushLog = path.join(tmtDir, 'push-log.jsonl');
const stub = path.join(tmtDir, 'push-stub.js');
fs.writeFileSync(stub, `const wp = require(${JSON.stringify(require.resolve('web-push', { paths: [ROOT] }))});
wp.sendNotification = (sub, body) => { require('fs').appendFileSync(${JSON.stringify(pushLog)}, JSON.stringify({ endpoint: sub.endpoint, body: JSON.parse(body) }) + '\\n'); return Promise.resolve(); };
`);
const vapid = require(require.resolve('web-push', { paths: [ROOT] })).generateVAPIDKeys();

const LINK_SECRET = 'e2e-link-secret-0123456789';
const NOTIFY_SECRET = 'e2e-notify-secret-0123456789';
const EXPERT = 'e2e-expert', CLIENT = 'e2e-client', OTHER = 'e2e-other';
const envTmt = {
  ...process.env, NOESIS_DATA_DIR: tmtDir, PORT: String(TMT_PORT), TRADE_LINK_SECRET: LINK_SECRET, TRADE_NOTIFY_SECRET: NOTIFY_SECRET,
  TRADE_ALLOWED_USER_IDS: EXPERT + ',' + CLIENT, TRADE_BASE_URL: TRADE, NOESIS_VAPID_PUBLIC_KEY: vapid.publicKey, NOESIS_VAPID_PRIVATE_KEY: vapid.privateKey,
  NODE_OPTIONS: '--require ' + stub,
};
const envTrade = {
  ...process.env, NOESIS_DATA_DIR: tradeDir, PORT: String(TRADE_PORT), TRADE_LINK_SECRET: LINK_SECRET, TRADE_NOTIFY_SECRET: NOTIFY_SECRET,
  TRADE_TOKEN_KEY: 'e2e-token-key-0123456789', TRADE_EXPERT_TMT_IDS: EXPERT, TMT_BASE_URL: TMT, TRADE_ADMIN_TOKEN: 'e2e-admin-token-0123456789',
  TRADE_SYNC_DISABLE: '1', TRADE_CONNECTOR: 'demo',
};

let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pushes = () => (fs.existsSync(pushLog) ? fs.readFileSync(pushLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// Prépare la base TMT (profils + abonnement push + témoins de session) dans un processus à part, avant le démarrage du serveur.
const prep = execFileSync('node', ['-e', `
const db = require('./server/db');
const sess = require('./server/lib/session');
const out = {};
for (const id of [${JSON.stringify(EXPERT)}, ${JSON.stringify(CLIENT)}, ${JSON.stringify(OTHER)}]) {
  db.prepare("INSERT INTO users (id, name, lang, createdAt) VALUES (?, ?, 'fr', '2026-01-01')").run(id, id);
  let c = ''; sess.setSessionCookie({ secure: false, headers: {} }, { append: (k, v) => { c = v.split(';')[0]; } }, id); out[id] = c;
}
db.prepare("INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, createdAt) VALUES (?, 'https://push.invalid/expert', 'p', 'a', '2026')").run(${JSON.stringify(EXPERT)});
console.log(JSON.stringify(out));`], { cwd: ROOT, env: envTmt, encoding: 'utf8' });
const cookies = JSON.parse(prep.trim().split('\n').pop());

const procs = [];
const killAll = () => procs.forEach((p) => { try { p.kill('SIGKILL'); } catch (e) { /* déjà arrêté */ } });
process.on('exit', killAll);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));
function start(file, env, port, label) {
  const p = spawn('node', [file], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', (d) => process.stderr.write('[' + label + '] ' + d));
  procs.push(p);
  return p;
}
async function waitUp(url) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch (e) { /* pas encore */ } await sleep(250); }
  throw new Error('serveur non démarré : ' + url);
}
const tmtGet = (p, who) => fetch(TMT + p, { headers: who ? { Cookie: cookies[who] } : {} });
const setCookie = (r) => ((r.headers.get('set-cookie') || '').match(/tt_session=[^;]+/) || [''])[0];

// Exécute un morceau de code Trade Tracker (même base que le serveur Trade), notifieur réel vers TMT.
function tradeScript(code) {
  return execFileSync('node', ['-e', `(async () => {
    const { openDb } = require('./trade-tracker/server/db');
    const { syncAll } = require('./trade-tracker/server/lib/sync');
    const { createNotifier } = require('./trade-tracker/server/lib/notifier');
    const demo = require('./trade-tracker/server/lib/connectors/demo');
    const db = openDb();
    ${code}
  })().catch((e) => { console.error(e); process.exit(1); });`], { cwd: ROOT, env: envTrade, encoding: 'utf8' }).trim();
}

(async () => {
  start(path.join(ROOT, 'server', 'index.js'), envTmt, TMT_PORT, 'tmt');
  start(path.join(ROOT, 'trade-tracker', 'server', 'index.js'), envTrade, TRADE_PORT, 'trade');
  await waitUp(TMT + '/api/health').catch(() => waitUp(TMT + '/'));
  await waitUp(TRADE + '/api/health');
  const tradeLib = require('../server/lib/tradelink');

  // 1. Module off / non autorisé
  let r = await tmtGet('/api/trade/link', EXPERT);
  assert(r.status === 403, 'module trade off : GET /api/trade/link -> 403');
  r = await tmtGet('/api/trade/link', OTHER);
  assert(r.status === 403, 'id non autorisé : 403');
  r = await tmtGet('/api/trade/link');
  assert(r.status === 401 || r.status === 403, 'sans session : refusé');

  // 2. Activation (id autorisé) et lien signé
  r = await fetch(TMT + '/api/profile/' + EXPERT + '/modules', { method: 'PUT', headers: { Cookie: cookies[EXPERT], 'Content-Type': 'application/json' }, body: JSON.stringify({ modules: { trade: true } }) });
  assert(r.status === 200, 'activation du module trade pour un id autorisé');
  r = await fetch(TMT + '/api/profile/' + OTHER + '/modules', { method: 'PUT', headers: { Cookie: cookies[OTHER], 'Content-Type': 'application/json' }, body: JSON.stringify({ modules: { trade: true } }) });
  assert(r.status === 403, 'activation refusée pour un id non autorisé');
  r = await tmtGet('/api/trade/link', EXPERT);
  const link = await r.json();
  assert(r.status === 200 && link.configured && link.url.startsWith(TRADE + '/link?token='), 'GET /api/trade/link renvoie une URL vers Trade');

  // 3. Trade : /link crée une session ; rejeu, falsifié, expiré refusés
  r = await fetch(link.url, { redirect: 'manual' });
  let expertSession = setCookie(r);
  assert(r.status === 302 && r.headers.get('location') === '/' && expertSession, '/link?token= : 302 vers / + cookie tt_session');
  r = await fetch(TRADE + '/api/me', { headers: { Cookie: expertSession } });
  let me = await r.json();
  assert(r.status === 200 && me.role === 'expert', 'session valide : /api/me expert');
  r = await fetch(TRADE + '/api/portfolio', { headers: { Cookie: expertSession } });
  assert(r.status === 403, 'expert : rien avant la vérification en deux étapes');
  expertSession = (await require('../trade-tracker/test/mfa-helper').enrollAndVerify(TRADE, expertSession)).cookie;
  r = await fetch(link.url, { redirect: 'manual' });
  assert(r.status === 302 && /linkError=denied/.test(r.headers.get('location')) && !setCookie(r), 'jeton rejoué (usage unique) : refusé');
  const tok = decodeURIComponent(link.url.split('token=')[1]);
  const [pl, sg] = tok.split('.');
  r = await fetch(TRADE + '/link?token=' + encodeURIComponent(pl + '.' + sg.slice(0, -2) + (sg.endsWith('AA') ? 'BB' : 'AA')), { redirect: 'manual' });
  assert(r.status === 302 && /linkError=denied/.test(r.headers.get('location')) && !setCookie(r), 'jeton falsifié : invalid');
  const old = tradeLib.signLinkToken({ sub: EXPERT, name: 'x', ua: 'node' }, LINK_SECRET, Date.now() - 10 * 60 * 1000);
  r = await fetch(TRADE + '/link?token=' + encodeURIComponent(old), { redirect: 'manual' });
  assert(r.status === 302 && /linkError=expired/.test(r.headers.get('location')) && !setCookie(r), 'jeton expiré : expired');
  r = await fetch(TRADE + '/api/me');
  assert(r.status === 401, 'sans cookie : 401');

  // 4. Seed de démo (expert + client) : la première synchro ne notifie pas l'historique
  const first = tradeScript(`
    db.prepare("INSERT OR IGNORE INTO tt_users (tmtUserId, name, email, role) VALUES (?,?,?,?)").run(${JSON.stringify(CLIENT)}, 'Client E2E', 'client@e2e.invalid', 'client');
    const res = await syncAll(db, { connector: demo.createDemoConnector(), notifier: createNotifier() });
    console.log(JSON.stringify({ res, events: db.prepare('SELECT COUNT(*) n FROM events').get().n }));`);
  const f = JSON.parse(first.split('\n').pop());
  assert(f.res.every((x) => x.ok && x.first) && f.events === 0, 'première synchro : OK, aucun événement pour l\'historique');
  await sleep(300);
  assert(pushes().length === 0, 'première synchro : aucune notification push');

  // 5. Nouvel achat de l'expert -> événement -> POST signé -> notification
  const second = tradeScript(`
    const fx = JSON.parse(JSON.stringify(demo.EXPERT_FIXTURE));
    fx.accounts[0].transactions.push({ externalId: 'E-NEW', date: '2026-10-19', type: 'ACHAT', symbol: 'NEW.TO', quantity: 30, price: 10, amount: 300, currency: 'CAD' });
    fx.accounts[0].positions.push({ symbol: 'NEW.TO', name: 'Nouveau Démo', sector: 'Or', currency: 'CAD', quantity: 30, avgCost: 10, lastPrice: 10 });
    const connector = demo.createDemoConnector({ fixtures: { ${JSON.stringify(EXPERT)}: fx } });
    const res = await syncAll(db, { connector, notifier: createNotifier() });
    const ev = db.prepare('SELECT id, notifyStatus, notifyAttempts FROM events').all();
    console.log(JSON.stringify({ res, ev }));`);
  const s = JSON.parse(second.split('\n').pop());
  assert(s.ev.length === 1 && s.ev[0].notifyStatus === 'SENT', 'nouvel achat : 1 événement, envoyé à TMT (SENT)');
  await sleep(300);
  let pl2 = pushes();
  assert(pl2.length === 1 && pl2[0].body.title === 'Trade Tracker' && /Nouvel achat : NEW\.TO — 30 × 10/.test(pl2[0].body.body) && pl2[0].body.url.startsWith('/?notif=trade&symbol=NEW.TO'), 'TMT a créé la notification push attendue');
  // rejeu du même événement : idempotent
  tradeScript(`db.prepare("UPDATE events SET notifyStatus='PENDING', notifyAttempts=0").run();
    const { notifyPending } = require('./trade-tracker/server/lib/notifier');
    const out = await notifyPending(db, createNotifier());
    console.log(JSON.stringify(out.map((o) => o.status)));`);
  await sleep(300);
  assert(pushes().length === 1, 'rejeu du même événement : accepté, pas de 2e notification');
  // synchro suivante sans nouvel achat : rien de nouveau
  tradeScript(`const fx = JSON.parse(JSON.stringify(demo.EXPERT_FIXTURE));
    fx.accounts[0].transactions.push({ externalId: 'E-NEW', date: '2026-10-19', type: 'ACHAT', symbol: 'NEW.TO', quantity: 30, price: 10, amount: 300, currency: 'CAD' });
    fx.accounts[0].positions.push({ symbol: 'NEW.TO', name: 'Nouveau Démo', sector: 'Or', currency: 'CAD', quantity: 30, avgCost: 10, lastPrice: 10 });
    await syncAll(db, { connector: demo.createDemoConnector({ fixtures: { ${JSON.stringify(EXPERT)}: fx } }), notifier: createNotifier() });`);
  await sleep(300);
  assert(pushes().length === 1, 'synchro suivante sans nouvel achat : aucune notification');

  // 6. Achats et comparaison
  r = await fetch(TRADE + '/api/purchases', { headers: { Cookie: expertSession } });
  const pu = await r.json();
  assert(r.status === 200 && pu.purchases.some((p) => p.symbol === 'NEW.TO' && p.quantity === 30), '/api/purchases liste le nouvel achat');
  const cl = await fetch(TRADE + '/link?token=' + encodeURIComponent(tradeLib.signLinkToken({ sub: CLIENT, name: 'Client E2E', ua: 'node' }, LINK_SECRET)), { redirect: 'manual' });
  const clientSession = setCookie(cl);
  assert(cl.status === 302 && clientSession, 'client existant : session créée');
  r = await fetch(TRADE + '/api/compare', { headers: { Cookie: clientSession } });
  const cmp = await r.json();
  const sum = (a, k) => a.reduce((t, x) => t + x[k], 0);
  assert(r.status === 200 && Math.abs(sum(cmp.bySector, 'clientPct') - 100) < 0.05 && Math.abs(sum(cmp.bySector, 'expertPct') - 100) < 0.05, 'compare : poids sectoriels = 100 % de chaque côté');
  assert(cmp.bySector.concat(cmp.byPosition).every((x) => Math.abs(x.gapPts - (x.clientPct - x.expertPct)) < 0.02), 'compare : écart = client - expert');
  assert(cmp.byPosition.some((x) => x.symbol === 'NEW.TO' && x.clientPct === 0 && x.expertPct > 0), 'compare : le nouvel achat de l\'expert apparaît chez l\'expert seulement');
  r = await fetch(TRADE + '/api/compare', { headers: { Cookie: expertSession } });
  const ce = await r.json();
  assert(r.status === 200 && ce.bySector.concat(ce.byPosition).every((x) => x.gapPts === 0), 'compare : expert contre lui-même = écarts nuls');

  // 7. Intégration TMT <-> Trade (chantier 1, repli 15) : retrait, comptes, navigateur, liste « modifier l'activité »
  const putMod = (who, v) => fetch(TMT + '/api/profile/' + who + '/modules', { method: 'PUT', headers: { Cookie: cookies[who], 'Content-Type': 'application/json' }, body: JSON.stringify({ modules: { trade: v } }) });
  const getMod = async (who) => (await (await tmtGet('/api/profile/' + who + '/modules', who)).json());
  let gm = await getMod(EXPERT);
  assert(gm.tradeAllowed === true && gm.modules.trade === true && gm.list.some((m) => m.id === 'trade'), 'activé : le « + » de l\'activité voit Trade (tradeAllowed, état actif, listé)');
  assert((await getMod(OTHER)).tradeAllowed === false && !(await getMod(OTHER)).list.some((m) => m.id === 'trade'), 'compte non autorisé : tradeAllowed faux, Trade non listé');
  r = await tmtGet('/api/trade/link', EXPERT);
  const linkBeforeOff = await r.json();
  r = await putMod(EXPERT, false);
  assert(r.status === 200, 'retrait de Trade de l\'activité (module désactivé)');
  gm = await getMod(EXPERT);
  assert(gm.modules.trade === false && gm.list.some((m) => m.id === 'trade'), 'après retrait : état inactif, Trade reste proposé au « + »');
  r = await tmtGet('/api/trade/link', EXPERT);
  assert(r.status === 403 && (await r.json()).code === 'module_off', 'après retrait : nouveau lien refusé (module_off)');
  r = await fetch(linkBeforeOff.url, { redirect: 'manual' });
  assert(r.status === 302 && r.headers.get('location') === '/' && !!setCookie(r), 'lien émis AVANT le retrait : valable jusqu\'à 2 min, usage unique (limite connue, aucune donnée perdue)');
  r = await putMod(EXPERT, true);
  assert(r.status === 200 && (await getMod(EXPERT)).modules.trade === true, 'réactivation : état actif de nouveau');
  r = await tmtGet('/api/trade/link', CLIENT);
  assert(r.status === 403, 'module jamais activé (id autorisé) : lien refusé');
  // tradeAllowed retiré alors que le module est stocké actif : refusé et masqué (lecture directe de la base, liste d'autorisés vide)
  const off = JSON.parse(execFileSync('node', ['-e', `
const m = require('./server/lib/modules');
console.log(JSON.stringify({ en: m.isEnabled(${JSON.stringify(EXPERT)}, 'trade'), st: m.getModules(${JSON.stringify(EXPERT)}).trade, listed: m.list(${JSON.stringify(EXPERT)}).some((x) => x.id === 'trade'), allowed: m.isTradeAllowed(${JSON.stringify(EXPERT)}) }));`], { cwd: ROOT, env: { ...envTmt, TRADE_ALLOWED_USER_IDS: '' }, encoding: 'utf8' }).trim().split('\n').pop());
  assert(off.en === false && off.st === false && off.listed === false && off.allowed === false, 'tradeAllowed retiré : module inactif, masqué, jamais actif malgré la valeur stockée');
  // Comptes et navigateurs : jetons valides mais non admis
  const tokAs = (sub, ua) => tradeLib.signLinkToken({ sub, name: sub, ua }, LINK_SECRET, Date.now());
  r = await fetch(TRADE + '/link?token=' + encodeURIComponent(tokAs(OTHER, 'node')), { redirect: 'manual' });
  assert(r.status === 302 && /linkError=/.test(r.headers.get('location')) && !setCookie(r), 'lien d\'un compte non invité : refusé, aucune session');
  r = await fetch(TRADE + '/link?token=' + encodeURIComponent(tokAs('e2e-stranger', 'node')), { redirect: 'manual' });
  assert(r.status === 302 && /linkError=/.test(r.headers.get('location')) && !setCookie(r), 'lien d\'un compte autorisé mais non invité par l\'expert : refusé');
  r = await tmtGet('/api/trade/link', EXPERT);
  const linkUa = await r.json();
  r = await fetch(linkUa.url, { redirect: 'manual', headers: { 'User-Agent': 'autre-navigateur/1.0' } });
  assert(r.status === 302 && /linkError=/.test(r.headers.get('location')) && !setCookie(r), 'lien ouvert dans un autre navigateur : refusé');
  const secret2 = tradeLib.signLinkToken({ sub: EXPERT, name: 'x', ua: 'node' }, 'autre-secret-0123456789', Date.now());
  r = await fetch(TRADE + '/link?token=' + encodeURIComponent(secret2), { redirect: 'manual' });
  assert(r.status === 302 && /linkError=denied/.test(r.headers.get('location')) && !setCookie(r), 'jeton signé avec un autre secret : refusé');
})().catch((e) => { failed++; console.log('  FAIL erreur : ' + (e && e.stack || e)); }).finally(() => {
  procs.forEach((p) => p.kill());
  for (const d of [tmtDir, tradeDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* sans conséquence */ } }
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  console.log('Trade E2E : tout passe');
  process.exit(0);
});
