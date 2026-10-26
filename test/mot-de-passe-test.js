// Mot de passe fort (26 oct. 2026, demande d'Émilien) : 10 caractères ou plus avec minuscule, majuscule, chiffre et caractère spécial ;
// un compte encore protégé par l'ancien code à 4 chiffres s'y connecte une dernière fois, puis DOIT choisir un mot de passe fort.
// Usage : node test/mot-de-passe-test.js (règles pures + serveur réel sur données temporaires)
const path = require('path');
const dir = require('./lib/tmpdir').mkTmp('tmt-mdp-regles-');
process.env.NOESIS_DATA_DIR = dir; // auth.js ouvre la base : on la garde hors des vraies données
const auth = require('../server/lib/auth');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeCounter, client } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

(async () => {
  // --- règles pures ---
  const ok = (pw, who) => auth.checkPasswordStrength(pw, who).ok;
  assert(ok('Xk9#Longue-2026!'), 'mot de passe fort accepté');
  assert(!ok('Court1!a'), 'moins de 10 caractères refusé');
  assert(!ok('sansmajuscule-2026!'), 'sans majuscule refusé');
  assert(!ok('SANSMINUSCULE-2026!'), 'sans minuscule refusé');
  assert(!ok('SansChiffre-Longue!'), 'sans chiffre refusé');
  assert(!ok('SansSpecial2026Longue'), 'sans caractère spécial refusé');
  assert(!ok('Azerty-123456-Ok!'), 'mot de passe courant refusé');
  assert(!ok('Bonjour-Noesis-2026!'), 'le nom de l\'app est refusé');
  assert(!ok('Camille#Longue-2026!', { name: 'Camille', lastName: 'Dupont', email: 'c@exemple.test' }), 'contenant le prénom refusé');
  assert(!ok('Xk9#Dupont-2026!', { name: 'Camille', lastName: 'Dupont', email: 'c@exemple.test' }), 'contenant le nom refusé');
  assert(!ok('Xk9#' + 'a'.repeat(130) + 'B1!'), 'plus de 128 caractères refusé');
  assert(ok('Xk9#Longue-2026!', { name: 'Camille', lastName: 'Dupont', email: 'c@exemple.test' }), 'sans lien avec la personne : accepté');

  // --- serveur ---
  const s = await startServer();
  try {
    const base = { name: 'Camille', lastName: 'Mdp', phone: '5145550160', email: 'camille.mdp@exemple.test', termsAccepted: true };
    const d1 = client(s.base);
    assert((await d1.post('/api/profile', Object.assign({}, base, { pin: '1234' }))).status === 400, 'création : code à 4 chiffres refusé');
    assert((await d1.post('/api/profile', Object.assign({}, base, { pin: 'MotSansSpecial2026' }))).status === 400, 'création : sans caractère spécial refusé');
    const cr = await d1.post('/api/profile', Object.assign({}, base, { pin: 'Xk9#Longue-2026!' }));
    assert(cr.status === 201 && cr.body.id, 'création : mot de passe fort accepté');
    const d1b = client(s.base);
    const lg = await d1b.post('/api/profile/' + cr.body.id + '/verify-pin', { pin: 'Xk9#Longue-2026!' });
    assert(lg.status === 200 && lg.body.mustChangePassword === false, 'connexion avec mot de passe fort : aucun changement exigé');
    assert((await d1b.post('/api/profile/' + cr.body.id + '/verify-pin', { pin: 'x'.repeat(500) })).status === 401, 'connexion : mot de passe démesuré refusé sans calcul');

    // Ancien compte (code à 4 chiffres, passwordStrong = 0)
    const db = new DatabaseSync(path.join(s.dir, 'noesis.db'));
    db.prepare("INSERT INTO users (id, name, lastName, email, pin, createdAt) VALUES ('ancien1', 'Ancien', 'Compte', 'ancien@exemple.test', ?, datetime('now'))").run(auth.makePinRecord('1234'));
    db.close();
    const d2 = client(s.base);
    const old = await d2.post('/api/profile/ancien1/verify-pin', { pin: '1234' });
    assert(old.status === 200 && old.body.mustChangePassword === true, 'ancien compte : entre avec l\'ancien code, changement exigé');
    const blocked = await d2.get('/api/activities?userId=ancien1');
    assert(blocked.status === 403 && blocked.body.mustChangePassword === true, 'ancien compte : le reste de l\'app est bloqué tant que le mot de passe n\'est pas changé');
    assert((await d2.get('/api/session/me')).status === 200, 'ancien compte : la session reste lisible');
    assert((await d2.post('/api/profile/ancien1/set-pin', { currentPin: '1234', pin: '4321' })).status === 400, 'changement : nouveau code faible refusé');
    assert((await d2.post('/api/profile/ancien1/set-pin', { currentPin: '9999', pin: 'Zr7#Autre-Mot-2026!' })).status === 401, 'changement : mauvais ancien code refusé');
    assert((await d2.post('/api/profile/ancien1/set-pin', { currentPin: '1234', pin: 'Zr7#Autre-Mot-2026!' })).status === 200, 'changement : mot de passe fort accepté');
    assert((await d2.get('/api/activities?userId=ancien1')).status === 200, 'après le changement : l\'app est de nouveau accessible');
    const d3 = client(s.base);
    const again = await d3.post('/api/profile/ancien1/verify-pin', { pin: 'Zr7#Autre-Mot-2026!' });
    assert(again.status === 200 && again.body.mustChangePassword === false, 'reconnexion avec le nouveau mot de passe : plus rien d\'exigé');
    assert((await client(s.base).post('/api/profile/ancien1/verify-pin', { pin: '1234' })).status === 401, 'l\'ancien code ne marche plus');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
