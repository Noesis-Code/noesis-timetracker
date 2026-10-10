// Activité de test « Exemple statistiques (test) » (10 oct. 2026, demande d'Emilien) : une activité PUBLIQUE, riche
// et réaliste (~2 ans, plus d'un millier de tâches, 4 membres) où l'on voit VRAIMENT toutes les cartes de
// Statistiques (Tâches et Objectifs), le détail « Où ça glisse », les statistiques par membre (fenêtre Activité)
// et le profil visité. Jumeau de scenarios-staging.js : STAGING UNIQUEMENT (RAILWAY_ENVIRONMENT_NAME défini et
// != "production"), au démarrage sauf SEED_STATS_DEMO=0. Idempotent : seules les deux activités de test
// (« Exemple statistiques (test) » et « Exemple confidentiel (test) », propriétaire Emilien) sont supprimées puis
// recréées ; aucune autre n'est touchée. Dates relatives à aujourd'hui, générateur pseudo-aléatoire à graine fixe.
// Reset : node scripts/seed-stats-demo.js --reset
//
// Contenu : 3 pôles (Produit avec 2 secteurs Interface/Serveur, Marketing et Communauté sans secteur) ;
// tâches faites à temps / en retard / en avance, glissées, non faites, restantes ; objectifs hebdomadaires et
// périodiques (13 périodes par année) avec statuts variés, reports ; temps chronométré par pôle/secteur ;
// série de jours consécutifs en cours ; répartition inégale entre 4 membres (Emilien + 3 fictifs).

const db = require('../db');
const goals = require('./goals');
const goalstasks = require('./goalstasks');
const scen = require('./scenarios-staging');

const NAME = 'Exemple statistiques (test)';
const NAME_CONF = 'Exemple confidentiel (test)';
// Profil fictif observable : Léa Démo (NIP commun du seed), propriétaire de ses propres activités de test.
const LEA = { name: 'Léa', lastName: 'Démo', color: '#C77DA3' };
const LEA_NAME = 'Activité de Léa (test)';
const LEA_NAME_CONF = 'Léa — confidentielle (test)';

function isStaging() { return scen.isStaging(); }

// Vrai pour les 4 activités d'exemple (staging seulement) : la purge des tâches faites de plus de 7 jours (goalstasks.purgeOldDoneTasks)
// les épargne, sinon l'historique de 2 ans disparaît dès l'ouverture de la Page 2 des objectifs.
function isDemoActivity(activityId) {
  if (!isStaging()) return false;
  const r = db.prepare('SELECT name FROM activities WHERE id = ?').get(activityId);
  return !!r && [NAME, NAME_CONF, LEA_NAME, LEA_NAME_CONF].indexOf(r.name) >= 0;
}

function emilien() {
  return db.prepare("SELECT id, name FROM users WHERE name = 'Emilien' AND lastName = 'Staging'").get()
    || db.prepare("SELECT id, name FROM users WHERE name = 'Emilien'").get()
    || db.prepare("SELECT id, name FROM users WHERE name LIKE 'Emilien%' ORDER BY createdAt LIMIT 1").get() || null;
}

function leaUser() { return db.prepare('SELECT id, name, color FROM users WHERE name = ? AND lastName = ?').get(LEA.name, LEA.lastName) || null; }

function resetStatsDemo() {
  const u = emilien();
  const lea = leaUser();
  let n = 0;
  [[u, NAME, NAME_CONF], [lea, LEA_NAME, LEA_NAME_CONF]].forEach(([owner, a, b]) => {
    if (!owner) return;
    const found = db.prepare('SELECT id FROM activities WHERE name IN (?, ?) AND ownerId = ?').all(a, b, owner.id);
    found.forEach((x) => scen.removeActivity(x.id));
    n += found.length;
  });
  return n;
}

// Crée Léa Démo si absente (même NIP que les autres profils fictifs) et la fait suivre (statut accepté) par Emilien.
function ensureLea(emilienId) {
  let lea = leaUser();
  if (!lea) {
    const { makePinRecord } = require('./auth');
    const id = require('node:crypto').randomUUID();
    db.prepare("INSERT INTO users (id, name, lastName, phone, email, color, createdAt, pin, theme, shareProfile, lang) VALUES (?, ?, ?, '', '', ?, ?, ?, 'dark', 1, 'fr')")
      .run(id, LEA.name, LEA.lastName, LEA.color, new Date().toISOString(), makePinRecord('0000'));
    lea = { id, name: LEA.name, color: LEA.color };
  }
  const f = db.prepare('SELECT id, status FROM follows WHERE followerId = ? AND followeeId = ?').get(emilienId, lea.id);
  const nowIso = new Date().toISOString();
  if (!f) db.prepare("INSERT INTO follows (followerId, followeeId, status, createdAt, respondedAt) VALUES (?, ?, 'accepted', ?, ?)").run(emilienId, lea.id, nowIso, nowIso);
  else if (f.status !== 'accepted') db.prepare("UPDATE follows SET status = 'accepted', respondedAt = ? WHERE id = ?").run(nowIso, f.id);
  return lea;
}

// Générateur à graine fixe (mulberry32) : mêmes proportions à chaque démarrage.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Thèmes par pôle/secteur : [texte de l'objectif, [libellés de tâches proches de ce texte]].
const THEMES = {
  interface: [
    ["Refonte de l'écran des tâches", ["Maquette de l'écran des tâches", "Choisir les couleurs de l'écran des tâches", "Intégrer l'écran des tâches", "Tester l'écran des tâches sur mobile", "Corriger l'affichage de l'écran des tâches"]],
    ['Mode sombre complet', ['Palette du mode sombre', 'Contraste du mode sombre', 'Vérifier le mode sombre sur les cartes', 'Icônes du mode sombre', 'Corriger le mode sombre du calendrier']],
    ["Nouvelle page d'accueil", ["Maquette de la page d'accueil", "Textes de la page d'accueil", "Intégrer la page d'accueil", "Animation de la page d'accueil"]],
    ["Accessibilité de l'interface", ['Audit des contrastes', 'Navigation au clavier', 'Libellés lisibles par lecteur d\'écran', 'Taille des boutons tactiles']],
  ],
  serveur: [
    ['Accélérer les statistiques', ['Optimiser les requêtes des statistiques', 'Index sur les tâches', 'Mettre en cache les statistiques', 'Mesurer la lenteur des statistiques']],
    ['Sauvegardes fiables', ['Script de sauvegarde', 'Tester la restauration des sauvegardes', 'Alerte en cas de sauvegarde manquée', 'Documenter les sauvegardes']],
    ['Notifications push', ['Abonnement aux notifications push', 'Rédiger les notifications push', 'Tester les notifications push', 'Limiter la fréquence des notifications push']],
    ['Synchronisation hors ligne', ["File d'attente hors ligne", 'Résolution des conflits hors ligne', 'Tester la synchronisation hors ligne']],
  ],
  marketing: [
    ['Lancer le blogue', ['Rédiger un article du blogue', 'Relire les articles du blogue', 'Illustrer le blogue', 'Planifier le calendrier du blogue', 'Publier le blogue']],
    ['Campagne courriel de printemps', ['Écrire la campagne courriel', 'Segmenter la liste de la campagne courriel', 'Tester la campagne courriel', 'Analyser la campagne courriel']],
    ['Présence sur les réseaux sociaux', ['Publication pour les réseaux sociaux', 'Visuels des réseaux sociaux', 'Répondre aux commentaires des réseaux sociaux', 'Calendrier des réseaux sociaux']],
    ['Page de tarifs', ['Comparer les tarifs de la concurrence', 'Rédiger la page de tarifs', 'Mettre en ligne la page de tarifs']],
  ],
  communaute: [
    ['Organiser la rencontre mensuelle', ['Inviter les membres à la rencontre', 'Réserver la salle de la rencontre', "Préparer l'ordre du jour de la rencontre", 'Résumer la rencontre', 'Relancer les absents de la rencontre']],
    ['Accueil des nouveaux membres', ["Message d'accueil des nouveaux membres", "Guide d'accueil des nouveaux membres", 'Appeler les nouveaux membres', 'Suivi des nouveaux membres']],
    ['Sondage de satisfaction', ['Rédiger le sondage de satisfaction', 'Envoyer le sondage de satisfaction', 'Analyser le sondage de satisfaction', 'Partager les résultats du sondage de satisfaction']],
    ['Programme de parrainage', ['Définir le programme de parrainage', 'Page du programme de parrainage', 'Annoncer le programme de parrainage']],
  ],
};
const GOAL_FLAVORS = ['', ' (suite)', ' — étape 2', ' (finalisation)'];

function seedStatsDemo() {
  const u = emilien();
  if (!u) return { skipped: 'profil Emilien introuvable' };
  resetStatsDemo();
  const em = build(u, ['Alex', 'Sam', 'Jamie'], NAME, NAME_CONF, 20261010);
  const lea = ensureLea(u.id);
  const le = build(lea, ['Alex', 'Jamie'], LEA_NAME, LEA_NAME_CONF, 20261011);
  return { emilien: em, lea: Object.assign({ userId: lea.id }, le) };
}

// Génère UNE activité riche (propriétaire `u`, membres = u + fakeNames) et sa jumelle confidentielle.
function build(u, fakeNames, NAME, NAME_CONF, seed) {
  const rnd = makeRng(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayIso = iso(new Date());
  const D = (d, n) => goals.addDays(d, n);
  const at = (day, h, mi) => { const [y, m, dd] = day.split('-').map(Number); return new Date(y, m - 1, dd, h, mi || 0, 0).toISOString(); };
  const dowOf = (day) => { const [y, m, dd] = day.split('-').map(Number); return new Date(y, m - 1, dd).getDay(); };
  const DOW = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const now = new Date().toISOString();

  // ---- Membres : Emilien + 3 profils fictifs du seed existant (Alex, Sam, Jamie).
  const fakes = fakeNames.map((n) => db.prepare('SELECT id, name, color FROM users WHERE name = ? ORDER BY createdAt LIMIT 1').get(n)).filter(Boolean);
  if (fakes.length < fakeNames.length) {
    const extra = db.prepare('SELECT id, name, color FROM users WHERE id <> ? ORDER BY createdAt LIMIT 5').all(u.id);
    extra.forEach((x) => { if (fakes.length < fakeNames.length && !fakes.some((f) => f.id === x.id)) fakes.push(x); });
  }
  const emRow = db.prepare('SELECT id, name, color FROM users WHERE id = ?').get(u.id);
  const members = [emRow].concat(fakes);
  const memberColor = (m) => m.color || '#674EA7';
  // Profil de chaque membre : part du travail, ponctualité, fiabilité.
  const PROFILE = [
    { w: 0.40, punctual: 0.85 }, // Emilien : beaucoup de travail, plutôt ponctuel
    { w: 0.28, punctual: 1.00 }, // Alex : très ponctuel
    { w: 0.20, punctual: 0.60 }, // Sam : souvent en retard
    { w: 0.12, punctual: 0.40 }, // Jamie : peu de tâches terminées
  ].slice(0, members.length);
  const pickMember = (bias) => {
    let r = rnd() * PROFILE.reduce((s, p, i) => s + (bias && bias[i] != null ? bias[i] : p.w), 0);
    for (let i = 0; i < PROFILE.length; i += 1) { r -= (bias && bias[i] != null ? bias[i] : PROFILE[i].w); if (r <= 0) return i; }
    return 0;
  };

  // ---- Activité publique + membres
  const aid = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, 0, 1, ?, ?)').run(NAME, u.id, now).lastInsertRowid);
  members.forEach((m) => db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, ?, ?)').run(aid, m.id, memberColor(m), now));

  // ---- Pôles et secteurs (tous créés AVANT toute donnée)
  const first = goals.ensureDefaultCategory(aid)[0];
  goals.renameCategory(aid, first.key, 'Produit');
  goals.addCategory(aid, 'Marketing');
  goals.addCategory(aid, 'Communauté');
  goals.addCategory(aid, 'Interface', first.key);
  goals.addCategory(aid, 'Serveur', first.key);
  const keyOf = (label) => goals.categoriesForActivity(aid).flatMap((p) => [p].concat(goals.secteursForPole(aid, p.key))).find((c) => c.label === label).key;
  const K = { produit: first.key, interface: keyOf('Interface'), serveur: keyOf('Serveur'), marketing: keyOf('Marketing'), communaute: keyOf('Communauté') };
  const LEAVES = ['interface', 'serveur', 'marketing', 'communaute'];
  const keyByName = (n) => K[n];

  // ---- Grille des périodes : plan démarré 2 ans avant l'année en cours ; données dès ~25 mois avant aujourd'hui.
  const curYear = Number(todayIso.slice(0, 4));
  const y0 = curYear - 2;
  const planStart = goals.mostRecentMonday(y0 + '-01-01');
  LEAVES.forEach((n) => db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)').run(aid, K[n], planStart, now));
  const periodStart = (n) => D(goals.mostRecentMonday((y0 + Math.floor((n - 1) / 13)) + '-01-01'), ((n - 1) % 13) * 28);
  const dataFrom = D(todayIso, -750);
  let firstP = 1; while (periodStart(firstP + 1) <= dataFrom) firstP += 1;
  let curP = 1; while (periodStart(curP + 1) <= todayIso) curP += 1;
  const lastP = curP + 2; // deux périodes à venir ont déjà des objectifs
  const curWeekStart = goals.mostRecentMonday(todayIso);

  // ---- Qualité d'une semaine (monte avec le temps, bruitée) ; les 6 dernières semaines sont toutes présentes.
  const spanDays = goals.daysBetween(periodStart(firstP), todayIso);
  // « Forme » de chaque période (bonne / moyenne / mauvaise) : les pourcentages de « Où ça glisse » varient d'une période à l'autre.
  const form = {}; for (let n = firstP; n <= curP + 3; n += 1) form[n] = pick([0.3, 0.2, 0.1, 0, -0.1, -0.25, -0.35]);
  form[curP - 1] = 0.35; form[curP - 2] = -0.35; // la période terminée la plus récente est bonne, celle d'avant mauvaise
  const formOf = (ws) => { let n = firstP; while (n < curP + 3 && periodStart(n + 1) <= ws) n += 1; return form[n] || 0; };
  const quality = (ws) => clamp(0.58 + 0.3 * (goals.daysBetween(periodStart(firstP), ws) / spanDays) + formOf(ws) + (rnd() - 0.5) * 0.5, 0.05, 1);
  const intensity = (ws) => 0.55 + 0.45 * Math.sin(goals.daysBetween(periodStart(firstP), ws) / 41) + (rnd() - 0.5) * 0.3; // rythme varié

  // ---- Sous-projets/sections « Tâches » par pôle/secteur
  const sec = {};
  Object.keys(K).forEach((n) => { sec[n] = goalstasks.ensureCategoryTaskSection(aid, u.id, K[n]); });

  const insTask = db.prepare(`INSERT INTO sub_project_items
    (subProjectId, sectionId, label, done, doneBy, doneAt, position, createdAt, dueDate, dueDateAuto, plannedUserId, goalWeeklyId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insEntry = db.prepare(`INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory)
    VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const minutesByKeyPeriod = {}; // clé|numéro de période -> minutes chronométrées
  const entryDays = new Set();
  const doneDays = new Set();
  let pos = 0; let nTasks = 0; let nEntries = 0;
  const periodOfDay = (d) => { let n = firstP; while (n < lastP && periodStart(n + 1) <= d) n += 1; return n; };

  const addEntry = (memberIdx, keyName, day, minutes, h) => {
    const s = at(day, h || between(8, 15), between(0, 50));
    const e = new Date(new Date(s).getTime() + minutes * 60000).toISOString();
    insEntry.run(members[memberIdx].id, aid, s, e, minutes * 60, day, DOW[dowOf(day)], K[keyName]);
    const pk = keyName + '|' + periodOfDay(day);
    minutesByKeyPeriod[pk] = (minutesByKeyPeriod[pk] || 0) + minutes;
    entryDays.add(day); nEntries += 1;
  };
  // Crée une tâche. outcome : { done:boolean, doneDay, doneIdx }. weekly = id ou null.
  const addTask = (keyName, label, due, auto, plannedIdx, outcome, weeklyId) => {
    const s = sec[keyName];
    const done = outcome && outcome.done ? 1 : 0;
    insTask.run(s.subProject.id, s.section.id, label, done, done ? members[outcome.doneIdx].id : null,
      done ? at(outcome.doneDay, between(8, 17), between(0, 59)) : null, pos += 1, at(D(due, -between(3, 12)), 12, 0), due, auto, members[plannedIdx].id, weeklyId);
    nTasks += 1;
    if (done) {
      doneDays.add(outcome.doneDay);
      addEntry(outcome.doneIdx, keyName, outcome.doneDay, between(10, 45));
    }
  };
  // Tire le sort d'une tâche dont l'échéance est `due` dans la semaine terminant en `we`, pour un membre, qualité q.
  const outcomeFor = (due, we, idx, q) => {
    const yesterday = D(todayIso, -1);
    if (due > yesterday) { // à venir (ou aujourd'hui) : parfois déjà faite aujourd'hui/avant
      if (due >= todayIso && rnd() < 0.18 * q) return { done: true, doneDay: D(todayIso, -between(0, 1)), doneIdx: idx, early: true };
      return { done: false, kind: 'open' };
    }
    const pOn = clamp(0.2 + 0.72 * q * PROFILE[idx].punctual, 0.04, 0.96);
    const pLate = (1 - pOn) * 0.5;
    const pSlip = (1 - pOn - pLate) * 0.55;
    const u0 = rnd();
    const doer = rnd() < 0.8 ? idx : pickMember();
    if (u0 < pOn) return { done: true, doneDay: rnd() < 0.12 ? D(due, -between(1, 2)) : due, doneIdx: doer };
    if (u0 < pOn + pLate) {
      const d = D(due, between(1, 6));
      return d <= yesterday ? { done: true, doneDay: d, doneIdx: doer } : { done: false, kind: 'overdue' };
    }
    if (u0 < pOn + pLate + pSlip) { // date repoussée à une autre semaine/période ; si cette nouvelle date est passée, elle a été faite ce jour-là
      const to = D(we, between(3, 35));
      return to <= yesterday ? { done: true, kind: 'slipped', to, doneDay: to, doneIdx: doer } : { done: false, kind: 'slipped', to };
    }
    return { done: false, kind: 'overdue' };
  };

  // ---- Objectifs : périodes (setMainGoal pose les lignes), hebdomadaires, tâches liées
  const weeklies = []; // { id, key, n, w, ws, we, status }
  const tag = (t, i) => t + GOAL_FLAVORS[i % GOAL_FLAVORS.length];
  const themeIdx = {}; LEAVES.forEach((n) => { themeIdx[n] = between(0, 3); });
  const insWeekly = db.prepare(`INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, status, assignedUserId, createdAt)
    VALUES (?, ?, ?, ?, 'manual', 1, ?, ?, ?)`);
  const periodTheme = {}; // clé|n -> thème
  for (let n = firstP; n <= lastP; n += 1) {
    LEAVES.forEach((kn) => {
      if (n === firstP || rnd() < 0.45) themeIdx[kn] = (themeIdx[kn] + 1) % THEMES[kn].length;
      periodTheme[kn + '|' + n] = THEMES[kn][themeIdx[kn]];
      goals.setMainGoal(aid, K[kn], n, tag(periodTheme[kn + '|' + n][0], n), '', 600);
    });
  }
  const periodIdOf = {};
  db.prepare('SELECT id, category, periodNumber FROM goal_periods WHERE activityId = ?').all(aid).forEach((r) => { periodIdOf[r.category + '|' + r.periodNumber] = r.id; });

  for (let n = firstP; n <= lastP; n += 1) {
    const ps = periodStart(n);
    for (let w = 1; w <= 4; w += 1) {
      const ws = D(ps, (w - 1) * 7); const we = D(ws, 6);
      if (ws > D(curWeekStart, 21)) continue; // pas d'hebdomadaires au-delà de ~3 semaines
      const recent = we >= D(curWeekStart, -42);
      const vacation = !recent && we < todayIso && rnd() < 0.06; // semaine sans travail
      const q = quality(ws); const inten = intensity(ws);
      LEAVES.forEach((kn) => {
        if (vacation) return;
        if (ws === curWeekStart && (kn === 'interface' || kn === 'marketing')) return; // leurs objectifs non atteints de la semaine dernière y sont reportés
        if (!(recent || rnd() < 0.58)) return;
        const theme = periodTheme[kn + '|' + n];
        const wPast = we < todayIso;
        const assignee = pickMember();
        const est = between(6, 18) * 15;
        const wid = Number(insWeekly.run(periodIdOf[K[kn] + '|' + n], w, theme[0] + (w > 1 ? ' — semaine ' + w : ''), est, null, rnd() < 0.8 ? members[assignee].id : null, now).lastInsertRowid);
        // Tâches liées à cet objectif
        const count = clamp(Math.round(3 + inten * 3 + (rnd() - 0.4) * 2), 2, 7);
        let doneN = 0; let totalN = 0;
        let qq = q;
        // Les deux dernières semaines terminées : une mauvaise (pour les reports) et une bonne.
        if (we < curWeekStart && we >= D(curWeekStart, -7) && (kn === 'interface' || kn === 'marketing')) qq = 0.05;
        for (let t = 0; t < count; t += 1) {
          const label = theme[1][t % theme[1].length];
          const idx = pickMember(kn === 'marketing' ? [0.2, 0.3, 0.35, 0.15] : (kn === 'communaute' ? [0.35, 0.1, 0.2, 0.35] : null));
          const due = D(ws, pick([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]));
          const oc = outcomeFor(due, we, idx, qq);
          let dueDate = due; let auto = rnd() < 0.5 ? 1 : 0;
          if (oc.kind === 'slipped') { dueDate = oc.to; auto = 1; }
          else if (oc.kind === 'overdue') auto = 0; // date fixée : l'application ne la ramène pas à aujourd'hui, la tâche reste en retard
          addTask(kn, label, dueDate, auto, idx, oc, wid);
          totalN += 1; if (oc.done) doneN += 1;
        }
        // « Avancées » : tâches de CET objectif faites pendant la semaine précédente (déjà terminée).
        if (wPast || ws <= todayIso) {
          const prevEnd = D(ws, -1);
          if (prevEnd < todayIso && rnd() < 0.4) {
            const k2 = between(1, 2);
            for (let t = 0; t < k2; t += 1) {
              const idx = pickMember();
              const label = theme[1][(count + t) % theme[1].length];
              addTask(kn, label, D(ws, between(0, 4)), 0, idx, { done: true, doneDay: D(ws, -between(1, 5)), doneIdx: idx }, wid);
              totalN += 1; doneN += 1;
            }
          }
        }
        let status = null;
        if (ws <= todayIso) { // semaine passée OU en cours : statut automatique d'après les tâches faites
          status = goals.weeklyStatusFromTasks(new Array(totalN).fill(0).map((_, i) => ({ done: i < doneN, minutes: 30 })));
          if (qq === 0.05 && we < curWeekStart && we >= D(curWeekStart, -7)) status = 'non_atteint';
          if (ws === curWeekStart) status = kn === 'communaute' ? 'atteint' : 'partiel'; // semaine en cours : un objectif atteint d'avance, un partiel
        }
        db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run(status, wid);
        weeklies.push({ id: wid, key: kn, n, w, ws, we, status });
      });
    }
  }

  // ---- Tâches sans objectif lié (au fil des semaines), plus quelques-unes directement sur le pôle Produit
  for (let ws = periodStart(firstP); ws <= D(curWeekStart, 21); ws = D(ws, 7)) {
    const we = D(ws, 6); const q = quality(ws);
    LEAVES.forEach((kn) => {
      if (rnd() > 0.4) return;
      const theme = pick(THEMES[kn]);
      for (let t = 0; t < between(1, 3); t += 1) {
        const idx = pickMember();
        const due = D(ws, between(0, 4));
        const oc = outcomeFor(due, we, idx, q);
        addTask(kn, pick(theme[1]), oc.kind === 'slipped' ? oc.to : due, oc.kind === 'overdue' ? 0 : 1, idx, oc, null);
      }
    });
    if (rnd() < 0.15) {
      const idx = pickMember(); const due = D(ws, between(0, 4));
      addTask('produit', pick(['Réunion de produit', 'Revue du plan', 'Point avec les membres']), due, 0, idx, outcomeFor(due, we, idx, q), null);
    }
  }
  // Série en cours : au moins une tâche faite chaque jour des 12 derniers jours (Emilien + membres).
  for (let off = -11; off <= 0; off += 1) {
    const d = D(todayIso, off);
    if (!doneDays.has(d)) {
      const idx = pickMember();
      addTask(pick(['marketing', 'communaute', 'interface']), pick(['Suivi quotidien', 'Point rapide', 'Réponse aux messages', 'Mise à jour du tableau']), d, 0, idx, { done: true, doneDay: d, doneIdx: idx }, null);
    }
  }
  // Tâches urgentes (échéance dans les 3 jours) et à venir, non faites.
  [[1, 'interface', "Valider la maquette de l'écran des tâches"], [2, 'serveur', 'Corriger la lenteur des statistiques'], [3, 'communaute', 'Inviter les membres à la rencontre']].forEach(([off, kn, label]) => {
    const idx = pickMember(); addTask(kn, label, D(todayIso, off), 0, idx, { done: false }, null);
  });
  // Jours de travail supplémentaires (temps chronométré hors tâches) : rythme varié, journées creuses, pause estivale.
  for (let d = dataFrom; d <= todayIso; d = D(d, 1)) {
    const dw = dowOf(d);
    if (dw === 0 || dw === 6) { if (rnd() < 0.9) continue; }
    if (entryDays.has(d) && rnd() < 0.6) continue;
    if (rnd() < 0.3) continue; // journée sans travail
    addEntry(pickMember(), pick(LEAVES), d, between(15, 60));
  }

  // ---- Reports d'objectifs hebdomadaires non atteints (mêmes règles que goals.carryOverWeekly), en ordre chronologique
  const slotSeq = (x) => (x.n - 1) * 4 + (x.w - 1);
  const bySlot = {}; weeklies.forEach((x) => { bySlot[x.key + '|' + slotSeq(x)] = x; });
  const carriedFrom = new Set();
  const ordered = weeklies.slice().sort((a, b) => slotSeq(a) - slotSeq(b));
  for (let i = 0; i < ordered.length; i += 1) {
    const x = ordered[i];
    if (x.we >= todayIso || x.status !== 'non_atteint' || carriedFrom.has(x.id)) continue;
    let seq = slotSeq(x) + 1;
    while (bySlot[x.key + '|' + seq] && seq < lastP * 4) seq += 1;
    const tn = Math.floor(seq / 4) + 1; const tw = (seq % 4) + 1;
    if (tn > lastP) continue;
    const row = db.prepare('SELECT text, estimateMinutes, assignedUserId FROM goal_weekly WHERE id = ?').get(x.id);
    const ws = D(periodStart(tn), (tw - 1) * 7); const we = D(ws, 6);
    const hops = (x.hops || 0) + 1;
    let status = null;
    if (we < todayIso) { const r = rnd(); status = hops >= 3 || r < 0.5 ? 'atteint' : (r < 0.7 ? 'partiel' : 'non_atteint'); }
    const nid = Number(db.prepare(`INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, status, assignedUserId, carriedOverFromId, createdAt)
      VALUES (?, ?, ?, ?, 'manual', 1, ?, ?, ?, ?)`).run(periodIdOf[K[x.key] + '|' + tn], tw, row.text, row.estimateMinutes, status, row.assignedUserId, x.id, now).lastInsertRowid);
    db.prepare('UPDATE goal_weekly SET carriedToId = ? WHERE id = ?').run(nid, x.id);
    carriedFrom.add(x.id);
    const copy = { id: nid, key: x.key, n: tn, w: tw, ws, we, status, hops };
    bySlot[x.key + '|' + seq] = copy;
    // insère au bon rang chronologique (la copie est toujours plus tard)
    let j = i + 1; while (j < ordered.length && slotSeq(ordered[j]) <= seq) j += 1;
    ordered.splice(j, 0, copy);
  }

  // ---- Statuts des objectifs périodiques (dérivés des hebdomadaires ; sinon tirés au sort), reports de période
  const periodRows = db.prepare('SELECT id, category, periodNumber, startDate, endDate FROM goal_periods WHERE activityId = ? ORDER BY periodNumber').all(aid);
  const keyNameOf = {}; Object.keys(K).forEach((n) => { keyNameOf[K[n]] = n; });
  periodRows.forEach((p) => {
    if (p.periodNumber < firstP || p.endDate >= todayIso) return;
    const wk = db.prepare("SELECT COUNT(*) AS c FROM goal_weekly WHERE periodId = ? AND TRIM(text) <> ''").get(p.id).c;
    if (wk) goals.recomputePeriodStatus(p.id);
    else {
      const r = rnd();
      db.prepare('UPDATE goal_periods SET mainGoalStatus = ? WHERE id = ?').run(r < 0.4 ? 'atteint' : (r < 0.7 ? 'partiel' : 'non_atteint'), p.id);
    }
  });
  // Report d'objectifs périodiques non atteints vers la période suivante (la dernière période terminée en force un).
  const finalState = {};
  periodRows.forEach((p) => { finalState[p.category + '|' + p.periodNumber] = db.prepare('SELECT * FROM goal_periods WHERE id = ?').get(p.id); });
  periodRows.forEach((p) => {
    if (p.periodNumber < firstP || p.endDate >= todayIso) return;
    const cur = db.prepare('SELECT * FROM goal_periods WHERE id = ?').get(p.id);
    const force = p.periodNumber === curP - 1 && keyNameOf[p.category] === 'serveur';
    if (force) db.prepare("UPDATE goal_periods SET mainGoalStatus = 'non_atteint' WHERE id = ?").run(p.id);
    if (!(force || (cur.mainGoalStatus === 'non_atteint' && rnd() < 0.45))) return;
    const nxt = finalState[p.category + '|' + (p.periodNumber + 1)];
    if (!nxt || nxt.carriedOverFromId != null) return;
    db.prepare('UPDATE goal_periods SET mainGoalText = ?, carriedOverFromId = ? WHERE id = ?').run(cur.mainGoalText, p.id, nxt.id);
    db.prepare('UPDATE goal_periods SET carriedToId = ? WHERE id = ?').run(nxt.id, p.id);
  });

  // ---- Temps cible par période : proportionnel au temps réellement fait (plus ou moins), pression sur la période en cours
  const elapsed = Math.min(1, (goals.daysBetween(periodStart(curP), todayIso) + 1) / 28);
  const curTarget = { interface: 1.0, serveur: 1.0, marketing: 1.8, communaute: 0.3 }; // part du « normal » : Marketing en avance, Communauté en retard, Produit dans les temps
  periodRows.forEach((p) => {
    const kn = keyNameOf[p.category]; if (!kn) return;
    const done = minutesByKeyPeriod[kn + '|' + p.periodNumber] || 0;
    let target;
    if (p.periodNumber === curP) target = Math.round(Math.max(120, done / Math.max(0.2, elapsed * curTarget[kn])));
    else if (p.periodNumber > curP) target = between(8, 20) * 60;
    else target = Math.round(Math.max(120, done * (0.65 + rnd() * 0.9)));
    db.prepare('UPDATE goal_periods SET mainGoalEstimateMinutes = ?, mainGoalEstimateSource = ?, mainGoalEstimateConfidence = 1 WHERE id = ?').run(target, 'manual', p.id);
  });

  const stats = {
    tasks: nTasks, entries: nEntries, weeklies: weeklies.length, carried: carriedFrom.size, periods: lastP - firstP + 1,
    done: db.prepare('SELECT COUNT(*) AS c FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ? AND i.done = 1').get(aid).c,
  };
  const conf = seedConfidential(u, members[0], todayIso, D, at, NAME_CONF);
  return { activityId: aid, confidentialId: conf, keys: K, members: members.map((m) => m.name), stats };
}

// 2e activité : CONFIDENTIELLE (jamais listée sur le profil visité), quelques tâches seulement.
function seedConfidential(u, em, todayIso, D, at, NAME_CONF) {
  const now = new Date().toISOString();
  const aid = Number(db.prepare('INSERT INTO activities (name, requiresNote, active, ownerId, createdAt) VALUES (?, 0, 1, ?, ?)').run(NAME_CONF, u.id, now).lastInsertRowid);
  db.prepare('INSERT INTO activity_members (activityId, userId, color, joinedAt, confidential) VALUES (?, ?, ?, ?, 1)').run(aid, u.id, em.color || '#674EA7', now);
  const pole = goals.ensureDefaultCategory(aid)[0];
  goals.renameCategory(aid, pole.key, 'Privé');
  const s = goalstasks.ensureCategoryTaskSection(aid, u.id, pole.key);
  const ins = db.prepare(`INSERT INTO sub_project_items (subProjectId, sectionId, label, done, doneBy, doneAt, position, createdAt, dueDate, dueDateAuto, plannedUserId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`);
  [['Préparer le dossier confidentiel', -9, 1], ['Relire le contrat confidentiel', -4, 1], ['Appeler le conseiller', -2, 1], ['Classer les documents', 1, 0], ['Rencontre confidentielle', 4, 0]].forEach(([label, off, done], i) => {
    const due = D(todayIso, off);
    ins.run(s.subProject.id, s.section.id, label, done, done ? u.id : null, done ? at(due, 11, 0) : null, i + 1, now, due, u.id);
  });
  return aid;
}

// Au démarrage : staging seulement (jamais en production), sauf SEED_STATS_DEMO=0.
function seedStatsDemoOnStaging() {
  if (!isStaging() || process.env.SEED_STATS_DEMO === '0') return null;
  const r = seedStatsDemo();
  console.log('[stats-demo-staging]', JSON.stringify(r));
  return r;
}

module.exports = { NAME, NAME_CONF, LEA_NAME, isDemoActivity, isStaging, seedStatsDemo, resetStatsDemo, seedStatsDemoOnStaging };
