// Conversations par projet, notes de tâches, tâches éphémères — voir server/lib/conversations.js.
const express = require('express');
const conv = require('../lib/conversations');
const goalstasks = require('../lib/goalstasks');
const goals = require('../lib/goals');
const { containsBlockedWord, BLOCKED_MESSAGE } = require('../lib/blockedwords');
const { sendToUsers } = require('../lib/push');
const db = require('../db');

const router = express.Router();

function wrap(fn) {
  return (req, res) => {
    if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
    try { fn(req, res); } catch (e) {
      if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error('[conversations]', e);
      res.status(500).json({ error: 'Erreur serveur.' });
    }
  };
}
const blocked = (res, text) => {
  if (!containsBlockedWord(text)) return false;
  res.status(422).json({ error: BLOCKED_MESSAGE, blocked: true });
  return true;
};

// Liste : conversations de groupe + mes messages individuels d'un projet partagé.
router.get('/activities/:id/conversations', wrap((req, res) => {
  res.json(conv.listConversations(req.userId, Number(req.params.id)));
}));

router.post('/activities/:id/conversations', wrap((req, res) => {
  const activityId = Number(req.params.id);
  if (req.body.withUserId) return res.status(201).json(conv.openDirectConversation(req.userId, activityId, String(req.body.withUserId)));
  if (blocked(res, req.body.title)) return;
  res.status(201).json(conv.createGroupConversation(req.userId, activityId, req.body.title, req.body.itemId ? Number(req.body.itemId) : null));
}));

router.get('/conversations/:id/messages', wrap((req, res) => {
  res.json(conv.messages(req.userId, Number(req.params.id), req.query.markRead !== '0'));
}));

router.post('/conversations/:id/messages', wrap((req, res) => {
  if (blocked(res, req.body.body)) return;
  const r = conv.postMessage(req.userId, Number(req.params.id), req.body.body);
  res.status(201).json(r.message);
  try {
    const c = r.conv;
    const author = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
    const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(c.activityId);
    const recipients = c.kind === 'direct'
      ? [c.userA, c.userB].filter((u) => u !== req.userId)
      : db.prepare('SELECT userId FROM activity_members WHERE activityId = ? AND userId != ? AND notifyEnabled = 1').all(c.activityId, req.userId).map((x) => x.userId);
    if (recipients.length && author && act) {
      sendToUsers(recipients, { title: '💬 ' + act.name, body: author.name + ' : ' + r.message.body.slice(0, 120), module: 'sharing', tag: 'project-conv-' + c.id, url: '/?notif=activity&activityId=' + c.activityId });
    }
  } catch (e) { /* notification jamais bloquante */ }
}));

router.get('/community/project-conversations-unread', wrap((req, res) => {
  res.json({ byActivity: conv.unreadByActivity(req.userId) });
}));

// Projets partagés en commun avec une autre personne (écrire depuis son profil).
router.get('/conversations/common-projects/:otherUserId', wrap((req, res) => {
  res.json({ projects: conv.commonProjects(req.userId, req.params.otherUserId) });
}));

// Notes de tâches.
router.get('/activities/:id/notes/latest', wrap((req, res) => {
  res.json({ notes: conv.latestNotes(req.userId, Number(req.params.id), 3) });
}));
router.get('/items/:itemId/notes', wrap((req, res) => {
  res.json({ notes: conv.notesForItem(req.userId, Number(req.params.itemId)) });
}));
router.post('/items/:itemId/notes', wrap((req, res) => {
  if (blocked(res, req.body.body)) return;
  res.status(201).json(conv.addNote(req.userId, Number(req.params.itemId), req.body.body));
}));

// Tâches actives de l'activité (pour choisir où poser une note) + catégories (pour une tâche éphémère).
router.get('/activities/:id/notes/tasks', wrap((req, res) => {
  const activityId = Number(req.params.id);
  conv.assertAccess(req.userId, activityId, false);
  const tasks = goalstasks.allTasksWithGroup(activityId).filter((t) => !t.done)
    .map((t) => ({ id: t.id, label: t.label, groupLabel: t.groupLabel, key: t.key }));
  const seen = {}, categories = [];
  goals.categoriesForActivity(activityId).forEach((pole) => {
    const sect = goals.secteursForPole(activityId, pole.key) || [];
    (sect.length ? sect : [pole]).forEach((t) => { if (!seen[t.key]) { seen[t.key] = 1; categories.push({ key: t.key, label: t.label }); } });
  });
  res.json({ tasks, categories });
}));

// Tâche éphémère : création (tâche ordinaire + date d'expiration) et liste.
router.post('/activities/:id/ephemeral-tasks', wrap((req, res) => {
  const activityId = Number(req.params.id);
  conv.assertAccess(req.userId, activityId, false);
  if (blocked(res, req.body.label)) return;
  if (!goals.isValidCategoryOrSecteurForActivity(activityId, req.body.categoryKey)) return res.status(400).json({ error: 'Catégorie invalide pour cette activité.' });
  const days = Number(req.body.days);
  if (!Number.isFinite(days) || days < 1 || days > 30) return res.status(400).json({ error: 'Durée invalide (1 à 30 jours).' });
  const item = goalstasks.addCategoryTask(activityId, req.userId, req.body.categoryKey, req.body.label, {});
  const expiresAt = conv.setEphemeral(item.id, days);
  res.status(201).json({ id: item.id, label: item.label, expiresAt });
}));
router.get('/activities/:id/ephemeral-tasks', wrap((req, res) => {
  res.json({ tasks: conv.ephemeralForActivity(req.userId, Number(req.params.id)) });
}));

// Purge des tâches éphémères échues : au démarrage puis toutes les heures.
function purge() { try { conv.purgeExpired(); } catch (e) { console.error('[conversations] purge', e.message); } }
purge();
setInterval(purge, 3600000).unref();

module.exports = router;
