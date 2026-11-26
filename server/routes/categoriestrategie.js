// GET/PUT /api/activities/:id/strategie-categorie/:key — document « Stratégie » d'une catégorie (18-19 nov. 2026). :key = clé du pôle ou du secteur, ou « _ » pour l'activité elle-même.
// Lecture : tout membre ; écriture : le propriétaire et les responsables de CETTE catégorie ou d'un niveau supérieur (droits de server/lib/responsables.js). On n'écrit jamais que sur la catégorie visée :
// le niveau inférieur ne modifie jamais le supérieur. Erreurs au format { error, code }. Voir server/lib/categorie-strategie.js et docs/ia/strategie-modele.md.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/session');
const CS = require('../lib/categorie-strategie');
const router = express.Router();

const fail = (res, status, error, code) => res.status(status).json({ error, code });
function canEdit(userId, id, key) {
  try { return !!require('../lib/responsables').listeCategorie(userId, id, key).canOpen; } catch (e) { return false; }
}
function access(req, res) {
  const id = Number(req.params.id), key = String(req.params.key || '');
  const act = Number.isInteger(id) && db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(id);
  const member = act && db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(id, req.userId);
  if (!member) { fail(res, 403, "Tu n'es pas membre de cette activité.", 'pas_membre'); return null; }
  if (key !== '_') {
    let ok = false;
    try { ok = !!require('../lib/goals').isValidCategoryOrSecteurForActivity(id, key); } catch (e) { ok = false; }
    if (!ok) { fail(res, 404, 'Catégorie introuvable.', 'categorie_introuvable'); return null; }
  }
  return { id, key, isOwner: act.ownerId === req.userId, canEdit: act.ownerId === req.userId || canEdit(req.userId, id, key) };
}
const view = (a) => Object.assign(CS.view(a.id, a.key), { canEdit: a.canEdit });

router.get('/activities/:id/strategie-categorie/:key', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  res.json(view(a));
});

router.put('/activities/:id/strategie-categorie/:key', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  if (!a.canEdit) return fail(res, 403, 'Seul un responsable de cette catégorie peut modifier la stratégie.', 'pas_responsable');
  try { CS.set(a.id, a.key, req.userId, req.body); res.json(view(a)); } catch (e) { if (e.statusCode) fail(res, e.statusCode, e.message, e.code || 'strategie_invalide'); else fail(res, 500, 'Erreur serveur.', 'erreur_serveur'); }
});

module.exports = router;
