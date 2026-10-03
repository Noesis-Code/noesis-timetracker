// Exemples de correction du classement IA des taches (3 oct. 2026).
// Un deplacement manuel d'une tache vers un autre secteur/pole est memorise
// PAR ACTIVITE ; les derniers exemples sont reinjectes dans le prompt de
// classement de cette meme activite (jamais d'une autre : aucune donnee ne
// passe d'un groupe a l'autre). Jamais bloquant : toute erreur est avalee.

const db = require('../db');

const MAX_LABEL = 120;
const KEEP_PER_ACTIVITY = 50;
const INJECT_COUNT = 8;

function recordCorrection(activityId, userId, label, categoryKey) {
  try {
    const clean = String(label || '').trim().slice(0, MAX_LABEL);
    if (!clean || !categoryKey) return;
    db.prepare('INSERT INTO goal_classify_examples (activityId, userId, label, categoryKey, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(activityId, userId || null, clean, categoryKey, new Date().toISOString());
    db.prepare(`DELETE FROM goal_classify_examples WHERE activityId = ? AND id NOT IN
      (SELECT id FROM goal_classify_examples WHERE activityId = ? ORDER BY id DESC LIMIT ?)`)
      .run(activityId, activityId, KEEP_PER_ACTIVITY);
  } catch (e) {
    // non bloquant
  }
}

// Derniers exemples (du plus recent au plus ancien) avec libelles lisibles
// "Pole → Secteur" ; ceux dont la categorie n'est plus candidate sont ignores.
function recentExamples(activityId, candidates, limit) {
  try {
    const byKey = new Map((candidates || []).map((c) => [c.key, c.label]));
    const rows = db.prepare('SELECT label, categoryKey FROM goal_classify_examples WHERE activityId = ? ORDER BY id DESC LIMIT 30')
      .all(activityId);
    const out = [];
    for (const r of rows) {
      const catLabel = byKey.get(r.categoryKey);
      if (catLabel) out.push({ label: r.label, categoryLabel: catLabel });
      if (out.length >= (limit || INJECT_COUNT)) break;
    }
    return out;
  } catch (e) {
    return [];
  }
}

module.exports = { recordCorrection, recentExamples };
