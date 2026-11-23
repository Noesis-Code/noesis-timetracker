// Mot de passe oublié de bout en bout (sans réseau : le courriel est écrit dans un dossier, NODE_ENV=test).
// Usage : node test/mot-de-passe-oublie-test.js
const fs = require('fs');
process.env.NOESIS_MAIL_DIR = require('./lib/tmpdir').mkTmp('tmt-mail-');
const { startServer, makeCounter, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
const mails = () => fs.readdirSync(process.env.NOESIS_MAIL_DIR).map((f) => JSON.parse(fs.readFileSync(process.env.NOESIS_MAIL_DIR + '/' + f, 'utf8')));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const s = await startServer();
  try {
    const c = client(s.base);
    const cr = await c.post('/api/profile', { name: 'Rita', lastName: 'Oubli', phone: '5145550177', email: 'Rita.Oubli@Exemple.test', pin: 'Xk9#Ancien-2026!', termsAccepted: true });
    assert(cr.status === 201, 'création avec courriel');
    const anon = client(s.base);
    assert((await anon.post('/api/password/forgot', { email: 'pas-un-courriel' })).status === 400, 'courriel invalide refusé');
    const inconnu = await anon.post('/api/password/forgot', { email: 'personne@exemple.test' });
    assert(inconnu.status === 200 && inconnu.body.ok, 'courriel inconnu : même réponse neutre');
    await wait(150);
    assert(mails().length === 0, 'courriel inconnu : aucun envoi');
    const r = await anon.post('/api/password/forgot', { email: '  rita.oubli@EXEMPLE.test ' });
    assert(r.status === 200 && r.body.message === inconnu.body.message, 'courriel connu (autre casse, espaces) : même réponse');
    await wait(300);
    const m = mails();
    assert(m.length === 1 && m[0].to === 'rita.oubli@exemple.test', 'un courriel envoyé à l\'adresse du compte');
    const mt = m[0] && /(https?:\/\/[^\s]+\/\?reset=([\w-]+))/.exec(m[0].text);
    assert(mt && mt[1].startsWith(s.base + '/?reset='), 'lien vers le bon domaine avec jeton');
    const token = mt && mt[2];
    assert((await anon.post('/api/password/reset', { token: 'x'.repeat(30), password: 'Xk9#Nouveau-2026!' })).status === 400, 'faux jeton refusé');
    assert((await anon.post('/api/password/reset', { token, password: 'faible' })).status === 400, 'mot de passe faible refusé');
    const ok = await anon.post('/api/password/reset', { token, password: 'Xk9#Nouveau-2026!' });
    assert(ok.status === 200 && ok.body.id === cr.body.id, 'réinitialisation réussie');
    assert((await anon.post('/api/password/reset', { token, password: 'Xk9#Autre-2026!!' })).status === 400, 'jeton à usage unique');
    const lg = await client(s.base).post('/api/login-email', { email: 'RITA.OUBLI@exemple.test', password: 'Xk9#Nouveau-2026!' });
    assert(lg.status === 200, 'connexion par courriel avec le nouveau mot de passe');
    assert((await client(s.base).post('/api/profile/' + cr.body.id + '/verify-pin', { pin: 'Xk9#Ancien-2026!' })).status === 401, 'ancien mot de passe refusé');
  } finally { s.stop(); }
  console.log(T.failed ? 'ÉCHEC : ' + T.failed : 'OK : ' + T.passed + ' vérifications');
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
