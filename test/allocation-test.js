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
// ---- Moyenne par semaine d'une ligne (bloc de 5 ans) : 5 h puis 8 h dès le milieu de la ligne ----
const Q = { activityId: a1, level: 'activite' };
A.set('u1', Q, '2030-01-01', 300); A.set('u1', Q, '2033-01-01', 480);
const avg = A.average('u1', Q, '2030-01-01', '2034-12-31'); // 3 ans à 5 h, 2 ans à 8 h : (3 × 300 + 2 × 480) / 5 = 372
assert(avg.minutes === 372 && avg.own === true, 'moyenne par semaine d\'une ligne de 5 ans : 5 h puis 8 h -> 6 h12 (' + avg.minutes + ' min), réglé');
const avg2 = A.average('u1', Q, '2036-01-01', '2036-12-31');
assert(avg2.minutes === 480 && avg2.own === false, 'une ligne sans valeur posée reprend la précédente : 8 h, gris');
// ---- Répartition par catégorie et par membre (donnée seulement) ----
const O = require('../server/lib/objectifs');
const aShared = mkAct('u1', 'Maison'); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u3', '#674EA7', '')").run(aShared);
const cu = categories.addCategory(aShared, 'Cuisine'); const cuKey = (cu && cu.key) || goals.categoriesForActivity(aShared)[0].key;
const T0 = '2027-03-01';
A.set('u1', { activityId: aShared, level: 'pole', poleKey: cuKey }, '2027-01-01', 240);
db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u3', ?, '', 'a', 'b', 7200, '2027-02-22', 'x', ?)").run(aShared, cuKey);
db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', 3600, '2027-02-22', 'x', ?)").run(aShared, cuKey);
const R = A.repartition('u1', { level: 'pole', activityId: aShared }, { start: '2027-01-01', end: '2027-12-31' }, T0);
const c0 = R.categories[0];
assert(R.categories.length === 1 && c0.label === 'Cuisine' && c0.alloueMin === 240 && c0.own === true && R.totalMin === 240, 'répartition par pôle : alloué 4 h, réglé');
assert(c0.chronoMin > 0 && c0.objectifsMin === 0, 'répartition : chrono mesuré sur la part écoulée de la ligne ; objectifs = somme des rythmes (0 ici)');
assert(Array.isArray(c0.membres) && c0.membres.length === 2 && c0.membres.some((m) => m.userId === 'u3' && m.chronoMin > 0), 'par membre : le Chrono mesuré de chaque membre existe déjà (moyenne 4 semaines) ; prévu = null tant que rien n\'est posé');
// ---- Pop-up des heures : membres d'une catégorie pour une ligne (seulement ceux qui ont du Chrono ou du prévu ; un membre absent n'apparaît pas) ----
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u4', 'Absent', datetime('now'))").run();
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u4', '#674EA7', '')").run(aShared);
const R2 = A.repartition('u1', { level: 'pole', activityId: aShared }, { start: '2027-01-01', end: '2027-12-31' }, T0);
const mm = R2.categories[0].membres || [];
assert(mm.some((m) => m.userId === 'u1' && m.chronoMin > 0) && mm.some((m) => m.userId === 'u3' && m.chronoMin > 0) && !mm.some((m) => m.userId === 'u4'), 'pop-up : les membres avec du Chrono dans la catégorie, un membre absent n’y apparaît pas');
assert(mm.every((m) => typeof m.isResponsable === 'boolean' && 'plannedMin' in m), 'pop-up : chaque membre porte son Chrono, son prévu (null si inexistant, rien d’inventé) et s’il est responsable de l’activité');
const creerSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
assert(creerSrc.includes('function openHeures(spec, row, label)') && creerSrc.includes("'/api/objectifs/allocation/repartition'") && creerSrc.includes('objTable({ levelLabel:') && creerSrc.includes("crumbs.appendChild(back)"), 'pop-up S1 / S2 : même tableau que le dépassement (objTable), fil « ligne › catégorie », données de la répartition');
console.log(failed ? '\n' + failed + ' échec(s)' : 'allocation-test OK'); process.exit(failed ? 1 : 0);
