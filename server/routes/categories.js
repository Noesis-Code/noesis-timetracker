// Gestion des pôles et secteurs (catégories personnalisables par activité) —
// routes extraites de server/routes/goals.js (19 oct. 2026, lot 5 de l'audit
// de simplification), URLs et réponses inchangées. Logique : server/lib/categories.js
// (ré-exportée par server/lib/goals.js). Les secteurs remontent au pôle
// (goals.resolveToPole) ; seuls les pôles portent une couleur.

const express = require('express');
const db = require('../db');
const goals = require('../lib/goals');
const goalstasks = require('../lib/goalstasks');
const goalstaskclassify = require('../lib/goalstaskclassify');

const router = express.Router();

// Mêmes gardes que server/routes/goals.js (dupliquées volontairement : petits
// et sans état, pour que les deux routeurs restent indépendants).
function requireMembership(userId, activityId) {
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  if (!activity) return { error: { status: 404, body: { error: 'Activité introuvable.' } } };
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) return { error: { status: 403, body: { error: "Tu n'es pas membre de cette activité." } } };
  return { activity };
}

function handleGoalsError(res, err) {
  if (err && err.statusCode) return res.status(err.statusCode).json(err.taskCount !== undefined ? { error: err.message, taskCount: err.taskCount } : { error: err.message });
  console.error('[goals]', err);
  return res.status(500).json({ error: 'Erreur serveur' });
}

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
      maxCategories: goals.MAX_CUSTOM_CATEGORIES, maxSecteurs: goals.MAX_SECTEURS_PER_POLE,
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
    const categories = goals.addCategory(activityId, req.body.label, undefined, req.body.atTop === true);
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

// Aperçu avant retrait (pôle ou secteur) : nombre de tâches affiliées.
router.get('/activities/:id/goals/categories/:key/removal-preview', (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);
  try {
    res.json(goals.previewCategoryRemoval(activityId, req.params.key));
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
    const categories = goals.removeCategory(activityId, req.params.key, { tasks: (req.body && req.body.tasks) || req.query.tasks });
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

// Redistribution des tâches d'un secteur retiré : selon le mode de
// Noèsis de l'utilisateur — autonome : propositions appliquées d'office par le
// client ; partiel : propositions à valider ; absence : aucun choix proposé.
router.get('/activities/:id/goals/categories/:key/secteurs/:secteurKey/redistribution', async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  const activityId = Number(req.params.id);
  const check = requireMembership(userId, activityId);
  if (check.error) return res.status(check.error.status).json(check.error.body);
  try {
    assertSecteurBelongsToPole(activityId, req.params.key, req.params.secteurKey);
    const info = goals.secteurRemovalInfo(activityId, req.params.secteurKey);
    const modeRow = db.prepare('SELECT aiMode FROM users WHERE id = ?').get(userId);
    const mode = (modeRow && modeRow.aiMode) || 'absence';
    const proposals = {};
    if (mode !== 'absence' && info.targets.length > 1) {
      const restrictKeys = info.targets.map((t) => t.key);
      for (const sp of info.tasks) {
        try {
          const r = await goalstaskclassify.classifyCategory(activityId, sp.name, { strict: true, restrictKeys });
          if (r && r.key) proposals[sp.id] = r.key;
          else if (r && r.suggested && r.suggested[0]) proposals[sp.id] = r.suggested[0].key;
        } catch (e) { /* pas de proposition pour ce sous-projet */ }
      }
    }
    res.json({ mode, tasks: info.tasks, targets: info.targets, proposals });
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
    const secteurs = goals.removeCategory(activityId, req.params.secteurKey, { tasks: (req.body && req.body.tasks) || req.query.tasks, assignments: req.body && req.body.assignments, mode: req.body && req.body.mode, target: req.body && req.body.target });
    res.json({ ok: true, secteurs });
  } catch (err) {
    handleGoalsError(res, err);
  }
});

module.exports = router;
