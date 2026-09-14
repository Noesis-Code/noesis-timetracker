// Planning d'objectifs annuel — Chantier 1 de la feuille de route produit
// (12 septembre 2026, noesis-timetracker-feuille-de-route-produit.md).
//
// Cadré avec Emilien avant tout code (AskUserQuestion, plusieurs allers-
// retours) — règles à respecter strictement par tout chantier futur sur ce
// volet :
//
//  1. Le planning est propre à CHAQUE (ACTIVITÉ, CATÉGORIE), jamais global à
//     la personne (une activité partagée a UN SEUL plan par catégorie,
//     visible et modifiable par tous ses membres actuels — même principe
//     que Sous-projets, pas un plan par membre).
//  2. Les objectifs hebdomadaires d'une période se fixent INDÉPENDAMMENT par
//     l'utilisateur. Ce fichier ne décompose JAMAIS un grand objectif en
//     objectifs hebdomadaires — la génération/optimisation automatique d'un
//     plan est le différenciateur de l'offre payante MANAGER. L'estimation
//     par similarité ci-dessous ne fait que SUGGÉRER UNE DURÉE pour un
//     objectif déjà écrit par l'utilisateur ; elle ne génère ni ne modifie
//     jamais le texte d'un objectif.
//
// 14 septembre 2026 (deuxième passage, demande d'Emilien) : le planning
// n'est plus un mais TROIS par activité, un par catégorie fixe — les 3
// sous-catégories identifiées pour structurer une entreprise, reprises du
// concept CRM historique (voir noesis-timetracker-contexte-technique.md,
// section « Origine ») : Entreprise / Communauté / Produit. Chaque catégorie
// a son propre cycle de 13 périodes de 4 semaines, sa propre bande de
// tendance, son propre arbre de grands objectifs — trois plannings
// indépendants, pas un seul planning étiqueté. Ajouté dans la foulée, sur
// demande d'Emilien : chaque objectif hebdomadaire peut être confié à UN
// membre de l'activité (assignedUserId), pour que le travail à faire dans
// chaque catégorie se répartisse visiblement entre les membres — le grand
// objectif de période, lui, reste collectif (jamais assigné à une seule
// personne, même principe que le reste du plan).
//
// Structure (par catégorie) : un cycle de 13 périodes de 4 semaines (52
// semaines), démarré le jour où l'utilisateur crée son premier objectif
// dans CETTE catégorie sur cette activité (pas forcément le 1er janvier, et
// les 3 catégories démarrent chacune à leur propre date, indépendamment).
// Un deuxième cycle s'enchaîne automatiquement après la période 13
// (periodNumber continue, cycleIndex passe à 2).

const db = require('../db');
const { postActivityMessage } = require('./community');

const PERIOD_DAYS = 28;
const WEEK_DAYS = 7;
const WEEKS_PER_PERIOD = 4;
const PERIODS_PER_CYCLE = 13;
const STATUSES = ['non_atteint', 'partiel', 'atteint'];

const CATEGORIES = ['entreprise', 'communaute', 'produit'];
const CATEGORY_LABELS = { entreprise: 'Entreprise', communaute: 'Communauté', produit: 'Produit' };

function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

function assertCategory(category) {
  if (!isValidCategory(category)) {
    throw Object.assign(new Error('Catégorie invalide.'), { statusCode: 400 });
  }
}

// ---------------------------------------------------------------------------
// Dates — même précaution qu'ailleurs dans le projet (calendarfeed.js,
// duereminders.js) : arithmétique en UTC, jamais en heure locale, pour
// qu'un changement d'heure ne décale rien.
//
// ⚠️ Dupliqué délibérément depuis server/lib/duereminders.js (todayLocal/
// daysBetween y sont identiques) plutôt qu'importé : duereminders.js
// entraînerait avec lui server/lib/push.js (VAPID, web-push) comme
// dépendance de ce fichier, pour deux fonctions de date qui n'ont rien à voir
// avec les notifications. Même raisonnement que period.js, volontairement
// minuscule et sans dépendance inutile.
function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function daysBetween(fromDay, toDay) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const a = parse(fromDay), b = parse(toDay);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

function addDays(isoDay, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function periodBounds(planStartDate, periodNumber) {
  const start = addDays(planStartDate, (periodNumber - 1) * PERIOD_DAYS);
  const end = addDays(planStartDate, periodNumber * PERIOD_DAYS - 1);
  const cycleIndex = Math.floor((periodNumber - 1) / PERIODS_PER_CYCLE) + 1;
  const periodIndexInCycle = ((periodNumber - 1) % PERIODS_PER_CYCLE) + 1;
  return { start, end, cycleIndex, periodIndexInCycle };
}

function weekBounds(periodStart, weekIndex) {
  const start = addDays(periodStart, (weekIndex - 1) * WEEK_DAYS);
  const end = addDays(periodStart, weekIndex * WEEK_DAYS - 1);
  return { start, end };
}

// Numéro de période (1-based, continu sur toute la vie du plan) contenant le
// jour `isoDay`. Un jour antérieur au démarrage du plan (ne devrait pas
// arriver) retombe sur la période 1 plutôt que sur un nombre négatif.
function periodNumberForDate(planStartDate, isoDay) {
  const days = daysBetween(planStartDate, isoDay);
  if (days === null || days < 0) return 1;
  return Math.floor(days / PERIOD_DAYS) + 1;
}

// ---------------------------------------------------------------------------
// Le plan (une ligne par (activité, catégorie), jamais recréée)

function getPlan(activityId, category) {
  return db.prepare('SELECT * FROM activity_goal_plans WHERE activityId = ? AND category = ?')
    .get(activityId, category) || null;
}

// Démarre le plan de cette catégorie au jour d'aujourd'hui s'il n'existe pas
// encore. Idempotent : un plan déjà démarré n'est jamais réinitialisé, même
// si cette fonction est appelée à nouveau.
function ensurePlan(activityId, category) {
  const existing = getPlan(activityId, category);
  if (existing) return existing;
  const startDate = todayLocal();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO activity_goal_plans (activityId, category, startDate, createdAt) VALUES (?, ?, ?, ?)')
    .run(activityId, category, startDate, createdAt);
  return getPlan(activityId, category);
}

// ---------------------------------------------------------------------------
// Membres de l'activité — pour l'assignation des objectifs hebdomadaires et
// la vue de répartition côté client. Toujours renvoyé avec le planning
// (planningForActivity) plutôt que par un nouvel appel séparé.
function membersForActivity(activityId) {
  return db.prepare(`
    SELECT u.id AS id, u.name AS name, m.color AS color
    FROM activity_members m JOIN users u ON u.id = m.userId
    WHERE m.activityId = ?
    ORDER BY m.position, m.joinedAt
  `).all(activityId);
}

// ---------------------------------------------------------------------------
// Temps réel chronométré — SUR TOUTE L'ACTIVITÉ (tous les membres actuels
// confondus, pas seulement l'auteur de l'objectif) : le planning est propre
// à l'activité, pas à la personne (règle 1 ci-dessus), donc son bilan de
// temps l'est aussi. Non scindé par catégorie : le temps chronométré ne
// distingue pas dans quelle catégorie d'objectif il a été passé (aucune
// demande d'Emilien en ce sens ; le chrono reste à un seul niveau, celui de
// l'activité).
function actualSecondsForRange(activityId, startDate, endDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(durationSeconds), 0) AS seconds
    FROM time_entries
    WHERE activityId = ? AND isoDate BETWEEN ? AND ?
  `).get(activityId, startDate, endDate);
  return row.seconds;
}

// ---------------------------------------------------------------------------
// Estimation par similarité — cadré avec Emilien le 12 septembre 2026.
//
// Ne compare QUE des objectifs du même niveau (grand objectif entre eux,
// hebdomadaires entre eux), de la même activité ET de la même catégorie :
// comparer un grand objectif de 4 semaines à un objectif hebdomadaire, ou un
// objectif "Produit" à un objectif "Communauté", n'aurait aucun sens
// d'échelle ni de nature.
const STOPWORDS_FR = new Set([
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'à', 'au',
  'aux', 'pour', 'sur', 'en', 'dans', 'par', 'avec', 'sans', 'ce', 'cette',
  'ces', 'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'plus', 'que', 'qui',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS_FR.has(t));
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  setA.forEach((t) => { if (setB.has(t)) inter += 1; });
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

// Objectifs passés DE CETTE ACTIVITÉ ET DE CETTE CATÉGORIE, du même niveau,
// dont le temps réel est déjà connu (la semaine/période correspondante est
// terminée) — comparer à un objectif encore en cours donnerait un temps réel
// tronqué, trompeur.
function pastSamplesFor(activityId, category, scope) {
  const today = todayLocal();
  if (scope === 'main') {
    const rows = db.prepare(`
      SELECT mainGoalText AS text, startDate, endDate
      FROM goal_periods
      WHERE activityId = ? AND category = ? AND endDate < ? AND mainGoalText != ''
    `).all(activityId, category, today);
    return rows.map((r) => ({
      text: r.text,
      minutes: Math.round(actualSecondsForRange(activityId, r.startDate, r.endDate) / 60),
    }));
  }
  const rows = db.prepare(`
    SELECT w.text AS text, w.weekIndex AS weekIndex, p.startDate AS periodStart
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND w.text != ''
  `).all(activityId, category);
  return rows
    .map((r) => {
      const b = weekBounds(r.periodStart, r.weekIndex);
      if (b.end >= today) return null; // semaine pas encore terminée
      return { text: r.text, minutes: Math.round(actualSecondsForRange(activityId, b.start, b.end) / 60) };
    })
    .filter(Boolean);
}

// Renvoie { minutes, confidence, basedOn, source } — `minutes` est null si
// rien de comparable n'existe encore (l'utilisateur saisit alors lui-même).
// `confidence` grandit avec le nombre de cas déjà vécus (idée d'Emilien au
// cadrage initial), jamais au-delà de 1.
function estimateForGoal(activityId, category, scope, text) {
  const samples = pastSamplesFor(activityId, category, scope);
  if (!samples.length) return { minutes: null, confidence: 0, basedOn: 0, source: 'none' };

  const targetTokens = new Set(tokenize(text));
  const scored = samples
    .map((s) => ({ ...s, score: jaccard(targetTokens, new Set(tokenize(s.text))) }))
    .filter((s) => s.score > 0.15);

  if (scored.length) {
    const totalWeight = scored.reduce((sum, s) => sum + s.score, 0);
    const minutes = Math.round(scored.reduce((sum, s) => sum + s.score * s.minutes, 0) / totalWeight);
    return { minutes, confidence: Math.min(1, scored.length / 5), basedOn: scored.length, source: 'similarity' };
  }

  // Rien d'assez proche par les mots-clés : repli sur la moyenne générale des
  // objectifs passés de cette activité/catégorie, à niveau de confiance
  // réduit — toujours une suggestion, jamais un texte généré.
  const avg = Math.round(samples.reduce((sum, s) => sum + s.minutes, 0) / samples.length);
  return { minutes: avg, confidence: Math.min(0.4, samples.length / 10), basedOn: samples.length, source: 'similarity-fallback' };
}

// ---------------------------------------------------------------------------
// Score de justesse personnel (estimé vs réel), idée d'Emilien au cadrage
// initial, incluse dès la v1. null tant qu'il n'y a rien à comparer (pas
// d'estimation, ou temps réel pas encore connu).
function accuracyScore(estimateMinutes, actualMinutes) {
  if (estimateMinutes == null || actualMinutes == null) return null;
  if (estimateMinutes <= 0 && actualMinutes <= 0) return 1;
  const denom = Math.max(estimateMinutes, actualMinutes, 1);
  return Math.max(0, 1 - Math.abs(estimateMinutes - actualMinutes) / denom);
}

// ---------------------------------------------------------------------------
// Lecture / création des périodes

function rowToPeriod(row) {
  return row ? { ...row } : null;
}

function ensurePeriodRow(activityId, category, periodNumber, planStartDate) {
  const existing = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber);
  if (existing) return rowToPeriod(existing);

  const bounds = periodBounds(planStartDate, periodNumber);
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO goal_periods
      (activityId, category, periodNumber, cycleIndex, periodIndexInCycle, startDate, endDate, mainGoalText, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, '', ?)
  `).run(activityId, category, periodNumber, bounds.cycleIndex, bounds.periodIndexInCycle, bounds.start, bounds.end, createdAt);

  return rowToPeriod(db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .get(activityId, category, periodNumber));
}

// Garantit l'existence de toutes les périodes de 1 jusqu'à `upToPeriodNumber`
// inclus (pas de trou dans la séquence, même si l'utilisateur n'ouvre le
// planning qu'après plusieurs périodes écoulées).
function ensurePeriodsUpTo(activityId, category, upToPeriodNumber, planStartDate) {
  for (let n = 1; n <= upToPeriodNumber; n += 1) ensurePeriodRow(activityId, category, n, planStartDate);
}

function weeklyForPeriod(periodId) {
  return db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? ORDER BY weekIndex, id').all(periodId);
}

// ---------------------------------------------------------------------------
// Report automatique d'un objectif hebdomadaire non atteint (12 septembre
// 2026, décidé par Emilien) — calculé À LA VOLÉE (pas de tâche planifiée
// dédiée) chaque fois que le planning d'une (activité, catégorie) est
// ouvert : plus simple que d'ajouter un nouveau minuteur serveur, et le
// résultat est identique puisque rien n'affiche jamais un objectif dont la
// semaine n'est pas encore terminée.
//
// Ne déplace QUE ce que l'utilisateur avait déjà écrit (texte, estimation,
// assignation) — ne génère jamais un nouvel objectif ni n'en modifie le
// contenu.
function carryOverWeekly(activityId, category, planStartDate) {
  const today = todayLocal();

  const pending = db.prepare(`
    SELECT w.*, p.startDate AS periodStart, p.periodNumber AS periodNumber
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND p.category = ? AND w.carriedToId IS NULL AND w.text != ''
  `).all(activityId, category);

  pending.forEach((w) => {
    const bounds = weekBounds(w.periodStart, w.weekIndex);
    if (bounds.end >= today) return; // semaine pas encore terminée

    // Statut toujours non tranché à la fin de la semaine : compte comme non
    // atteint (l'utilisateur n'est jamais venu le marquer), condition de
    // report. Un objectif explicitement marqué "atteint" ou "partiel" par
    // l'utilisateur n'est jamais reporté.
    if (w.status == null) {
      db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run('non_atteint', w.id);
    }
    if (w.status !== null && w.status !== 'non_atteint') return;

    // Semaine cible : la suivante dans la même période, ou la semaine 1 de
    // la période suivante si on était déjà en semaine 4.
    let targetPeriodNumber = w.periodNumber;
    let targetWeekIndex = w.weekIndex + 1;
    if (targetWeekIndex > WEEKS_PER_PERIOD) {
      targetPeriodNumber += 1;
      targetWeekIndex = 1;
    }
    const targetPeriod = ensurePeriodRow(activityId, category, targetPeriodNumber, planStartDate);

    // Semaine cible déjà occupée : on cherche la première semaine libre de
    // cette même période plutôt que d'écraser l'objectif qui s'y trouve déjà
    // — s'il n'y en a aucune, l'objectif attend la période suivante.
    while (true) {
      const occupied = db.prepare('SELECT 1 FROM goal_weekly WHERE periodId = ? AND weekIndex = ?')
        .get(targetPeriod.id, targetWeekIndex);
      if (!occupied) break;
      targetWeekIndex += 1;
      if (targetWeekIndex > WEEKS_PER_PERIOD) {
        targetPeriodNumber += 1;
        targetWeekIndex = 1;
        const nextPeriod = ensurePeriodRow(activityId, category, targetPeriodNumber, planStartDate);
        targetPeriod.id = nextPeriod.id;
      }
    }

    const createdAt = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, assignedUserId, carriedOverFromId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(targetPeriod.id, targetWeekIndex, w.text, w.estimateMinutes, w.estimateSource, w.estimateConfidence, w.assignedUserId, w.id, createdAt);

    db.prepare('UPDATE goal_weekly SET carriedToId = ? WHERE id = ?').run(Number(info.lastInsertRowid), w.id);
  });
}

// ---------------------------------------------------------------------------
// Bilan automatique de fin de période — ENVOI AUTOMATIQUE (décision
// d'Emilien, 12 septembre 2026 : pas de bouton "Partager", le bilan part de
// lui-même dans le fil de discussion de l'activité dès que la période se
// termine). Publié une seule fois par période (bilanPostedAt) et seulement
// pour une activité PARTAGÉE (>= 2 membres) : une activité solo n'a pas de
// fil de discussion, voir noesis-timetracker-activite.md. Le nom de la
// catégorie est indiqué dans le texte (14 septembre 2026) puisqu'une
// activité publie désormais jusqu'à 3 bilans indépendants par période
// écoulée, un par catégorie.
function buildBilanText(activityName, category, period, weeklies) {
  const doneCount = weeklies.filter((w) => w.status === 'atteint').length;
  const actualMinutes = Math.round(actualSecondsForRange(period.activityId, period.startDate, period.endDate) / 60);
  const estH = period.mainGoalEstimateMinutes != null ? (period.mainGoalEstimateMinutes / 60).toFixed(1) : null;
  const realH = (actualMinutes / 60).toFixed(1);

  const lines = [];
  const categoryLabel = CATEGORY_LABELS[category] || category;
  lines.push('📊 Bilan automatique — ' + categoryLabel + ' — Période ' + period.periodIndexInCycle + ' (' + period.startDate + ' – ' + period.endDate + ')');
  if (period.mainGoalText) {
    lines.push('Grand objectif : « ' + period.mainGoalText + ' » — ' + statusLabel(period.mainGoalStatus));
  }
  lines.push(doneCount + ' objectif(s) hebdomadaire(s) sur ' + weeklies.length + ' atteint(s).');
  if (estH != null) {
    lines.push(estH + 'h estimées contre ' + realH + 'h réelles.');
  } else {
    lines.push(realH + 'h réelles sur cette période.');
  }
  return lines.join('\n');
}

function statusLabel(status) {
  if (status === 'atteint') return 'atteint';
  if (status === 'partiel') return 'partiellement atteint';
  if (status === 'non_atteint') return 'non atteint';
  return 'non évalué';
}

function postBilanIfDue(activity, category, planStartDate) {
  const today = todayLocal();
  const membersCount = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(activity.id).n;

  const due = db.prepare(`
    SELECT * FROM goal_periods
    WHERE activityId = ? AND category = ? AND endDate < ? AND bilanPostedAt IS NULL
  `).all(activity.id, category, today);

  due.forEach((period) => {
    const weeklies = weeklyForPeriod(period.id);
    const hasContent = !!(period.mainGoalText || weeklies.length);
    // ⚠️ Période jamais touchée par l'utilisateur (ni grand objectif, ni
    // objectif hebdomadaire) : on ne marque PAS bilanPostedAt, pour laisser
    // une chance à un contenu ajouté en retard d'être bilanné plus tard —
    // sans ça, une période créée automatiquement (ensurePeriodsUpTo) puis
    // jamais remplie se verrait fermée pour de bon dès le premier balayage,
    // avant même que l'utilisateur ait eu l'occasion d'y écrire quoi que ce
    // soit. Coût négligeable : cette requête reste bornée aux périodes déjà
    // terminées et sans bilan, jamais toute la table.
    if (!hasContent) return;

    // Statut du grand objectif toujours non tranché à la fin de la période :
    // compte comme non atteint, même logique que les objectifs hebdomadaires.
    if (period.mainGoalStatus == null && period.mainGoalText) {
      db.prepare('UPDATE goal_periods SET mainGoalStatus = ? WHERE id = ?').run('non_atteint', period.id);
      period.mainGoalStatus = 'non_atteint';
    }

    // Publication seulement si l'activité est PARTAGÉE : une activité solo
    // n'a pas de fil de discussion (noesis-timetracker-activite.md). Le
    // bilan reste malgré tout consultable dans la page de bilan de l'app.
    if (membersCount >= 2) {
      const text = buildBilanText(activity.name, category, { ...period, activityId: activity.id }, weeklies);
      // Publié au nom du propriétaire de l'activité : il n'existe pas de
      // compte "système" dans ce projet (activity_messages.userId est
      // NOT NULL, voir server/db.js) — même principe que les autres
      // publications automatiques de l'app, toujours rattachées à une vraie
      // personne.
      if (activity.ownerId) postActivityMessage(activity.id, activity.ownerId, text);
    }

    db.prepare('UPDATE goal_periods SET bilanPostedAt = ? WHERE id = ?').run(new Date().toISOString(), period.id);
  });
}

// ---------------------------------------------------------------------------
// Point d'entrée principal, appelé par la route GET : garantit que le plan
// de cette catégorie existe, que toutes les périodes jusqu'à aujourd'hui
// sont créées, fait tourner le report automatique et l'envoi du bilan, puis
// renvoie l'état complet du planning de cette (activité, catégorie), plus la
// liste des membres de l'activité (pour l'assignation et la répartition).
function planningForActivity(activityId, category) {
  assertCategory(category);
  const activity = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ?').get(activityId);
  const plan = ensurePlan(activityId, category);
  const currentPeriodNumber = periodNumberForDate(plan.startDate, todayLocal());
  // 13 septembre 2026 (correction, demande d'Emilien) : on matérialise tout
  // le CYCLE de 13 périodes en cours, pas seulement les périodes jusqu'à
  // aujourd'hui. ensurePeriodRow() ne fait que poser les dates de la période
  // (aucun texte d'objectif, aucune suggestion) : matérialiser une période à
  // l'avance ne viole donc pas la règle verrouillée « aucune génération
  // automatique d'objectif ».
  const cycleIndexForCurrent = Math.floor((currentPeriodNumber - 1) / PERIODS_PER_CYCLE) + 1;
  const cycleLastPeriodNumber = cycleIndexForCurrent * PERIODS_PER_CYCLE;
  ensurePeriodsUpTo(activityId, category, cycleLastPeriodNumber, plan.startDate);
  carryOverWeekly(activityId, category, plan.startDate);
  postBilanIfDue(activity, category, plan.startDate);

  const periods = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? ORDER BY periodNumber')
    .all(activityId, category)
    .map((p) => {
      const weeklies = weeklyForPeriod(p.id).map((w) => ({
        ...w,
        actualMinutes: weekIsOver(p.startDate, w.weekIndex)
          ? Math.round(actualSecondsForRange(activityId, weekBounds(p.startDate, w.weekIndex).start, weekBounds(p.startDate, w.weekIndex).end) / 60)
          : null,
      }));
      weeklies.forEach((w) => { w.accuracy = accuracyScore(w.estimateMinutes, w.actualMinutes); });

      const periodOver = p.endDate < todayLocal();
      const actualMinutes = periodOver
        ? Math.round(actualSecondsForRange(activityId, p.startDate, p.endDate) / 60)
        : null;
      return {
        ...p,
        weeklies,
        actualMinutes,
        accuracy: accuracyScore(p.mainGoalEstimateMinutes, actualMinutes),
        isCurrent: p.periodNumber === currentPeriodNumber,
        isPast: p.endDate < todayLocal(),
      };
    });

  return {
    plan,
    category,
    currentPeriodNumber,
    periods,
    members: membersForActivity(activityId),
  };
}

function weekIsOver(periodStart, weekIndex) {
  return weekBounds(periodStart, weekIndex).end < todayLocal();
}

// ---------------------------------------------------------------------------
// Écritures

function setMainGoal(activityId, category, periodNumber, text) {
  assertCategory(category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const cleanText = String(text || '').trim();
  const estimate = estimateForGoal(activityId, category, 'main', cleanText);
  db.prepare(`
    UPDATE goal_periods
    SET mainGoalText = ?, mainGoalEstimateMinutes = ?, mainGoalEstimateSource = ?, mainGoalEstimateConfidence = ?
    WHERE activityId = ? AND category = ? AND periodNumber = ?
  `).run(cleanText, estimate.minutes, estimate.source, estimate.confidence, activityId, category, periodNumber);
  return { ...estimate };
}

function setMainGoalStatus(activityId, category, periodNumber, status) {
  assertCategory(category);
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide.'), { statusCode: 400 });
  db.prepare('UPDATE goal_periods SET mainGoalStatus = ? WHERE activityId = ? AND category = ? AND periodNumber = ?')
    .run(status, activityId, category, periodNumber);
}

// Crée ou remplace le texte de l'objectif hebdomadaire (weekIndex 1-4) de
// cette période. Un seul objectif "actif" (non issu d'un report) par
// (période, semaine) — la contrainte est vérifiée ici, pas en base, pour ne
// pas gêner le report automatique qui, lui, peut avoir besoin de chercher une
// semaine libre au-delà de la 4e (voir carryOverWeekly).
function setWeekly(activityId, category, periodNumber, weekIndex, text) {
  assertCategory(category);
  const plan = ensurePlan(activityId, category);
  ensurePeriodsUpTo(activityId, category, periodNumber, plan.startDate);
  const period = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, category, periodNumber);
  const cleanText = String(text || '').trim();
  const estimate = estimateForGoal(activityId, category, 'weekly', cleanText);

  const existing = db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL')
    .get(period.id, weekIndex);
  const createdAt = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE goal_weekly SET text = ?, estimateMinutes = ?, estimateSource = ?, estimateConfidence = ?
      WHERE id = ?
    `).run(cleanText, estimate.minutes, estimate.source, estimate.confidence, existing.id);
    return { ...estimate, id: existing.id };
  }

  const info = db.prepare(`
    INSERT INTO goal_weekly (periodId, weekIndex, text, estimateMinutes, estimateSource, estimateConfidence, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(period.id, weekIndex, cleanText, estimate.minutes, estimate.source, estimate.confidence, createdAt);
  return { ...estimate, id: Number(info.lastInsertRowid) };
}

function setWeeklyStatus(activityId, weeklyId, status) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Statut invalide.'), { statusCode: 400 });
  // Scopé par activité : vérifie que cet objectif hebdomadaire appartient
  // bien à une période de CETTE activité avant d'écrire, comme partout
  // ailleurs dans le projet (R4 du contrat d'avancement de Sous-projets).
  const row = db.prepare(`
    SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });
  db.prepare('UPDATE goal_weekly SET status = ? WHERE id = ?').run(status, weeklyId);
}

// Assigne (ou retire, si userId est null) UN membre de l'activité à cet
// objectif hebdomadaire — 14 septembre 2026, demande d'Emilien, pour que le
// travail de chaque catégorie se répartisse visiblement entre les membres.
// Le grand objectif de période n'est volontairement pas assignable (règle 1
// en tête de fichier : le plan appartient à l'activité).
function setWeeklyAssignee(activityId, weeklyId, userId) {
  const row = db.prepare(`
    SELECT w.id FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });

  const cleanUserId = userId ? String(userId) : null;
  if (cleanUserId) {
    const member = db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(activityId, cleanUserId);
    if (!member) throw Object.assign(new Error("Ce membre n'appartient pas à cette activité."), { statusCode: 400 });
  }
  db.prepare('UPDATE goal_weekly SET assignedUserId = ? WHERE id = ?').run(cleanUserId, weeklyId);
}

// ---------------------------------------------------------------------------
// Balayage global — ENVOI AUTOMATIQUE du bilan (décision d'Emilien, 12
// septembre 2026) : ne doit pas dépendre de l'ouverture de l'app par
// quelqu'un. Même principe que server/lib/duereminders.js (minuteur démarré
// APRÈS l'écoute du serveur, jamais la seule raison qui garde le processus
// en vie). Fréquence large (6h) : une période dure 28 jours, inutile de
// balayer plus souvent — le report automatique, lui, reste aussi calculé à
// la volée à chaque ouverture du planning (voir planningForActivity), donc
// aucune perte entre deux balayages. Parcourt maintenant chaque (activité,
// catégorie) ayant un plan démarré, plutôt que chaque activité seule.
function runGoalsSweepAll() {
  const plans = db.prepare(`
    SELECT DISTINCT a.id AS activityId, a.name AS activityName, a.ownerId AS ownerId, p.category AS category
    FROM activities a
    JOIN activity_goal_plans p ON p.activityId = a.id
    WHERE a.active = 1
  `).all();

  let posted = 0;
  plans.forEach((row) => {
    try {
      const activity = { id: row.activityId, name: row.activityName, ownerId: row.ownerId };
      const plan = getPlan(activity.id, row.category);
      if (!plan) return;
      carryOverWeekly(activity.id, row.category, plan.startDate);
      const before = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ? AND bilanPostedAt IS NOT NULL').get(activity.id, row.category).n;
      postBilanIfDue(activity, row.category, plan.startDate);
      const after = db.prepare('SELECT COUNT(*) AS n FROM goal_periods WHERE activityId = ? AND category = ? AND bilanPostedAt IS NOT NULL').get(activity.id, row.category).n;
      posted += Math.max(0, after - before);
    } catch (err) {
      console.warn('[objectifs] balayage échoué pour l\'activité ' + row.activityId + ' / ' + row.category + ' :', err.message);
    }
  });
  return { posted };
}

const SWEEP_MS = 6 * 60 * 60 * 1000;
const FIRST_SWEEP_MS = 25 * 1000;
let sweepTimer = null;

function startGoalsSweep() {
  if (sweepTimer) return;
  const tick = () => {
    try {
      const res = runGoalsSweepAll();
      if (res.posted) console.log('Objectifs : ' + res.posted + ' bilan(s) publié(s) automatiquement');
    } catch (err) {
      console.warn('[objectifs] balayage échoué :', err.message);
    }
  };
  setTimeout(tick, FIRST_SWEEP_MS).unref();
  sweepTimer = setInterval(tick, SWEEP_MS);
  sweepTimer.unref();
}

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  isValidCategory,
  STATUSES,
  planningForActivity,
  membersForActivity,
  setMainGoal,
  setMainGoalStatus,
  setWeekly,
  setWeeklyStatus,
  setWeeklyAssignee,
  runGoalsSweepAll,
  startGoalsSweep,
  // Exportés pour les tests (bac à sable) — mêmes fonctions, pas de doublon.
  periodBounds,
  weekBounds,
  periodNumberForDate,
  estimateForGoal,
  accuracyScore,
  buildBilanText,
  addDays,
};
