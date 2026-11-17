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

module.exports = { setLink, readLink, stepsOf, tasksOf, wouldCycle, ensureColumns };
