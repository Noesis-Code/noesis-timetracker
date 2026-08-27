const path = require('path');
const express = require('express');

// Pas d'activités par défaut : chaque déploiement démarre vide, à chacun
// de créer ses activités (à l'initialisation puis dans Paramètres).
require('./db');

const app = express();
app.use(express.json());

app.use('/api', require('./routes/profile'));
app.use('/api', require('./routes/activities'));
app.use('/api', require('./routes/timer'));
app.use('/api', require('./routes/stats'));
app.use('/api', require('./routes/community'));
app.use('/api', require('./routes/history'));
app.use('/api', require('./routes/import'));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Toute route non-API renvoie l'app (navigation par onglets gérée côté client)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Noèsis TimeTracker en écoute sur http://localhost:${PORT}`);
});
