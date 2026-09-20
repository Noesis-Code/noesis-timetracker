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
const goalsdailyauto = require('../lib/goalsdailyauto');
// Chantier Objectifs — C (fusion sous-projet → catégorie, section Tâches,
// 17 septembre 2026) — voir server/lib/goalstasks.js.
const goalstasks = require('../lib/goalstasks');
// Chantier Objectifs — C (bulle IA de classement automatique, 17 septembre
// 2026) — voir server/lib/goalstaskclassify.js.
const goalstaskclassify = require('../lib/goalstaskclassify');

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
  const active = goals.polesForActivity(activityId);
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
    const active = goals.polesForActivity(activityId);
    const frozen = goals.frozenPolesForActivity(activityId);
    const byCategory = {};
    active.concat(frozen).forEach((c) => {
      byCategory[c.key] = goals.planningForActivity(activityId, c.key);
    });
    // 16 septembre 2026 (9e passage) : maxCategories ajouté ici aussi (déjà
    // renvoyé par GET .../goals/categories) — le nouveau bouton « + » du
    // volet Objectifs (renderGoalsGridHead(), app.js) doit savoir si le
    // plafond est atteint SANS requête séparée, ce point d'entrée étant déjà
    // celui que reloadGoalsAll() appelle à chaque ouverture/rafraîchissement.
    res.json({ categories: active, frozenCategories: frozen, byCategory, maxCategories: goals.MAX_CUSTOM_POLES });
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
    // 20 septembre 2026 (« Pôles & secteurs », exposition) : chaque pôle
    // porte désormais aussi `secteurs` (champ AJOUTÉ, ignoré sans risque par
    // tout client qui ne le connaît pas encore — même convention que
    // `parentKey` sur categorySummary/categoryBreakdownForRange) pour que le
    // panneau de gestion affiche/gère les secteurs d'un pôle sans requête
    // séparée par pôle.
    const categories = goals.polesForActivity(activityId).map((p) => ({
      ...p,
      secteurs: goals.secteursForPole(activityId, p.key),
    }));
    res.json({
      customized: goals.isCustomized(activityId),
      categories,
      frozenCategories: goals.frozenPolesForActivity(activityId),
      maxCategories: goals.MAX_CUSTOM_POLES,
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
    const categories = goals.addPoleOrSecteur(activityId, req.body.label);
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
    const categories = goals.renamePoleOrSecteur(activityId, req.params.key, req.body.label);
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
    const categories = goals.removePoleOrSecteur(activityId, req.params.key);
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
    const categories = goals.reorderPoles(activityId, keys);
    res.json({ ok: true, categories });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Secteurs (20 septembre 2026, discussion Objectifs — Logique métier,
// chantier « Pôles & secteurs » — mécanique posée le 18 septembre par ce même
// fichier goals.js, voir noesis-timetracker-poles-secteurs.md). Un secteur
// est une subdivision optionnelle d'UN pôle (activity_goal_categories.parentKey)
// — mêmes garanties que les routes pôle ci-dessus (retrait = gel, jamais
// suppression) mais SANS minimum (« un secteur, lui, peut être retiré sans
// minimum »). Même convention de nommage pour éviter le piège Express déjà
// documenté sur ce fichier (`/secteurs-reorder`, jamais `/secteurs/reorder`,
// pour ne jamais risquer qu'une route `/secteurs/:secteurKey` déclarée avant
// n'intercepte "reorder" comme valeur de :secteurKey).

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
    // goals.addPoleOrSecteur lève déjà une 404 « Pôle introuvable pour ce
    // secteur. » si :key n'est pas un pôle actif de cette activité — aucune
    // vérification redondante nécessaire ici.
    const secteurs = goals.addPoleOrSecteur(activityId, req.body.label, req.params.key);
    res.json({ ok: true, secteurs });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

// `secteurKey` doit appartenir au pôle `:key` de l'URL — goals.js valide/gère
// pôles et secteurs par la même fonction générique (renamePoleOrSecteur,
// removePoleOrSecteur ci-dessous), sans regarder le pôle parent ; ce garde
// évite qu'une URL incohérente (bon secteur, mauvais pôle dans le chemin)
// réussisse silencieusement.
function assertSecteurBelongsToPole(activityId, poleKey, secteurKey) {
  if (goals.parentKeyFor(activityId, secteurKey) !== poleKey) {
    throw Object.assign(new Error('Secteur introuvable pour ce pôle.'), { statusCode: 404 });
  }
}

router.put('/activities/:id/goals/categories/:key/secteurs/:secteurKey', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);

  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);

  try {
    assertSecteurBelongsToPole(activityId, req.params.key, req.params.secteurKey);
    const secteurs = goals.renamePoleOrSecteur(activityId, req.params.secteurKey, req.body.label);
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
    const secteurs = goals.removePoleOrSecteur(activityId, req.params.secteurKey);
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

  if (!goals.isValidPoleForActivity(activityId, req.params.key)) {
    return res.status(400).json({ error: 'Pôle invalide pour cette activité.' });
  }

  try {
    const item = goalstasks.addCategoryTask(activityId, userId, req.params.key, req.body.label);
    res.status(201).json(item);
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
    if (!goals.isValidPoleForActivity(activityId, category)) {
      return res.status(400).json({ error: 'Pôle invalide pour cette activité.' });
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
    if (!goals.isValidPoleForActivity(activityId, category)) {
      return res.status(400).json({ error: 'Pôle invalide pour cette activité.' });
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

module.exports = router;
