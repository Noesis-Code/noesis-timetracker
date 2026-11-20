// Heures et tâches (20 nov. 2026) : la capacité de tâches d'une personne = SA PART des heures des objectifs en cours ; repli sur l'ancienne chaîne sans heures. Usage : node test/heures-taches-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-heures-taches-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'); require('../server/lib/objectifs'); require('../server/lib/partagetaches'); require('../server/lib/taches-rangement');
const goalsauto = require('../server/lib/goalsauto'), overload = require('../server/lib/goalsoverload'), RM = require('../server/lib/repartition-membres'), cap = require('../server/lib/objectifs-capacite');
['toi', 'gas', 'zoe'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const mk = (name, members) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'toi', '')").run(name).lastInsertRowid); members.forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(id, u)); return id; };
const lastKey = (l) => l[l.length - 1].key;
const solo = mk('Solo', ['toi']), duo = mk('Duo', ['toi', 'gas']);
const P = lastKey(categories.addCategory(solo, 'Pôle')), D = lastKey(categories.addCategory(duo, 'Pôle D')), D1 = lastKey(categories.addCategory(duo, 'Secteur D1', D));
const today = require('../server/lib/dates').userToday();
const add = (days) => new Date(Date.parse(today + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const obj = (userId, act, level, pk, ck, hours, extra) => Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, metaJson, createdAt, level, poleKey, categoryKey, parentId) VALUES (?, ?, 'O', 1, 'x', ?, ?, ?, '', ?, ?, ?, ?)").run(userId, act, (extra && extra.start) || add(-10), (extra && extra.end) || add(60), JSON.stringify(Object.assign(hours ? { hoursPerWeek: hours } : {}, (extra && extra.meta) || {})), level, pk, ck, (extra && extra.parentId) || null).lastInsertRowid);

// ---- repli : aucune heure d'objectif ----
const repli = goalsauto.capacityMinutesForMember(solo, P, 'toi');
assert(cap.weeklyShareMinutes(solo, P, 'toi') === null && repli === require('../server/lib/weekplanner').DEFAULT_WEEKLY_CAPACITY_MINUTES, 'sans heure d\'objectif : repli sur l\'ancienne chaîne (défaut 30 h)');
// ---- une personne avec 10 h : capacité = 10 h, budget du jour = 10 h / 7, jamais plus de 10 h x 1,2 par semaine ----
const o1 = obj('toi', solo, 'pole', P, null, 10);
assert(goalsauto.capacityMinutesForMember(solo, P, 'toi') === 600, '10 h sur un objectif en cours : capacité 600 min / semaine');
assert(overload.budgetFor(solo, 'toi', P) === Math.round(600 / 7), 'budget du jour = part / 7');
assert(overload.referenceFor(solo, 'toi', P) === Math.round(600 / 7), 'la médiane observée ne remplace plus la part d\'heures');
assert(overload.isOverloaded(Math.round(600 / 7) * 1.2 + 1, overload.referenceFor(solo, 'toi', P)) && !overload.isOverloaded(600 / 7 * 1.2, overload.referenceFor(solo, 'toi', P)), 'tolérance +20 % conservée : 10 h x 1,2 par semaine au plus');
// ---- deux objectifs = somme ----
const o2 = obj('toi', solo, 'pole', P, null, 4);
assert(goalsauto.capacityMinutesForMember(solo, P, 'toi') === 840, 'deux objectifs en cours : la somme (14 h)');
// ---- hors période, abandonné, sans heures : ignorés ----
obj('toi', solo, 'pole', P, null, 8, { start: add(-90), end: add(-30) }); obj('toi', solo, 'pole', P, null, 8, { meta: { abandoned: true } }); obj('toi', solo, 'pole', P, null, null);
assert(goalsauto.capacityMinutesForMember(solo, P, 'toi') === 840, 'objectif terminé, abandonné ou sans heures : ignoré');
// ---- étape d'un objectif : le parent n'est pas compté deux fois ----
const par = obj('toi', solo, 'pole', P, null, 6), step = obj('toi', solo, 'pole', P, null, 6, { parentId: par });
assert(goalsauto.capacityMinutesForMember(solo, P, 'toi') === 840 + 360, 'un objectif parent de ses étapes n\'est pas compté deux fois');
db.prepare('DELETE FROM user_objectives WHERE id IN (?, ?)').run(par, step);
// ---- les objectifs d'une autre personne ne comptent pas dans une activité personnelle ----
assert(cap.weeklyShareMinutes(solo, P, 'gas') === null, 'activité personnelle : les heures d\'un autre ne sont pas les miennes');
// ---- activité partagée : parts égales par défaut, puis répartition posée ----
const od = obj('toi', duo, 'pole', D, null, 10);
assert(goalsauto.capacityMinutesForMember(duo, D, 'toi') === 300 && goalsauto.capacityMinutesForMember(duo, D, 'gas') === 300, 'activité partagée sans répartition : parts égales (5 h chacun)');
RM.poser(duo, '_', { toi: 70, gas: 30 });
assert(goalsauto.capacityMinutesForMember(duo, D, 'toi') === 420 && goalsauto.capacityMinutesForMember(duo, D, 'gas') === 180, 'répartition posée 70/30 : 7 h et 3 h');
RM.poser(duo, D, { toi: 100, gas: 0 });
assert(goalsauto.capacityMinutesForMember(duo, D, 'toi') === 600, 'part de pôle (héritage vers le haut du plus précis) : toute la part');
// ---- membre sans part : repli, jamais 0 ----
assert(cap.weeklyShareMinutes(duo, D, 'gas') === null && goalsauto.capacityMinutesForMember(duo, D, 'gas') >= 1, 'membre à 0 % : pas de part, repli sur l\'ancienne chaîne');
// ---- le total d'une catégorie est divisé entre ses membres (ajustement du temps) ----
RM.poser(duo, D, { toi: 60, gas: 40 });
const l = RM.lire(duo, D);
assert(l.objectifsHeures === 10 && l.heuresParMembre.toi === 6 && l.heuresParMembre.gas === 4, 'ajustement du temps : total 10 h divisé 6 h / 4 h');
// ---- secteur : un objectif de secteur compte pour son pôle, sans double compte avec l'objectif du pôle (le plus grand des deux niveaux) ----
obj('toi', duo, 'secteur', D, D1, 3);
assert(cap.totalMinutes(duo, D) === 600 && cap.totalMinutes(duo, D1) === 180 && cap.totalMinutes(duo, '_') === 600, 'pôle = max(pôle, somme des secteurs) ; secteur et activité lus');
db.prepare('DELETE FROM user_objectives WHERE id = ?').run(od);
assert(cap.totalMinutes(duo, D) === 180, 'sans objectif de pôle : la somme des secteurs');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout passe'); process.exit(failed ? 1 : 0);
