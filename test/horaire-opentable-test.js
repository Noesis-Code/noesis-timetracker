// Module « Horaire » : import CSV des réservations OpenTable (totaux de couverts par jour et service, jamais de noms de clients).
// Usage : node test/horaire-opentable-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-opentable-');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

const db = require('../server/db');
const h = require('../server/lib/horaire');
const now = new Date().toISOString();
['uA', 'uB'].forEach((id) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, id, now));

const csv = [
  'Date;Heure;Taille du groupe;Statut;Nom du client;Notes',
  '2026-11-02;12:30;4;Confirmée;Tremblay;allergie noix',
  '2026-11-02;18:00;2;Confirmée;Gagnon;',
  '2026-11-02;19:30:00;6;Confirmée;Roy;anniversaire',
  '2026-11-02;20:00;3;Annulée;Lavoie;',
  '03/11/2026;7:30 PM;5;Confirmée;Côté;',
  '2026-11-04;heure?;2;Confirmée;Bad;',
].join('\n');
const r = h.importReservationsCsv('uA', csv);
assert(!r.error && r.reservations === 4 && r.covers === 17 && r.days === 2, 'import : 4 réservations, 17 couverts, 2 jours (annulée exclue)');
assert(r.skipped.length === 1 && r.skipped[0].line === 7, 'ligne illisible signalée avec son numéro');
const w = h.weekCovers('uA', '2026-11-02');
const get = (d, s) => (w.find((x) => x.day === d && x.service === s) || {}).covers;
assert(get('2026-11-02', 'jour') === 4 && get('2026-11-02', 'soir') === 8 && get('2026-11-03', 'soir') === 5, 'totaux par jour et service (avant 16 h = jour)');
assert(h.weekCovers('uB', '2026-11-02').length === 0, 'un autre compte ne voit rien');
assert(!JSON.stringify(db.prepare('SELECT * FROM horaire_covers').all()).match(/Tremblay|Gagnon|noix|anniversaire/), 'aucun nom ni note de client gardé');
const again = h.importReservationsCsv('uA', 'date,time,party size\n2026-11-02,13:00,10');
assert(again.covers === 10 && h.weekCovers('uA', '2026-11-02').filter((x) => x.day === '2026-11-02').length === 1, 'réimport : les totaux du jour sont remplacés, pas additionnés');
assert(h.weekCovers('uA', '2026-11-02').some((x) => x.day === '2026-11-03'), 'les jours absents du nouveau fichier restent');
assert(!!h.importReservationsCsv('uA', 'nom;age\nA;3').error, 'colonnes non reconnues : erreur claire');
assert(h.normDate('03/11/2026') === '2026-11-03' && h.normDate('11/25/2026') === '2026-11-25' && h.normDate('31/02/2026') === null, 'dates : JJ/MM d\'abord, MM/JJ impossible corrigé, date fausse refusée');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nOK');
process.exit(failed ? 1 : 0);
