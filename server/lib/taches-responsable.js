// RESPONSABLE D'UNE TÂCHE AU RANGEMENT (18 nov. 2026, décision d'Émilien, bloc 7 du schéma v11) : à chaque rangement l'app PROPOSE le responsable de la tâche, UNE seule proposition, correctible ; la correction est apprise.
//  - Une activité à UN seul membre : la tâche est à lui, sans calcul.
//  - Plusieurs membres avec des PARTS (task_share_wanted, « toi 60 %, moi 40 % ») : les parts DÉCIDENT l'attribution automatique : la tâche va à celui dont la part réelle de travail ouvert est la plus en dessous de sa part voulue.
//  - Égalité, ou aucune part saisie : le responsable de la catégorie, avec héritage (catégorie, puis pôle, puis propriétaire de l'activité : responsables.js).
//  - Le même titre déjà attribué par la personne : même responsable (mémoire exacte, taches-apprentissage).
// Règles gratuites, sans IA. Rien n'est écrit ici : le panneau de validation applique (taches-choix.corriger, champ « responsable »).
const db = require('../db');
const A = require('./taches-apprentissage');

const DEFAULT_MINUTES = 30; // durée par défaut d'une tâche sans estimation (même valeur que les statistiques)

function members(activityId) {
  try { return db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY COALESCE(position, 0), userId').all(activityId).map((r) => r.userId); } catch (e) {
    return db.prepare('SELECT userId FROM activity_members WHERE activityId = ? ORDER BY userId').all(activityId).map((r) => r.userId);
  }
}
// Temps voulu de chacun (task_share_wanted, minutes) : { userId: minutes } ; vide sans saisie.
function wanted(activityId) {
  const out = {};
  try { db.prepare('SELECT userId, minutes FROM task_share_wanted WHERE activityId = ?').all(activityId).forEach((r) => { if (r.minutes > 0) out[r.userId] = r.minutes; }); } catch (e) { /* table absente : aucune part */ }
  return out;
}
// Travail ouvert de chacun dans l'activité (minutes : médiane estimée, sinon 30) : { userId: minutes }.
function charge(activityId, excludeItemId) {
  const out = {};
  try {
    db.prepare(`SELECT i.plannedUserId AS u, SUM(COALESCE(i.medianMinutes, ?)) AS m FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId
      WHERE p.activityId = ? AND i.done = 0 AND i.plannedUserId IS NOT NULL AND i.id != ? GROUP BY i.plannedUserId`).all(DEFAULT_MINUTES, activityId, Number(excludeItemId) || 0).forEach((r) => { out[r.u] = r.m; });
  } catch (e) { /* sans charge connue */ }
  return out;
}

// userId : la personne qui range ; opts : { itemId, label, categoryKey, poleKey }. Renvoie TOUJOURS { userId, source: 'unique' | 'memoire' | 'parts' | 'responsable', raison } (jamais deux choix).
function proposer(userId, activityId, opts) {
  const o = opts || {};
  const ms = members(activityId);
  if (ms.length <= 1) return { userId: ms[0] || userId, source: 'unique', raison: 'Un seul membre : la tâche est à lui.' };
  try {
    const mem = o.label ? A.lastChoiceFor(userId, activityId, o.label, 'responsable') : null;
    if (mem && ms.includes(mem)) return { userId: mem, source: 'memoire', raison: 'Déjà attribuée ainsi pour ce titre.' };
  } catch (e) { /* suite */ }
  let manager = null;
  try { const r = require('./responsables').categorie(userId, activityId, o.categoryKey || '', o.poleKey || null); manager = r && ms.includes(r.userId) ? r.userId : null; } catch (e) { manager = null; }
  const w = wanted(activityId), tot = ms.reduce((s, u) => s + (w[u] || 0), 0);
  if (tot > 0) {
    const c = charge(activityId, o.itemId), load = ms.reduce((s, u) => s + (c[u] || 0), 0);
    // Écart entre la part voulue et la part réelle de travail ouvert : le plus grand écart positif reçoit la tâche.
    const gap = (u) => (w[u] || 0) / tot - (load > 0 ? (c[u] || 0) / load : 0);
    const ranked = ms.map((u) => ({ u, g: gap(u) })).sort((a, b) => b.g - a.g || (a.u === manager ? -1 : b.u === manager ? 1 : 0));
    const best = ranked[0];
    const tie = ranked[1] && Math.abs(ranked[1].g - best.g) < 1e-9;
    if (tie && manager && ranked.filter((r) => Math.abs(r.g - best.g) < 1e-9).some((r) => r.u === manager)) return { userId: manager, source: 'responsable', raison: 'Parts à égalité : le responsable de la catégorie.' };
    return { userId: best.u, source: 'parts', raison: 'Parts voulues : la plus en dessous de sa part.' };
  }
  return { userId: manager || userId, source: 'responsable', raison: 'Aucune part saisie : le responsable de la catégorie.' };
}

module.exports = { proposer, members, wanted, charge };
