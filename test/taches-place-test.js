// Place d'une tâche dans son objectif (lot 2 du rangement des tâches, schéma v11 blocs 5, 6, 8) : stratégie par type d'objectif, chaîne de progression (5 km avant 10 km), courbe des délais,
// décalage des moins utiles, dépassement sans transfert d'heures, application validée et apprise. Usage : node test/taches-place-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-place-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const O = require('../server/lib/objectifs'); require('../server/lib/estimateur');
const P = require('../server/lib/taches-place'), R = require('../server/lib/taches-rangement'), A = require('../server/lib/taches-apprentissage');
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ---- Fonctions pures ----
assert(JSON.stringify(P.quantite('Courir 5 km')) === JSON.stringify({ valeur: 5, unite: 'km' }), 'quantité : « Courir 5 km » = 5 km');
assert(P.quantite('Courir le semi-marathon').valeur === 21.0975, 'quantité : semi-marathon = 21,0975 km');
assert(P.quantite('Réserver le dossard') === null && P.quantite('Appeler 3 personnes') === null, 'quantité : sans unité reconnue, ce n\'est pas un palier');
assert(P.importance({ taskKind: 'maintenance', maintUrgent: true }, 'projet') === 1, 'importance : maintenance urgente = rang 1');
assert(P.importance({ taskKind: 'developpement', phase: 'reformer' }, 'projet') === 2, 'importance : réformer = rang 2');
assert(P.importance({ taskKind: 'developpement', phase: 'cadrage' }, 'projet') === 3, 'importance projet : cadrage = rang 3');
assert(P.importance({ taskKind: 'developpement', phase: 'cadrage' }, 'progression') === 4, 'importance progression : pas de phases, rang 4');
let o = P.ordonner([{ id: 1, label: 'Courir 10 km' }, { id: 2, label: 'Courir 5 km' }, { id: 3, label: 'S\'inscrire à la course' }], 'progression', null);
assert(o.map((t) => t.id).join() === '2,1,3', 'chaîne : 5 km avant 10 km, la tâche sans chiffre garde sa place d\'ajout');
o = P.ordonner([{ id: 1, label: 'Atteindre 75 kg' }, { id: 2, label: 'Atteindre 80 kg' }], 'progression', 'inverse');
assert(o.map((t) => t.id).join() === '2,1', 'diminution : sens inverse, la plus grande valeur d\'abord');
o = P.ordonner([{ id: 1, label: 'Publier', taskKind: 'developpement', phase: 'finition' }, { id: 2, label: 'Définir le plan', taskKind: 'developpement', phase: 'cadrage' }, { id: 3, label: 'Réparer la fuite', taskKind: 'maintenance', maintUrgent: true }], 'projet', null);
assert(o.map((t) => t.id).join() === '3,2,1', 'projet : maintenance urgente, puis cadrage, puis finition');
const sem = (n) => Array.from({ length: n }, (_, i) => P.addDays('2027-01-04', 7 * i));
let pl = P.planifier(P.ordonner([{ id: 1, label: 'A', minutes: 60 }, { id: 2, label: 'B', minutes: 60 }, { id: 3, label: 'C', minutes: 60 }], 'projet', null), sem(5), 120, 'projet', null);
assert(pl.map((p) => p.idx).join() === '0,0,1', 'place : 120 min par semaine, trois tâches de 60 min : deux la première semaine, une la suivante');
pl = P.planifier(P.ordonner([{ id: 1, label: 'Courir 5 km', minutes: 30 }, { id: 2, label: 'Courir 10 km', minutes: 30 }], 'progression', null), sem(10), null, 'progression', () => 4);
assert(pl[0].idx === 0 && pl[1].idx === 4, 'courbe : le 10 km recule de 4 semaines (délai entre paliers), jamais d\'une seule case');
pl = P.planifier(P.ordonner([1, 2, 3, 4].map((i) => ({ id: i, label: 'T' + i, minutes: 60 })), 'projet', null), sem(2), 60, 'projet', null);
assert(pl[2].depasse && pl[3].depasse && !pl[0].depasse && !pl[1].depasse, 'dépassement : rien ne trouve de place dans le cadre, la tâche reste dans son objectif');
pl = P.planifier(P.ordonner([{ id: 1, label: 'Courir 5 km', minutes: 30 }, { id: 2, label: 'Courir 10 km', minutes: 30, date: sem(10)[1] }], 'progression', null), sem(10), null, 'progression', () => 4);
assert(pl[1].apresDate === true, 'date : une tâche repoussée après sa date est signalée');

// ---- Avec la base ----
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u2', 'u2', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const mkObj = (title, end, hpw, famille) => Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, level, metaJson, objectif_famille, createdAt) VALUES ('u1', ?, ?, 1, 'x', ?, ?, 'pole', ?, ?, '')")
  .run(act, title, plus(-10), end, JSON.stringify({ hoursPerWeek: hpw }), famille || null).lastInsertRowid);
const sp = Number(db.prepare("INSERT INTO sub_projects (activityId, name, createdAt, createdBy) VALUES (?, 'sp', '', 'u1')").run(act).lastInsertRowid);
const sec = Number(db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, title, createdBy, position, createdAt) VALUES (?, 'tasks', 's', 'u1', 0, '')").run(sp).lastInsertRowid);
const mk = (l, oid, due) => { const id = Number(db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt, dueDate) VALUES (?, ?, ?, 0, 0, '', ?)").run(sp, sec, l, due || null).lastInsertRowid); if (oid) R.setLink(id, { objectiveId: oid }); return id; };
const lundi = P.mondayOf(plus(0));
(async () => {
  // Scénario d'Émilien : « courir 10 km » est déjà rangé dans la première semaine ; on ajoute « courir 5 km ».
  const course = mkObj('Courir un 21 km', plus(300), 1, 'course');
  const t10 = mk('Courir 10 km', course, lundi);
  const t5 = mk('Courir 5 km', course, null);
  const insc = mk('S\'inscrire à la course', course, null);
  const meta0 = db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(course).metaJson;
  const p = await P.proposer('u1', { itemId: t5 }, { type: 'progression' });
  assert(p.strategie === 'progression' && p.objectiveId === course, 'la stratégie suit le type de l\'objectif (progression)');
  assert(p.chaine.length === 2 && p.chaine[0].id === t5 && p.chaine[1].id === t10 && p.chaine[0].nouvelle, 'la chaîne entière est affichée : le 5 km avant le 10 km');
  assert(p.chaine[0].semaine < p.chaine[1].semaine, 'le 5 km tombe avant le 10 km');
  const d10 = p.decales.find((d) => d.id === t10);
  assert(d10 && d10.avant === lundi && P.mondayOf(d10.apres) >= P.addDays(lundi, 28), 'le 10 km est décalé selon la courbe de l\'objectif (4 semaines du tableau, pas une case)');
  assert(p.rangement && p.rangement.itemId === t5 && p.lignes.length === 3, 'une seule proposition de place pour la tâche, avec les lignes de l\'objectif');
  assert(typeof p.responsableId === 'string', 'le responsable proposé accompagne la place');
  assert(p.objectifTitre === 'Courir un 21 km' && p.tache === 'Courir 5 km' && Array.isArray(p.membres), 'la proposition porte le titre de l\'objectif et la tâche (pour le panneau)');
  // Le délai réel de la personne remplace le tableau (courbe personnalisée).
  A.recordPalierDelay('u1', 'course', 5, 10, 2);
  const p2 = await P.proposer('u1', { itemId: t5 }, { type: 'progression' });
  const d10b = p2.decales.find((d) => d.id === t10);
  assert(d10b && P.mondayOf(d10b.apres) === P.addDays(lundi, 14), 'délai réel de la personne (2 semaines) : le 10 km recule de 2 semaines, le tableau général est remplacé');
  assert(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(course).metaJson === meta0, 'aucune heure ni donnée de l\'objectif modifiée par la proposition');
  assert(db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(t10).dueDate === lundi, 'proposer n\'écrit rien');
  // ---- Application validée, correction apprise ----
  const modifiee = p2.lignes.map((l) => (l.id === t10 ? Object.assign({}, l, { semaine: P.addDays(lundi, 21) }) : l));
  const r = P.appliquer('u1', { itemId: t5, objectiveId: course, lignes: modifiee, proposition: { lignes: p2.lignes } });
  assert(r.appliquees === 3, 'appliquer : les trois lignes validées sont écrites');
  assert(db.prepare('SELECT dueDate FROM sub_project_items WHERE id = ?').get(t10).dueDate === P.addDays(lundi, 21), 'la date de la tâche est le lundi de la semaine validée (celle que la personne a modifiée)');
  assert(db.prepare('SELECT chainRank FROM sub_project_items WHERE id = ?').get(t5).chainRank === 1, 'le rang de la chaîne est enregistré');
  assert(db.prepare("SELECT COUNT(*) n FROM task_rangement_corrections WHERE field = 'place'").get().n === 1, 'la ligne que la personne a changée est apprise (champ « place »)');
  let refus = false; try { P.appliquer('u2', { itemId: t5, objectiveId: course, lignes: [] }); } catch (e) { refus = e.statusCode === 404; }
  assert(refus, 'une personne qui n\'est pas membre de l\'activité ne peut rien appliquer');
  // ---- Projet : phases ----
  const site = mkObj('Refaire le site', plus(200), 5);
  const fin = mk('Publier le site', site), cad = mk('Définir le plan du site', site), rea = mk('Rédiger les pages', site);
  db.prepare("UPDATE sub_project_items SET taskKind = 'developpement', taskPhase = 'finition' WHERE id = ?").run(fin);
  db.prepare("UPDATE sub_project_items SET taskKind = 'developpement', taskPhase = 'cadrage' WHERE id = ?").run(cad);
  db.prepare("UPDATE sub_project_items SET taskKind = 'developpement', taskPhase = 'realisation' WHERE id = ?").run(rea);
  const q = await P.proposer('u1', { itemId: fin }, { type: 'projet' });
  assert(q.strategie === 'projet' && q.lignes.map((l) => l.id).join() === [cad, rea, fin].join(), 'projet : cadrage, puis réalisation, puis finition');
  assert(q.chaine.length === 3, 'projet : la chaîne des phases est affichée');
  // ---- Dépassement : un objectif court, une capacité minuscule ----
  const court = mkObj('Petit objectif', plus(10), 0.5);
  const c1 = mk('Tâche 1', court), c2 = mk('Tâche 2', court), c3 = mk('Tâche 3', court), c4 = mk('Tâche 4', court);
  const d = await P.proposer('u1', { itemId: c4 }, { type: 'projet' });
  assert(d.depassements.length >= 1 && d.rangement, 'dépassement : la tâche reste dans son objectif, signalée, sans changer d\'objectif');
  assert(db.prepare('SELECT objectiveId FROM sub_project_items WHERE id = ?').get(c4).objectiveId === court, 'aucun transfert vers un autre objectif');
  // ---- Sans objectif ----
  const libre = mk('Appeler le notaire', null);
  const s = await P.proposer('u1', { itemId: libre });
  assert(s.rangement === null && s.raison === 'sans objectif', 'sans objectif : aucune place proposée');
  // ---- Date d'atteinte : la lecture des objectifs ne casse rien ----
  let ok = true; try { O.liste('u1', 'tous'); } catch (e) { ok = false; }
  assert(ok, 'la lecture des objectifs (date d\'atteinte) ne casse rien');
  if (failed) { console.log('\nÉCHEC (' + failed + ')'); process.exit(1); }
  console.log('\nOK');
})().catch((e) => { console.error(e); process.exit(1); });
