// server/lib/seed-staging.js
//
// 11 septembre 2026 (demande directe d'Emilien) : l'environnement de test
// Railway (PR #2, staging -> main) doit ressembler à une app "vivante" pour
// qu'Emilien puisse tester dans des conditions réalistes — SANS jamais y
// faire entrer les vraies données de ses utilisateurs. Décision déjà prise
// avec lui lors de la mise en place du protocole staging (10-11 septembre,
// voir noesis-timetracker-deploiement.md) : la base de l'environnement de
// test reste libre de toute donnée personnelle réelle (téléphone, email,
// PIN de vrais comptes), pour ne pas créer une deuxième copie de données
// personnelles dans un environnement temporaire et moins protégé que la
// production (voir noesis-timetracker-conformite-loi25.md).
//
// Solution retenue avec Emilien (AskUserQuestion, deux tours, 11 septembre
// 2026) : des profils et activités FICTIFS (aucune vraie donnée), regénérés
// à CHAQUE démarrage du serveur sur cet environnement — donc à chaque
// nouveau push sur `staging`, comme demandé explicitement. Conséquence
// assumée : tout ce qu'Emilien crée manuellement en testant sur cet
// environnement est effacé au prochain déploiement de `staging` — ce n'est
// pas un bug, c'est le fonctionnement voulu (état de test prévisible et
// reproductible à chaque fois).
//
// Déclenchement (voir server/index.js) : uniquement quand la variable
// RAILWAY_ENVIRONMENT_NAME existe ET vaut autre chose que "production".
// Cette variable est posée automatiquement par Railway sur CHAQUE
// environnement (confirmé via l'API Railway le 11 septembre 2026) :
//   - en production, RAILWAY_ENVIRONMENT_NAME = "production" -> jamais de seed ;
//   - sur l'environnement de test PR (nom généré, ex.
//     "noesis-timetracker-pr-2") -> seed à chaque démarrage ;
//   - en local (npm start / npm run dev, hors Railway), cette variable
//     n'existe pas du tout -> jamais de seed, la base locale démarre comme
//     avant (vide, à chacun de créer ses activités).
//
// Toute erreur ici est avalée (try/catch) : un problème de seed ne doit
// JAMAIS empêcher le serveur de démarrer, même sur l'environnement de test
// — même philosophie de robustesse que computeAppVersion() dans index.js.

const { randomUUID } = require('node:crypto');
const { makePinRecord } = require('./auth');
const { DARK_PALETTE } = require('../../public/theme-palette.js');
const { isoDateOf, dayNameOf } = require('./dates');

// Code PIN commun à tous les profils fictifs, pour qu'Emilien puisse s'y
// reconnecter sans avoir à en retenir un différent par profil (de toute
// façon régénéré à chaque déploiement, donc sans valeur à protéger).
const SEED_PIN = '0000';

const FAKE_USERS = [
  { name: 'Alex', lastName: 'Tremblay' },
  { name: 'Sam', lastName: 'Bouchard' },
  { name: 'Jamie', lastName: 'Roy' },
  { name: 'Léo', lastName: 'Gagnon' }
];

const FAKE_ACTIVITY_NAMES = ['Développement', 'Réunions', 'Formation', 'Administratif', 'Pause'];

function shouldSeed() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME;
  return !!env && env !== 'production';
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function shuffled(arr) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

function seedStagingData(db) {
  if (!shouldSeed()) return;
  try {
    const envName = process.env.RAILWAY_ENVIRONMENT_NAME;
    console.log('[seed-staging] Environnement de test détecté (' + envName + ') — génération de données fictives...');

    // Purge des tables concernées. ON DELETE CASCADE (activity_members,
    // time_entries, running_timers -> users ; activity_members,
    // time_entries -> activities) suffirait techniquement en ne vidant que
    // users/activities, mais on vide aussi explicitement les tables filles
        // pour ne jamais dépendre implicitement de l'ordre des contraintes.
    db.exec('DELETE FROM running_timers');
    db.exec('DELETE FROM time_entries');
    db.exec('DELETE FROM activity_members');
    db.exec('DELETE FROM activities');
    db.exec('DELETE FROM users');

    const now = new Date();
    const nowIso = now.toISOString();
    const pinRecord = makePinRecord(SEED_PIN);

    const insertUser = db.prepare(
      "INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang) VALUES (?, ?, ?, '', '', ?, ?, ?, 'dark', 1, 'fr')"
    );
    const insertActivity = db.prepare(
      'INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, 0, 1, ?, ?, ?)'
    );
    const insertMember = db.prepare(
      'INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)'
    );
    const insertEntry = db.prepare(
      'INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    FAKE_USERS.forEach((u, idx) => {
      const userId = randomUUID();
      const color = DARK_PALETTE[idx % DARK_PALETTE.length];
      insertUser.run(userId, u.name, u.lastName, color, nowIso, pinRecord);

      // 2 à 3 activités par profil fictif, sans doublon pour ce profil.
      const chosenNames = shuffled(FAKE_ACTIVITY_NAMES).slice(0, randomInt(2, 3));
      const activityIds = [];
      chosenNames.forEach((name) => {
        const info = insertActivity.run(name, userId, randomUUID(), nowIso);
        const activityId = info.lastInsertRowid;
        activityIds.push(activityId);
        insertMember.run(activityId, userId, color, nowIso);
      });

      // 14 derniers jours, 0 à 2 entrées fictives par jour, pour que la
      // Feuille de temps / Historique / Statistiques ne soient pas vides.
      for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
        const entriesForDay = randomInt(0, 2);
        for (let i = 0; i < entriesForDay; i++) {
          const activityId = pick(activityIds);
          const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), randomInt(8, 16), randomInt(0, 59));
          const durationSeconds = randomInt(15, 120) * 60;
          const end = new Date(start.getTime() + durationSeconds * 1000);
          insertEntry.run(
            userId, activityId, '',
            start.toISOString(), end.toISOString(), durationSeconds,
            isoDateOf(start), dayNameOf(start)
          );
        }
      }
    });

    console.log('[seed-staging] ' + FAKE_USERS.length + ' profils fictifs créés (code PIN commun : ' + SEED_PIN + ').');
  } catch (err) {
    console.error('[seed-staging] Échec du seed (le serveur démarre quand même) :', err);
  }
}

module.exports = { seedStagingData, shouldSeed };
