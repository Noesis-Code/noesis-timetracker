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
const { makePinRecord, verifyPinRecord } = require('./auth');
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
      "INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang, passwordStrong) VALUES (?, ?, ?, '', 'seed@exemple.test', ?, ?, ?, 'dark', 1, 'fr', 1)"
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

// Recrée SEUL le compte d'Emilien (supprimé par erreur, 30 oct. 2026) : même nom, même NIP, abonnement mutuel accepté avec les profils fictifs, et
// retour dans les activités partagées d'origine (« Développement Noèsis », « Réunions clients », « Formation ») avec leur historique de temps.
// Ne touche à aucun autre compte ; ne fait rien si le compte existe déjà. Lancé par scripts/recreate-emilien-staging.js.
function recreateEmilienAccount(db) {
  const exists = db.prepare('SELECT id FROM users WHERE name = ? AND lastName = ?').get(EMILIEN_SEED_ACCOUNT.name, EMILIEN_SEED_ACCOUNT.lastName);
  if (exists) return { created: false, id: exists.id };
  const nowIso = new Date().toISOString();
  const emilienId = randomUUID();
  const color = DARK_PALETTE[0];
  db.prepare("INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang, passwordStrong) VALUES (?, ?, ?, '', 'seed@exemple.test', ?, ?, ?, 'dark', 1, 'fr', 1)")
    .run(emilienId, EMILIEN_SEED_ACCOUNT.name, EMILIEN_SEED_ACCOUNT.lastName, color, nowIso, makePinRecord(EMILIEN_SEED_ACCOUNT.pin));
  const insertEntry = db.prepare('INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertMember = db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)');
  const insertFollow = db.prepare("INSERT OR IGNORE INTO follows (followerId, followeeId, status, createdAt, respondedAt) VALUES (?, ?, 'accepted', ?, ?)");
  let follows = 0, joined = 0;
  FAKE_USERS.forEach((u) => {
    const f = db.prepare('SELECT id FROM users WHERE name = ? AND lastName = ?').get(u.name, u.lastName);
    if (!f) return;
    insertFollow.run(emilienId, f.id, nowIso, nowIso); insertFollow.run(f.id, emilienId, nowIso, nowIso); follows += 1;
  });
  SHARED_WITH_EMILIEN.forEach((def) => {
    const act = db.prepare('SELECT id FROM activities WHERE name = ? ORDER BY id LIMIT 1').get(def.name);
    let id = act && act.id;
    if (!id) id = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, 0, 1, ?, ?, ?)').run(def.name, emilienId, randomUUID(), nowIso).lastInsertRowid);
    insertMember.run(id, emilienId, color, nowIso);
    db.prepare('UPDATE activities SET ownerId = ? WHERE id = ?').run(emilienId, id); // propriétaire d'origine (la suppression du compte avait passé la propriété à un autre membre) : Drive n'est géré que par le propriétaire
    addTimeEntries(insertEntry, emilienId, id, 10);
    joined += 1;
  });
  return { created: true, id: emilienId, follows, activities: joined };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// OBJECTIFS DE DÉMONSTRATION (arbre des objectifs de la page 1) — STAGING UNIQUEMENT (shouldSeed : RAILWAY_ENVIRONMENT_NAME défini et différent de « production »).
// Pour Emilien Staging et deux profils fictifs : jusqu'à 4 activités chacun, 2 à 4 objectifs finaux par activité, étapes sur 2 à 3 niveaux (parentId), des objectifs RÉALISÉS (passé),
// EN COURS, FUTURS (échéances jusqu'en 2031) et un ABANDONNÉ (meta.abandoned). Chaque objectif porte meta.demo = true (« donnée de démonstration »). Idempotent : un utilisateur qui a
// déjà un objectif de démonstration n'est pas retouché ; aucun objectif réel n'est modifié. Désactivation : SEED_OBJECTIFS_DEMO=0.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const DEMO_TREES = [
  [ // activité 1
    { t: 'Lancer la version 2', s: -70, e: 260, kids: [
      { t: 'Concevoir les nouveaux écrans', s: -70, e: -10, done: true, kids: [{ t: 'Prototype cliquable', s: -70, e: -30, done: true }, { t: 'Tests avec dix utilisateurs', s: -30, e: -10, done: true }] },
      { t: 'Développer les modules', s: -10, e: 170, kids: [{ t: 'Module des objectifs', s: -10, e: 60 }, { t: 'Bêta fermée', s: 110, e: 170 }] },
      { t: 'Lancement public', s: 170, e: 260 }] },
    { t: 'Atteindre mille utilisateurs', s: 260, e: 1000, kids: [{ t: 'Cent premiers utilisateurs', s: 260, e: 420, kids: [{ t: 'Programme de parrainage', s: 260, e: 330 }] }, { t: 'Équipe de cinq personnes', s: 420, e: 1000 }] },
    { t: 'Version 1 publiée', s: -520, e: -90, done: true, kids: [{ t: 'Première maquette', s: -520, e: -400, done: true }, { t: 'Fonctions de base', s: -400, e: -90, done: true }] },
    { t: 'Ancien prototype papier', s: -400, e: -300, dropped: true },
  ],
  [ // activité 2
    { t: 'Obtenir ma certification', s: -40, e: 220, kids: [
      { t: 'Réussir l’examen théorique', s: -40, e: 100, kids: [{ t: 'Cours en ligne', s: -40, e: 30, done: true }, { t: 'Examen blanc', s: 30, e: 100 }] },
      { t: 'Réussir l’examen pratique', s: 100, e: 220, kids: [{ t: 'Stage de préparation', s: 100, e: 160 }] }] },
    { t: 'Parler anglais couramment', s: 220, e: 1500, kids: [{ t: 'Niveau intermédiaire', s: 220, e: 600, kids: [{ t: 'Cours du soir', s: 220, e: 400 }] }, { t: 'Séjour à l’étranger', s: 900, e: 1500 }] },
    { t: 'Lire douze livres techniques', s: -330, e: -20, done: true, kids: [{ t: 'Six premiers livres', s: -330, e: -170, done: true }] },
  ],
  [ // activité 3
    { t: 'Signer dix clients', s: -90, e: 120, kids: [
      { t: 'Offre claire et tarifs', s: -90, e: -20, done: true },
      { t: 'Cinq rendez-vous par mois', s: -20, e: 60, kids: [{ t: 'Liste de prospects', s: -20, e: 10, done: true }, { t: 'Relance des devis', s: 10, e: 60 }] },
      { t: 'Contrats signés', s: 60, e: 120 }] },
    { t: 'Cinquante clients actifs', s: 120, e: 1700, kids: [{ t: 'Trente clients actifs', s: 120, e: 800, kids: [{ t: 'Équipe commerciale', s: 400, e: 800 }] }] },
    { t: 'Refonte de l’offre', s: -260, e: -60, done: true },
  ],
  [ // activité 4
    { t: 'Courir un semi-marathon', s: -50, e: 140, kids: [{ t: 'Courir 10 km sans arrêt', s: -50, e: 20, done: true }, { t: 'Courir 15 km', s: 20, e: 80 }, { t: 'Course officielle', s: 140, e: 150 }] },
    { t: 'Courir un marathon', s: 150, e: 800, kids: [{ t: 'Plan de seize semaines', s: 330, e: 520, kids: [{ t: 'Sorties longues', s: 400, e: 520 }] }] },
    { t: 'Ultra-trail de montagne', s: 900, e: 1900 },
  ],
];
function seedDemoObjectives(db) {
  if (!shouldSeed() || process.env.SEED_OBJECTIFS_DEMO === '0') return { skipped: 'hors staging' };
  const objectifs = require('./objectifs');
  const today = new Date();
  const iso = (off) => { const d = new Date(today.getTime() + off * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const people = [{ name: EMILIEN_SEED_ACCOUNT.name, lastName: EMILIEN_SEED_ACCOUNT.lastName }].concat(FAKE_USERS.slice(0, 2).map((u) => ({ name: u.name, lastName: u.lastName })));
  const out = { users: 0, objectives: 0 };
  people.forEach((p) => {
    const u = db.prepare('SELECT id FROM users WHERE name = ? AND lastName = ?').get(p.name, p.lastName);
    if (!u) return;
    if (db.prepare('SELECT 1 FROM user_objectives WHERE userId = ? AND metaJson LIKE ? LIMIT 1').get(u.id, '%"demo":true%')) return; // déjà fait
    const acts = db.prepare('SELECT a.id FROM activity_members m JOIN activities a ON a.id = m.activityId WHERE m.userId = ? AND a.active = 1 ORDER BY a.id LIMIT 4').all(u.id);
    acts.forEach((a, ai) => {
      (function make(list, activityId, parentId) {
        list.forEach((n) => {
          try {
            const days = n.e - n.s, unit = days > 400 ? 'mois' : 'semaines';
            const r = objectifs.creer(u.id, { title: n.t, activityId, startDate: iso(n.s), endDate: iso(n.e), unit, amount: unit === 'mois' ? Math.max(1, Math.round(days / 30)) : Math.max(1, Math.round(days / 7)), periodWeeks: days > 400 ? 'mois' : (days > 120 ? 4 : 1), weekly: false, parentId, parentRel: parentId ? 'apres' : undefined, description: 'Donnée de démonstration', noBridge: true });
            if (n.done) r.periods.forEach((pp) => pp.weeks.forEach((w) => objectifs.semaine(u.id, r.id, pp.n, w.i, true)));
            const row = db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(r.id), meta = JSON.parse(row.metaJson || '{}');
            meta.demo = true; if (n.dropped) meta.abandoned = true;
            db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify(meta), r.id);
            out.objectives += 1;
            if (n.kids) make(n.kids, activityId, r.id);
          } catch (e) { console.error('[objectifs-demo] ' + n.t + ' :', e && e.message); }
        });
      })(DEMO_TREES[ai % DEMO_TREES.length], a.id, null);
    });
    out.users += 1;
  });
  return out;
}
// Renommage idempotent : les titres de période générés « Étape N » / « Objectif N » (objectifs de démonstration) deviennent « P N » (« P N sur M ») : ce sont des périodes, pas de vrais objectifs.
function renameDemoSteps(db) {
  try {
    const rows = db.prepare("SELECT id, stepsJson FROM user_objectives WHERE metaJson LIKE '%\"demo\":true%' AND (stepsJson LIKE '%\"title\":\"Étape %' OR stepsJson LIKE '%\"title\":\"Objectif %')").all();
    rows.forEach((r) => {
      let changed = false; const steps = JSON.parse(r.stepsJson);
      steps.forEach((p) => { const m = /^(?:Étape|Objectif) (\d+)( sur \d+)?$/.exec(p.title || ''); if (m) { p.title = 'P ' + m[1] + (m[2] || ''); changed = true; } });
      if (changed) db.prepare('UPDATE user_objectives SET stepsJson = ? WHERE id = ?').run(JSON.stringify(steps), r.id);
    });
  } catch (e) { console.error('[objectifs-demo] renommage :', e && e.message); }
}
// Niveaux de démonstration (activité > pôle > secteur) : chaque activité de démo reçoit deux pôles et leurs secteurs (si elle n'en a aucun) ; les objectifs de démo prennent le niveau de leur
// profondeur (racine = activité, étapes directes = pôle, au-delà = secteur). Idempotent : seuls les objectifs de démo encore au niveau « activité » ET rattachés à un parent sont touchés.
const DEMO_POLES = [
  [['Produit', ['Interface', 'Serveur']], ['Croissance', ['Marketing', 'Ventes']]],
  [['Théorie', ['Cours', 'Lectures']], ['Pratique', ['Examens', 'Stages']]],
  [['Prospection', ['Contacts', 'Offres']], ['Fidélisation', ['Suivi', 'Contrats']]],
  [['Endurance', ['Sorties longues', 'Fractionné']], ['Santé', ['Sommeil', 'Nutrition']]],
];
function levelDemo(db) {
  try {
    const goals = require('./goals');
    const like = '%"demo":true%';
    db.prepare('SELECT DISTINCT userId FROM user_objectives WHERE metaJson LIKE ? AND parentId IS NOT NULL AND level = ?').all(like, 'activite').forEach(({ userId }) => {
      const acts = db.prepare('SELECT a.id FROM activity_members m JOIN activities a ON a.id = m.activityId WHERE m.userId = ? AND a.active = 1 ORDER BY a.id LIMIT 4').all(userId);
      acts.forEach((a, ai) => {
        if (!db.prepare('SELECT 1 FROM user_objectives WHERE userId = ? AND activityId = ? AND metaJson LIKE ? AND parentId IS NOT NULL AND level = ? LIMIT 1').get(userId, a.id, like, 'activite')) return;
        if (!goals.categoriesForActivity(a.id).length) {
          DEMO_POLES[ai % DEMO_POLES.length].forEach(([pl]) => goals.addCategory(a.id, pl));
          goals.categoriesForActivity(a.id).forEach((p, pi) => (DEMO_POLES[ai % DEMO_POLES.length][pi] || [null, []])[1].forEach((sl) => goals.addCategory(a.id, sl, p.key)));
        }
        const poles = goals.categoriesForActivity(a.id); if (!poles.length) return;
        const rows = db.prepare('SELECT id, parentId FROM user_objectives WHERE userId = ? AND activityId = ? AND metaJson LIKE ? ORDER BY id').all(userId, a.id, like);
        const byId = {}; rows.forEach((r) => { byId[r.id] = r; });
        const depth = (r) => { let d = 0; for (let c = r; c && c.parentId != null && byId[c.parentId]; c = byId[c.parentId]) d += 1; return d; };
        const key = {}; let kp = 0; const ks = {};
        rows.map((r) => ({ r, d: depth(r) })).sort((x, y) => x.d - y.d || x.r.id - y.r.id).forEach(({ r, d }) => {
          if (d === 0) { key[r.id] = { level: 'activite' }; return; }
          if (d === 1) { const p = poles[kp % poles.length]; kp += 1; key[r.id] = { level: 'pole', poleKey: p.key }; return; }
          const par = key[r.parentId] || {}, pk = par.poleKey || poles[0].key, sect = goals.secteursForPole(a.id, pk);
          if (!sect.length) { key[r.id] = { level: 'pole', poleKey: pk }; return; }
          ks[pk] = (ks[pk] || 0); const x = sect[ks[pk] % sect.length]; ks[pk] += 1; key[r.id] = { level: 'secteur', poleKey: pk, categoryKey: x.key };
        });
        rows.forEach((r) => { const k = key[r.id]; if (k && k.level !== 'activite') db.prepare('UPDATE user_objectives SET level = ?, poleKey = ?, categoryKey = ? WHERE id = ?').run(k.level, k.poleKey || null, k.categoryKey || null, r.id); });
      });
    });
  } catch (e) { console.error('[objectifs-demo] niveaux :', e && e.message); }
}
function seedDemoObjectivesOnStaging(db) {
  try { renameDemoSteps(db || require('../db')); const r = seedDemoObjectives(db || require('../db')); levelDemo(db || require('../db')); if (r && r.objectives) console.log('[objectifs-demo]', JSON.stringify(r)); return r; } catch (e) { console.error('[objectifs-demo]', e && e.message); return null; }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// COMPTE A (10 nov. 2026) — compte de test persistant pour Gaspard (création d'objectifs sur staging). STAGING UNIQUEMENT (shouldSeed : RAILWAY_ENVIRONMENT_NAME défini
// et différent de « production »), jamais en production ni en local. Idempotent : s'il existe déjà (même prénom/nom), rien n'est recréé ni écrasé (seul un ancien mot de passe est remplacé).
// Contenu : UNE activité « Course à pied », 2 pôles (Entraînement, Santé), 1 secteur par pôle (Endurance, Récupération), et du temps Chrono sur le seul secteur Endurance :
// 6 semaines consécutives se terminant cette semaine, 3 séances d'environ 1 h par semaine. Aucun objectif (Gaspard les crée en testant). Identité fictive, aucune donnée réelle.
// Connexion : écran de connexion, Prénom « Compte », Nom « A » et le mot de passe posé dans la variable d'environnement COMPTE_A_PASSWORD (Railway, environnement staging) : jamais écrit dans le dépôt.
// Variable absente ou vide : le compte n'est pas créé et, s'il existe, il n'est pas touché. Variable changée : seul le hachage du mot de passe est remplacé (compteur d'échecs et verrou remis à zéro).
// ---------------------------------------------------------------------------------------------------------------------------------------------
const COMPTE_A_SEED_ACCOUNT = { name: 'Compte', lastName: 'A' };
const COMPTE_A_WEEKS = 6;
// Séances par semaine (de la plus ancienne à la plus récente) : [jour (0 = lundi), minutes] — 3 séances d'environ 1 h, légèrement variées.
const COMPTE_A_SESSIONS = [[[0, 55], [2, 65], [5, 60]], [[1, 60], [3, 50], [5, 70]], [[0, 60], [2, 60], [4, 55]], [[1, 65], [3, 60], [6, 50]], [[0, 50], [3, 65], [5, 60]], [[0, 60], [1, 55], [2, 65]]];
function seedCompteAOnStaging(db) {
  if (!shouldSeed()) return null;
  const password = process.env.COMPTE_A_PASSWORD;
  if (!password) { console.log('[compte-a] COMPTE_A_PASSWORD absent, Compte A non créé.'); return null; }
  try {
    db = db || require('../db');
    const existing = db.prepare('SELECT id, pin FROM users WHERE name = ? AND lastName = ?').get(COMPTE_A_SEED_ACCOUNT.name, COMPTE_A_SEED_ACCOUNT.lastName);
    if (existing) {
      // Déjà créé : seul le hachage du mot de passe est remis à jour s'il ne correspond plus (ancien mot de passe) ; rien d'autre n'est touché.
      let ok = false; try { ok = verifyPinRecord(password, existing.pin); } catch (e) { ok = false; }
      if (ok) return { created: false };
      db.prepare('UPDATE users SET pin = ?, pinFailCount = 0, pinLockedUntil = NULL WHERE id = ?').run(makePinRecord(password), existing.id);
      console.log('[compte-a] Mot de passe du Compte A mis à jour.');
      return { created: false, passwordUpdated: true };
    }
    const goals = require('./goals');
    const now = new Date(), nowIso = now.toISOString();
    const userId = randomUUID();
    const color = DARK_PALETTE[1] || DARK_PALETTE[0];
    db.prepare("INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang, passwordStrong) VALUES (?, ?, ?, '', 'compte-a@exemple.test', ?, ?, ?, 'dark', 1, 'fr', 1)")
      .run(userId, COMPTE_A_SEED_ACCOUNT.name, COMPTE_A_SEED_ACCOUNT.lastName, color, nowIso, makePinRecord(password));
    const aid = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, shareToken, createdAt) VALUES (?, 0, 1, ?, ?, ?)').run('Course à pied', userId, randomUUID(), nowIso).lastInsertRowid);
    db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(aid, userId, color, nowIso);
    goals.addCategory(aid, 'Entraînement');
    goals.addCategory(aid, 'Santé');
    const poles = goals.categoriesForActivity(aid);
    const poleOf = (label) => poles.find((p) => p.label === label);
    goals.addCategory(aid, 'Endurance', poleOf('Entraînement').key);
    goals.addCategory(aid, 'Récupération', poleOf('Santé').key);
    const endurance = goals.secteursForPole(aid, poleOf('Entraînement').key).find((x) => x.label === 'Endurance');
    const insertEntry = db.prepare('INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const mondayOff = (now.getDay() + 6) % 7; // jours écoulés depuis le lundi de cette semaine
    for (let w = 0; w < COMPTE_A_WEEKS; w++) { // w = 0 : cette semaine
      COMPTE_A_SESSIONS[COMPTE_A_WEEKS - 1 - w].forEach(([dow, minutes], i) => {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOff - 7 * w + dow, 7 + (i % 2) * 10, 15 * i);
        if (start.getTime() + minutes * 60000 > now.getTime()) return; // jamais de séance dans le futur (semaine en cours)
        const end = new Date(start.getTime() + minutes * 60000);
        insertEntry.run(userId, aid, '', start.toISOString(), end.toISOString(), minutes * 60, isoDateOf(start), dayNameOf(start), endurance.key);
      });
    }
    console.log('[compte-a] Compte A créé (activité « Course à pied », 2 pôles, 2 secteurs, ' + COMPTE_A_WEEKS + ' semaines de Chrono sur Endurance).');
    return { created: true, id: userId, activityId: aid };
  } catch (e) { console.error('[compte-a]', e && e.message); return null; }
}

module.exports = { seedCompteAOnStaging, COMPTE_A_SEED_ACCOUNT, seedStagingData, shouldSeed, recreateEmilienAccount, seedDemoObjectives, seedDemoObjectivesOnStaging };
