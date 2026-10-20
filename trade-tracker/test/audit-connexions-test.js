// Journal des connexions et sessions visible de l'utilisateur (GET /api/security/audit, déjà à l'écran Sécurité) : chaque événement
// de connexion / session laisse UNE ligne dans le journal DU COMPTE concerné, jamais dans celui d'un autre, sans jeton, cookie ni user-agent brut.
const assert = require('assert');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('../server/db');
const { createApp } = require('../server/app');
const A = require('../server/lib/auth');

(async () => {
  const secret = crypto.randomBytes(16).toString('hex');
  const env = { TRADE_LINK_SECRET: secret, TRADE_EXPERT_TMT_IDS: 'ex', TRADE_TOKEN_KEY: crypto.randomBytes(16).toString('hex') };
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON'); migrate(db);
  const server = createApp(db, { env, limits: { link: 1000, write: 1000, auth: 1000 } }).listen(0);
  const base = 'http://127.0.0.1:' + server.address().port;
  const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 secret-ua-marker-' + crypto.randomBytes(4).toString('hex');
  const UA2 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14) Firefox/130';
  try {
    const inv = (email) => A.createInvitation(db, { invitedBy: null, email, role: 'client' }).code;
    const linkTok = (sub, ua = UA) => A.signLinkToken({ sub, name: sub, email: sub + '@x.test', ua }, secret);
    const login = async (sub, ua = UA, code) => {
      const tok = linkTok(sub, ua);
      const r = await fetch(base + '/link?token=' + tok + (code ? '&invite=' + code : ''), { redirect: 'manual', headers: { 'user-agent': ua } });
      return { tok, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
    };
    const journal = async (cookie, ua = UA) => (await (await fetch(base + '/api/security/audit', { headers: { cookie, 'user-agent': ua } })).json());
    const ev = (j) => j.entries.map((e) => e.event);
    const uid = (sub) => db.prepare('SELECT id FROM tt_users WHERE tmtUserId = ?').get(sub).id;
    const countOf = (sub, event) => db.prepare('SELECT COUNT(*) n FROM audit_log WHERE userId = ? AND event = ?').get(uid(sub), event).n;

    // u1 se connecte, u2 aussi (deux comptes distincts)
    const a = await login('u1', UA, inv('u1@x.test')), b = await login('u2', UA, inv('u2@x.test'));
    assert(a.cookie && b.cookie, 'deux sessions ouvertes');
    assert.strictEqual(countOf('u1', 'link_ok'), 1, 'connexion réussie : une ligne');

    // rejeu du même lien : refus, noté dans le journal du compte visé
    await fetch(base + '/link?token=' + a.tok, { redirect: 'manual', headers: { 'user-agent': UA } });
    assert.strictEqual(countOf('u1', 'link_refused'), 1, 'rejeu du lien : une ligne « refusé » chez u1');
    assert.strictEqual(countOf('u2', 'link_refused'), 0, 'rien chez u2');

    // session utilisée depuis un autre navigateur : fermée et journalisée (session_device)
    const r1 = await fetch(base + '/api/security/audit', { headers: { cookie: a.cookie, 'user-agent': UA2 } });
    assert.strictEqual(r1.status, 401); assert.strictEqual((await r1.json()).error, 'session_device');
    assert.strictEqual(countOf('u1', 'session_device'), 1);

    // inactivité et durée absolue : sessions vieillies dans la base (aucune attente réelle)
    const a2 = await login('u1', UA);
    db.prepare("UPDATE sessions SET lastSeenAt = ? WHERE userId = ?").run(new Date(Date.now() - 16 * 60e3).toISOString(), uid('u1'));
    const r2 = await fetch(base + '/api/me', { headers: { cookie: a2.cookie, 'user-agent': UA } });
    assert.strictEqual((await r2.json()).error, 'session_idle'); assert.strictEqual(countOf('u1', 'session_idle'), 1);
    const a3 = await login('u1', UA);
    db.prepare("UPDATE sessions SET expiresAt = ? WHERE userId = ?").run(new Date(Date.now() - 1000).toISOString(), uid('u1'));
    const r3 = await fetch(base + '/api/me', { headers: { cookie: a3.cookie, 'user-agent': UA } });
    assert.strictEqual((await r3.json()).error, 'session_expired'); assert.strictEqual(countOf('u1', 'session_expired'), 1);

    // déconnexion, puis « fermer toutes mes sessions »
    const a4 = await login('u1', UA);
    await fetch(base + '/api/logout', { method: 'POST', headers: { cookie: a4.cookie, 'user-agent': UA } });
    assert.strictEqual(countOf('u1', 'logout'), 1, 'déconnexion : une ligne');
    const a5 = await login('u1', UA), a6 = await login('u1', UA);
    const rv = await fetch(base + '/api/security/sessions/revoke-all', { method: 'POST', headers: { cookie: a5.cookie, 'user-agent': UA } });
    assert.strictEqual(rv.status, 200);
    assert.strictEqual(countOf('u1', 'sessions_revoked_all'), 1, '« fermer toutes les sessions » : une ligne');
    assert.strictEqual((await fetch(base + '/api/me', { headers: { cookie: a6.cookie, 'user-agent': UA } })).status, 401, 'les autres sessions sont bien fermées');

    // ce que u1 voit : tous ces événements, dans son journal seulement
    const a7 = await login('u1', UA);
    const j1 = await journal(a7.cookie);
    for (const e of ['link_ok', 'link_refused', 'session_device', 'session_idle', 'session_expired', 'logout', 'sessions_revoked_all']) assert(ev(j1).includes(e), 'u1 voit : ' + e);
    assert(j1.entries.every((x) => db.prepare('SELECT userId FROM audit_log WHERE id = ?').get(x.id).userId === uid('u1')), 'u1 ne voit que ses lignes');
    const j2 = await journal(b.cookie);
    assert.deepStrictEqual(ev(j2).filter((e) => e !== 'link_ok'), [], 'u2 ne voit que sa propre connexion');
    assert(j2.entries.every((x) => db.prepare('SELECT userId FROM audit_log WHERE id = ?').get(x.id).userId === uid('u2')));
    assert(j1.chain.ok, 'chaîne intacte après tous ces événements');

    // aucune donnée sensible dans la réponse ni en base : ni lien, ni cookie de session, ni user-agent brut, ni code d'invitation
    const body = JSON.stringify(j1) + JSON.stringify(db.prepare('SELECT * FROM audit_log').all());
    const sessTokens = [a, a2, a3, a4, a5, a6, a7, b].map((x) => x.cookie.split('=')[1]).filter(Boolean);
    for (const s of sessTokens) assert(!body.includes(s), 'cookie de session absent du journal');
    for (const s of [a.tok, a7.tok, 'secret-ua-marker', UA]) assert(!body.includes(s), 'lien / user-agent brut absents du journal');
    assert(j1.entries.every((x) => typeof x.device === 'string' && !/Mozilla/.test(x.device)), 'appareil = libellé lisible seulement');
  } finally { server.close(); }
  console.log('audit-connexions-test OK');
})().catch((e) => { console.error(e); process.exit(1); });
