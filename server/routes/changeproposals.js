// Modifications proposées (Essor). Logique : server/lib/changeproposals.js.
const express = require('express');
const db = require('../db');
const changeproposals = require('../lib/changeproposals');
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
const mw = [requireAuth, requireOffer1Access, guard];

router.get('/activities/:id/change-proposals', ...mw, (req, res) => {
  try { res.json({ proposals: changeproposals.list(Number(req.params.id), req.userId) }); } catch (e) { fail(res, e); }
});
// Demande à l'IA de chercher de nouvelles modifications (propositions seulement ; plafond IA quotidien partagé).
router.post('/activities/:id/change-proposals/generate', ...mw, async (req, res) => {
  try {
    const r = await changeproposals.generate(req.userId, Number(req.params.id), {});
    res.json({ ...r, proposals: changeproposals.list(Number(req.params.id), req.userId) });
  } catch (e) { fail(res, e); }
});
router.post('/activities/:id/change-proposals/apply', ...mw, (req, res) => {
  try { res.json(changeproposals.apply(req.userId, Number(req.params.id), (req.body || {}).ids)); } catch (e) { fail(res, e); }
});
router.post('/activities/:id/change-proposals/check', ...mw, (req, res) => {
  try { const b = req.body || {}; res.json(changeproposals.setChecked(Number(req.params.id), b.id, b.checked === true || b.checked === 1 || b.checked === '1')); } catch (e) { fail(res, e); }
});
router.post('/activities/:id/change-proposals/dismiss', ...mw, (req, res) => {
  try { res.json(changeproposals.dismiss(Number(req.params.id), (req.body || {}).ids)); } catch (e) { fail(res, e); }
});

module.exports = router;
