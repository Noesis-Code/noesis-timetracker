// Lecture/écriture des 4 formulaires persistants de l'Offre 1 — indépendantes
// du paiement (voir server/lib/offerforms.js). Utilisées par le parcours
// d'achat (étape formulaires) ET par l'édition permanente après abonnement
// (Réglages > activité, et le raccourci au-dessus des sous-projets épinglés)
// — un seul jeu de routes pour les deux, exactement comme le prévoit
// l'écran côté client.
const express = require('express');
const sp = require('../lib/subprojects');
const forms = require('../lib/offerforms');
const { requireAuth } = require('../lib/session');

const router = express.Router();

function checkActivityAccess(req, res, activityId) {
  if (!sp.isActivityMember(req.userId, activityId)) {
    res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
    return false;
  }
  return true;
}

function validAnswers(req, res) {
  const answers = req.body.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    res.status(400).json({ error: 'answers requis (objet).' });
    return null;
  }
  return answers;
}

router.get('/activities/:activityId/forms', requireAuth, (req, res) => {
  const activityId = Number(req.params.activityId);
  if (!checkActivityAccess(req, res, activityId)) return;
  res.json(forms.activityForms(activityId));
});

router.put('/activities/:activityId/forms/:kind', requireAuth, (req, res) => {
  const activityId = Number(req.params.activityId);
  const kind = req.params.kind;
  if (forms.ACTIVITY_FORM_KINDS.indexOf(kind) === -1) {
    return res.status(400).json({ error: 'Type de formulaire inconnu.' });
  }
  if (!checkActivityAccess(req, res, activityId)) return;
  const answers = validAnswers(req, res);
  if (!answers) return;
  res.json(forms.saveActivityForm(activityId, kind, req.userId, answers));
});

// Profil client : toujours req.userId, jamais de paramètre cible — même
// principe que le reste de server/routes/profile.js.
router.get('/profile-form', requireAuth, (req, res) => {
  res.json(forms.clientProfileForm(req.userId));
});

router.put('/profile-form', requireAuth, (req, res) => {
  const answers = validAnswers(req, res);
  if (!answers) return;
  res.json(forms.saveClientProfileForm(req.userId, answers));
});

module.exports = router;
