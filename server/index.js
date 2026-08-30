const path = require('path');
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

app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/activities'));
app.use('/api', require('./routes/invites'));
app.use('/api', require('./routes/follows'));
app.use('/api', require('./routes/timer'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/community'));
app.use('/api', require('./routes/history'));
app.use('/api', require('./routes/import'));

// Le service worker ne doit JAMAIS être servi depuis le cache du navigateur :
// c'est lui qui pilote la mise à jour de l'app sur les téléphones installés.
// S'il était mis en cache, un déploiement pourrait rester invisible pendant
// des jours. Même chose pour index.html et le manifeste.
app.use((req, res, next) => {
  if (
    req.path === '/' ||
    req.path === '/index.html' ||
    req.path === '/sw.js' ||
    req.path === '/manifest.webmanifest'
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
});
