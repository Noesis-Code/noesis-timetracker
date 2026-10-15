// Accomplissements (lot C) : aperçu des rapprochements puis application des
// seuls rapprochements validés. Logique dans server/lib/accomplishments.js.
const express = require('express');
const db = require('../db');
const accomplishments = require('../lib/accomplishments');
const { requireOffer1Access } = require('../lib/offer1access');
const { requireAuth } = require('../lib/session');

const router = express.Router();

function guard(req, res) {
  if (!req.userId) { res.status(401).json({ error: 'Non authentifié. Reconnecte-toi.', needsLogin: true }); return null; }
  const activityId = Number(req.params.id);
  const member = Number.isInteger(activityId)
    && db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, req.userId);
  if (!member) { res.status(403).json({ error: "Tu n'es pas membre de cette activité." }); return null; }
  return activityId;
}

function handle(res, fn) {
  try { res.json(fn()); } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Erreur serveur.' }); }
}

router.post('/activities/:id/accomplishments/preview', requireAuth, requireOffer1Access, (req, res) => {
  const id = guard(req, res); if (id == null) return;
  handle(res, () => accomplishments.preview(req.userId, id, (req.body || {}).entries));
});

router.post('/activities/:id/accomplishments/apply', requireAuth, requireOffer1Access, (req, res) => {
  const id = guard(req, res); if (id == null) return;
  handle(res, () => accomplishments.apply(req.userId, id, (req.body || {}).validated));
});

module.exports = router;
