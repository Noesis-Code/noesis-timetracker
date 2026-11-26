// Échéance d'un objectif : demain ou après seulement ; « Quitter sans enregistrer ? » partout (20 nov. 2026). Usage : node test/echeance-demain-test.js
const fs = require('fs'), path = require('path'), os = require('os');
process.env.NOESIS_DATA_DIR = process.env.NOESIS_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-ech-'));
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const obj = require('../server/lib/objectifs'), dates = require('../server/lib/dates');
const t = dates.userToday(), add = (d, n) => obj.addDays(d, n);
const msg = (day) => { try { obj.checkEcheance({ endDate: day, startDate: add(t, -30) }, add(t, -30), true); return null; } catch (e) { return e.message; } };
assert(msg(t) === 'L’échéance doit être après aujourd’hui.', 'aujourd’hui refusé, message unique');
assert(msg(add(t, -3)) === 'L’échéance doit être après aujourd’hui.', 'hier ou avant refusé, même message');
assert(msg(add(t, 1)) === null, 'demain accepté');
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const cr = rd('public/js/objectifs-creer.js'), cp = rd('public/js/composants.js');
assert(cp.includes('fermerAvecConfirmation: function (fermer, aChange)') && cp.includes("confirmBox(tr('Quitter sans enregistrer ?')"), 'un seul utilitaire commun de fermeture avec confirmation (TMT.ui.confirm)');
assert(cr.includes('function closePanel() { TMT.ui.fermerAvecConfirmation(endFlow, closeGuard); }') && cr.includes('closeGuard = function () { return !!String(titleIn.value'), 'création : ✕ après saisie demande confirmation');
assert(cr.includes("openModal(tr('Ajuster le temps'), { dirty:"), 'Ajuster le temps : ✕ demande confirmation après une modification');
assert(cr.includes('form.dateBad = v <= todayLocal()') && cr.includes('form.dateBad === true') && cr.includes('if (form.endDate <= todayLocal())'), 'création : échéance aujourd’hui ou avant bloque Suivant / Terminer avec le message sous le champ');
assert(rd('public/js/objectifs-arbre.js').includes('return iso > dayIso() ? iso : null;'), 'arbre : case entièrement passée sans « + », période en cours créable');
process.exit(failed ? 1 : 0);
