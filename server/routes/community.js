const express = require('express');
const db = require('../db');
const {
  sharedActivitiesForUser, sharedFeedForUser, followingFeedForUser, activityMembersForUser,
  activityMessagesForUser, postActivityMessage, markActivityMessagesRead, unreadMessageCountsForUser,
  activityBreakdownForUser, activityDailyBreakdownForUser, activityTimesheetForUser,
} = require('../lib/community');
const { notifyActivityMessage } = require('../lib/push');

// Longueur maximale d'un message du fil de discussion : généreuse pour une
// conversation, mais bornée — le corps de requête d'Express est certes déjà
// limité globalement à 5 Mo (voir server/index.js, pour l'import CSV et les
// photos de profil), ce n'est pas une raison pour laisser stocker un roman
// par message.
const MAX_MESSAGE_LENGTH = 2000;

const router = express.Router();

// Contrôle d'accès commun à toutes les routes /community/activity-* : profil
// existant, activité existante, appelant membre de cette activité, activité
// bien partagée (>= 2 membres). Factorisé pour éviter la 4e copie du même
// enchaînement de vérifs (activity-feed, activity-members, activity-stats,
// activity-timesheet). Renvoie soit { error: { status, body } } soit
// { activity }.
function checkSharedActivityAccess(userId, activityId) {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return { error: { status: 404, body: { error: 'Profil introuvable.' } } };

  const activity = db.prepare('SELECT id, name FROM activities WHERE id = ?').get(activityId);
  if (!activity) return { error: { status: 404, body: { error: 'Activité introuvable.' } } };

  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };

  const membersCount = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activityId).n;
  if (membersCount < 2) return { error: { status: 400, body: { error: "Cette activité n'est pas partagée." } } };

  return { activity };
}

// Communauté = MES activités partagées (celles où je suis membre ET qui ont
// >= 2 membres), avec un classement par activité. Jamais les activités
// (encore) solo, ni celles des autres auxquelles je n'appartiens pas.
router.get('/community', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const period = ['day', 'week', 'month', 'year'].includes(req.query.period) ? req.query.period : 'week';
  res.json(sharedActivitiesForUser(userId, period, req.query.date || null));
});

// Flux "Partagée" : sessions des autres membres des activités que je
// partage actuellement — voir sharedFeedForUser dans lib/community.js.
router.get('/community/shared-feed', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  res.json(sharedFeedForUser(userId));
});

// Détail d'UNE activité partagée précise (section Membres > sélecteur
// d'activité) : sessions + notes des AUTRES membres de cette activité
// uniquement, jamais de toutes les activités partagées mélangées — voir
// sharedFeedForUser(userId, activityId) dans lib/community.js.
router.get('/community/activity-feed', (req, res) => {
  const userId = req.query.userId;
  const activityId = req.query.activityId;
  if (!userId || !activityId) return res.status(400).json({ error: 'userId et activityId requis.' });

  const check = checkSharedActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  res.json({ activityName: check.activity.name, entries: sharedFeedForUser(userId, activityId) });
});

// Liste des membres d'UNE activité partagée précise, avec indicateur "en
// direct" (chrono actuellement en cours sur CETTE activité, pas un chrono
// quelconque) — section Membres > menu "⋮" d'une ligne > "Voir les
// membres". Mêmes contrôles d'accès que /community/activity-feed.
router.get('/community/activity-members', (req, res) => {
  const userId = req.query.userId;
  const activityId = req.query.activityId;
  if (!userId || !activityId) return res.status(400).json({ error: 'userId et activityId requis.' });

  const check = checkSharedActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  res.json({ activityName: check.activity.name, members: activityMembersForUser(activityId) });
});

// ---------- Fil de discussion d'UNE activité partagée ----------
// Mêmes contrôles d'accès que les autres routes /community/activity-* :
// seuls les membres ACTUELS d'une activité effectivement partagée lisent et
// écrivent dans son fil. Ici le message reste, même une fois le chrono
// arrêté, et il n'y a pas d'audience à choisir.

router.get('/community/activity-messages', (req, res) => {
  const userId = req.query.userId;
  const activityId = req.query.activityId;
  if (!userId || !activityId) return res.status(400).json({ error: 'userId et activityId requis.' });

  const check = checkSharedActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const messages = activityMessagesForUser(activityId);

  // markRead=0 permet de rafraîchir le fil en arrière-plan (rechargement
  // périodique tant que l'écran est ouvert) sans effacer la pastille de
  // non-lus si la personne n'est pas réellement en train de le regarder.
  // Par défaut (paramètre absent), une lecture vaut lecture.
  if (req.query.markRead !== '0') markActivityMessagesRead(activityId, userId);

  res.json({ activityName: check.activity.name, messages: messages });
});

router.post('/community/activity-messages', (req, res) => {
  const userId = req.body.userId;
  const activityId = req.body.activityId;
  if (!userId || !activityId) return res.status(400).json({ error: 'userId et activityId requis.' });

  const check = checkSharedActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Message vide.' });
  if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Message trop long (2000 caractères maximum).' });

  const message = postActivityMessage(activityId, userId, body);

  // Notification push aux autres membres de l'activité (1er septembre 2026).
  // Volontairement APRÈS l'enregistrement et sans await : l'envoi part en
  // arrière-plan et ne peut jamais faire échouer l'écriture du message (voir
  // le principe posé en tête de server/lib/push.js). Sans clés VAPID
  // configurées, cet appel ne fait rien du tout.
  notifyActivityMessage(activityId, userId, body);

  res.status(201).json(message);
});

// Suppression d'un message : uniquement le sien. Le propriétaire de
// l'activité n'a AUCUN droit particulier ici — cohérent avec le reste de
// l'app, où chacun ne supprime que ses propres traces (une session, une
// note, son appartenance à une activité) et jamais celles des autres.
router.delete('/community/activity-messages/:id', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const message = db.prepare('SELECT id, activityId, userId FROM activity_messages WHERE id = ?').get(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message introuvable.' });
  if (message.userId !== userId) return res.status(403).json({ error: 'Tu ne peux supprimer que tes propres messages.' });

  db.prepare('DELETE FROM activity_messages WHERE id = ?').run(message.id);
  res.json({ ok: true });
});

// Total des messages non lus, toutes activités partagées confondues — sert
// la pastille de l'onglet Communauté, consultable depuis n'importe quel
// onglet sans charger tout le reste du volet.
router.get('/community/unread-messages', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  const byActivity = unreadMessageCountsForUser(userId);
  const total = Object.keys(byActivity).reduce((sum, k) => sum + byActivity[k], 0);
  res.json({ total: total, byActivity: byActivity });
});

// Statistiques d'UNE activité partagée (section Membres) : mêmes trois
// périodes (semaine/mois/année) + répartition quotidienne que /stats, mais
// l'axe de comparaison est les MEMBRES de cette activité, pas mes activités
// entre elles — voir activityBreakdownForUser/activityDailyBreakdownForUser
// dans lib/community.js. Mêmes contrôles d'accès que activity-feed/-members.
router.get('/community/activity-stats', (req, res) => {
  const userId = req.query.userId;
  const activityId = req.query.activityId;
  if (!userId || !activityId) return res.status(400).json({ error: 'userId et activityId requis.' });

  const check = checkSharedActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const refDate = req.query.date || null;
  const VALID_PERIODS = ['day', 'week', 'month', 'year'];
  const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'week';

  res.json({
    activityName: check.activity.name,
    week: activityBreakdownForUser(activityId, 'week', refDate),
    month: activityBreakdownForUser(activityId, 'month', refDate),
    year: activityBreakdownForUser(activityId, 'year', refDate),
    dailyBreakdown: activityDailyBreakdownForUser(activityId, period, refDate),
  });
});

// Feuille de temps d'UNE activité partagée (section Membres) : même grille
// jour × quart d'heure que /stats/timesheet, mais combinant les sessions de
// TOUS les membres actuels de cette activité — voir activityTimesheetForUser
// dans lib/community.js. Mêmes contrôles d'accès que les routes ci-dessus.
router.get('/community/activity-timesheet', (req, res) => {
  const userId = req.query.userId;
  const activityId = req.query.activityId;
  if (!userId || !activityId) return res.status(400).json({ error: 'userId et activityId requis.' });

  const check = checkSharedActivityAccess(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const weekOffset = parseInt(req.query.weekOffset, 10);
  if (req.query.weekOffset !== undefined && (isNaN(weekOffset) || weekOffset < 0)) {
    return res.status(400).json({ error: 'weekOffset invalide.' });
  }

  const data = activityTimesheetForUser(activityId, isNaN(weekOffset) ? 0 : weekOffset);
  res.json(Object.assign({ activityName: check.activity.name }, data));
});

// Flux "Suivi" : sessions des personnes que je suis et qui ont activé
// "Partager mon profil" — voir followingFeedForUser dans lib/community.js.
router.get('/community/following-feed', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  res.json(followingFeedForUser(userId));
});

// La route "En ce moment" (GET /community/live-feed, notes envoyées en
// direct par des membres/abonnés dont le chrono tourne encore) a été
// retirée le 1er septembre 2026 : orpheline des deux côtés depuis fin août
// (plus aucun lecteur depuis le 30 août, plus aucun écrivain depuis le 31 —
// voir noesis-timetracker-journal-communaute.md et l'audit
// noesis-timetracker-audit-doublons-code-mort.md, point A1).

module.exports = router;