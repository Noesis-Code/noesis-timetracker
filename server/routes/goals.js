// Planning d'objectifs annuel — Chantier 1 de la feuille de route produit
// (12 septembre 2026). Toute la logique vit dans server/lib/goals.js ; ce
// fichier ne fait que le contrôle d'accès (même appelant que les autres
// routes /activities/:id/*) et la forme HTTP.
//
// 14 septembre 2026 : chaque route accepte désormais une catégorie
// (entreprise/communaute/produit — server/lib/goals.js expose la liste et le
// validateur) passée en query string `?category=` pour la lecture, ou dans
// le corps pour les écritures qui en ont besoin. Nouvelle route d'assignation
// d'un objectif hebdomadaire à un membre de l'activité.

const express = require('express');
const db = require('../db');
const goals = require('../lib/goals');

const router = express.Router();

// Même contrôle qu'ailleurs dans le projet : n'importe quel membre ACTUEL de
// l'activité (partagée ou solo) peut lire/écrire son planning — le plan
// appartient à l'activité, pas à une personne (règle 1 de goals.js).
function requireMembership(userId, activityId) {
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  if (!activity) return { error: { status: 404, body: { error: 'Activité introuvable.' } } };
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  return { activity };
}

function handleGoalsError(res, err) {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[goals]', err);
  return res.status(500).json({ error: 'Erreur serveur.' });
}

// 15 septembre 2026 (discussion Objectifs — B) : la catégorie par défaut
// n'est plus 'entreprise' en dur — une activité personnalisée peut très bien
// ne plus l'avoir comme catégorie active. Sans catégorie fournie, on retombe
// sur la première catégorie ACTIVE de l'activité (fixe ou personnalisée) ;
// la validation elle-même (active pour une écriture, active-ou-gelée pour
// une lecture) est faite par server/lib/goals.js, par activité — ce fichier
// ne fait plus que résoudre la valeur brute reçue.
function resolveCategory(activityId, raw) {
  if (typeof raw === 'string' && raw) return raw;
  const active = goals.categoriesForActivity(activityId);
  return active.length ? active[0].key : 'entreprise';
}

router.get('/activities/:id/goals', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const category = resolveCategory(activityId, req.query.category);
    res.json(goals.planningForActivity(activityId, category));
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// Les 3 plannings d'une activité en un seul appel (pour la page arbre, qui
// affiche les 13 périodes de la catégorie sélectionnée mais a besoin des
// 3 pour la vue « Répartition » croisant les catégories) — évite 3 allers-
// retours séquentiels au chargement de l'onglet Objectifs.
router.get('/activities/:id/goals/all', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    // 15 septembre 2026 (discussion Objectifs — B) : `categories` n'est plus
    // la liste fixe de 3 chaînes, mais les catégories ACTIVES de l'activité
    // (fixes tant qu'elle n'est pas personnalisée, sinon ses propres
    // catégories, jusqu'à 3 — voir noesis-timetracker-objectifs.md). Pour
    // une activité non personnalisée, `categories` porte encore exactement
    // les 3 clés historiques ('entreprise'/'communaute'/'produit') : le
    // client actuel (public/app.js, `GOALS_CATEGORIES` codé en dur) continue
    // donc de fonctionner à l'identique tant que la discussion A n'a pas
    // adapté son affichage à un nombre variable de catégories. `byCategory`
    // couvre aussi les catégories GELÉES (`frozenCategories`, historique
    // d'une table rase ou d'un retrait) pour ne perdre l'accès à aucune
    // donnée déjà écrite.
    const active = goals.categoriesForActivity(activityId);
    const frozen = goals.frozenCategoriesForActivity(activityId);
    const byCategory = {};
    active.concat(frozen).forEach((c) => {
      byCategory[c.key] = goals.planningForActivity(activityId, c.key);
    });
    res.json({ categories: active, frozenCategories: frozen, byCategory });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/periods/:periodNumber/main', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);
  if (!periodNumber || periodNumber < 1) return res.status(400).json({ error: 'Période invalide.' });

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const text = typeof req.body.text === 'string' ? req.body.text : '';
  if (text.length > 500) return res.status(400).json({ error: 'Texte trop long (500 caractères maximum).' });

  try {
    const category = resolveCategory(activityId, req.body.category);
    const estimate = goals.setMainGoal(activityId, category, periodNumber, text);
    res.json({ ok: true, estimate });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/periods/:periodNumber/main-status', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const category = resolveCategory(activityId, req.body.category);
    goals.setMainGoalStatus(activityId, category, periodNumber, req.body.status);
    res.json({ ok: true });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/periods/:periodNumber/weekly/:weekIndex', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);
  const weekIndex = Number(req.params.weekIndex);
  if (!periodNumber || periodNumber < 1) return res.status(400).json({ error: 'Période invalide.' });
  if (!weekIndex || weekIndex < 1 || weekIndex > 4) return res.status(400).json({ error: 'Semaine invalide (1 à 4).' });

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const text = typeof req.body.text === 'string' ? req.body.text : '';
  if (text.length > 300) return res.status(400).json({ error: 'Texte trop long (300 caractères maximum).' });

  try {
    const category = resolveCategory(activityId, req.body.category);
    const result = goals.setWeekly(activityId, category, periodNumber, weekIndex, text);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/weekly/:weeklyId/status', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const weeklyId = Number(req.params.weeklyId);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    goals.setWeeklyStatus(activityId, weeklyId, req.body.status);
    res.json({ ok: true });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 14 septembre 2026 — assigne (ou retire, userId: null) un membre de
// l'activité à un objectif hebdomadaire, pour la répartition du travail par
// personne à travers les 3 catégories.
router.put('/activities/:id/goals/weekly/:weeklyId/assignee', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const weeklyId = Number(req.params.weeklyId);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    goals.setWeeklyAssignee(activityId, weeklyId, req.body.userId || null);
    res.json({ ok: true });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 14 septembre 2026 — remplace la liste complète des membres travaillant sur
// l'objectif périodique (ex-« grand objectif ») d'une période. Contrairement
// à l'assignation hebdomadaire ci-dessus (une seule personne), plusieurs
// membres peuvent être cochés à la fois : le client envoie toujours la liste
// entière (userIds), pas un ajout/retrait unitaire.
router.put('/activities/:id/goals/periods/:periodNumber/assignees', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const periodNumber = Number(req.params.periodNumber);
  if (!periodNumber || periodNumber < 1) return res.status(400).json({ error: 'Période invalide.' });

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [];

  try {
    const category = resolveCategory(activityId, req.body.category);
    const assignees = goals.setPeriodAssignees(activityId, category, periodNumber, userIds);
    res.json({ ok: true, assignees });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// 15 septembre 2026 (discussion Objectifs — B) — gestion des catégories
// personnalisables par activité. Cadré avec Emilien (AskUserQuestion, voir
// noesis-timetracker-objectifs.md) : gratuit pour tous, par activité, 3
// catégories maximum, table rase à l'activation, retrait toujours possible
// tant qu'il en reste au moins une. Périmètre serveur uniquement — l'UI
// (emplacement du point d'entrée, adaptation de l'arbre/de la grille
// comparative à 1-3 catégories) revient à la discussion A.
//
// ⚠️ La route de réordonnancement est nommée `/goals/categories-reorder`
// (et non `/goals/categories/reorder`) pour éviter le piège Express déjà
// rencontré ailleurs dans ce projet (server/routes/profile.js, section
// Projets) : une route `/categories/:key` déclarée avant `/categories/reorder`
// intercepterait "reorder" comme valeur de `:key`.

router.get('/activities/:id/goals/categories', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json({
      customized: goals.isCustomized(activityId),
      categories: goals.categoriesForActivity(activityId),
      frozenCategories: goals.frozenCategoriesForActivity(activityId),
      maxCategories: goals.MAX_CUSTOM_CATEGORIES,
    });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.post('/activities/:id/goals/categories/activate', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const categories = goals.activateCustomCategories(activityId, req.body.label, req.body.color);
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.post('/activities/:id/goals/categories', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const categories = goals.addCategory(activityId, req.body.label, req.body.color);
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/categories/:key', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const categories = goals.renameCategory(activityId, req.params.key, req.body.label, req.body.color);
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.delete('/activities/:id/goals/categories/:key', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const categories = goals.removeCategory(activityId, req.params.key);
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/categories-reorder', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
  try {
    const categories = goals.reorderCategories(activityId, keys);
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

module.exports = router;
