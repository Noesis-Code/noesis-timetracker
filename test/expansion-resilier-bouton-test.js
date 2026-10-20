// Bouton « Résilier mon abonnement » (20 oct. 2026, demande d'Émilien) : présent dans la carte Expansion, masqué par défaut,
// montré seulement avec un abonnement, ouvre /api/offer/portal, traduit. Contrôle de sources, aucun réseau.
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const p1 = read('public/js/objectifs-page1.js'), app = read('public/app.js'), i18n = read('public/i18n.js');
ok(/id="offer1CancelBtn" class="offer1PromoBtn hidden">Résilier mon abonnement</.test(p1), 'bouton exact, violet (classe existante), masqué par défaut');
ok((p1.match(/offer1CancelBtn/g) || []).length === 2 && /api\('POST', '\/api\/offer\/portal'/.test(p1), 'un seul écouteur, appelle /api/offer/portal');
ok(/offer1CancelBtn'\)\.classList\.toggle\('hidden', !\(rows && rows\.length\)\)/.test(app), 'visible seulement avec un abonnement');
ok(/"Résilier mon abonnement": "Cancel my subscription"/.test(i18n), 'traduction EN');
process.exit(failed ? 1 : 0);
