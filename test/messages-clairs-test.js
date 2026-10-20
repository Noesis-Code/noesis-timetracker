// Usage : node test/messages-clairs-test.js — pas de message technique brut montré à l'utilisateur.
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { userMessage } = require('../server/lib/usermessage');
assert(userMessage(new Error("Anthropic a refusé l'appel (HTTP 529) : Overloaded.")) === 'Erreur serveur', 'HTTP 529 / nom de service : message clair');
assert(userMessage(new Error('fetch failed')) === 'Erreur serveur', 'fetch failed : message clair');
assert(userMessage(new Error('SQLITE_CONSTRAINT: NOT NULL constraint failed')) === 'Erreur serveur', 'SQLite : message clair');
assert(userMessage(new Error("Cannot read properties of undefined (reading 'id')")) === 'Erreur serveur', 'TypeError : message clair');
assert(userMessage(new Error('')) === 'Erreur serveur' && userMessage(null) === 'Erreur serveur', 'message vide : repli');
assert(userMessage(Object.assign(new Error('Date invalide.'), { statusCode: 400 })) === 'Date invalide.', 'erreur voulue (statusCode) : texte conservé');
assert(userMessage(new Error('Aucune catégorie sur cette activité.')) === 'Aucune catégorie sur cette activité.', 'message français voulu : conservé');
assert(userMessage(Object.assign(new Error('Plafond IA atteint.'), { aiBlocked: true })) === 'Plafond IA atteint.', 'plafond IA : conservé');
const fs = require('fs'), path = require('path');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
assert(/'Erreur serveur'\s*:\s*'Server error'/.test(i18n), 'repli traduit en anglais');
process.exit(failed ? 1 : 0);
