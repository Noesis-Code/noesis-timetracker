// GET/PUT /api/activities/:id/strategie-categorie/:key — panneau « Stratégie » d'une catégorie (18 nov. 2026). :key = clé du pôle ou du secteur, ou « _ » pour l'activité elle-même.
// Lecture : tout membre ; écriture : propriétaire de l'activité seulement (comme la description et les responsables des catégories). Voir server/lib/categorie-strategie.js.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/session');
const CS = require('../lib/categorie-strategie');
const router = express.Router();

function access(req, res) {
  const id = Number(req.params.id), key = String(req.params.key || '');
  const act = Number.isInteger(id) && db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(id);
  const member = act && db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(id, req.userId);
  if (!member) { res.status(403).json({ error: "Tu n'es pas membre de cette activité." }); return null; }
  if (key !== '_') {
    let ok = false;
    try { ok = !!require('../lib/goals').isValidCategoryOrSecteurForActivity(id, key); } catch (e) { ok = false; }
    if (!ok) { res.status(404).json({ error: 'Catégorie introuvable.' }); return null; }
  }
  return { id, key, isOwner: act.ownerId === req.userId };
}
const view = (a) => ({ own: CS.own(a.id, a.key), effective: CS.effective(a.id, a.key), familles: CS.familles(), canEdit: a.isOwner });

router.get('/activities/:id/strategie-categorie/:key', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  res.json(view(a));
});

router.put('/activities/:id/strategie-categorie/:key', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  if (!a.isOwner) return res.status(403).json({ error: 'Seul le propriétaire de l’activité peut modifier la stratégie.' });
  try { CS.set(a.id, a.key, req.userId, req.body); res.json(view(a)); } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Erreur serveur.' }); }
});

module.exports = router;
