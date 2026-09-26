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
const goalsauto = require('../lib/goalsauto');
// 26 septembre 2026 (discussion C, remplissage IA hebdomadaire — voir
// server/lib/goalsweeklyauto.js pour le cadrage complet) : déclenché ici,
// jamais depuis l'intérieur de goals.js#setMainGoal (qui reste pur/sans IA).
const goalsweeklyauto = require('../lib/goalsweeklyauto');
// 26 septembre 2026 (discussion C, moteur cross-secteur — voir
// server/lib/crosssectorinference.js pour le cadrage complet) : chaîné après
// goalsweeklyauto ci-dessous, jamais un hook indépendant.
const crosssectorinference = require('../lib/crosssectorinference');
const goalsdailyauto = require('../lib/goalsdailyauto');
// Brief B (22 septembre 2026, Aiguillage) — liste quotidienne de tâches
// priorisées, voir server/lib/goalsdailypriority.js.
const goalsdailypriority = require('../lib/goalsdailypriority');
// Chantier Objectifs — C (fusion sous-projet → catégorie, section Tâches,
// 17 septembre 2026) — voir server/lib/goalstasks.js.
const goalstasks = require('../lib/goalstasks');
// Chantier Objectifs — C (bulle IA de classement automatique, 17 septembre
// 2026) — voir server/lib/goalstaskclassify.js.
const goalstaskclassify = require('../lib/goalstaskclassify');
// 25 septembre 2026 (restructuration du volet Objectifs en 3 pages, demande
// directe d'Emilien) — badges « non vu » et capture multi-activités, voir
// server/lib/goalstasks.js (compteurs) et server/lib/goalstaskclassify.js
// (dispatch multi-activités). subprojects requis ICI seulement pour la garde
// d'appartenance de POST .../tasks/:itemId/mark-seen, même pattern que
// moveCategoryTask (goalstasks.js) juste au-dessus dans ce fichier.
const subprojects = require('../lib/subprojects');

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
    // 16 septembre 2026 (9e passage) : maxCategories ajouté ici aussi (déjà
    // renvoyé par GET .../goals/categories) — le nouveau bouton « + » du
    // volet Objectifs (renderGoalsGridHead(), app.js) doit savoir si le
    // plafond est atteint SANS requête séparée, ce point d'entrée étant déjà
    // celui que reloadGoalsAll() appelle à chaque ouverture/rafraîchissement.
    res.json({ categories: active, frozenCategories: frozen, byCategory, maxCategories: goals.MAX_CUSTOM_CATEGORIES });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 21 septembre 2026 (« Secteurs dans l'arbre périodique », demande explicite
// d'Emilien : « On ne change pas l'arbre. Cependant, les secteurs deviennent
// les pôles. ») — colonnes de la grille (#goalsGrid/#goalsGridHead,
// public/app.js, INCHANGÉES) pour UN SEUL pôle : ses secteurs actifs, ou lui-
// même en repli s'il n'en a aucun (goals.gridColumnsForPole). Même forme que
// GET .../goals/all (`byCategory` clé par clé de colonne) pour que
// renderGoalsGrid()/renderGoalsGridHead() n'aient rien à changer — seule la
// SOURCE des données change côté client (activeGoalsCategories()). Le
// sélecteur de pôle lui-même (la nouvelle barre de boutons) continue de
// s'appuyer sur GET .../goals/all (`categories`, strictement pôle,
// inchangée) : cette route-ci ne renvoie que ce qu'il faut pour UNE grille.
router.get('/activities/:id/goals/all-for-pole', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const poleKey = resolveCategory(activityId, req.query.poleKey);
    if (!goals.isValidCategoryForActivity(activityId, poleKey)) {
      return res.status(400).json({ error: 'Pôle invalide pour cette activité.' });
    }
    const columns = goals.gridColumnsForPole(activityId, poleKey);
    const byCategory = {};
    columns.forEach((c) => {
      byCategory[c.key] = goals.planningForActivity(activityId, c.key);
    });
    res.json({
      poleKey,
      columns,
      byCategory,
      maxSecteurs: goals.MAX_SECTEURS_PER_POLE,
    });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 15 septembre 2026 (chantier Objectifs — C, lien Sous-projets → Objectifs) —
// liste seule des membres de l'activité (même source que planningForActivity,
// membersForActivity), pour le sélecteur "membre prévu" d'une tâche
// Sous-projets sans charger tout un planning. Fonctionne aussi sur une
// activité SOLO (aucune condition "partagée", contrairement à
// GET /api/community/activity-members).
router.get('/activities/:id/goals/members', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json({ members: goals.membersForActivity(activityId) });
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
    // 26 septembre 2026 : déclenché APRÈS la réponse HTTP, jamais awaité —
    // « fire-and-forget », la proposition IA arrive en tâche de fond (voir
    // server/lib/goalsweeklyauto.js pour le cadrage complet, y compris la
    // décision de non-écrasement et le repli silencieux si l'IA n'est pas
    // configurée ou si rien n'est à remplir).
    //
    // Point de coordination (tranché avec le remplissage hebdomadaire, voir
    // server/lib/goalsweeklyauto.js) : le moteur d'inférence cross-secteur
    // (« Coordination inter-secteurs », même déclencheur setMainGoal) est
    // CHAÎNÉ ici via .then() — jamais un second .catch() indépendant posé en
    // parallèle, pour ne jamais avoir deux appels IA concurrents sur le même
    // événement.
    goalsweeklyauto.generateForPeriod(activityId, userId, category, periodNumber)
      .then(() => crosssectorinference.evaluateCrossSectorLinks(activityId, category, { type: 'main_goal', text, periodNumber }))
      .catch(() => {});
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
// noesis-timetracker-objectifs.md) : gratuit pour tous, par activité, 5
// catégories maximum, retrait toujours possible tant qu'il en reste au moins
// une.
//
// 16 septembre 2026 (8e passage) : plus d'étape "activer" séparée — une
// activité a toujours au moins une catégorie (par défaut, synthétique tant
// que rien n'a été écrit — voir server/lib/goals.js, ensureDefaultCategory),
// donc POST .../categories/activate a disparu ; POST .../categories et PUT
// .../categories/:key n'acceptent plus de couleur (couleur 100% automatique
// côté client, voir même fichier).
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
      // 20 septembre 2026 (exposition « Pôles & secteurs ») : chaque pôle
      // porte désormais un champ additif `secteurs` (tableau, potentiellement
      // vide) — changement rétrocompatible, aucun champ existant retiré ni
      // renommé. `categoriesForActivity` ne renvoie que les pôles (voir son
      // commentaire dans server/lib/goals.js), donc jamais de doublon ici.
      categories: goals.categoriesForActivity(activityId).map((c) => ({
        ...c,
        secteurs: goals.secteursForPole(activityId, c.key),
      })),
      frozenCategories: goals.frozenCategoriesForActivity(activityId),
      maxCategories: goals.MAX_CUSTOM_CATEGORIES,
      // 17 septembre 2026 (fusion sous-projet → catégorie, section Tâches) :
      // les tâches de chaque catégorie ACTIVE, agrégées depuis tous les
      // sous-projets qui lui sont rattachés — voir server/lib/goalstasks.js.
      // Bundlé ici plutôt qu'un appel séparé par catégorie : ce point
      // d'entrée est déjà celui que loadActivityGoalsCategories() appelle à
      // chaque ouverture/rafraîchissement du panneau (public/app.js).
      tasksByCategory: goalstasks.tasksByCategoryForActivity(activityId),
    });
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
    const categories = goals.addCategory(activityId, req.body.label);
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
    // 25 septembre 2026 (Brief 2 « Coordination inter-secteurs de l'IA ») :
    // description optionnelle transmise telle quelle — undefined si absente
    // du corps, voir le commentaire de renameCategory (server/lib/goals.js).
    const categories = goals.renameCategory(activityId, req.params.key, req.body.label, req.body.description);
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

// ---------------------------------------------------------------------------
// Secteurs (20 septembre 2026, exposition HTTP — mécanique posée le 18
// septembre par server/lib/goals.js, voir noesis-timetracker-poles-secteurs.md).
// `:key` ci-dessous désigne toujours le PÔLE parent, jamais un secteur —
// server/lib/goals.js refuse la création d'un secteur sous un secteur
// (profondeur 1 niveau). Même remarque que pour /goals/categories-reorder
// plus haut : la route de réordonnancement est nommée
// `/categories/:key/secteurs-reorder` (segment littéral séparé de `/secteurs`)
// pour ne jamais risquer qu'Express l'avale comme une clé `:secteurKey`.

// `secteurKey` appartient-il bien au pôle `poleKey` de l'URL ? Sans ce garde,
// une requête pourrait renommer/retirer un secteur d'un AUTRE pôle en visant
// une URL /categories/:key/secteurs/:secteurKey avec un `:key` qui ne
// correspond pas à son vrai parent — parentKeyFor donne la réponse exacte.
function assertSecteurBelongsToPole(activityId, poleKey, secteurKey) {
  if (goals.parentKeyFor(activityId, secteurKey) !== poleKey) {
    throw Object.assign(new Error('Secteur introuvable pour ce pôle.'), { statusCode: 404 });
  }
}

router.get('/activities/:id/goals/categories/:key/secteurs', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json({ secteurs: goals.secteursForPole(activityId, req.params.key) });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.post('/activities/:id/goals/categories/:key/secteurs', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const secteurs = goals.addCategory(activityId, req.body.label, req.params.key);
    res.json({ ok: true, secteurs });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/categories/:key/secteurs-reorder', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
  try {
    const secteurs = goals.reorderSecteurs(activityId, req.params.key, keys);
    res.json({ ok: true, secteurs });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 26 septembre 2026 (panneau « gérer mes catégories », déplacement d'un
// secteur d'un pôle à un autre) — ⚠️ RÉINTRODUITE le même jour après avoir
// disparu de ce fichier lors d'une écriture concurrente d'une autre
// discussion partie d'une copie antérieure ; voir le commentaire au-dessus
// de moveSecteurToPole dans server/lib/goals.js et
// noesis-timetracker-chantiers-en-cours.md pour le détail de l'incident.
router.put('/activities/:id/goals/categories/:key/secteurs/:secteurKey/move', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    assertSecteurBelongsToPole(activityId, req.params.key, req.params.secteurKey);
    const categories = goals.moveSecteurToPole(
      activityId, req.params.key, req.params.secteurKey,
      req.body.targetPoleKey, req.body.targetIndex,
    );
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.put('/activities/:id/goals/categories/:key/secteurs/:secteurKey', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    assertSecteurBelongsToPole(activityId, req.params.key, req.params.secteurKey);
    // 25 septembre 2026 (Brief 2 « Coordination inter-secteurs de l'IA ») :
    // même ajout que la route pôle ci-dessus.
    const secteurs = goals.renameCategory(activityId, req.params.secteurKey, req.body.label, req.body.description);
    res.json({ ok: true, secteurs });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

router.delete('/activities/:id/goals/categories/:key/secteurs/:secteurKey', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    assertSecteurBelongsToPole(activityId, req.params.key, req.params.secteurKey);
    const secteurs = goals.removeCategory(activityId, req.params.secteurKey);
    res.json({ ok: true, secteurs });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// 17 septembre 2026 (fusion sous-projet → catégorie, section Tâches) :
// ajoute une tâche directement depuis la catégorie — voir
// server/lib/goalstasks.js pour la matérialisation paresseuse du sous-projet
// "domicile" qui la reçoit réellement. Le toggle (coché/pas coché) et la
// suppression réutilisent tels quels PUT/DELETE /api/sub-project-items/:id
// (server/routes/subprojects.js) : une tâche créée ici n'est en rien
// différente d'une tâche créée depuis un sous-projet.
router.post('/activities/:id/goals/categories/:key/tasks', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  // 21 septembre 2026 (Chrono — sélecteur pôle/secteur, cadré avec Emilien via
  // AskUserQuestion : « Oui, au secteur ») : une tâche peut désormais être
  // rattachée directement à un secteur, pas seulement à son pôle — même garde
  // que capacity ci-dessus.
  if (!goals.isValidCategoryOrSecteurForActivity(activityId, req.params.key)) {
    return res.status(400).json({ error: 'Catégorie invalide pour cette activité.' });
  }

  try {
    const item = goalstasks.addCategoryTask(activityId, userId, req.params.key, req.body.label, { dueDate: req.body.dueDate });
    res.status(201).json(item);
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 21 septembre 2026 (Chrono — fenêtre « visualiser » d'un secteur) : tâches
// déjà datées (dueDate) cette semaine pour ce pôle OU ce secteur, groupées par
// jour — voir server/lib/goalstasks.js#tasksForCategoryThisWeek. Lecture
// seule (la route POST d'ajout ci-dessus reste en place, mais n'est plus
// appelée depuis cette fenêtre — voir public/app.js#openSecteurTasksModal,
// 22 septembre 2026 : « je souhaite supprimer la possibilité d'ajouter une
// nouvelle tâche »).
//
// 22 septembre 2026, demande d'Emilien : « ajouter une flèche pour faire
// défiler les semaines [...] voir les tâches des semaines futures. Pas
// passées [...] uniquement futur. » — weekOffset (0 = semaine courante)
// accepté en query, jamais négatif : une valeur invalide ou négative retombe
// silencieusement sur 0 plutôt que de renvoyer une erreur, pour qu'un lien
// mal formé affiche simplement la semaine courante. La réponse porte aussi
// l'objectif hebdomadaire de cette même semaine (« ajouter en haut de la
// liste des tâches, les objectifs hebdomadaires »).
router.get('/activities/:id/goals/categories/:key/tasks/week', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  if (!goals.isValidCategoryOrSecteurForActivity(activityId, req.params.key)) {
    return res.status(400).json({ error: 'Catégorie invalide pour cette activité.' });
  }

  const rawOffset = Number(req.query.weekOffset);
  const weekOffset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  try {
    const days = goalstasks.tasksForCategoryThisWeek(activityId, req.params.key, weekOffset);
    const weeklyObjective = goalstasks.weeklyObjectiveForWeek(activityId, req.params.key, weekOffset);
    res.json({ days, weeklyObjective, weekOffset });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// 17 septembre 2026 (discussion C, cadré avec Emilien via AskUserQuestion,
// citation directe : « La tâche, après, va s'ajouter automatiquement grâce à
// une IA dans l'une des catégories créées ») : ajoute une tâche SANS
// catégorie choisie — une IA choisit la catégorie la plus probable parmi
// celles de l'activité, toujours une catégorie choisie, jamais de blocage ni
// de confirmation demandée (voir server/lib/goalstaskclassify.js).
// Fonctionnalité gratuite, non conditionnée à l'offre payante (Emilien :
// « Cela ne correspond pas à l'offre 1 »). Pas de piège de route Express ici
// (voir le commentaire au-dessus de GET .../categories) : "auto-task" est un
// segment littéral, jamais confondu avec un :key, et aucune autre route
// POST n'a la même forme.
router.post('/activities/:id/goals/categories/auto-task', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const item = await goalstaskclassify.addTaskWithAutoCategory(activityId, userId, req.body.label);
    res.status(201).json(item);
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// 17 septembre 2026 (maquette approuvée par Emilien, citation directe :
// « Je souhaite ajouter une option pour changer manuellement les tâches de
// catégorie. ») — reclassement manuel d'une tâche déjà existante, à côté du
// classement automatique de la route ci-dessus. Toute la logique (garde
// d'activité + déplacement réel) vit dans goalstasks.js#moveCategoryTask —
// cette route ne fait que vérifier la session et relayer.
router.put('/activities/:id/goals/tasks/:itemId/category', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const item = goalstasks.moveCategoryTask(activityId, userId, Number(req.params.itemId), req.body.categoryKey);
    res.json(item);
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// 25 septembre 2026 (restructuration du volet Objectifs en 3 pages, demande
// directe d'Emilien) — nouvelle bulle de capture de la page 1 : UNE tâche
// texte, dispatchée indépendamment dans CHAQUE activité sélectionnée (voir
// server/lib/goalstaskclassify.js#captureTaskForActivities). Route à part de
// POST .../categories/auto-task (inchangée, gardée pour tout appelant qui
// resterait scopé à une seule activité) : celle-ci n'est PAS scopée à une
// activité dans son URL, la sélection se fait entièrement dans le corps.
// requireMembership vérifié ICI, activité par activité, avant tout appel à
// la lib (qui ne fait aucune vérification de droits elle-même) — une
// activité refusée n'empêche jamais les autres de réussir, même principe
// « jamais bloquant » que le reste de ce fichier.
router.post('/goals/capture', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const rawIds = Array.isArray(req.body.activityIds) ? req.body.activityIds : [];
  if (!rawIds.length) return res.status(400).json({ error: 'Au moins une activité doit être sélectionnée.' });

  const denied = [];
  const allowed = [];
  rawIds.forEach((rawId) => {
    const activityId = Number(rawId);
    const check = requireMembership(userId, activityId);
    if (check.error) denied.push({ activityId, ok: false, error: check.error.body.error });
    else allowed.push(activityId);
  });

  try {
    const ok = allowed.length ? await goalstaskclassify.captureTaskForActivities(allowed, userId, req.body.label) : [];
    res.status(201).json({ results: denied.concat(ok) });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 25 septembre 2026 (badges « non vu ») : compte, pour CHAQUE activité dont
// l'utilisateur est membre, les tâches autoCaptured pas encore vues — appelé
// par la page 1 (badge par activité) ET la page 2 (badge par nœud de l'arbre
// périodique, via byCategory). Pas scopée à une activité dans son URL, même
// raisonnement que la route ci-dessus.
router.get('/goals/capture/badges', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  try {
    const activities = db.prepare(`
      SELECT a.id FROM activities a
      JOIN activity_members m ON m.activityId = a.id
      WHERE m.userId = ? AND a.active = 1
      ORDER BY a.id
    `).all(userId);
    const out = {};
    activities.forEach((a) => { out[a.id] = goalstasks.unseenCountsForActivity(a.id); });
    res.json({ activities: out });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 25 septembre 2026 (badges « non vu ») : pose seenAt sur toutes les tâches
// autoCaptured non vues d'une activité entière (page 1, ouvrir une activité)
// — jamais bloquant si rien n'était à marquer (idempotent, voir
// goalstasks.js#markCategoriesSeen).
router.post('/activities/:id/goals/categories/mark-seen', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json(goalstasks.markCategoriesSeen(activityId));
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 25 septembre 2026 (badges « non vu ») : même geste, scopé à UN SEUL nœud
// pôle/secteur de l'arbre périodique (page 2, ouvrir un pôle ou un secteur).
router.post('/activities/:id/goals/categories/:key/mark-seen', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json(goalstasks.markCategoriesSeen(activityId, req.params.key));
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 25 septembre 2026 (badges « non vu ») : pose seenAt sur UNE tâche précise
// (page 3, calendrier — point violet à droite d'une tâche nouvellement
// ajoutée, qui disparaît une fois la tâche ouverte/visualisée). Même garde
// d'appartenance que moveCategoryTask ci-dessus : sans elle, un identifiant
// de tâche d'une autre activité pourrait être marqué vu par appel direct à
// cette route.
router.post('/activities/:id/goals/tasks/:itemId/mark-seen', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const item = subprojects.getItemRaw(Number(req.params.itemId));
    if (!item) return res.status(404).json({ error: 'Tâche introuvable.' });
    const subProject = subprojects.getSubProject(item.subProjectId);
    if (!subProject || Number(subProject.activityId) !== Number(activityId)) {
      return res.status(400).json({ error: "Cette tâche n'appartient pas à cette activité." });
    }
    res.json(subprojects.markItemSeen(item.id));
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// 17 septembre 2026 (discussion A — Offre1, cadré avec Emilien) : ajustement
// manuel de la capacité hebdomadaire utilisée par le moteur d'auto-
// planification (server/lib/goalsauto.js) — voir le commentaire de
// goal_capacity_overrides dans server/db.js. Portée (activité, catégorie,
// membre COURANT) : chaque membre ajuste sa propre capacité, jamais celle
// d'un autre membre de l'activité.
router.get('/activities/:id/goals/capacity', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const category = resolveCategory(activityId, req.query.category);
    // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
    // secteurs — la capacité peut désormais être ajustée pour un secteur,
    // pas seulement pour un pôle.
    if (!goals.isValidCategoryOrSecteurForActivity(activityId, category)) {
      return res.status(400).json({ error: 'Catégorie invalide pour cette activité.' });
    }
    const override = goalsauto.getCapacityOverrideMinutes(activityId, category, userId);
    const computed = goalsauto.capacityMinutesForMember(activityId, category, userId);
    res.json({ override, computed });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// weeklyMinutes: null, '' ou absent retire l'ajustement manuel (retour au
// calcul automatique) ; sinon pose/remplace la valeur (REMPLACE le calcul
// auto tant qu'elle est active, ne l'additionne ni ne le plafonne).
router.put('/activities/:id/goals/capacity', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const category = resolveCategory(activityId, req.body.category);
    // 21 septembre 2026 (« Secteurs dans l'arbre périodique ») : élargi aux
    // secteurs — la capacité peut désormais être ajustée pour un secteur,
    // pas seulement pour un pôle.
    if (!goals.isValidCategoryOrSecteurForActivity(activityId, category)) {
      return res.status(400).json({ error: 'Catégorie invalide pour cette activité.' });
    }
    if (req.body.weeklyMinutes === null || req.body.weeklyMinutes === '' || req.body.weeklyMinutes === undefined) {
      goalsauto.clearCapacityOverride(activityId, category, userId);
      return res.json({ ok: true, override: null });
    }
    const result = goalsauto.setCapacityOverrideMinutes(activityId, category, userId, req.body.weeklyMinutes);
    res.json({ ok: true, override: result.weeklyMinutes });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// 17 septembre 2026 (discussion A — Offre1, cadré avec Emilien) : génère la
// feuille de route jour par jour d'un objectif hebdomadaire déjà rempli par
// goalsauto.js — voir server/lib/goalsdailyauto.js. Jamais automatique,
// toujours à la demande explicite d'un membre (coût par appel IA).
router.post('/activities/:id/goals/weekly/:weeklyId/daily-plan', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const weeklyId = Number(req.params.weeklyId);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    const result = await goalsdailyauto.generateDailyPlanForWeekly(activityId, weeklyId, userId);
    res.json({ ok: true, ...result });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// Brief B (22 septembre 2026, Aiguillage) — liste quotidienne de tâches
// priorisées, voir server/lib/goalsdailypriority.js. Toujours une
// PROPOSITION à valider par l'utilisateur (règle verrouillée) — cette route
// ne fait que CALCULER, jamais n'applique ni n'écrit quoi que ce soit ;
// aucune persistance ce chantier-ci (la surface de validation/ajustement
// revient à Objectifs — Planification IA, voir le commentaire de tête de
// goalsdailypriority.js). Couvre toute l'activité, tous pôles/secteurs
// confondus (le planning reste propre à l'activité, jamais global à la
// personne — règle 1 de goals.js).
router.get('/activities/:id/goals/daily-priority', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    res.json(goalsdailypriority.computeDailyPriorityList(activityId, userId));
  } catch (err) {
    handleGoalsError(res, err);
  }
});

module.exports = router;
