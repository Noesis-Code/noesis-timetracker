// Sécurité de POST /offer/checkout (20 oct. 2026, repli 20) : (1) chemins de retour hostiles (//, \\, encodés, schémas
// javascript:/data:, @, retours à la ligne, tabulation, NUL) ne sortent jamais de l'origine de la requête ;
// (2) la réutilisation de session (10 s) est propre à l'utilisateur ET à l'offre/activité : deux comptes, deux
// activités ou deux déclarations d'âge ne partagent jamais une session. Aucun réseau (fetch simulé).
// Usage : node test/expansion-checkout-securite-test.js
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('exp-cosec-');
process.env.STRIPE_OFFER1_PRICE_ID = 'price_test_local';
process.env.STRIPE_SECRET_KEY = 'sk_test_local';
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const express = require('express');
const db = require('../server/db');

let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };

const sessions = [];
global.fetch = async (url, opts) => {
  await new Promise((r) => setTimeout(r, 60));
  const p = new URLSearchParams(opts.body);
  sessions.push({ success: p.get('success_url'), cancel: p.get('cancel_url'), activityId: p.get('metadata[activityId]'), userId: p.get('metadata[userId]') });
  return { ok: true, status: 200, json: async () => ({ id: 'cs_' + sessions.length, url: 'https://checkout.stripe.test/c/' + sessions.length }) };
};

const app = express();
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-user']; next(); });
app.use(require('../server/routes/offercheckout'));

function call(port, user, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ port, method: 'POST', path: '/offer/checkout', headers: { 'Content-Type': 'application/json', 'x-user': user, Host: 'web-staging.example' } }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* vide */ } resolve({ status: res.statusCode, json: j }); });
    });
    r.on('error', reject); r.end(JSON.stringify(body));
  });
}

(async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const now = new Date().toISOString();
  for (const u of ['uA', 'uB']) db.prepare("INSERT INTO users (id, name, email, phone, createdAt) VALUES (?,?,?,?,?)").run(u, u, u + '@exemple.test', '5145550100', now);
  let n = 0;
  const mkAct = (owner, name) => { const id = Number(db.prepare('INSERT INTO activities (name, ownerId, createdAt) VALUES (?,?,?)').run(name || 'A' + (++n), owner, now).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(id, owner); return id; };
  const body = (id, extra) => Object.assign({ ageDeclaration: 'adult', activityChoice: { activityId: id } }, extra || {});
  const OK_S = 'http://web-staging.example/?achat=succes', OK_C = 'http://web-staging.example/?achat=annule';

  // (1) Chemins hostiles : retour par défaut ; et, même si un chemin passait, l'URL commence toujours par l'origine.
  const hostile = [
    '//evil.example', '///evil.example', '/\\evil.example', '\\\\evil.example', '\\evil.example', '/\\/evil.example',
    '%2F%2Fevil.example', '/%5Cevil.example@x', 'https://evil.example', 'http://evil.example/x', 'javascript:alert(1)', '/javascript:alert(1)@x',
    'data:text/html,x', 'vbscript:x', ' //evil.example', '//evil.example/%2e%2e', '/ok\nLocation: https://evil.example', '/ok\r\nX: y', '/ok\tx', '/ok\u0000x',
    '/@evil.example', '/a@b', 'evil.example', '', '?achat=succes', '#x',
  ];
  for (const bad of hostile) {
    sessions.length = 0;
    const r = await call(port, 'uA', body(mkAct('uA'), { successPath: bad, cancelPath: bad }));
    ok(r.status === 201 && sessions[0].success === OK_S && sessions[0].cancel === OK_C, 'chemin hostile ignoré : ' + JSON.stringify(bad));
  }
  // Types non texte : ignorés aussi.
  for (const bad of [null, 5, ['/x'], { a: 1 }, true]) {
    sessions.length = 0;
    const r = await call(port, 'uA', body(mkAct('uA'), { successPath: bad, cancelPath: bad }));
    ok(r.status === 201 && sessions[0].success === OK_S && sessions[0].cancel === OK_C, 'valeur non texte ignorée : ' + JSON.stringify(bad));
  }
  // Chemins locaux légitimes (y compris encodés : restent des chemins sur la même origine) : toujours préfixés par l'origine.
  for (const good of ['/?achat=succes&x=1', '/a/b?c=d#e', '/%2F%2Fevil.example']) {
    sessions.length = 0;
    await call(port, 'uA', body(mkAct('uA'), { successPath: good }));
    ok(sessions[0] && sessions[0].success === 'http://web-staging.example' + good, 'chemin local gardé sous l\'origine : ' + good);
  }
  ok(sessions.every((s) => s.success.startsWith('http://web-staging.example/')), 'toute URL de retour commence par l\'origine de la requête');

  // (2) Réutilisation de session : même utilisateur + même offre = même session ; autre compte, autre activité, autre âge = nouvelle.
  const shared = mkAct('uA', 'Partagée');
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(shared, 'uB'); // activité commune aux deux comptes
  sessions.length = 0;
  const a1 = await call(port, 'uA', body(shared));
  const a2 = await call(port, 'uA', body(shared));
  ok(a1.status === 201 && a2.status === 201 && a1.json.url === a2.json.url && sessions.length === 1, 'même compte, même activité, <10 s : même session');
  const b1 = await call(port, 'uB', body(shared));
  ok(b1.status === 201 && b1.json.url !== a1.json.url && sessions.length === 2 && sessions[1].userId === 'uB', 'autre compte, MÊME activité : session distincte, metadata.userId = uB');
  const [pa, pb] = await Promise.all([call(port, 'uA', body(mkAct('uA', 'Course'))), call(port, 'uB', body(shared, { successPath: '/?achat=succes&b=1' }))]);
  ok(pa.json.url !== pb.json.url, 'requêtes simultanées de deux comptes : sessions distinctes');
  const other = mkAct('uA');
  const c1 = await call(port, 'uA', body(other));
  ok(c1.json.url !== a1.json.url, 'même compte, autre activité : session distincte');
  const sameIdOtherUser = await call(port, 'uB', body(other)); // uB n'est pas membre de « other »
  ok(sameIdOtherUser.status === 400 && !sameIdOtherUser.json.url, 'un compte ne reçoit jamais la session d\'un autre sur une activité dont il n\'est pas membre (400)');
  // Nouvelle activité de même nom pour deux comptes : une activité chacun, deux sessions.
  sessions.length = 0;
  const nn = { ageDeclaration: 'adult', activityChoice: { newActivityName: 'Même nom' } };
  const [n1, n2] = await Promise.all([call(port, 'uA', nn), call(port, 'uB', nn)]);
  const rows = db.prepare("SELECT ownerId FROM activities WHERE name = 'Même nom' ORDER BY ownerId").all().map((r) => r.ownerId);
  ok(n1.status === 201 && n2.status === 201 && n1.json.url !== n2.json.url && rows.join() === 'uA,uB' && sessions.length === 2, 'même nom d\'activité, deux comptes : deux activités, deux sessions');
  // Sans session : refusé.
  const anon = await call(port, '', body(shared));
  ok(anon.status === 401, 'sans session : 401 (aucune session réutilisable)');

  server.close();
  console.log(failed ? `\n${failed} échec(s)` : '\nTout est ok');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
