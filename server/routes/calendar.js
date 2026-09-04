// Flux calendrier des échéances de sous-projets — routes HTTP.
//
// Propriété : discussion "Calendrier des clôtures" (4 septembre 2026).
// Toute la logique vit dans server/lib/calendarfeed.js ; ce fichier ne fait
// que la validation d'entrée, le contrôle d'accès et les en-têtes HTTP —
// même découpage que subprojects.js / lib/subprojects.js.
//
// Deux familles de routes, avec DEUX authentifications différentes :
//   · /calendar/feed  — gestion de SON propre flux, appelée par l'app, donc
//     avec le userId du navigateur, comme partout ailleurs dans ce projet ;
//   · /calendar/<jeton>.ics — le flux lui-même, appelé par les serveurs de
//     Google et d'Apple, qui n'ont ni session ni navigateur. Le jeton est la
//     seule authentification possible ici, et il ne donne accès qu'à ça.
//
// ⚠️ Ces routes sont montées sous /api (server/index.js). C'est nécessaire :
// server/index.js renvoie index.html pour TOUTE route non-API (catch-all de
// la navigation par onglets). Une URL /calendar/... hors de /api renverrait
// donc la page de l'app, et le lecteur de calendrier recevrait du HTML.

const express = require('express');
const feed = require('../lib/calendarfeed');

const router = express.Router();

// La fonction désactivée se comporte comme si les routes n'existaient pas —
// pas comme un accès refusé. Un 404 ne dit rien de ce qui est éteint chez qui.
function guardEnabled(req, res, next) {
  if (!feed.isFeedEnabled()) return res.status(404).json({ error: 'Introuvable.' });
  next();
}

// URL absolue du flux, construite à partir de la requête reçue plutôt que
// d'une adresse écrite en dur ou de l'adresse de partage saisie à la main
// dans Réglages : c'est la seule qui soit forcément exacte, en local comme
// derrière le proxy de l'hébergeur (server/index.js pose déjà
// app.set('trust proxy', 1), donc req.protocol vaut bien https en ligne).
function feedUrl(req, token) {
  return req.protocol + '://' + req.get('host') + '/api/calendar/' + token + '.ics';
}

function stateFor(req, row) {
  return {
    enabled: true,
    hasFeed: !!row,
    url: row ? feedUrl(req, row.token) : null,
    createdAt: row ? row.createdAt : null,
    lastAccessAt: row ? row.lastAccessAt : null,
  };
}

// ----- Gestion de son propre flux -----

// L'état, y compris quand la fonction est éteinte : le client a besoin de
// savoir s'il doit afficher la section du tout. C'est la seule route du
// fichier qui répond quand la fonction est désactivée.
router.get('/calendar/feed', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  if (!feed.isFeedEnabled()) {
    return res.json({ enabled: false, hasFeed: false, url: null, createdAt: null, lastAccessAt: null });
  }
  res.json(stateFor(req, feed.getTokenRow(userId)));
});

// Créer son flux, ou en régénérer un nouveau. Le même geste dans les deux
// cas : régénérer invalide immédiatement l'ancienne URL, c'est ce qu'il faut
// faire si elle a fuité.
router.post('/calendar/feed', guardEnabled, (req, res) => {
  const userId = (req.body || {}).userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  res.json(stateFor(req, feed.issueToken(userId)));
});

router.delete('/calendar/feed', guardEnabled, (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });
  feed.revokeToken(userId);
  res.json(stateFor(req, null));
});

// ----- Le flux lui-même -----
//
// Le suffixe '.ics' n'est pas décoratif : plusieurs lecteurs (Apple en tête)
// décident du traitement d'une URL d'abonnement à partir de son extension
// autant que du type de contenu. Il est retiré ici plutôt que déclaré dans le
// motif de route (`/calendar/:token.ics`), dont l'interprétation dépend de la
// version de path-to-regexp embarquée par Express — un détail qui change
// silencieusement d'une version majeure à l'autre.
router.get('/calendar/:file', guardEnabled, (req, res) => {
  const token = String(req.params.file || '').replace(/\.ics$/i, '');
  const userId = feed.findUserIdByToken(token);
  // Jeton inconnu ou révoqué : 404, jamais 403. Un 403 confirmerait que
  // l'URL a existé.
  if (!userId) return res.status(404).type('text/plain').send('Not found');

  const body = feed.buildFeedForUser(userId);
  feed.touchToken(userId);

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="noesis.ics"');
  // Une URL porteuse de secret ne doit ni être mise en cache par un
  // intermédiaire, ni finir dans un index.
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.send(body);
});

module.exports = router;
