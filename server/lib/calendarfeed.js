// Flux calendrier des échéances de sous-projets — jetons et contenu.
//
// Propriété : discussion "Calendrier des clôtures" (4 septembre 2026).
// L'app expose, par utilisateur, une URL qui renvoie un calendrier iCalendar.
// Apple Calendar et Google Agenda savent tous deux s'y abonner en lecture
// seule et la relisent périodiquement (Google souvent toutes les 8 à 24 h,
// Apple selon le réglage de l'appareil). Une seule implémentation couvre donc
// les deux, sans OAuth, sans jeton d'un tiers à stocker, sans écran de
// consentement à faire valider, et sans dépendance npm — un .ics est du texte.
//
// ===================== CE QUI SORT DE L'APP, ET RIEN D'AUTRE =====================
// Ce flux communique des données à un tiers (les serveurs de Google et
// d'Apple vont chercher l'URL eux-mêmes). Minimisation stricte, décidée au
// cadrage du 4 septembre 2026 : NOM DU SOUS-PROJET, NOM DE L'ACTIVITÉ, DATE.
// Pas les tâches, pas les messages, pas les sondages, pas les noms des
// membres, pas les durées chronométrées. Toute ligne ajoutée ici est une
// donnée de plus chez un tiers : ne rien ajouter sans le décider explicitement
// et sans mettre à jour noesis-timetracker-loi25-politique-confidentialite.md.
//
// ===================== DÉSACTIVÉ PAR DÉFAUT =====================
// Deux gestes sont nécessaires pour qu'une seule donnée sorte :
//   1. Emilien active la fonction sur le serveur (NOESIS_CALENDAR_FEED=1) ;
//   2. chaque utilisateur crée SON flux depuis Profil > Réglages > Calendrier.
// Sans le premier, les routes répondent 404 comme si elles n'existaient pas.
// Sans le second, l'utilisateur n'a aucun jeton et rien ne peut être lu.

const crypto = require('crypto');
const db = require('../db');
const { subProjectsForActivity } = require('./subprojects');
const { buildCalendar } = require('./ical');

// ===================== L'INTERRUPTEUR SERVEUR =====================
// Lu à chaque appel plutôt que mis en cache au démarrage : c'est une garde de
// confidentialité, elle doit pouvoir se refermer sans redéploiement.
function isFeedEnabled() {
  return process.env.NOESIS_CALENDAR_FEED === '1';
}

// ===================== LE JETON =====================
// L'URL du flux EST le mot de passe : quiconque l'a lit les noms des
// sous-projets de son propriétaire, et une URL d'abonnement se retrouve en
// clair dans les réglages d'un téléphone. D'où :
//   · 32 octets tirés de crypto.randomBytes (module natif, aucune dépendance
//     ajoutée) — 256 bits, indevinable ;
//   · base64url, donc utilisable tel quel dans un chemin d'URL, sans
//     échappement et sans caractère qu'un lecteur de calendrier pourrait
//     recoder ;
//   · une table dédiée, RÉVOCABLE et régénérable depuis Profil.
//
// ⚠️ Le jeton est stocké EN CLAIR, contrairement au PIN (server/lib/auth.js,
// haché par scrypt). Ce n'est pas un oubli : l'utilisateur doit pouvoir
// RELIRE son URL pour la recoller sur un deuxième appareil, ce qu'un haché
// interdirait — il faudrait alors régénérer, donc casser l'abonnement déjà
// posé, à chaque fois qu'on veut revoir l'adresse. Le compromis est celui de
// tout jeton porteur (comme l'endpoint d'une souscription push, déjà stocké
// en clair ici) : sa valeur est sa capacité, et sa défense est sa longueur et
// sa révocabilité, pas son stockage.
//
// ⚠️ ET C'EST UN MÉCANISME D'AUTHENTIFICATION NOUVEAU pour ce projet. L'app
// faisait jusqu'ici confiance à l'id stocké dans le navigateur, et
// server/lib/auth.js ne couvre que la RÉCUPÉRATION d'un profil par code PIN.
// Ici l'appelant est un robot Google ou Apple, sans session ni navigateur :
// l'URL doit donc suffire à elle seule. Signalé explicitement à Emilien.
function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Un seul flux par personne (choix d'Emilien au cadrage du 4 septembre 2026) :
// une URL unique couvrant toutes ses activités, donc un seul abonnement à
// poser sur le téléphone et un seul geste pour tout révoquer.
function getTokenRow(userId) {
  if (!userId) return null;
  return db.prepare('SELECT * FROM calendar_feed_tokens WHERE userId = ?').get(userId) || null;
}

function findUserIdByToken(token) {
  if (typeof token !== 'string' || !token) return null;
  // Forme contrôlée avant d'interroger la base : un jeton qui n'a pas la tête
  // d'un jeton n'a aucune raison de coûter une requête.
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  const row = db.prepare('SELECT userId FROM calendar_feed_tokens WHERE token = ?').get(token);
  return row ? row.userId : null;
}

// Crée le flux s'il n'existe pas encore, ou remplace le jeton existant
// (régénération). Dans les deux cas l'ancien jeton cesse immédiatement de
// fonctionner : c'est le geste à faire si une URL a fuité.
function issueToken(userId) {
  const token = generateToken();
  const now = new Date().toISOString();
  const existing = getTokenRow(userId);
  if (existing) {
    db.prepare('UPDATE calendar_feed_tokens SET token = ?, createdAt = ?, lastAccessAt = NULL WHERE userId = ?')
      .run(token, now, userId);
  } else {
    db.prepare('INSERT INTO calendar_feed_tokens (userId, token, createdAt) VALUES (?, ?, ?)')
      .run(userId, token, now);
  }
  return getTokenRow(userId);
}

// Révocation : la ligne disparaît. L'abonnement déjà posé sur le téléphone ne
// reçoit plus rien (404) — c'est voulu et visible, plutôt qu'un flux qui se
// viderait en silence et laisserait croire qu'il n'y a plus d'échéance.
function revokeToken(userId) {
  const info = db.prepare('DELETE FROM calendar_feed_tokens WHERE userId = ?').run(userId);
  return info.changes > 0;
}

// Trace de dernière lecture, pour qu'Emilien puisse constater qu'un
// abonnement est bien actif (« Google est-il vraiment passé ? »). Une date,
// rien d'autre : ni adresse IP, ni agent utilisateur, ni journal d'accès.
function touchToken(userId) {
  db.prepare('UPDATE calendar_feed_tokens SET lastAccessAt = ? WHERE userId = ?')
    .run(new Date().toISOString(), userId);
}

// ===================== LE CONTENU =====================

// DTEND EST EXCLUSIF sur un événement daté (RFC 5545 §3.8.2.2) : pour une
// clôture au 12 mars, c'est DTSTART 20260312 et DTEND 20260313. Se tromper
// décale tout l'affichage d'un jour, ou fait disparaître l'événement.
//
// Arithmétique en UTC (Date.UTC + setUTCDate) et non en heure locale : un
// changement d'heure survenant cette nuit-là ferait autrement retomber
// « +1 jour » sur le même jour ou deux jours plus loin.
function addDay(isoDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Les activités dont l'utilisateur est membre. Même requête que
// GET /api/activities (server/routes/activities.js, zone "Gestion des
// activités") : on ne lit que `activities` et `activity_members`, jamais
// sub_projects — les clôtures passent obligatoirement par la fonction de
// Sous-projets, voir juste en dessous.
function activitiesForUser(userId) {
  return db.prepare(`
    SELECT a.id, a.name FROM activities a
    JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.active = 1
    ORDER BY a.id
  `).all(userId);
}

// ⚠️ CONTRAT AVEC LA DISCUSSION "SOUS-PROJETS" : les clôtures sont lues par
// subProjectsForActivity(activityId, includeClosed), jamais en interrogeant
// sub_projects directement. La règle de visibilité (OPEN_ONLY, le `>=` qui
// garde le sous-projet visible LE JOUR de sa clôture) est écrite une seule
// fois, chez eux, et elle a déjà bougé une fois.
//
// includeClosed = true : choix d'Emilien au cadrage du 4 septembre 2026 — un
// sous-projet déjà clôturé RESTE dans le calendrier, comme mémoire de ce qui
// a été fait. C'est cohérent avec la conception du volet Sous-projets, où la
// clôture masque sans supprimer.
//
// Un sous-projet supprimé, lui, disparaît du flux au rafraîchissement suivant
// sans rien à faire : le calendrier est reconstruit à chaque lecture, il n'y a
// aucun état à nettoyer.
function eventsForUser(userId) {
  const events = [];
  for (const activity of activitiesForUser(userId)) {
    const subProjects = subProjectsForActivity(activity.id, true);
    for (const sp of subProjects) {
      if (!sp.closesAt) continue;
      const end = addDay(sp.closesAt);
      if (!end) continue;
      events.push({
        // UID STABLE : c'est lui qui fait qu'une date modifiée MET À JOUR
        // l'événement au lieu d'en créer un second. Il ne dépend que de
        // l'identifiant du sous-projet — ni de son nom, ni de sa date, ni de
        // l'utilisateur qui lit le flux (deux membres de la même activité
        // partagée voient donc le même événement, ce qui est correct : c'est
        // la même échéance).
        uid: 'subproject-' + sp.id + '@noesis',
        startDate: sp.closesAt,
        endDate: end,
        // L'événement tombe LE JOUR de la clôture, comme dans l'app : le
        // sous-projet est encore visible ce jour-là et disparaît le lendemain.
        summary: sp.name,
        description: 'Activité : ' + activity.name,
      });
    }
  }
  // Tri par date puis par identifiant : le flux d'un même état est toujours
  // identique octet pour octet, ce qui évite de faire croire à un changement
  // à chaque relecture.
  events.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.uid < b.uid ? -1 : 1));
  return events;
}

function buildFeedForUser(userId, now) {
  return buildCalendar({
    name: 'Noesis — echeances',
    events: eventsForUser(userId),
    now: now,
  });
}

module.exports = {
  isFeedEnabled,
  generateToken,
  getTokenRow,
  findUserIdByToken,
  issueToken,
  revokeToken,
  touchToken,
  addDay,
  activitiesForUser,
  eventsForUser,
  buildFeedForUser,
};
