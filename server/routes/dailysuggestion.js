// Suggestion quotidienne — routes HTTP. Toute la logique de données vit dans
// server/lib/dailysuggestion.js ; ce fichier ne fait que l'authentification,
// la validation d'entrée et le codage des statuts HTTP — même découpage que
// server/routes/subprojects.js / server/lib/subprojects.js.

const express = require('express');
const db = require('../db');
const dailysuggestion = require('../lib/dailysuggestion');

const router = express.Router();

function requireUser(req, res) {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.userId);
  if (!user) { res.status(404).json({ error: 'Profil introuvable. Réinitialise ton profil dans Paramètres.' }); return null; }
  return user;
}

function handleError(res, err) {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[suggestion-quotidienne]', err);
  return res.status(500).json({ error: 'Erreur serveur.' });
}

// Suggestion du jour (calculée une seule fois par jour — voir l'index unique
// de daily_suggestions dans server/db.js).
router.get('/daily-suggestion/today', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    res.json(dailysuggestion.getOrGenerateTodaySuggestion(user.id));
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/daily-suggestion/settings', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  res.json({ declaredMinutes: dailysuggestion.getDeclaredMinutes(user.id) });
});

router.put('/daily-suggestion/settings', (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const declaredMinutes = dailysuggestion.setDeclaredMinutes(user.id, req.body.declaredMinutes);
    res.json({ declaredMinutes });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
