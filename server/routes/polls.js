// Noèsis TimeTracker — routes des sondages
//
// Propriété : discussion "Sondages" (11ᵉ discussion, 3 septembre 2026).
// Le modèle de données, les règles de vote et le REGISTRE des gardes vivent
// dans server/lib/polls.js — lire l'en-tête de ce fichier avant celui-ci.
//
// Ce fichier fait deux choses, et deux seulement :
//   1. il ENREGISTRE la garde d'accès de chaque scope, en appelant la
//      fonction de la discussion hôte plutôt qu'en réécrivant sa logique ;
//   2. il traduit les appels HTTP en appels au socle.

const express = require('express');
const db = require('../db');
const polls = require('../lib/polls');

const router = express.Router();

// ===================== GARDES D'ACCÈS, PAR HÔTE =====================

// ----- scope 'profile' : un sondage qui défile comme un "post" -----
//
// L'hôte est server/routes/profile.js, qui porte depuis le 2 septembre 2026
// un accès à DEUX niveaux : `canViewProjects` (soi-même ou tout membre
// identifié) pour l'identité publique / les projets / les statistiques, et
// `canViewPosts` (soi-même ou abonné accepté) pour les messages.
//
// Les sondages relèvent du PREMIER niveau, pas du second. C'est un choix
// explicite d'Emilien (3 septembre 2026, question « qui le voit défiler ? »
// -> « Aussi les visiteurs de sa page de profil ») : un sondage doit pouvoir
// récolter des réponses au-delà du cercle des abonnés, sans quoi il ne sert
// pas à grand-chose sur un profil peu suivi. Conséquence assumée et à garder
// en tête : sur une page de visite de profil, les MESSAGES restent réservés
// aux abonnés acceptés, mais les SONDAGES sont visibles et votables par tout
// membre identifié de Noèsis.
//
// La garde n'est pas recopiée ici : on appelle celle de Profil, exposée sur
// son routeur (voir la fin de server/routes/profile.js). Si Profil resserre
// un jour ses règles, les sondages suivent automatiquement.
const profileRoutes = require('./profile');

polls.registerScopeGuard('profile', function (userId, scopeId) {
  const owner = db.prepare('SELECT id FROM users WHERE id = ?').get(scopeId);
  if (!owner) return { error: { status: 404, body: { error: 'Profil introuvable.' } } };
  if (!profileRoutes.canViewProjects(userId, owner.id)) {
    return { error: { status: 403, body: { error: "Tu n'as pas accès à ce profil." } } };
  }
  // Lire et voter : tout membre identifié. Créer : le propriétaire du profil
  // seulement — un sondage de scope 'profile' EST une publication de ce
  // profil, personne ne publie sur le mur de quelqu'un d'autre.
  return { canCreate: userId === owner.id };
});

// ----- scope 'subproject' : un sondage dans un sous-projet d'activité -----
//
// L'hôte est la discussion "Sous-projets" (server/lib/subprojects.js), qui
// expose déjà `checkSubProjectAccess(userId, subProjectId)` renvoyant
// exactement la forme attendue par le registre : { error } ou { subProject }.
// Rien à écrire de plus, rien à recopier.
//
// ⚠️ Chargement TOLÉRANT, et ce n'est pas de la précaution théorique : au
// moment où ce fichier a été écrit, `server/lib/subprojects.js` existait déjà
// sur le disque d'Emilien mais ses tables n'étaient PAS encore dans
// server/db.js (la discussion "Sous-projets" livrait son chantier en même
// temps que celui-ci). Un `require` en dur aurait fait échouer le démarrage du
// serveur ENTIER pendant cet intervalle — un chantier de sondages ne doit
// jamais pouvoir empêcher l'app de démarrer.
//
// Les deux modes de défaillance sont couverts, et tous les deux REFUSENT :
//   - module absent    -> aucune garde enregistrée pour ce scope, le socle
//                         refuse (fermé par défaut) ;
//   - module présent mais tables manquantes -> l'appel lève, et
//                         checkScopeAccess convertit l'exception en 403.
// Vérifié dans les deux cas en bac à sable avant livraison.
try {
  const sp = require('../lib/subprojects');
  if (sp && typeof sp.checkSubProjectAccess === 'function') {
    polls.registerScopeGuard('subproject', function (userId, scopeId) {
      const check = sp.checkSubProjectAccess(userId, scopeId);
      if (check.error) return check;
      // Tout membre de l'activité peut lancer un sondage dans un sous-projet :
      // un sous-projet appartient à l'activité, pas à son créateur (voir
      // l'en-tête de server/lib/subprojects.js).
      return { canCreate: true };
    });
  }
} catch (err) {
  console.warn('[polls] scope "subproject" non enregistré :', err && err.message);
}

// ===================== ROUTES =====================

// Liste des sondages d'un emplacement donné.
// ⚠️ Déclarée AVANT toute route à paramètre commençant par /polls/ — piège
// Express déjà rencontré trois fois sur server/routes/profile.js.
router.get('/polls/following', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  res.json(polls.pollsForFollowing(userId));
});

router.get('/polls', (req, res) => {
  const userId = req.query.userId;
  const scope = req.query.scope;
  const scopeId = req.query.scopeId;

  const access = polls.checkScopeAccess(scope, scopeId, userId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  res.json({
    canCreate: access.canCreate,
    polls: polls.pollsForScope(scope, scopeId, userId),
  });
});

router.post('/polls', (req, res) => {
  const userId = req.body.userId;
  const scope = req.body.scope;
  const scopeId = req.body.scopeId;

  const access = polls.checkScopeAccess(scope, scopeId, userId);
  if (access.error) return res.status(access.error.status).json(access.error.body);
  if (!access.canCreate) {
    return res.status(403).json({ error: 'Tu ne peux pas créer de sondage ici.' });
  }

  const created = polls.createPoll({
    scope: scope,
    scopeId: scopeId,
    authorId: userId,
    question: req.body.question,
    options: req.body.options,
    multiChoice: !!req.body.multiChoice,
    anonymous: !!req.body.anonymous,
    allowSuggestions: !!req.body.allowSuggestions,
    closesAt: req.body.closesAt,
  });
  if (created.error) return res.status(created.error.status).json(created.error.body);

  res.status(201).json(created.poll);
});

// Contrôle d'accès du vote : on repasse par la garde de l'hôte à partir du
// scope RÉEL du sondage, jamais d'un scope fourni par l'appelant — sinon il
// suffirait d'annoncer un scope permissif pour voter sur n'importe quoi.
function accessForPoll(pollId, userId) {
  const row = polls.getPollRow(pollId);
  if (!row) return { error: { status: 404, body: { error: 'Sondage introuvable.' } } };
  const access = polls.checkScopeAccess(row.scope, row.scopeId, userId);
  if (access.error) return access;
  return { ok: true, row: row };
}

router.post('/polls/:id/vote', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const access = accessForPoll(req.params.id, userId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const result = polls.votePoll(access.row.id, userId, req.body.optionIds, req.body.suggestion);
  if (result.error) return res.status(result.error.status).json(result.error.body);

  res.json(result.poll);
});

router.post('/polls/:id/close', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const access = accessForPoll(req.params.id, userId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const result = polls.closePoll(access.row.id, userId);
  if (result.error) return res.status(result.error.status).json(result.error.body);

  res.json(result.poll);
});

router.delete('/polls/:id', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const access = accessForPoll(req.params.id, userId);
  if (access.error) return res.status(access.error.status).json(access.error.body);

  const result = polls.deletePoll(access.row.id, userId);
  if (result.error) return res.status(result.error.status).json(result.error.body);

  res.json({ ok: true });
});

module.exports = router;
