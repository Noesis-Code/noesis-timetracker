// Exemples de correction du classement IA des taches.
// Un deplacement manuel d'une tache vers un autre secteur/pole est memorise
// PAR ACTIVITE et par utilisateur ; les derniers exemples DE CET UTILISATEUR sont reinjectes
// dans le prompt de classement de cette meme activite (jamais ceux d'un autre membre ni
// d'une autre activite : aucune donnee ne passe d'un compte a l'autre). Jamais bloquant : toute erreur est avalee.

const db = require('../db');

const MAX_LABEL = 120;
const KEEP_PER_ACTIVITY = 50;
const INJECT_COUNT = 5;
// Plafond du bloc d'exemples dans le prompt (~63 jetons pour les lignes + ~27 d'en-tete = ~90 jetons, soit
// <= +12 % sur un prompt de 12 categories) : au-dela, les exemples les plus anciens sont ignores.
const MAX_BLOCK_CHARS = 250;

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
// Apprentissage PAR UTILISATEUR (20 oct. 2026) : seules les corrections faites
// par `userId` lui-meme sont reinjectees (jamais celles d'un autre membre) ;
// sans userId, aucun exemple. Nombre limite a INJECT_COUNT et taille du bloc
// a MAX_BLOCK_CHARS.
function recentExamples(activityId, candidates, limit, userId) {
  try {
    if (!userId) return [];
    const byKey = new Map((candidates || []).map((c) => [c.key, c.label]));
    const rows = db.prepare('SELECT label, categoryKey FROM goal_classify_examples WHERE activityId = ? AND userId = ? ORDER BY id DESC LIMIT 30')
      .all(activityId, userId);
    const out = [];
    let size = 0;
    for (const r of rows) {
      const catLabel = byKey.get(r.categoryKey);
      if (!catLabel) continue;
      const len = r.label.length + catLabel.length + 6;
      if (size + len > MAX_BLOCK_CHARS) break;
      size += len;
      out.push({ label: r.label, categoryLabel: catLabel });
      if (out.length >= (limit || INJECT_COUNT)) break;
    }
    return out;
  } catch (e) {
    return [];
  }
}

// Remise a zero cote serveur : efface les exemples appris de CE compte (toutes activites).
// Appelee par DELETE /api/profile/:id/ai-examples et a la suppression du compte.
function resetForUser(userId) {
  try {
    if (!userId) return 0;
    return Number(db.prepare('DELETE FROM goal_classify_examples WHERE userId = ?').run(userId).changes) || 0;
  } catch (e) {
    return 0;
  }
}

module.exports = { recordCorrection, recentExamples, resetForUser, INJECT_COUNT, MAX_BLOCK_CHARS };
