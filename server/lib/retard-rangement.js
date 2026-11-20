'use strict';
// RETARD ET OBJECTIF D'UNE TÂCHE (20 nov. 2026, décision d'Émilien) : une tâche que le retard sort de son objectif (retirée de la période suivante, ou sans place avant l'échéance : niveaux A et B)
// relance la recherche d'objectif du rangement (taches-choix.js, étapes 1 à 4 du schéma « Rangement d'une tâche »), avec un champ RÉDUIT :
//   - jamais plus loin que la période SUIVANTE : la date de départ est le début de la période suivante, seuls comptent les objectifs qui la couvrent et qui commencent avant sa fin ;
//   - la catégorie de la tâche reste celle de la tâche (aucune recatégorisation) ;
//   - UNE seule réponse (doute = l'échéance la plus proche, comme à la création) ; aucun objectif ne convient = la tâche reste dans son objectif (dépassement, rien ne change).
// SILENCIEUX, comme tout le retard (aucun panneau, aucun message) : le changement s'applique seul. Une ligne par (tâche, objectif de départ) garde la trace et empêche de recommencer.
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS retard_propositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  itemId INTEGER NOT NULL,
  activityId INTEGER NOT NULL,
  fromObjectiveId INTEGER NOT NULL,
  toObjectiveId INTEGER NOT NULL,
  toTitle TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  etat TEXT NOT NULL DEFAULT 'acceptee',
  createdAt TEXT NOT NULL,
  decidedAt TEXT,
  UNIQUE(userId, itemId, fromObjectiveId)
)`);

const MAX_PAR_PASSE = 5;
const parse = (json, dflt) => { try { const v = JSON.parse(json); return v == null ? dflt : v; } catch (e) { return dflt; } };

// Début et fin de la période SUIVANTE de l'évaluation (ev.wins[1] : fenêtres de la période suivante) ; null s'il n'y en a pas (dernière période : la tâche reste en dépassement).
function periodeSuivante(ev) {
  const w = ev && ev.wins && ev.wins[1];
  if (!w || !w.length) return null;
  return { start: w[0].start, end: w[w.length - 1].end };
}

// Range chaque tâche listée (ids) dans le meilleur objectif de la période suivante, seul. Asynchrone (appel IA possible), jamais bloquant : toute erreur est ignorée. Renvoie le nombre de tâches changées d'objectif.
async function proposer(userId, ev, ids) {
  const suiv = periodeSuivante(ev);
  if (!suiv || !ids || !ids.length) return 0;
  const choix = require('./taches-choix');
  let n = 0;
  for (const id of ids.slice(0, MAX_PAR_PASSE)) {
    try {
      const deja = db.prepare('SELECT 1 FROM retard_propositions WHERE userId = ? AND itemId = ? AND fromObjectiveId = ?').get(userId, id, ev.objectifId);
      if (deja) continue; // déjà rangée pour cet objectif de départ : jamais refait
      const t = (ev.mine || []).find((x) => x.id === id);
      if (!t) continue;
      const p = await choix.choisir(userId, ev.activityId, t.label, { date: suiv.start, categoryKey: t.category || null, itemId: id });
      const oid = p && p.objectiveId ? Number(p.objectiveId) : 0;
      if (!oid || oid === ev.objectifId) continue; // aucun objectif ne convient, ou le même : la tâche reste où elle est
      const o = db.prepare('SELECT id, title, startDate, endDate FROM user_objectives WHERE id = ? AND userId = ?').get(oid, userId);
      if (!o || o.startDate > suiv.end || o.endDate < suiv.start) continue; // jamais plus loin que la période suivante
      const ins = db.prepare("INSERT OR IGNORE INTO retard_propositions (userId, itemId, activityId, fromObjectiveId, toObjectiveId, toTitle, date, etat, createdAt, decidedAt) VALUES (?,?,?,?,?,?,?,'acceptee',?,?)")
        .run(userId, id, ev.activityId, ev.objectifId, o.id, o.title || '', suiv.start, new Date().toISOString(), new Date().toISOString());
      if (ins.changes) { appliquer({ itemId: id, fromObjectiveId: ev.objectifId, toObjectiveId: o.id, date: suiv.start }); n += 1; }
    } catch (e) { /* non bloquant */ }
  }
  return n;
}

// Le lien de la tâche change d'objectif, elle prend la date de la période suivante, et les deux listes de tâches des objectifs suivent.
function appliquer(r) {
  const R = require('./taches-rangement');
  const setIds = db.prepare('UPDATE user_objectives SET taskIdsJson = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    R.setLink(r.itemId, { objectiveId: r.toObjectiveId });
    db.prepare('UPDATE sub_project_items SET dueDate = ? WHERE id = ?').run(r.date, r.itemId);
    const f = db.prepare('SELECT taskIdsJson FROM user_objectives WHERE id = ?').get(r.fromObjectiveId);
    if (f) setIds.run(JSON.stringify(parse(f.taskIdsJson, []).filter((x) => x !== r.itemId)), r.fromObjectiveId);
    const t = db.prepare('SELECT taskIdsJson FROM user_objectives WHERE id = ?').get(r.toObjectiveId);
    if (t) { const l = parse(t.taskIdsJson, []); if (!l.includes(r.itemId)) l.push(r.itemId); setIds.run(JSON.stringify(l), r.toObjectiveId); }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { proposer, periodeSuivante };
