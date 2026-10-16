// Ajout de tâches depuis un document (Essor). Logique : server/lib/documenttasks.js.
const express = require('express');
const db = require('../db');
const documenttasks = require('../lib/documenttasks');
const { requireOffer1Access, activityHasEssor } = require('../lib/offer1access');
const { requireAuth } = require('../lib/session');

const router = express.Router();

// Membre de l'activité ET Essor sur cette activité.
function guard(req, res, next) {
  const id = Number(req.params.id);
  const member = Number.isInteger(id) && db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(id, req.userId);
  if (!member) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  if (!activityHasEssor(id, req.userId)) return res.status(403).json({ error: 'essor_required' });
  next();
}

function fail(res, e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Erreur serveur.' }); }

router.post('/activities/:id/document-tasks/propose', requireAuth, requireOffer1Access, guard, async (req, res) => {
  try { res.json(await documenttasks.propose(req.userId, Number(req.params.id), req.body || {})); } catch (e) { fail(res, e); }
});

router.post('/activities/:id/document-tasks/apply', requireAuth, requireOffer1Access, guard, (req, res) => {
  try { res.json(documenttasks.apply(req.userId, Number(req.params.id), (req.body || {}).tasks)); } catch (e) { fail(res, e); }
});

module.exports = router;
