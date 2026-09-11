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
// ⚠️ MODÈLE DE PERSISTANCE CHANGÉ le 11 septembre 2026 (deuxième cadrage,
// AskUserQuestion, trois tours) : la première version de ce fichier vidait
// et régénérait TOUTE la base à CHAQUE démarrage du serveur — donc à chaque
// nouveau push sur `staging`, ce qui effaçait systématiquement le compte
// qu'Emilien venait de se créer en testant, quelques minutes plus tôt.
// Signalé par Emilien comme un problème (« il faut que je me recrée un
// compte à chaque fois ») plutôt qu'un comportement voulu. Nouveau
// comportement : le seed ne s'exécute plus qu'UNE SEULE FOIS, uniquement si
// la table users est VIDE au démarrage. Dès qu'il y a au moins un profil en
// base (le jeu de données fictif initial, OU n'importe quoi qu'Emilien a
// créé lui-même depuis), plus aucune régénération automatique — les
// données survivent aux redéploiements de `staging`, exactement comme la
// production survit aux siens. Si Emilien veut un jour repartir d'une base
// de test propre, ça demande une action explicite (vider la base sur
// l'environnement de test), pas un comportement implicite au démarrage.
//
// Contenu initial enrichi au même passage, pour qu'Emilien n'ait plus à
// tout reconstruire à la main pour tester dans des conditions réalistes :
// - un compte PERSISTANT pour Emilien lui-même (voir EMILIEN_SEED_ACCOUNT
//   plus bas), sur lequel il peut se connecter dès le premier chargement de
//   l'app et qui reste ensuite là tant qu'il ne le supprime pas lui-même ;
// - plusieurs profils fictifs, avec des activités PARTAGÉES incluant le
//   compte d'Emilien (pas seulement des activités isolées par profil,
//   comme dans la première version) ;
// - des messages dans le fil de discussion de ces activités partagées ;
// - des publications (profile_posts) de plusieurs membres fictifs ;
// - un abonnement (follows, statut accepted) entre Emilien et chaque membre
//   fictif, dans les deux sens, pour que le flux "Suivi" et les pages de
//   profil des autres membres soient déjà peuplés.
//
// Déclenchement (voir server/index.js) : uniquement quand la variable
// RAILWAY_ENVIRONMENT_NAME existe ET vaut autre chose que "production".
// Cette variable est posée automatiquement par Railway sur CHAQUE
// environnement (confirmé via l'API Railway le 11 septembre 2026) :
//   - en production, RAILWAY_ENVIRONMENT_NAME = "production" -> jamais de seed ;
//   - sur l'environnement de test PR (nom généré, ex.
//     "noesis-timetracker-pr-2") -> seed UNE FOIS si la base est vide, jamais
//     ensuite tant qu'il reste au moins un profil ;
//   - en local (npm start / npm run dev, hors Railway), cette variable
//     n'existe pas du tout -> jamais de seed, la base locale démarre comme
//     avant (vide, à chacun de créer ses activités).
//
// Toute erreur ici est avalée (try/catch) : un problème de seed ne doit
// JAMAIS empêcher le serveur de démarrer, même sur l'environnement de test
// — même philosophie de robustesse que computeAppVersion() dans index.js.

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('node:crypto');
const { makePinRecord } = require('./auth');
const { DARK_PALETTE } = require('../../public/theme-palette.js');
const { isoDateOf, dayNameOf } = require('./dates');

// ⚠️ Marqueur de transition, ajouté le même 11 septembre 2026 : le jeu de
// données déjà présent sur l'environnement de test au moment de ce
// déploiement vient de l'ANCIEN régime (régénéré à chaque démarrage, donc
// sans le compte persistant d'Emilien ni les activités partagées). Sans ce
// marqueur, la règle "userCount > 0 -> on ne touche à rien" empêcherait à
// jamais la nouvelle version de s'installer, puisque la base n'est
// techniquement jamais vide. On compare donc un numéro de version stocké
// dans un simple fichier sur le volume persistant (à côté de noesis.db) :
// tant qu'il est inférieur à SEED_MARKER_VERSION, on autorise UNE seule
// purge de transition puis on écrit le marqueur — après quoi le
// comportement redevient exactement celui décrit plus haut (plus jamais
// aucune purge automatique). Un futur changement de contenu du seed qui
// justifierait une nouvelle régénération ponctuelle se ferait en
// incrémentant simplement ce numéro, sans toucher au reste du fichier.
const SEED_MARKER_VERSION = 2;
const SEED_MARKER_DATA_DIR = process.env.NOESIS_DATA_DIR
  ? path.resolve(process.env.NOESIS_DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const SEED_MARKER_PATH = path.join(SEED_MARKER_DATA_DIR, '.seed-version');

function readSeedMarkerVersion() {
  try {
    return parseInt(fs.readFileSync(SEED_MARKER_PATH, 'utf8').trim(), 10) || 0;
  } catch (err) {
    return 0;
  }
}

function writeSeedMarkerVersion(version) {
  try {
    if (!fs.existsSync(SEED_MARKER_DATA_DIR)) fs.mkdirSync(SEED_MARKER_DATA_DIR, { recursive: true });
    fs.writeFileSync(SEED_MARKER_PATH, String(version));
  } catch (err) {
    console.error('[seed-staging] Impossible d\'écrire le marqueur de version de seed :', err);
  }
}

// Compte persistant d'Emilien sur l'environnement de test. Nom clairement
// distinct de son vrai compte de production (jamais "Emilien" tout court,
// pour qu'aucune confusion ne soit possible entre les deux environnements
// en cas de capture d'écran partagée) — NIP simple à retenir, différent de
// celui des profils fictifs ci-dessous.
const EMILIEN_SEED_ACCOUNT = { name: 'Emilien', lastName: 'Staging', pin: '1234' };

// Code PIN commun à tous les profils fictifs, pour qu'Emilien puisse s'y
// reconnecter sans avoir à en retenir un différent par profil.
const SEED_PIN = '0000';

const FAKE_USERS = [
  { name: 'Alex', lastName: 'Tremblay' },
  { name: 'Sam', lastName: 'Bouchard' },
  { name: 'Jamie', lastName: 'Roy' },
  { name: 'Léo', lastName: 'Gagnon' },
  { name: 'Noa', lastName: 'Lefebvre' }
];

const FAKE_ACTIVITY_NAMES = ['Développement', 'Réunions', 'Formation', 'Administratif', 'Pause'];

// Activités PARTAGÉES avec le compte d'Emilien : chacune associe son compte
// de test à un sous-ensemble des profils fictifs (par leur index dans
// FAKE_USERS), pour que l'onglet Activité/Communauté ne soit pas vide dès
// la première connexion.
const SHARED_WITH_EMILIEN = [
  { name: 'Développement Noèsis', memberIdx: [0, 1] }, // + Alex, Sam
  { name: 'Réunions clients', memberIdx: [2] },          // + Jamie
  { name: 'Formation', memberIdx: [3, 4] }               // + Léo, Noa
];

const FAKE_POSTS = [
  'Bonne semaine à tous, on garde le rythme !',
  'Nouvelle activité ajoutée de mon côté, hâte de commencer.',
  'Petit point rapide : tout avance bien sur mes dossiers en cours.',
  'Qui est partant pour une session de travail groupée cette semaine ?',
  'Merci pour les retours sur la dernière réunion, très utile.',
  'Journée productive aujourd\'hui — historique à jour.'
];

const FAKE_MESSAGES = [
  'Salut tout le monde, on démarre quand vous voulez.',
  'Je mets à jour le suivi de mon côté, dites-moi si ça avance pour vous aussi.',
  'On peut se caler un point rapide cette semaine ?',
  'Merci, je regarde ça de mon côté.',
  'Parfait, on continue comme ça.'
];

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

function daysAgoIso(days, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (hour != null) d.setHours(hour, minute || 0, 0, 0);
  return d.toISOString();
}

function addTimeEntries(insertEntry, userId, activityId, dayCount) {
  const now = new Date();
  for (let dayOffset = dayCount - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
    const entriesForDay = randomInt(0, 2);
    for (let i = 0; i < entriesForDay; i++) {
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
}

function seedStagingData(db) {
  if (!shouldSeed()) return;
  try {
    const envName = process.env.RAILWAY_ENVIRONMENT_NAME;
    const markerVersion = readSeedMarkerVersion();
    const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

    if (markerVersion < SEED_MARKER_VERSION) {
      // Transition ponctuelle depuis l'ancien régime (voir commentaire sur
      // SEED_MARKER_VERSION plus haut) : si la base contient déjà des
      // données de l'ancien seed (régénéré à chaque démarrage), on les
      // purge UNE fois pour laisser place au nouveau jeu de données
      // persistant. Si la base est déjà vide (tout premier démarrage sur
      // ce volume), rien à purger.
      if (userCount > 0) {
        console.log('[seed-staging] Transition depuis l\'ancien régime (' + userCount + ' profil(s) de l\'ancien seed régénéré à chaque démarrage) — purge unique avant de créer le nouveau jeu de données persistant...');
        db.exec('DELETE FROM activity_message_reads');
        db.exec('DELETE FROM activity_messages');
        db.exec('DELETE FROM profile_post_attachments');
        db.exec('DELETE FROM profile_posts');
        db.exec('DELETE FROM follows');
        db.exec('DELETE FROM running_timers');
        db.exec('DELETE FROM time_entries');
        db.exec('DELETE FROM activity_members');
        db.exec('DELETE FROM activities');
        db.exec('DELETE FROM users');
      }
    } else if (userCount > 0) {
      // ⚠️ Cœur du nouveau modèle : une fois la transition faite, on ne
      // seed plus QUE si la base est totalement vide. Dès qu'un seul
      // profil existe (le jeu fictif initial, ou un compte créé
      // manuellement par Emilien), on ne touche plus à rien — aucune
      // purge, jamais, tant que le serveur redémarre avec des données
      // déjà présentes.
      console.log('[seed-staging] ' + userCount + ' profil(s) déjà présent(s) sur cet environnement — aucune régénération (les données persistent désormais entre les déploiements).');
      return;
    }

    console.log('[seed-staging] Génération du jeu de données initial sur l\'environnement de test (' + envName + ')...');

    const now = new Date();
    const nowIso = now.toISOString();
    const seedPinRecord = makePinRecord(SEED_PIN);
    const emilienPinRecord = makePinRecord(EMILIEN_SEED_ACCOUNT.pin);

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
    const insertMessage = db.prepare(
      'INSERT INTO activity_messages (activityId, userId, body, createdAt) VALUES (?, ?, ?, ?)'
    );
    const insertPost = db.prepare(
      'INSERT INTO profile_posts (userId, body, createdAt) VALUES (?, ?, ?)'
    );
    const insertFollow = db.prepare(
      'INSERT INTO follows (followerId, followeeId, status, createdAt, respondedAt) VALUES (?, ?, \'accepted\', ?, ?)'
    );

    // 1) Compte persistant d'Emilien.
    const emilienId = randomUUID();
    const emilienColor = DARK_PALETTE[0];
    insertUser.run(emilienId, EMILIEN_SEED_ACCOUNT.name, EMILIEN_SEED_ACCOUNT.lastName, emilienColor, nowIso, emilienPinRecord);

    // 2) Profils fictifs, chacun avec 1 à 2 activités personnelles (non
    // partagées) en plus des activités partagées ajoutées à l'étape 3.
    const fakeUserIds = [];
    const fakeUserColors = [];
    FAKE_USERS.forEach((u, idx) => {
      const userId = randomUUID();
      const color = DARK_PALETTE[(idx + 1) % DARK_PALETTE.length];
      fakeUserIds.push(userId);
      fakeUserColors.push(color);
      insertUser.run(userId, u.name, u.lastName, color, nowIso, seedPinRecord);

      const personalNames = shuffled(FAKE_ACTIVITY_NAMES).slice(0, randomInt(1, 2));
      personalNames.forEach((name) => {
        const info = insertActivity.run(name, userId, randomUUID(), nowIso);
        const activityId = info.lastInsertRowid;
        insertMember.run(activityId, userId, color, nowIso);
        addTimeEntries(insertEntry, userId, activityId, 14);
      });

      // Publications (profile_posts) : 1 à 2 par membre fictif, échelonnées
      // sur les derniers jours pour que le flux "Suivi" d'Emilien ne montre
      // pas tout au même instant.
      const postCount = randomInt(1, 2);
      for (let i = 0; i < postCount; i++) {
        insertPost.run(userId, pick(FAKE_POSTS), daysAgoIso(randomInt(0, 6), randomInt(8, 20), randomInt(0, 59)));
      }

      // Abonnement mutuel avec Emilien (accepté des deux côtés), pour que
      // son flux "Suivi" et les pages de profil soient déjà peuplés.
      insertFollow.run(emilienId, userId, nowIso, nowIso);
      insertFollow.run(userId, emilienId, nowIso, nowIso);
    });

    // 3) Activités PARTAGÉES avec le compte d'Emilien.
    SHARED_WITH_EMILIEN.forEach((def) => {
      const info = insertActivity.run(def.name, emilienId, randomUUID(), nowIso);
      const activityId = info.lastInsertRowid;
      insertMember.run(activityId, emilienId, emilienColor, nowIso);
      addTimeEntries(insertEntry, emilienId, activityId, 10);

      const memberIds = [emilienId];
      def.memberIdx.forEach((idx) => {
        const userId = fakeUserIds[idx];
        insertMember.run(activityId, userId, fakeUserColors[idx], nowIso);
        addTimeEntries(insertEntry, userId, activityId, 10);
        memberIds.push(userId);
      });

      // Fil de discussion : 3 à 5 messages, auteurs pris au hasard parmi
      // les membres réels de CETTE activité (Emilien inclus), étalés sur
      // les derniers jours.
      const messageCount = randomInt(3, 5);
      for (let i = 0; i < messageCount; i++) {
        const author = pick(memberIds);
        insertMessage.run(activityId, author, pick(FAKE_MESSAGES), daysAgoIso(randomInt(0, 5), randomInt(8, 20), randomInt(0, 59)));
      }
    });

    writeSeedMarkerVersion(SEED_MARKER_VERSION);
    console.log('[seed-staging] 1 compte persistant (Emilien Staging, NIP ' + EMILIEN_SEED_ACCOUNT.pin + ') + ' + FAKE_USERS.length + ' profils fictifs créés (NIP commun : ' + SEED_PIN + '), avec activités partagées, publications et abonnements. Ces données ne seront plus régénérées automatiquement.');
  } catch (err) {
    console.error('[seed-staging] Échec du seed (le serveur démarre quand même) :', err);
  }
}

module.exports = { seedStagingData, shouldSeed };
