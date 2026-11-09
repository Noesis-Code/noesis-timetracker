// Création d'objectif : une activité est TOUJOURS présélectionnée (suggestedActivityId). Meilleure correspondance de mots si elle existe (inchangé) ; sinon l'activité qui a le plus de temps Chrono ; sinon la première de la liste.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-presel-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const mkUser = (id) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(id, id);
const mkAct = (u, name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, ?, '')").run(name, u).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '')").run(id, u); return id; };
const chrono = (u, act, hours) => db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, source) VALUES (?, ?, ?, ?, ?, ?, 2, 'manual')").run(u, act, today + 'T10:00:00Z', today + 'T11:00:00Z', Math.round(hours * 3600), today);
const sug = (u, text) => o.contexte(u, { text }).suggestedActivityId;

// Compte avec historique Chrono, titre sans mot en commun : l'activité où il y a le plus de temps
mkUser('u1'); const a1 = mkAct('u1', 'Marketing'), a2 = mkAct('u1', 'Atelier'), a3 = mkAct('u1', 'Famille');
chrono('u1', a1, 1); chrono('u1', a2, 5); chrono('u1', a3, 2);
assert(sug('u1', 'Courir un marathon') === a2, 'titre sans mot en commun, avec historique Chrono : l’activité qui a le plus de temps (Atelier)');
// Correspondance de mots : inchangé, la meilleure correspondance gagne même sans le plus de temps
assert(sug('u1', 'Refaire le marketing du site') === a1, 'correspondance de mots (score > 0) : la meilleure correspondance gagne (Marketing), inchangé');
// Égalité de scores : le premier de la liste classée (ordre de la liste des activités) reste choisi
mkUser('u2'); const b1 = mkAct('u2', 'Atelier bois'), b2 = mkAct('u2', 'Atelier fer');
chrono('u2', b2, 9);
assert(sug('u2', 'Ranger atelier') === b1, 'égalité de scores : la première de la liste (comportement inchangé)');
// Sans historique : la première activité de la liste
mkUser('u3'); const c1 = mkAct('u3', 'Zèbre'), c2 = mkAct('u3', 'Alpha');
assert(sug('u3', 'Courir un marathon') === c1 && c1 < c2, 'sans historique ni mot en commun : la première activité de la liste');
// Égalité de temps Chrono : la première de la liste
mkUser('u4'); const d1 = mkAct('u4', 'Un'), d2 = mkAct('u4', 'Deux'); chrono('u4', d1, 2); chrono('u4', d2, 2);
assert(sug('u4', 'Courir un marathon') === d1, 'égalité de temps Chrono : la première de la liste');
// Aucune activité : comme avant (null)
mkUser('u5');
assert(sug('u5', 'Courir un marathon') === null, 'aucune activité : null, comme avant');
console.log(failed ? '\nactivite-presel-test : ' + failed + ' ÉCHEC(S)' : '\nactivite-presel-test : OK');
process.exit(failed ? 1 : 0);
