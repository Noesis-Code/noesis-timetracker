// GET/PUT /api/activities/:id/repartition/:key — parts de tâches par membre d'une catégorie (18 nov. 2026). :key = pôle ou secteur, ou « _ » pour l'activité.
// POST /api/activities/:id/repartition/appliquer — lignes d'équilibrage acceptées / refusées une à une. Lecture : tout membre ; écriture : propriétaire seulement. Voir server/lib/repartition-membres.js.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/session');
const RM = require('../lib/repartition-membres');
const router = express.Router();

function access(req, res) {
  const id = Number(req.params.id), key = String(req.params.key || '_');
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
const fail = (res, e) => res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Erreur serveur.' });

router.get('/activities/:id/repartition/:key', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  res.json(Object.assign(RM.lire(a.id, a.key, req.userId), { canEdit: a.isOwner }));
});

router.put('/activities/:id/repartition/:key', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  if (!a.isOwner) return res.status(403).json({ error: 'Seul le propriétaire de l’activité peut modifier la répartition.' });
  try { const r = RM.poser(a.id, a.key, req.body && req.body.shares === null ? null : (req.body || {}).shares, (req.body || {}).hours, req.userId); res.json(Object.assign(r.lecture, { canEdit: true, proposition: r.proposition })); } catch (e) { fail(res, e); }
});

router.post('/activities/:id/repartition/:key/appliquer', requireAuth, (req, res) => {
  const a = access(req, res); if (!a) return;
  if (!a.isOwner) return res.status(403).json({ error: 'Seul le propriétaire de l’activité peut modifier la répartition.' });
  try { RM.appliquer(a.id, req.userId, (req.body || {}).acceptees, (req.body || {}).refusees); res.json(Object.assign(RM.lire(a.id, a.key, req.userId), { canEdit: true })); } catch (e) { fail(res, e); }
});

module.exports = router;
