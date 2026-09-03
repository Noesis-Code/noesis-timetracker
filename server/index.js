// Fuseau horaire du serveur (30 août 2026, bug signalé par Emilien) — DOIT
// être la toute première ligne exécutée, avant tout require, y compris
// celui de ./db juste en dessous : tout le reste du code (dates.js, stats.js,
// community.js, period.js, import.js...) calcule les heures/jours avec les
// méthodes "locales" de Date (getHours, getDate, getDay, le constructeur
// new Date(année, mois, jour, heure...)), qui dépendent du fuseau du
// PROCESSUS Node, pas de celui d'Emilien. Sans réglage explicite, un
// conteneur Railway démarre en UTC : une session commencée à 17h30-20h45
// heure de Montréal (UTC-4 en été) se retrouvait ainsi affichée 15h30-18h45
// dans la Feuille de temps — les heures de fin de journée basculaient même
// carrément sur le mauvais jour calendaire. Fixé une bonne fois pour toutes
// ici plutôt que de faire de la conversion de fuseau au cas par cas dans
// chaque fichier qui manipule des dates.
//
// "America/Toronto" plutôt que "America/Montreal" : les deux partagent le
// même fuseau (heure de l'Est, EDT/EST), mais "America/Montreal" est un
// simple alias historique vers "America/Toronto" dans la base de données
// IANA — on utilise directement le nom canonique.
process.env.TZ = 'America/Toronto';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

// Pas d'activités par défaut : chaque déploiement démarre vide, à chacun
// de créer ses activités (à l'initialisation puis dans Paramètres).
require('./db');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();

// Derrière le proxy d'un hébergeur (Railway, Render...), req.protocol et
// req.ip reflètent le proxy et non le visiteur tant qu'on ne fait pas
// confiance aux en-têtes X-Forwarded-*. Sans effet en local.
app.set('trust proxy', 1);

// 15 Mo au lieu des 100 Ko par défaut : l'import CSV de l'historique
// (POST /api/import/history) envoie tout le fichier dans le corps de la
// requête, une photo de profil transite en data URL, et une pièce jointe de
// note (photo/document, voir server/lib/attachments.js) peut peser jusqu'à
// 5 Mo décodés — environ 6.7 Mo une fois encodée en base64, plus marge pour
// le reste du JSON. La limite par défaut d'Express les refuserait avec une
// erreur peu explicite. Relevée de 5 à 15 Mo le 29 août 2026 pour les pièces
// jointes du Chrono (une seule à la fois par requête).
app.use(express.json({ limit: '15mb' }));

// ---------------------------------------------------------------------------
// Empreinte de version de l'app (volet Déploiement / Mobile, 30 août 2026)
//
// Problème résolu : une app installée sur l'écran d'accueil (PWA) n'est pas
// "relancée" comme une page web. Sur iOS surtout, elle est mise en veille puis
// reprise telle quelle — le code JavaScript déjà chargé en mémoire continue de
// tourner indéfiniment, même après un redéploiement. Emilien devait
// désinstaller/réinstaller l'app pour voir ses propres mises à jour.
//
// Cette empreinte est calculée UNE SEULE FOIS au démarrage, à partir du
// contenu réel des fichiers servis au navigateur. Elle est donc strictement
// constante pendant toute la vie d'un déploiement, et change dès qu'un de ces
// fichiers change — c'est exactement ce qu'il faut pour que le client puisse
// comparer "la version que j'ai chargée" à "la version en ligne maintenant"
// sans jamais se recharger en boucle. Voir le bloc <script> en tête de
// public/index.html pour la partie client.
const VERSION_FILES = ['index.html', 'app.js', 'styles.css', 'i18n.js', 'sw.js', 'theme-palette.js'];

function computeAppVersion() {
  const hash = crypto.createHash('sha1');
  for (const name of VERSION_FILES) {
    hash.update(name);
    try {
      hash.update(fs.readFileSync(path.join(PUBLIC_DIR, name)));
    } catch (err) {
      // Un fichier absent ne doit jamais empêcher le serveur de démarrer :
      // il compte simplement comme "absent" dans l'empreinte.
      hash.update('absent');
    }
  }
  return hash.digest('hex').slice(0, 12);
}

const APP_VERSION = computeAppVersion();

// no-store et pas seulement no-cache : cette réponse ne doit jamais être
// resservie depuis un cache, sinon la détection de mise à jour est aveugle.
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: APP_VERSION });
});

app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/activities'));
app.use('/api', require('./routes/invites'));
app.use('/api', require('./routes/follows'));
app.use('/api', require('./routes/timer'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/community'));
// Sous-projets d'une activité (découpage, todolist, fil par sous-projet,
// avancement) — discussion "Sous-projets", 3 septembre 2026.
app.use('/api', require('./routes/subprojects'));
app.use('/api', require('./routes/history'));
app.use('/api', require('./routes/import'));
app.use('/api', require('./routes/push'));

// Le service worker ne doit JAMAIS être servi depuis le cache du navigateur :
// c'est lui qui pilote la mise à jour de l'app sur les téléphones installés.
// S'il était mis en cache, un déploiement pourrait rester invisible pendant
// des jours. Même chose pour index.html et le manifeste.
//
// Ajout du 30 août 2026 (constaté par Emilien : aucun changement visible sur
// son téléphone après un simple rechargement) : app.js/styles.css/i18n.js
// n'avaient AUCUN en-tête Cache-Control explicite (comportement par défaut
// d'express.static plus bas) — sans max-age ni no-cache, un navigateur peut
// les garder en cache et les servir tels quels sans même revalider auprès du
// serveur (mise en cache heuristique), ce qui contournait complètement la
// stratégie "réseau d'abord" du service worker (public/sw.js), qui appelle
// bien fetch() à chaque fois mais reçoit alors une réponse déjà périmée
// renvoyée par le cache du navigateur avant même d'atteindre le serveur.
// "no-cache" (et non "no-store") est volontairement choisi ici : le fichier
// reste mis en cache, mais une revalidation (ETag/Last-Modified, déjà gérée
// par express.static) est obligatoire à chaque chargement — pas de course
// perpétuelle au réseau, juste plus de version périmée servie sans vérifier.
app.use((req, res, next) => {
  if (
    req.path === '/' ||
    req.path === '/index.html' ||
    req.path === '/sw.js' ||
    req.path === '/manifest.webmanifest' ||
    req.path === '/app.js' ||
    req.path === '/styles.css' ||
    req.path === '/i18n.js' ||
    req.path === '/theme-palette.js'
  ) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

app.use(express.static(PUBLIC_DIR));

// Toute route non-API renvoie l'app (navigation par onglets gérée côté client)
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// HOST : en local on reste sur localhost ; sur un hébergeur il faut écouter
// sur toutes les interfaces (0.0.0.0), sinon le routeur du service ne voit
// jamais l'application. Mettre NOESIS_HOST=0.0.0.0 permet aussi de tester
// depuis un téléphone sur le même WiFi.
const PORT = process.env.PORT || 3000;
const HOST = process.env.NOESIS_HOST || (process.env.PORT ? '0.0.0.0' : 'localhost');
app.listen(PORT, HOST, () => {
  console.log(`Noèsis TimeTracker en écoute sur http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Version de l'app servie : ${APP_VERSION}`);
});
