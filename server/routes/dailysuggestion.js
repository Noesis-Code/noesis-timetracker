// Routes RETIRÉES le 22 septembre 2026 — la Suggestion quotidienne (V1,
// 21 sept. 2026, jamais poussée en Git) est fusionnée dans le segment
// Objectifs — Logique métier (décision explicite d'Emilien, voir
// noesis-timetracker-chantiers-en-cours.md encart 46). Le calcul et la
// sélection vivent désormais dans server/lib/goalsdailypriority.js, exposés
// par GET /activities/:id/goals/daily-priority (server/routes/goals.js).
//
// /daily-suggestion/today et /daily-suggestion/settings sont retirées plutôt
// que conservées avec une logique périmée : aucune UI ne les consommait (V1
// jamais poussée), donc aucun risque de casser un usage réel. Fichier gardé
// monté (server/index.js: app.use('/api', require('./routes/dailysuggestion')))
// pour ne pas modifier index.js sans nécessité — un routeur vide n'expose
// simplement plus aucune route sous cet ancien préfixe.

const express = require('express');

const router = express.Router();

module.exports = router;
