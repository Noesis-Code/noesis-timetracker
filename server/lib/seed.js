// Amorce l'app avec quelques activités par défaut si la table est vide.
// Modifiable ensuite depuis l'onglet Paramètres — rien n'est figé.

const db = require('../db');

const DEFAULT_ACTIVITIES = [
  { name: 'Entreprise', color: '#B39DDB', requiresNote: 0 },
  { name: 'Produit', color: '#90CAF9', requiresNote: 0 },
  { name: 'Communauté', color: '#A5D6A7', requiresNote: 0 },
];

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM activities').get().n;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO activities (name, color, requiresNote, active, orderIndex) VALUES (?, ?, ?, 1, ?)'
  );
  db.exec('BEGIN');
  try {
    DEFAULT_ACTIVITIES.forEach((a, i) => insert.run(a.name, a.color, a.requiresNote, i + 1));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { seedIfEmpty, DEFAULT_ACTIVITIES };
