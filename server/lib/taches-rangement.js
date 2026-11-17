// RANGEMENT DES TÂCHES, modèle de données (18 nov. 2026, schéma « Rangement d'une tâche » v10).
// Une tâche (sub_project_items) porte désormais : l'OBJECTIF qui l'accueille (objectiveId -> user_objectives.id), la tâche qui la REGROUPE (parentItemId : « étape de »),
// et son RANG dans la chaîne de l'objectif (chainRank : 1 = d'abord). Nature et phase existent déjà (taskKind, maintType, maintUrgent, taskPhase : taskkind.js).
// Rétro-compatible : colonnes nullables ajoutées par ALTER, aucune donnée supprimée ; sans lien (NULL), tout se comporte comme avant.
// Pas de clé étrangère SQL (ALTER SQLite) : un lien vers un objectif supprimé est ignoré à la lecture (readLink vérifie l'existence).
const db = require('../db');

function ensureColumns() {
  const cols = db.prepare('PRAGMA table_info(sub_project_items)').all().map((c) => c.name);
  if (!cols.includes('objectiveId')) db.exec('ALTER TABLE sub_project_items ADD COLUMN objectiveId INTEGER');
  if (!cols.includes('parentItemId')) db.exec('ALTER TABLE sub_project_items ADD COLUMN parentItemId INTEGER');
  if (!cols.includes('chainRank')) db.exec('ALTER TABLE sub_project_items ADD COLUMN chainRank INTEGER');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sub_project_items_objective ON sub_project_items(objectiveId)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sub_project_items_parent ON sub_project_items(parentItemId)');
}
ensureColumns();

const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// Cycle : la tâche `parent` descend-elle déjà de `id` (en remontant ses parents) ?
function wouldCycle(id, parent) {
  const sel = db.prepare('SELECT parentItemId FROM sub_project_items WHERE id = ?');
  let cur = parent, guard = 0;
  while (cur && guard++ < 50) { if (cur === id) return true; const r = sel.get(cur); cur = r && r.parentItemId; }
  return false;
}

// Lien lisible : un objectif supprimé ou une tâche regroupante supprimée disparaît du lien (null) sans erreur.
function readLink(itemId) {
  const r = db.prepare('SELECT objectiveId, parentItemId, chainRank FROM sub_project_items WHERE id = ?').get(posInt(itemId) || 0);
  if (!r) return null;
  let objectiveId = r.objectiveId || null, parentItemId = r.parentItemId || null;
  if (objectiveId) { try { if (!db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(objectiveId)) objectiveId = null; } catch (e) { objectiveId = null; } }
  if (parentItemId && !db.prepare('SELECT 1 FROM sub_project_items WHERE id = ?').get(parentItemId)) parentItemId = null;
  return { objectiveId, parentItemId, chainRank: r.chainRank || null };
}

// Pose les liens d'une tâche (chaque champ absent du patch reste tel quel ; null efface). Refuse qu'une tâche soit sa propre étape ou qu'un cycle se forme. Renvoie le lien final.
function setLink(itemId, patch) {
  const id = posInt(itemId);
  if (!id) return null;
  const cur = db.prepare('SELECT objectiveId, parentItemId, chainRank FROM sub_project_items WHERE id = ?').get(id);
  if (!cur) return null;
  const p = patch || {};
  const next = { objectiveId: cur.objectiveId, parentItemId: cur.parentItemId, chainRank: cur.chainRank };
  if ('objectiveId' in p) next.objectiveId = p.objectiveId == null ? null : posInt(p.objectiveId);
  if ('chainRank' in p) next.chainRank = p.chainRank == null ? null : posInt(p.chainRank);
  if ('parentItemId' in p) {
    const par = p.parentItemId == null ? null : posInt(p.parentItemId);
    if (par && (par === id || wouldCycle(id, par))) return readLink(id);
    next.parentItemId = par;
  }
  db.prepare('UPDATE sub_project_items SET objectiveId = ?, parentItemId = ?, chainRank = ? WHERE id = ?').run(next.objectiveId, next.parentItemId, next.chainRank, id);
  return readLink(id);
}

// Les étapes d'une tâche regroupante, dans l'ordre (rang, puis création).
function stepsOf(parentItemId) {
  return db.prepare('SELECT id, label, done, dueDate, chainRank FROM sub_project_items WHERE parentItemId = ? ORDER BY COALESCE(chainRank, 1000000), id').all(posInt(parentItemId) || 0);
}
// Les tâches rangées dans un objectif, dans l'ordre de la chaîne.
function tasksOf(objectiveId) {
  return db.prepare('SELECT id, label, done, dueDate, chainRank, parentItemId FROM sub_project_items WHERE objectiveId = ? ORDER BY COALESCE(chainRank, 1000000), id').all(posInt(objectiveId) || 0);
}

// CLASSEMENT SILENCIEUX par règles (taskkind.js : aucune IA, aucun réseau, gratuit) d'une tâche qui n'a pas encore de nature : nature, phase, urgence. Ne touche jamais une tâche déjà classée
// (choix de la personne ou classement plus riche de la bulle de capture). Renvoie le résultat posé ou null.
function classerSilencieux(itemId) {
  const id = posInt(itemId);
  if (!id) return null;
  const r = db.prepare('SELECT i.id, i.label, i.taskKind, p.activityId, p.goalCategory FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId WHERE i.id = ?').get(id);
  if (!r || r.taskKind) return null;
  const tk = require('./taskkind');
  const res = tk.compute({ label: r.label, activityId: r.activityId, categoryKey: r.goalCategory || null });
  if (!res || !res.kind) return null; // sans signal assez net : neutre, comme avant (aucun effet)
  tk.write(id, res);
  return res;
}

// CADRE DE DÉCALAGE d'une tâche rangée dans un objectif (« jamais au-delà de l'arbre ») : où ses voisines moins utiles peuvent reculer.
//  hebdomadaire -> sa période (4 semaines) ; périodique -> son année ; annuel, pluriannuel -> la fin de son BLOC DE 5 ANS (une tâche peut viser un objectif dans 5 ans ; le bloc commence à l'année en cours).
// Renvoie { type, start, end } (dates AAAA-MM-JJ, bornes comprises) ou null (objectif inconnu).
function cadreDeDecalage(objectiveId) {
  const row = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(posInt(objectiveId) || 0);
  if (!row) return null;
  const O = require('./objectifs'), T = require('./objectifs-trou');
  const type = T.typeOfRow(row);
  if (type === 'hebdomadaire') { const s0 = O.periodStartOf(row.endDate); return { type, start: s0, end: O.addDays(s0, 27) }; }
  if (type === 'periodique') { const g = O.gridOf(row.endDate).grid; return { type, start: g, end: O.addDays(g, 363) }; }
  const b0 = O.blockYearOf(row.endDate); // bloc de 5 ans FIXE
  const start = O.gridOf(b0 + '-01-15').grid, next = O.gridOf((b0 + 5) + '-01-15').grid;
  return { type, start, end: O.addDays(next, -1) };
}

module.exports = { cadreDeDecalage, classerSilencieux, setLink, readLink, stepsOf, tasksOf, wouldCycle, ensureColumns };
