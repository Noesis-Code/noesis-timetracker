// Aide commune aux tests fonctionnels HTTP (test/fonctionnel-*.js) : serveur réel sur données temporaires, sans réseau externe.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function makeCounter() {
  const c = { failed: 0, passed: 0 };
  c.assert = (cond, label) => { if (cond) { c.passed++; console.log('  ok  ' + label); } else { c.failed++; console.log('  FAIL ' + label); } };
  return c;
}

async function startServer() {
  const dir = require('./lib/tmpdir').mkTmp('tmt-fonc-');
  const port = require('./lib/freeport')();
  const env = Object.assign({}, process.env, {
    NOESIS_DATA_DIR: dir, PORT: String(port), NOESIS_HOST: '127.0.0.1',
    ANTHROPIC_API_KEY: '', RAILWAY_ENVIRONMENT_NAME: '', NODE_ENV: 'test',
  });
  const child = spawn('node', [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/api/session/me'); if (r.status) break; } catch (e) { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) { child.kill(); throw new Error('serveur non démarré : ' + out); }
  }
  const stop = () => { child.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignoré */ } };
  return { base, dir, stop, child };
}

// Client HTTP avec témoin de session (cookie) conservé.
function client(base, tz) {
  let cookie = '';
  async function call(method, url, body) {
    const headers = { 'Content-Type': 'application/json', 'X-Client-Tz': tz || 'America/Toronto' };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    let json = null;
    try { json = await res.json(); } catch (e) { /* corps non JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  }
  return { setTz: (z) => { tz = z; }, get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b || {}), del: (u, b) => call('DELETE', u, b) };
}

// Crée un profil (connecte le client) puis une activité personnelle.
async function newUser(base, tag, tz, extra) {
  const c = client(base, tz);
  const r = await c.post('/api/profile', {
    name: 'Test' + tag, lastName: 'Fonc' + tag, phone: '5145550100', email: `t${tag}@exemple.test`, pin: 'Xk9#Longue-2026!', termsAccepted: true, ...(extra || {}),
  });
  if (r.status !== 201) throw new Error('création de profil échouée : ' + JSON.stringify(r.body));
  const a = await c.post('/api/activities', { name: 'Activité ' + tag });
  if (a.status !== 201) throw new Error("création d'activité échouée : " + JSON.stringify(a.body));
  return { c, id: r.body.id, activityId: a.body.id };
}

module.exports = { startServer, client, makeCounter, newUser };
