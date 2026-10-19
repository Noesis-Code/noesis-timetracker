// ETag serveur (304) + logique client : requêtes conditionnelles de data.js et préférences d'affichage (localStorage indisponible).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');
const { syncAll } = require('../server/lib/sync');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'tmt-e' };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const l = await fetch(base + '/link?token=' + A.signLinkToken({ sub: 'tmt-e', name: 'e', email: 'e@ex.test', ua: 'node' }, secret), { redirect: 'manual' });
    const cookie = l.headers.get('set-cookie').split(';')[0];
    await syncAll(db);

    // --- serveur : ETag + 304 ---
    for (const p of ['/api/portfolio', '/api/positions', '/api/compare', '/api/sync-log', '/api/history', '/api/purchases']) {
      const r1 = await fetch(base + p, { headers: { cookie } });
      assert.strictEqual(r1.status, 200, p); const tag = r1.headers.get('etag'); assert(/^"[\w-]+"$/.test(tag), 'etag fort ' + p);
      const body = await r1.text(); JSON.parse(body);
      const r2 = await fetch(base + p, { headers: { cookie, 'if-none-match': tag } });
      assert.strictEqual(r2.status, 304, p); assert.strictEqual(await r2.text(), '');
      const r3 = await fetch(base + p, { headers: { cookie, 'if-none-match': '"autre"' } });
      assert.strictEqual(r3.status, 200, p); assert.strictEqual(await r3.text(), body);
    }
    // changement de données => nouvel ETag
    const t1 = (await fetch(base + '/api/portfolio', { headers: { cookie } })).headers.get('etag');
    db.prepare('UPDATE positions SET lastPrice = lastPrice * 1.05').run();
    const r4 = await fetch(base + '/api/portfolio', { headers: { cookie, 'if-none-match': t1 } });
    assert.strictEqual(r4.status, 200); assert.notStrictEqual(r4.headers.get('etag'), t1);
    // sans session : 401, jamais de 304
    assert.strictEqual((await fetch(base + '/api/portfolio', { headers: { 'if-none-match': t1 } })).status, 401);

    // --- client : data.js (fetch simulé) ---
    const calls = [];
    const sandbox = { window: {}, location: { search: '' }, TTF: {}, console };
    sandbox.fetch = (url, opts) => {
      const h = Object.assign({}, opts.headers); calls.push([url, h['If-None-Match'] || null]);
      return fetch(base + url, { headers: Object.assign({ cookie }, h) }).then((r) => ({
        status: r.status, ok: r.ok, headers: r.headers, text: () => r.text(), json: () => r.json() }));
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/data.js'), 'utf8'), sandbox);
    const TTD = sandbox.window.TTD;
    const first = await TTD.load();
    assert.strictEqual(first.source, 'api');
    calls.length = 0;
    let r = await TTD.refresh();
    assert.strictEqual(r.changed.length, 0, 'rien ne change : aucun redessin');
    assert(calls.every((c) => c[1]), 'toutes les requêtes sont conditionnelles');
    assert.strictEqual(r.data.positions, first.positions, 'même objet conservé sur 304');
    db.prepare('UPDATE positions SET lastPrice = lastPrice * 1.2').run();
    r = await TTD.refresh();
    assert(r.changed.includes('portfolio') && r.changed.includes('positions'), 'changements détectés : ' + r.changed);
    assert(!r.changed.includes('syncLog'));

    // --- préférences : localStorage qui lève => repli mémoire ---
    const ps = { window: {}, document: { addEventListener() {} }, localStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } } };
    vm.createContext(ps); vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/prefs.js'), 'utf8'), ps);
    const P = ps.window.TTPrefs;
    assert.strictEqual(P.get('unit'), 'value'); P.set('unit', 'pct'); assert.strictEqual(P.get('unit'), 'pct');
    assert.strictEqual(P.get('minPct'), 0); assert(/data-kebab/.test(P.menu(['chart'])));
    console.log('refresh-test ok');
  } finally { server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
