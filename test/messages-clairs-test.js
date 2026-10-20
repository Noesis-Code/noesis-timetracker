// Usage : node test/messages-clairs-test.js — pas de message technique brut montré à l'utilisateur.
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { userMessage } = require('../server/lib/usermessage');
assert(userMessage(new Error("Anthropic a refusé l'appel (HTTP 529) : Overloaded.")) === 'Génération indisponible pour le moment.', 'HTTP 529 (surcharge) : indisponible, réessayer');
assert(userMessage(new Error("Anthropic a refusé l'appel (HTTP 503).")) === 'Génération indisponible pour le moment.', 'HTTP 503 : indisponible');
assert(userMessage(new Error("Anthropic a refusé l'appel (HTTP 400) : bad input.")) === 'Erreur serveur', 'HTTP 400 : repli générique');
assert(userMessage(new Error('fetch failed')) === 'Génération indisponible pour le moment.', 'fetch failed : indisponible');
assert(userMessage(new Error('SQLITE_CONSTRAINT: NOT NULL constraint failed')) === 'Erreur serveur', 'SQLite : message clair');
assert(userMessage(new Error("Cannot read properties of undefined (reading 'id')")) === 'Erreur serveur', 'TypeError : message clair');
assert(userMessage(new Error('')) === 'Erreur serveur' && userMessage(null) === 'Erreur serveur', 'message vide : repli');
assert(userMessage(Object.assign(new Error('Date invalide.'), { statusCode: 400 })) === 'Date invalide.', 'erreur voulue (statusCode) : texte conservé');
assert(userMessage(new Error('Aucune catégorie sur cette activité.')) === 'Aucune catégorie sur cette activité.', 'message français voulu : conservé');
assert(userMessage(Object.assign(new Error('Plafond IA atteint.'), { aiBlocked: true })) === 'Plafond IA atteint.', 'plafond IA : conservé');
const fs = require('fs'), path = require('path');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
assert(/'Erreur serveur'\s*:\s*'Server error'/.test(i18n), 'repli traduit en anglais');
assert(/"Génération indisponible pour le moment\."\s*:\s*"Generation unavailable/.test(i18n), 'indisponible traduit en anglais (clé existante)');
process.exit(failed ? 1 : 0);
