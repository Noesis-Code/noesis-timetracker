// Répartition des tâches par membre (18 nov. 2026) : parts par catégorie, héritage, coordination vers le bas, heures, refus mémorisé, attribution automatique d'une tâche. Usage : node test/repartition-membres-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-repart-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'); require('../server/lib/partagetaches'); require('../server/lib/taches-rangement');
const alloc = require('../server/lib/allocation'), RM = require('../server/lib/repartition-membres'), T = require('../server/lib/taches-responsable');
['toi', 'gas'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Duo', 'toi', '')").run().lastInsertRowid);
['toi', 'gas'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(act, u));
const solo = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Solo', 'toi', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'toi', '#fff', '')").run(solo);
const lastKey = (l) => l[l.length - 1].key;
const A = lastKey(categories.addCategory(act, 'Pôle A')), B = lastKey(categories.addCategory(act, 'Pôle B')), A1 = lastKey(categories.addCategory(act, 'Secteur A1', A));
const day = '2000-01-02';
alloc.set('toi', { activityId: act, level: 'pole', poleKey: A }, day, 600); alloc.set('toi', { activityId: act, level: 'pole', poleKey: B }, day, 600);

// ---- seulement pour une activité à plusieurs membres ----
let refused = false; try { RM.poser(solo, '_', { toi: 100 }); } catch (e) { refused = e.statusCode === 400; }
assert(refused, 'activité à un seul membre : refusé');
// ---- parts invalides ----
refused = false; try { RM.poser(act, '_', { toi: 70, gas: 40 }); } catch (e) { refused = e.statusCode === 400; }
assert(refused, 'parts qui ne font pas 100 % : refusées');
// ---- héritage ----
RM.poser(act, '_', { toi: 60, gas: 40 });
let l = RM.lire(act, A1);
assert(l.own === null && l.effective.toi === 60 && l.origine === 'activité', "héritage : le secteur sans réponse reprend la part de l'activité");
// ---- coordination (19 nov. 2026) : changer l'ACTIVITÉ propose d'ajuster les pôles qui ont leurs parts ; changer un pôle ne propose rien vers le haut ----
RM.poser(act, A, { toi: 30, gas: 70 }); RM.poser(act, B, { toi: 60, gas: 40 });
let r = RM.poser(act, A, { toi: 25, gas: 75 });
assert(r.proposition.lignes.length === 0 && !r.proposition.suggestion, 'changer un pôle : ni ligne vers un voisin, ni changement proposé pour l’activité');
assert(RM.lire(act, '_').own.toi === 60, 'le niveau du dessus n’est jamais modifié par le niveau inférieur');
r = RM.poser(act, '_', { toi: 50, gas: 50 });
assert(r.proposition.statut === 'proposition' && r.proposition.lignes.length === 2 && r.proposition.lignes.every((l) => l.apres.toi === 50 && l.apres.gas === 50), 'changer l’activité : A et B (parts propres) sont proposés à 50/50');
assert(RM.lire(act, B).own.toi === 60, 'rien n’est écrit avant la validation ligne par ligne');
// ---- refus mémorisé ----
RM.appliquer(act, 'toi', [], r.proposition.lignes);
r = RM.poser(act, '_', { toi: 50, gas: 50 });
assert(r.proposition.lignes.length === 0, 'un refus est mémorisé : la même ligne ne revient pas');
// ---- acceptation ----
r = RM.poser(act, '_', { toi: 40, gas: 60 });
assert(r.proposition.lignes.length === 2, 'nouveau changement : nouvelles lignes');
RM.appliquer(act, 'toi', [{ key: B, apres: { toi: 40, gas: 60 } }], []);
assert(RM.lire(act, B).own.toi === 40, 'ligne acceptée : B est écrit tel que montré');
// ---- heures persistées : pourcentage calculé ----
r = RM.poser(act, A, null, { toi: 6, gas: 14 }, 'toi');
assert(r.lecture.hours.toi === 6 && r.lecture.hours.gas === 14 && r.lecture.own.toi === 30 && r.lecture.own.gas === 70, 'heures 6 h / 14 h : pourcentages 30 / 70 calculés et écrits, heures relues');
assert(RM.lire(act, A1).effectiveHours.toi === 6 && RM.lire(act, A1).hours === null, 'le secteur hérite des heures du pôle');
let bad = false; try { RM.poser(act, A, null, { toi: 0, gas: 0 }, 'toi'); } catch (e) { bad = e.statusCode === 400; }
assert(bad, 'total d’heures nul : refusé');
RM.poser(act, '_', null, { toi: 3, gas: 1 }, 'toi');
assert(RM.lire(act, '_').own.toi === 75 && RM.lire(act, '_').own.gas === 25, 'activité : 3 h / 1 h donnent 75 / 25');
// ---- attribution automatique selon les parts (secteur : hérite du pôle A à 30/70 sans charge) ----
RM.poser(act, A, { toi: 30, gas: 70 });
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdAt, createdBy, goalCategory) VALUES (?, 'sp', '', 'toi', ?)").run(act, A).lastInsertRowid);
const sec = Number(db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, position, createdAt) VALUES (?, 'tasks', 's', 'toi', 0, '')").run(sp).lastInsertRowid);
const mk = (u, m) => db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt, plannedUserId, medianMinutes) VALUES (?, ?, 'x', 0, 0, '', ?, ?)").run(sp, sec, u, m);
let a = T.proposer('toi', act, { label: 'Nouvelle', categoryKey: A1, poleKey: A });
assert(a.userId === 'gas' && a.source === 'parts', 'attribution : le secteur hérite 30/70 du pôle, la tâche va à Gaspard (plus grande part)');
mk('gas', 300);
a = T.proposer('toi', act, { label: 'Autre', categoryKey: A1, poleKey: A });
assert(a.userId === 'toi' && a.source === 'parts', 'attribution : Gaspard a déjà tout le travail ouvert de la catégorie, la tâche va à toi');
RM.poser(act, B, { toi: 90, gas: 10 });
a = T.proposer('toi', act, { label: 'Ailleurs', categoryKey: B, poleKey: B });
assert(a.userId === 'toi' && a.source === 'parts', 'attribution : la charge est comptée par catégorie (B à 90/10, rien d\'ouvert dans B : la plus grande part)');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout passe'); process.exit(failed ? 1 : 0);
