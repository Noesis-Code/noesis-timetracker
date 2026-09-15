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
const subprojects = require('./subprojects');
const { subProjectsForActivity } = subprojects;
const { buildCalendar } = require('./ical');
// Chantier Objectifs — D (tâche du jour, 15 septembre 2026) : requis
// uniquement pour valider une catégorie contre les catégories réelles de
// l'activité (isValidCategoryForActivity/categoriesForActivity) et déclencher
// le moteur d'auto-planification après création d'une tâche — même précédent
// que server/lib/subprojects.js (chantier C), qui importe déjà goals.js pour
// la même raison. Le contrat "jamais le texte d'un objectif" plus haut ne
// concerne que le flux .ics lu par un tiers ; ceci reste une écriture
// authentifiée par session, jamais exposée au flux .ics.
const goals = require('./goals');
const goalsauto = require('./goalsauto');

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
// ⚠️ CONTRAT AVEC « PLANNING D'OBJECTIFS » (server/lib/goals.js, 12 septembre
// 2026) : réutilise ce même flux plutôt que d'en dupliquer un (décision
// prise au cadrage avec Emilien) — même minimisation stricte que pour les
// sous-projets ci-dessus (nom de l'activité, libellé de la période, date ;
// JAMAIS le texte de l'objectif lui-même, qui peut être personnel). Lu
// directement dans goal_periods plutôt qu'en import circulaire vers
// goals.js (qui, lui, dépend de server/db.js et de lib/community.js — pas de
// ce fichier).
function goalPeriodEventsForUser(userId) {
  const events = [];
  const rows = db.prepare(`
    SELECT gp.id, a.name AS activityName, gp.periodIndexInCycle, gp.endDate
    FROM goal_periods gp
    JOIN activities a ON a.id = gp.activityId
    JOIN activity_members m ON m.activityId = gp.activityId
    WHERE m.userId = ? AND a.active = 1
      AND (gp.mainGoalText != '' OR EXISTS (SELECT 1 FROM goal_weekly w WHERE w.periodId = gp.id AND w.text != ''))
  `).all(userId);

  for (const r of rows) {
    const end = addDay(r.endDate);
    if (!end) continue;
    events.push({
      uid: 'goalperiod-' + r.id + '@noesis',
      startDate: r.endDate,
      endDate: end,
      summary: 'Bilan — Période ' + r.periodIndexInCycle + ' (' + r.activityName + ')',
      description: 'Activité : ' + r.activityName,
    });
  }
  return events;
}

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
  events.push(...goalPeriodEventsForUser(userId));
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

// ===================== VUE CALENDRIER D'UNE PÉRIODE D'OBJECTIF (15 septembre
// 2026, discussion "Objectifs — D : Calendrier & intégrations") =====================
// Demande d'Emilien : « intégrer un calendrier au volet objectif (page 2 du
// volet Objectifs) [...] chaque ligne représente 1 jour ». Contrairement au
// flux .ics ci-dessus (lu par un serveur tiers, sans session), cette
// fonction sert une route authentifiée par SESSION (server/routes/calendar.js,
// GET /activities/:id/goals-days), appelée uniquement par l'app pour un
// membre de l'activité qui regarde déjà sa propre page 2 — la minimisation
// stricte du flux .ics ne s'applique donc pas ici de la même façon (rien ne
// sort vers un tiers). On reste malgré tout prudent par cohérence avec le
// reste de ce volet : cette fonction ne renvoie QUE des minutes agrégées par
// jour, jamais le texte d'un objectif.
//
// ⚠️ Le contrôle d'accès (assertActivityMember) reste une copie volontaire, à
// l'identique, de requireMembership() dans server/routes/goals.js plutôt
// qu'un import de ce fichier-là — seule la validation de catégorie importe
// désormais goals.js (voir le require en tête de fichier), pour rester
// correcte sur une activité aux catégories personnalisées (chantier Objectifs
// — B, 15 septembre 2026) : un Set figé aux 3 catégories historiques
// rejetterait à tort toute catégorie personnalisée valide.

function assertActivityMember(userId, activityId) {
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
  if (!activity) throw Object.assign(new Error('Activité introuvable.'), { statusCode: 404 });
  const membership = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, userId);
  if (!membership) throw Object.assign(new Error("Tu n'es pas membre de cette activité."), { statusCode: 403 });
}

// Jour local du serveur (America/Toronto, voir server/index.js) — même
// construction que todayLocal() dans server/lib/duereminders.js, dupliquée
// ici plutôt qu'importée pour la même raison qu'ailleurs dans ce fichier.
function todayLocalDay() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 28 jours (4 semaines) par période, par construction du volet Objectifs —
// voir PERIOD_DAYS/WEEKS_PER_PERIOD dans server/lib/goals.js (non importés
// ici, voir plus haut). La borne `guard` est un filet de sécurité, pas une
// hypothèse remise en cause : elle évite une boucle infinie si jamais
// startDate/endDate étaient un jour incohérents, sans dépendre d'une
// constante partagée avec goals.js.
// Tâches du jour déjà créées (voir createDayTask ci-dessous) pour une
// (activité, catégorie), groupées par dueDate — utilisé UNIQUEMENT pour
// peupler la vue calendrier d'une période, jamais le flux .ics. Traverse
// sub_projects/sub_project_items directement (comme goalPeriodEventsForUser
// plus haut vis-à-vis de goal_periods) plutôt que d'ajouter une fonction dans
// subprojects.js qui n'a pas de raison de connaître dueDate.
function dayTasksByDate(activityId, category, startDate, endDate) {
  const rows = db.prepare(`
    SELECT i.id, i.label, i.done, i.dueDate
    FROM sub_project_items i
    JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND sp.goalCategory = ? AND i.dueDate BETWEEN ? AND ?
    ORDER BY i.position ASC, i.id ASC
  `).all(activityId, category, startDate, endDate);
  const byDate = {};
  rows.forEach((r) => {
    if (!byDate[r.dueDate]) byDate[r.dueDate] = [];
    byDate[r.dueDate].push({ id: r.id, label: r.label, done: !!r.done });
  });
  return byDate;
}

function periodDaysForUser(userId, activityId, category, periodNumber) {
  assertActivityMember(userId, activityId);
  if (!goals.isValidCategoryForActivity(activityId, category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
  const period = db.prepare(`
    SELECT id, startDate, endDate FROM goal_periods
    WHERE activityId = ? AND category = ? AND periodNumber = ?
  `).get(activityId, category, periodNumber);
  if (!period) throw Object.assign(new Error('Période introuvable.'), { statusCode: 404 });

  const rows = db.prepare(`
    SELECT isoDate, COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE activityId = ? AND isoDate BETWEEN ? AND ?
    GROUP BY isoDate
  `).all(activityId, period.startDate, period.endDate);
  const secondsByDay = {};
  rows.forEach((r) => { secondsByDay[r.isoDate] = r.seconds; });
  const tasksByDay = dayTasksByDate(activityId, category, period.startDate, period.endDate);

  const today = todayLocalDay();
  const days = [];
  let cursor = period.startDate;
  let dayInWeek = 0;
  let weekIndex = 1;
  let guard = 0;
  while (cursor && cursor <= period.endDate && guard < 60) {
    days.push({
      date: cursor,
      weekIndex: weekIndex,
      actualMinutes: Math.round((secondsByDay[cursor] || 0) / 60),
      isToday: cursor === today,
      tasks: tasksByDay[cursor] || [],
    });
    dayInWeek += 1;
    if (dayInWeek === 7) { dayInWeek = 0; weekIndex += 1; }
    cursor = addDay(cursor);
    guard += 1;
  }

  return { periodId: period.id, startDate: period.startDate, endDate: period.endDate, days };
}

// ===================== TÂCHE DU JOUR (15 septembre 2026, discussion
// "Objectifs — D") =====================
// Demande d'Emilien : « lorsqu'on clique sur une journée, [...] ajouter la
// tâche à réaliser sur celle-ci [...] transmise [...] dans la section
// sous-projet de la fenêtre activité, sous la catégorie appropriée ». Cadré
// avec Emilien : (1) réutilise sub_projects.goalCategory déjà posé par le
// chantier C plutôt qu'un champ dédié ; (2) la tâche doit pouvoir être reprise
// par le moteur d'auto-planification Offre1 de C si l'activité l'a activé —
// d'où plannedUserId = l'auteur de la tâche, et l'appel à
// goalsauto.onSubProjectItemChanged() en toute fin, exactement comme le fait
// déjà server/routes/subprojects.js pour une tâche créée via le formulaire
// classique.
//
// Le flux .ics (eventsForUser ci-dessus) N'EST PAS étendu à ces tâches : il
// reste sur sa minimisation d'origine (nom du sous-projet, pas des tâches).
// Un abonné Apple/Google voit donc déjà la catégorie ("Entreprise", etc.) au
// prochain rafraîchissement du flux existant dès que le sous-projet porte une
// échéance — la tâche elle-même n'a pas de date de clôture propre à exposer.

// Sous-projet "catégorie" : le premier sous-projet ouvert de l'activité déjà
// rattaché à cette catégorie (créé par ce flux ou posé manuellement via
// PUT /api/sub-projects/:id, chantier C), sinon un nouveau, nommé d'après le
// libellé de la catégorie. Requête directe plutôt qu'un ajout de fonction
// dans subprojects.js : lecture étroite, à usage unique, qui n'a pas sa place
// dans son contrat public.
function findCategorySubProjectId(activityId, category) {
  const row = db.prepare(`
    SELECT sp.id FROM sub_projects sp
    WHERE sp.activityId = ? AND sp.goalCategory = ?
      AND (sp.closesAt IS NULL OR sp.closesAt >= date('now','localtime'))
    ORDER BY sp.position ASC, sp.id ASC
    LIMIT 1
  `).get(activityId, category);
  return row ? row.id : null;
}

function categoryLabel(activityId, category) {
  const active = goals.categoriesForActivity(activityId) || [];
  const found = active.find((c) => c.key === category);
  return found ? found.label : category;
}

function findOrCreateCategorySubProject(activityId, userId, category) {
  const existingId = findCategorySubProjectId(activityId, category);
  if (existingId) return subprojects.getSubProject(existingId);

  const created = subprojects.createSubProject(activityId, userId, categoryLabel(activityId, category), '', null);
  return subprojects.updateSubProject(created.id, { goalCategory: category });
}

// Un sous-projet neuf n'a aucune section (choix d'Emilien, voir
// subprojects.js) : la première tâche du jour en ouvre une, les suivantes la
// réutilisent.
function ensureTasksSection(subProjectId, userId) {
  const existing = db.prepare(`
    SELECT id, subProjectId FROM sub_project_sections
    WHERE subProjectId = ? AND kind = 'tasks'
    ORDER BY position ASC, id ASC LIMIT 1
  `).get(subProjectId);
  if (existing) return existing;
  return subprojects.createSection(subProjectId, userId, 'tasks', '');
}

function createDayTask(userId, activityId, category, isoDate, label) {
  assertActivityMember(userId, activityId);
  if (!goals.isValidCategoryForActivity(activityId, category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) {
    throw Object.assign(new Error('Date invalide.'), { statusCode: 400 });
  }
  const clean = typeof label === 'string' ? label.trim() : '';
  if (!clean) throw Object.assign(new Error('Intitulé de la tâche requis.'), { statusCode: 400 });
  if (clean.length > 300) throw Object.assign(new Error('Intitulé trop long (300 caractères maximum).'), { statusCode: 400 });

  const subProject = findOrCreateCategorySubProject(activityId, userId, category);
  const section = ensureTasksSection(subProject.id, userId);
  const item = subprojects.createItem(section, clean, { dueDate: isoDate, plannedUserId: userId });

  // Interaction demandée par Emilien avec le moteur Offre1 de C : si actif
  // sur cette activité/catégorie, cette tâche fraîchement créée (déjà
  // plannedUserId = userId ci-dessus) peut être reprise dans le prochain
  // objectif hebdomadaire composé automatiquement — jamais bloquant.
  const auto = goalsauto.onSubProjectItemChanged(activityId, category);

  return {
    id: item.id,
    label: item.label,
    done: item.done,
    dueDate: item.dueDate,
    subProjectId: subProject.id,
    subProjectName: subProject.name,
    autoPlanned: auto.processed > 0,
  };
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
  periodDaysForUser,
  createDayTask,
};
