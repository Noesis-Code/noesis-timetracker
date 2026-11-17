// Rangement des tâches (18 nov. 2026) : proposition UNIQUE de catégorie et d'objectif pour une tâche, et correction manuelle apprise. Voir server/lib/taches-choix.js.
// Rien n'est écrit par la proposition : le panneau de validation applique ensuite (POST /taches/rangement/corriger pour chaque lien validé).
const express = require('express');
const router = express.Router();
const db = require('../db');
const choix = () => require('../lib/taches-choix');
const fail = (res, tag, err) => {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[rangement] ' + tag, err);
  return res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
};

// body { activityId, label, date?, itemId? } -> { proposition: { categoryKey, objectiveId, parentItemId, source, confidence } }
router.post('/taches/choix', async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try {
    const b = req.body || {}, activityId = Number(b.activityId), label = String(b.label || '').trim().slice(0, 300);
    if (!label) return res.status(400).json({ error: 'Titre requis.' });
    if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, req.userId)) return res.status(404).json({ error: 'Activité introuvable.' });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : null;
    res.json({ proposition: await choix().choisir(req.userId, activityId, label, { date, itemId: Number(b.itemId) || null }) });
  } catch (err) { fail(res, 'POST /taches/choix', err); }
});
// body { itemId, field: 'objective' | 'group' | 'rank' | 'nature' | 'phase', to } -> lien final
router.post('/taches/rangement/corriger', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json({ lien: choix().corriger(req.userId, req.body || {}) }); } catch (err) { fail(res, 'POST /taches/rangement/corriger', err); }
});

// body { itemId, objectiveId? } -> { rangement, decales, chaine, depassements, responsableId, lignes } (PROPOSITION unique, rien n'est écrit ; schéma v11, blocs 5, 6, 8)
router.post('/taches/place', async (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json({ proposition: await require('../lib/taches-place').proposer(req.userId, req.body || {}) }); } catch (err) { fail(res, 'POST /taches/place', err); }
});
// body { itemId, objectiveId, lignes: [{ id, semaine, rang }], proposition?: { lignes }, responsableId? } -> { appliquees } : écrit ce que la personne valide ; chaque ligne changée est apprise.
router.post('/taches/place/appliquer', (req, res) => {
  if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
  try { res.json(require('../lib/taches-place').appliquer(req.userId, req.body || {})); } catch (err) { fail(res, 'POST /taches/place/appliquer', err); }
});

module.exports = router;
