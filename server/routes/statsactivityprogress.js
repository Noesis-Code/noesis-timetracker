// GET /api/stats/activity-progress?activityId=… — Statistiques, page 2
// (lecture seule). Même garde d'appartenance que routes/goals.js.
const express = require('express');
const db = require('../db');
const progress = require('../lib/statsactivityprogress');
const insights = require('../lib/statsinsights');
const partage = require('../lib/partagetaches');

const router = express.Router();

router.get('/stats/activity-progress', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId requis.' });
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  try { return res.json(progress.progressForActivity(activityId)); } catch (err) {
    console.error('[stats-activity-progress]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/stats/activity-insights?activityId=…[&poleKey=…][&year=AAAA|all][&scope=year|period|week][&offset=-N][&kind=periodic|weekly] — graphique cumulatif + cartes (lecture seule).
router.get('/stats/activity-insights', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId requis.' });
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
  if (!activity) return res.status(404).json({ error: 'Activité introuvable.' });
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  const poleKey = req.query.poleKey ? String(req.query.poleKey) : null;
  try { return res.json(insights.insightsForActivity(activityId, userId, poleKey, req.query.year, { scope: req.query.scope, offset: req.query.offset, woff: req.query.woff, toff: req.query.toff, kind: req.query.kind })); } catch (err) {
    console.error('[stats-activity-insights]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/stats/activity-insights/glisse?activityId=…&periodStart=AAAA-MM-JJ[&week=1..4] — détail d'une bulle « Où ça glisse ».
// Membre de l'activité seulement (jamais pour un profil visité : cette route ne prend pas de userId).
router.get('/stats/activity-insights/glisse', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId requis.' });
  if (!db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId)) return res.status(404).json({ error: 'Activité introuvable.' });
  if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId)) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  const ps = String(req.query.periodStart || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ps)) return res.status(400).json({ error: 'periodStart requis.' });
  const week = req.query.week ? Number(req.query.week) : null;
  if (week !== null && !(Number.isInteger(week) && week >= 1 && week <= 4)) return res.status(400).json({ error: 'week invalide.' });
  try { return res.json(insights.glisseDetail(activityId, ps, week)); } catch (err) {
    console.error('[stats-glisse]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/stats/activity-members?activityId=…[&scope=year|period|week|all][&category=<clé de pôle>] — réalisation des tâches par membre (onglet Statistiques
// de la fenêtre Activité). Membres de l'activité seulement (403 sinon) ; agrégats, jamais de titre de tâche.
router.get('/stats/activity-members', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.query.activityId);
  if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId requis.' });
  if (!db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId)) return res.status(404).json({ error: 'Activité introuvable.' });
  if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId)) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  try { return res.json(insights.memberStats(activityId, req.query.scope, null, typeof req.query.category === 'string' && req.query.category !== '' && req.query.category !== 'all' ? req.query.category : null)); } catch (err) {
    console.error('[stats-activity-members]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Partage des tâches (8 nov. 2026, lib/partagetaches.js, sans IA) : membres de l'activité seulement (403 sinon).
//  GET  /api/stats/recurring-tasks?activityId=…&scope=all|year|period|week — tableau « Tâches récurrentes » (comptes par membre) ;
//  GET  /api/stats/task-share?activityId=…&mode=week|period — proposition de partage (responsables, h / sem., temps voulu) ;
//  POST /api/stats/task-share { activityId, wanted: { userId: minutes }, tasks: [{ id, userId, minutes }] } — « Valider le partage ».
function memberGuard(req, res, activityId) {
  if (!req.userId) { res.status(400).json({ error: 'userId requis.' }); return false; }
  if (!Number.isInteger(activityId)) { res.status(400).json({ error: 'activityId requis.' }); return false; }
  if (!db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId)) { res.status(404).json({ error: 'Activité introuvable.' }); return false; }
  if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, req.userId)) { res.status(403).json({ error: "Tu n'es pas membre de cette activité." }); return false; }
  return true;
}
router.get('/stats/recurring-tasks', (req, res) => {
  const activityId = Number(req.query.activityId);
  if (!memberGuard(req, res, activityId)) return undefined;
  try { return res.json(partage.recurringTable(activityId, String(req.query.scope || 'year'))); } catch (err) {
    console.error('[stats-recurring-tasks]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});
router.get('/stats/task-share', (req, res) => {
  const activityId = Number(req.query.activityId);
  if (!memberGuard(req, res, activityId)) return undefined;
  try { return res.json(partage.proposal(activityId, String(req.query.mode || 'week'))); } catch (err) {
    console.error('[stats-task-share]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});
router.post('/stats/task-share', (req, res) => {
  const activityId = Number(req.body && req.body.activityId);
  if (!memberGuard(req, res, activityId)) return undefined;
  try { return res.json(partage.save(activityId, req.body)); } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('[stats-task-share-save]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/stats/profile-insights?userId=…[&activityId=…][&year=all][&scope=year|period|week][&kind=periodic|weekly|all][&woff=-N]
// Statistiques de tâches et d'objectifs d'un AUTRE utilisateur (lecture seule). Règles appliquées ICI, côté serveur :
//  - même accès que le camembert du profil visité (canViewTrackedContent : soi-même ou abonné accepté) -> sinon 403 ;
//  - activités confidentielles du profil visité jamais listées ni sélectionnables (403), SANS exception : même
//    partagée avec le visiteur (les membres la voient dans l'activité elle-même, pas via le profil du propriétaire) ;
//  - réponse = agrégats seulement (insights.visitorInsights : aucun titre de tâche, agenda, capacité, responsable, durée estimée).
router.get('/stats/profile-insights', (req, res) => {
  const viewerId = req.userId;
  if (!viewerId) return res.status(401).json({ error: 'Non authentifié.' });
  const ownerId = String(req.query.userId || '');
  const owner = ownerId ? db.prepare('SELECT id FROM users WHERE id = ?').get(ownerId) : null;
  if (!owner) return res.status(404).json({ error: 'Profil introuvable.' });
  const profileRoutes = require('./profile');
  if (!profileRoutes.canViewTrackedContent(viewerId, owner.id)) return res.status(403).json({ error: 'Tu dois suivre ce profil pour voir ses statistiques.' });
  const hidden = new Set(owner.id === viewerId ? [] : db.prepare('SELECT activityId AS id FROM activity_members WHERE userId = ? AND confidential = 1').all(owner.id).map((r) => r.id));
  const activities = db.prepare(`SELECT a.id AS id, a.name AS name, COALESCE(am.color, '#674EA7') AS color
    FROM activity_members am JOIN activities a ON a.id = am.activityId WHERE am.userId = ? ORDER BY a.id`).all(owner.id)
    .filter((a) => !hidden.has(a.id));
  let activityId = null;
  if (req.query.activityId !== undefined && req.query.activityId !== '') {
    activityId = Number(req.query.activityId);
    if (!Number.isInteger(activityId)) return res.status(400).json({ error: 'activityId invalide.' });
    if (hidden.has(activityId)) return res.status(403).json({ error: 'Activité non accessible.' });
    if (!activities.some((a) => a.id === activityId)) return res.status(404).json({ error: 'Activité introuvable.' });
  } else if (activities.length) activityId = activities[0].id;
  if (activityId == null) return res.json({ activities, activityId: null, data: null });
  try {
    const data = insights.visitorInsights(activityId, owner.id, req.query.year, { scope: req.query.scope, kind: req.query.kind, woff: req.query.woff });
    return res.json({ activities, activityId, data });
  } catch (err) {
    console.error('[stats-profile-insights]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
