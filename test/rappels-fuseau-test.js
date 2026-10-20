// Rappels de fin de période (goalreminders.js) : fuseau du serveur (America/Toronto) et changements d'heure.
// Une période qui finit le 10 mars 2026 (heure d'été le 8 mars) puis le 3 nov. 2026 (retour à l'heure normale le 1er) :
// chaque seuil (3 jours, 1 jour) part UNE fois, jamais doublé (heure répétée comprise), jamais sauté, et le texte dit les bons jours.
// Usage : node test/rappels-fuseau-test.js
process.env.TZ = 'America/Toronto'; // même valeur que server/index.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-rappels-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
const push = require('../server/lib/push');
const goalreminders = require('../server/lib/goalreminders');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const sent = [];
push.pushEnabled = () => true;
push.sendToUsers = (ids, payload) => { sent.push({ ids, body: payload.body, tag: payload.tag }); };

db.prepare("INSERT INTO users (id, name, email, lang, createdAt) VALUES ('u1', 'Rappel', 'r@exemple.test', 'fr', '2026-01-01T00:00:00.000Z')").run();
const act = (name) => Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '2026-01-01T00:00:00.000Z')").run(name).lastInsertRowid);
const period = (activityId, n, endDate) => db.prepare(
  "INSERT INTO goal_periods (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt) VALUES (?, 'produit', ?, 1, ?, '2026-01-01', ?, 'objectif', '2026-01-01T00:00:00.000Z')")
  .run(activityId, n, n, endDate);
const A1 = act('Printemps'), A2 = act('Automne');
[A1, A2].forEach((a) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#674EA7', '2026-01-01T00:00:00.000Z')").run(a));
period(A1, 1, '2026-03-10');
period(A2, 1, '2026-11-03');

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi);
function sweep(label, when) { const before = sent.length; goalreminders.runGoalRemindersAll(when); return sent.slice(before); }

// Heure d'été : 8 mars 2026, 02:00 saute à 03:00.
let r = sweep('7 mars 23:30', at(2026, 3, 7, 23, 30));
assert(r.length === 1 && /dans 3 jours/.test(r[0].body), 'mars : le 7 au soir, rappel « dans 3 jours »');
assert(sweep('7 mars 23:45 (répété)', at(2026, 3, 7, 23, 45)).length === 0, 'mars : un second balayage le même jour n\'envoie rien');
assert(sweep('8 mars 01:59', at(2026, 3, 8, 1, 59)).length === 0, 'mars : 01:59 avant le saut, rien de nouveau');
assert(sweep('8 mars 03:00', at(2026, 3, 8, 3, 0)).length === 0, 'mars : 03:00 après le saut, rien de nouveau (seuil 3 déjà envoyé)');
r = sweep('9 mars 08:00', at(2026, 3, 9, 8, 0));
assert(r.length === 1 && /demain/.test(r[0].body), 'mars : le 9, rappel « demain » (le jour du saut n\'a pas décalé le compte)');
assert(sweep('10 mars 08:00', at(2026, 3, 10, 8, 0)).length === 0, 'mars : le jour de la fin, rien de plus (les deux seuils sont faits)');
assert(sent.length === 2, 'mars : deux rappels en tout, ni doublon ni saut');

// Retour à l'heure normale : 1er nov. 2026, 02:00 revient à 01:00 (l'heure 01:xx existe deux fois).
sent.length = 0;
r = sweep('31 oct 23:50', at(2026, 10, 31, 23, 50));
assert(r.length === 1 && /dans 3 jours/.test(r[0].body), 'novembre : le 31 octobre au soir, « dans 3 jours »');
const d1 = new Date(2026, 10, 1, 1, 30); // première occurrence de 01:30 (heure d'été)
const d2 = new Date(d1.getTime() + 3600 * 1000); // seconde occurrence (heure normale)
assert(d2.getHours() === 1 && d2.getDate() === 1, 'novembre : l\'heure 01:30 est bien répétée (contrôle du fuseau de test)');
assert(sweep('1er nov. 01:30 (1re)', d1).length === 0 && sweep('1er nov. 01:30 (2e)', d2).length === 0, 'novembre : l\'heure répétée n\'envoie rien de nouveau');
r = sweep('2 nov 09:00', at(2026, 11, 2, 9, 0));
assert(r.length === 1 && /demain/.test(r[0].body), 'novembre : le 2, « demain »');
assert(sent.length === 2, 'novembre : deux rappels en tout');

// Texte et jour calculés sur le calendrier local, pas sur 24 h x N (jour de 23 h / 25 h).
assert(goalreminders.daysBetween('2026-03-07', '2026-03-10') === 3 && goalreminders.daysBetween('2026-10-31', '2026-11-03') === 3, 'daysBetween : 3 jours des deux côtés des changements d\'heure');
assert(goalreminders.todayLocal(at(2026, 3, 8, 3, 0)) === '2026-03-08' && goalreminders.todayLocal(d2) === '2026-11-01', 'todayLocal : jour civil du fuseau du serveur');
process.exit(failed ? 1 : 0);
