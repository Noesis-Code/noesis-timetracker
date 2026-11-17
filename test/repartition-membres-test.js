// Répartition des tâches par membre (18 nov. 2026) : parts par catégorie, héritage, équilibrage proposé, impossible, refus mémorisé, attribution automatique d'une tâche. Usage : node test/repartition-membres-test.js
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
// ---- équilibrage proposé : A à 30/70 (10 h), B reste à 60/40 (10 h) ----
let r = RM.poser(act, A, { toi: 30, gas: 70 });
assert(r.proposition.statut === 'proposition' && r.proposition.lignes.length === 1 && r.proposition.lignes[0].key === B && r.proposition.lignes[0].apres.toi === 90, 'équilibrage : B proposé à 90/10 pour rester à 60/40');
assert(RM.lire(act, B).own === null, 'rien n\'est écrit avant la validation ligne par ligne');
// ---- refus mémorisé ----
RM.appliquer(act, 'toi', [], r.proposition.lignes);
r = RM.poser(act, A, { toi: 30, gas: 70 });
assert(r.proposition.lignes.length === 0, 'un refus est mémorisé : la même ligne ne revient pas');
// ---- acceptation : la moyenne retombe sur 60/40 ----
RM.poser(act, A, { toi: 25, gas: 75 });
r = RM.poser(act, A, { toi: 30, gas: 70 });
RM.appliquer(act, 'toi', [{ key: B, apres: { toi: 90, gas: 10 } }], []);
assert(RM.lire(act, B).own.toi === 90, 'ligne acceptée : B est écrit tel que montré');
assert(RM.lire(act, '_').calculee.toi === 60, "la moyenne pondérée par le temps retombe sur la part de l'activité");
// ---- impossible : aucun message d'erreur, proposition de changer l'activité ----
alloc.set('toi', { activityId: act, level: 'pole', poleKey: A }, '2001-01-01', 6000);
r = RM.poser(act, A, { toi: 0, gas: 100 });
assert(r.proposition.statut === 'impossible' && r.proposition.suggestion && r.proposition.suggestion.key === '' && r.proposition.lignes.length === 0, "impossible : on propose de modifier la part de l'activité, sans erreur");
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
a = T.proposer('toi', act, { label: 'Ailleurs', categoryKey: B, poleKey: B });
assert(a.userId === 'toi' && a.source === 'parts', 'attribution : la charge est comptée par catégorie (B à 90/10, rien d\'ouvert dans B : la plus grande part)');
console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout passe'); process.exit(failed ? 1 : 0);
