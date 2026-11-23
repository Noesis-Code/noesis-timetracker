// Contrôles de saisie uniques (public/js/saisie.js) : courriel, téléphone, mot de passe. Sans réseau.
const S = require('../public/js/saisie');
const auth = require('./lib/tmpdir').mkTmp && (process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-saisie-'), require('../server/lib/auth'));
let passed = 0, failed = 0;
function assert(c, m) { if (c) { passed++; } else { failed++; console.log('ÉCHEC : ' + m); } }

['a@b.co', 'admin+staging2311@compagnienoesis.com', 'a.b@sub.domaine.ca', ' Prenom.Nom-x@Exemple.CA '].forEach((e) => assert(S.isValidEmail(e), 'courriel valide : ' + e));
['sans-arobase.com', 'a@domainesanspoint', 'a b@c.com', 'a@b .com', '@b.com', 'a@.com', 'a@b.', ''].forEach((e) => assert(!S.isValidEmail(e), 'courriel invalide : ' + e));
assert(S.normalizeEmail('  A+B@Exemple.COM ') === 'a+b@exemple.com', 'courriel : trim + minuscules');

['514 555-1234', '(514) 555-1234', '514.555.1234', '+1 514 555 1234', '+1 (514) 555-1234 poste 22', '5145551234', ' 514   555 1234 '].forEach((p) => assert(S.isValidPhone(p), 'téléphone accepté : ' + p));
['', 'abc', '12345', '123-45'].forEach((p) => assert(!S.isValidPhone(p), 'téléphone refusé : ' + p));
assert(S.normalizePhone('  514   555 1234 ') === '514 555 1234', 'téléphone : espaces normalisés');

assert(S.passwordProblem('a'.repeat(9)) === 'Le mot de passe doit avoir 10 caractères ou plus.', 'mot de passe 9 caractères : message exact');
assert(S.passwordProblem('a'.repeat(10)) === '', 'mot de passe 10 caractères accepté (aucune autre exigence)');
assert(auth.checkPasswordStrength('a'.repeat(9)).error === 'Le mot de passe doit avoir 10 caractères ou plus.', 'serveur : même message');
assert(auth.checkPasswordStrength('toutenminuscule').ok, 'serveur : pas d\'exigence de majuscule/chiffre/symbole');
assert(/trop courant/.test(auth.checkPasswordStrength('azerty-qwerty-x').error), 'mot de passe courant : le message dit « trop courant »');

console.log(`\n${passed} ok, ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
