// Allocation d'heures par catégorie : héritage vers l'avant, migration non destructive de l'ancienne capacité. Usage : node test/allocation-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-allocation-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
// ---- base « existante » AVANT le chargement du module : une personne à une activité avec capacité manuelle, une à deux activités, une sans capacité ----
db.prepare("INSERT INTO users (id, name, createdAt, weeklyCapacityMinutes) VALUES ('u1', 'u1', datetime('now'), 1200)").run();
db.prepare("INSERT INTO users (id, name, createdAt, weeklyCapacityMinutes) VALUES ('u2', 'u2', datetime('now'), 600)").run();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u3', 'u3', datetime('now'))").run();
const mkAct = (u, name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#A04B52', '')").run(id, u); return id; };
const a1 = mkAct('u1', 'Noèsis'), a2a = mkAct('u2', 'A'), a2b = mkAct('u2', 'B');
const A = require('../server/lib/allocation'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals');
const cap = (u) => db.prepare('SELECT weeklyCapacityMinutes AS m FROM users WHERE id = ?').get(u).m;
// migration
assert(A.effective('u1', { activityId: a1, level: 'activite' }, '2027-03-01').minutes === 1200, 'migration : la capacité manuelle d\'une personne à UNE activité devient l\'allocation de départ de l\'activité');
assert(A.effective('u2', { activityId: a2a, level: 'activite' }, '2027-03-01').minutes === null && A.effective('u2', { activityId: a2b, level: 'activite' }, '2027-03-01').minutes === null, 'plusieurs activités : aucune allocation inventée');
assert(cap('u1') === 1200 && cap('u2') === 600, 'non destructive : la colonne d\'origine n\'est jamais modifiée');
assert(A.migrateLegacy() === 0 && db.prepare('SELECT COUNT(*) AS n FROM hour_allocations').get().n === 1, 'idempotente : un second passage ne change rien');
// héritage vers l'avant : 5 h en 2027, 8 h dès 2028, 3 h dès 2029 ; 2030 et après = 3 h
const pole = categories.addCategory(a1, 'Pôle A'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(a1)[0].key;
const P = { activityId: a1, level: 'pole', poleKey };
A.set('u1', P, '2027-01-01', 300); A.set('u1', P, '2028-01-01', 480); A.set('u1', P, '2029-01-01', 180);
const m = (d) => A.effective('u1', P, d).minutes;
assert(m('2027-06-15') === 300 && m('2028-01-01') === 480 && m('2028-12-31') === 480 && m('2029-01-01') === 180 && m('2030-01-01') === 180 && m('2045-01-01') === 180, '5 h en 2027, 8 h dès 2028, 3 h dès 2029 ; 2030 et après = 3 h');
assert(m('2026-12-31') === null, 'jamais vers l\'arrière : rien avant la première valeur posée');
assert(A.effective('u1', P, '2028-01-01').own === true && A.effective('u1', P, '2028-06-01').own === false, 'réglé sur la ligne (violet) ou hérité (gris)');
// colonne de droite de l'arbre : total par ligne (somme des colonnes), réglé = une valeur posée sur la ligne
const pole2 = categories.addCategory(a1, 'Pôle B'); const poleB = (pole2 && pole2.key) || goals.categoriesForActivity(a1)[1].key;
A.set('u1', { activityId: a1, level: 'pole', poleKey: poleB }, '2028-01-01', 120);
const L = A.lignes('u1', { level: 'pole', activityId: a1 }, ['2027-01-01', '2028-01-01', '2029-01-01', '2030-01-01']);
assert(L[0].totalMin === 300 && L[0].own, 'ligne 2027 : total 5 h, réglé');
assert(L[1].totalMin === 600 && L[1].own, 'ligne 2028 : 8 h + 2 h = 10 h, réglé');
assert(L[2].totalMin === 300 && L[2].own && L[3].totalMin === 300 && !L[3].own, 'ligne 2029 : 3 h + 2 h (héritée) ; 2030 hérite : gris');
// retirer une valeur posée : la catégorie reprend la précédente
A.set('u1', P, '2028-01-01', null);
assert(m('2028-06-01') === 300 && m('2029-01-01') === 180, 'retirer une valeur : reprend la précédente, la suite reste');
// refus
let bad = 0; [() => A.set('u1', P, '2028-01-01', 99999), () => A.set('u1', P, 'pas une date', 60), () => A.set('u1', { activityId: a1, level: 'pole', poleKey: 'zzz' }, '2028-01-01', 60), () => A.set('u3', P, '2028-01-01', 60)].forEach((f) => { try { f(); } catch (e) { bad += 1; } });
assert(bad === 4, 'valeur > 168 h, date invalide, pôle inconnu, activité d\'un autre : refusés');
console.log(failed ? '\n' + failed + ' échec(s)' : 'allocation-test OK'); process.exit(failed ? 1 : 0);
