// Feuille de route JOUR PAR JOUR par IA (17 septembre 2026, discussion A —
// Offre1, cadré avec Emilien) — décompose les tâches d'un objectif
// hebdomadaire déjà regroupées par goalsauto.js (goal_weekly, via
// sub_project_items.goalWeeklyId) sur des jours PRÉCIS de la semaine
// (sub_project_items.dueDate) : exactement la même colonne que le calendrier
// de période (discussion D, server/lib/calendarfeed.js#createDayTask) — une
// tâche ainsi datée apparaît donc directement dans le calendrier existant,
// sans nouvelle table ni nouvel écran dédié.
//
// Cadrage avec Emilien (AskUserQuestion, 17 septembre 2026) : IA plutôt
// qu'une simple répartition déterministe, pour un rendu jugé plus pertinent
// qu'un remplissage mécanique — mais recherche faite dans le code réel avant
// de coder : AUCUN appel à un modèle IA n'existe nulle part ailleurs dans ce
// projet aujourd'hui. server/lib/offerdelivery.js, cité dans
// noesis-timetracker-objectifs.md comme patron à suivre pour un futur module
// IA, N'A JAMAIS ÉTÉ CODÉ — la « vraie » Offre1 a été livrée jusqu'ici via
// des scripts ponctuels (scripts/apply-offre1-*.js), jamais un module
// applicatif appelant une IA en direct. Ce fichier est donc la toute
// première dépendance IA réelle de l'application.
//
// Même philosophie que server/lib/mail.js (Resend) : un simple appel
// fetch() natif (disponible depuis Node 18, voir package.json "engines"
// >= 22.13.0), aucune dépendance npm ajoutée (pas de @anthropic-ai/sdk).
// `configured()` expose l'absence de clé pour que l'appelant réagisse
// proprement plutôt que de planter.
//
// N'invente JAMAIS un texte de tâche : le modèle ne reçoit que les libellés
// déjà écrits par l'utilisateur (via Sous-projets, déjà regroupés dans
// goal_weekly par goalsauto.js) et ne renvoie qu'une DATE par identifiant
// déjà existant — jamais un nouveau texte, jamais une tâche inventée. Repli
// déterministe (répartition égale sur les jours restants de la semaine) si
// la clé API est absente, si l'appel échoue ou expire, ou si la réponse
// n'est pas exploitable : la fonctionnalité ne bloque jamais faute d'IA
// disponible — voir REQUEST_TIMEOUT_MS et le bloc try/catch de
// generateDailyPlanForWeekly ci-dessous.
//
// ⚠️ Coût par appel : un seul appel par génération (jamais un appel par
// tâche), payload borné (labels déjà écrits + 7 dates), max_tokens limité —
// voir MAX_OUTPUT_TOKENS. Jamais déclenché automatiquement (contrairement à
// goalsauto.onSubProjectItemChanged) : uniquement sur demande explicite de
// l'utilisateur (bouton), pour garder les coûts prévisibles et sous son
// contrôle.

const db = require('../db');
const goals = require('./goals');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
// Configurable via NOESIS_DAILY_PLAN_MODEL si Anthropic publie un modèle plus
// récent/moins coûteux après l'écriture de ce fichier — à vérifier sur
// https://docs.claude.com/en/docs/about-claude/models avant de changer la
// valeur par défaut en production.
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_OUTPUT_TOKENS = 1024;
// Au-delà, le payload devient coûteux et la pertinence d'un placement
// jour-par-jour s'effondre de toute façon (trop de tâches pour une seule
// semaine) — au-delà de cette taille, repli déterministe direct, sans appel.
const MAX_ITEMS_PER_CALL = 40;

function configured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function modelName() {
  return process.env.NOESIS_DAILY_PLAN_MODEL || DEFAULT_MODEL;
}

// Dupliqué délibérément depuis goals.js (qui le duplique lui-même depuis
// duereminders.js), comme goalsauto.js le fait déjà pour la même raison
// (voir son commentaire de tête) : une fonction de date d'une ligne ne
// justifie pas un export de plus.
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

const WEEKDAY_LABELS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function weekDates(periodStart, weekIndex) {
  const bounds = goals.weekBounds(periodStart, weekIndex);
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(goals.addDays(bounds.start, i));
  return dates;
}

// Scopé par activité, même garde que setWeeklyStatus/setWeeklyAssignee dans
// goals.js (R4 du contrat d'avancement de Sous-projets) : vérifie que cet
// objectif hebdomadaire appartient bien à une période de CETTE activité.
function loadWeeklyForActivity(activityId, weeklyId) {
  const row = db.prepare(`
    SELECT w.id, w.periodId, w.weekIndex, w.text, w.description, w.assignedUserId,
           p.activityId, p.category, p.startDate AS periodStart
    FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE w.id = ? AND p.activityId = ?
  `).get(weeklyId, activityId);
  if (!row) throw Object.assign(new Error('Objectif hebdomadaire introuvable.'), { statusCode: 404 });
  return row;
}

// Tâches déjà groupées dans cet objectif hebdomadaire par goalsauto.js (ou
// manuellement rattachées), mais pas encore datées à un jour précis — celles
// déjà datées (dueDate non NULL, par ex. ajoutées à la main depuis le
// calendrier) ne sont JAMAIS touchées, ici comme partout ailleurs dans ce
// projet.
function undatedItemsForWeekly(weeklyId) {
  return db.prepare(`
    SELECT id, label FROM sub_project_items
    WHERE goalWeeklyId = ? AND (dueDate IS NULL OR dueDateAuto = 2) AND done = 0
    ORDER BY position ASC, id ASC
  `).all(weeklyId);
}

// Repli déterministe, sans IA : répartition égale des tâches sur les jours
// de la semaine qui ne sont pas déjà passés (aujourd'hui inclus) — si la
// semaine est déjà entièrement passée (report en retard), répartition sur
// les 7 jours calendaires malgré tout, plutôt que de ne rien renvoyer.
function deterministicAssignments(items, dates) {
  const today = todayLocal();
  const usable = dates.filter((d) => d >= today);
  const pool = usable.length ? usable : dates;
  return items.map((item, idx) => ({ itemId: item.id, date: pool[idx % pool.length] }));
}


// ---------------------------------------------------------------------------
// 8 oct. 2026 (Émilien) : le temps de la SEMAINE prime sur celui du jour.
// Plafond du jour = jamais dépassé ; budget de la semaine = total que la somme
// des jours ne peut pas dépasser (déjà chronométré + déjà daté déduits). Les
// tâches sont servies par importance décroissante ; ce qui ne rentre plus
// reste SANS date (jours laissés vides). Les dates fixes (saisies à la main)
// ne bougent jamais : elles comptent dans les charges, c'est tout.
// PURE. items : [{id, minutes, importance, date?}] (date = jour proposé par l'IA, facultatif) ;
// dates : jours de la semaine ; dayLoad : {date: minutes déjà occupées} ;
// weekUsed : minutes déjà consommées ; dayMax/weekMax : null = pas de limite.
// Tâche très longue (> plafond du jour) : elle s'étale sur plusieurs jours consécutifs mais n'est datée qu'UNE fois
// (au premier jour). Parts : [plafond, plafond, ..., reste]. Ex. 3 h pour 2 h/jour -> lundi 2 h, mardi 1 h.
function spanParts(minutes, dayMax) {
  if (!dayMax || !(minutes > dayMax)) return [minutes];
  const n = Math.ceil(minutes / dayMax);
  const parts = [];
  for (let k = 0; k < n - 1; k += 1) parts.push(dayMax);
  parts.push(minutes - (n - 1) * dayMax);
  return parts;
}

function placeWithinCaps({ items, dates, today, dayLoad, weekUsed, dayMax, weekMax }) {
  const usable = dates.filter((d) => d >= today);
  const pool = usable.length ? usable : dates;
  const load = Object.assign({}, dayLoad);
  let used = weekUsed || 0;
  const placed = [];
  const skipped = [];
  const ordered = items.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0) || a.id - b.id);
  ordered.forEach((it) => {
    if (weekMax != null && used + it.minutes > weekMax) { skipped.push(it.id); return; }
    const start = it.date && pool.indexOf(it.date) >= 0 ? pool.indexOf(it.date) : 0;
    const order = pool.slice(start).concat(pool.slice(0, start));
    const parts = spanParts(it.minutes, dayMax);
    const day = order.find((d) => {
      const j = pool.indexOf(d);
      if (j + parts.length > pool.length) return false; // la tâche longue doit tenir dans la semaine
      return parts.every((m, k) => dayMax == null || (load[pool[j + k]] || 0) + m <= dayMax);
    });
    if (!day) { skipped.push(it.id); return; }
    const j0 = pool.indexOf(day);
    parts.forEach((m, k) => { load[pool[j0 + k]] = (load[pool[j0 + k]] || 0) + m; });
    used += it.minutes;
    placed.push({ itemId: it.id, date: day });
  });
  return { placed, skipped };
}

function inCapScope(activityId, capKey, category) {
  if (!category) return false;
  if (category === capKey) return true;
  return goals.isValidCategoryForActivity(activityId, capKey) && goals.resolveToPole(activityId, category) === capKey;
}

// Contexte des limites pour une semaine : charges par jour, minutes déjà consommées, minutes par tâche.
function capContextForWeek(activityId, weekly, userId, dates, items, caps, today) {
  const captureplace = require('./goalscaptureplace');
  const timecaps = require('./timecaps');
  const importance = require('./goalsimportance');
  const minutesOf = (label, category) => {
    const est = category ? goals.estimateForGoal(activityId, category, 'weekly', label) : null;
    // Une estimation de repli (aucune tâche similaire) n'est pas fiable : durée par défaut.
    const m = est && est.minutes && est.source !== 'similarity-fallback' ? est.minutes : captureplace.DEFAULT_TASK_MINUTES;
    return m; // une tâche plus longue que le plafond du jour s'étale sur plusieurs jours (spanParts)
  };
  const rows = db.prepare(`
    SELECT i.id, i.label, i.dueDate, sp.goalCategory AS category
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 0 AND i.dueDate >= ? AND i.dueDate <= ?
  `).all(activityId, dates[0], dates[dates.length - 1]);
  const dayLoad = {};
  let weekUsed = 0;
  rows.forEach((r) => {
    if (!inCapScope(activityId, weekly.category, r.category)) return;
    const m = minutesOf(r.label, r.category);
    spanParts(m, caps.dayMax).forEach((part, k) => {
      const d = goals.addDays(r.dueDate, k);
      dayLoad[d] = (dayLoad[d] || 0) + part;
    });
    weekUsed += m;
  });
  // Temps déjà chronométré cette semaine (jusqu'à aujourd'hui).
  try {
    const end = today < dates[dates.length - 1] ? today : dates[dates.length - 1];
    if (end >= dates[0]) {
      weekUsed += timecaps.minutesInRange(userId, activityId, weekly.category, dates[0], end);
    }
  } catch (e) { /* non bloquant */ }
  let ctx = {};
  try { ctx = importance.loadGoalContexts(items.map((it) => it.id)); } catch (e) { ctx = {}; }
  const enriched = items.map((it) => {
    const minutes = minutesOf(it.label, weekly.category);
    let score = 0;
    try { score = importance.computeImportance({ today, goal: ctx[it.id], minutes, capacity: caps.dayMax || caps.weekMax || 60, dayLoadMinutes: 0 }).score; } catch (e) { score = 0; }
    return { id: it.id, minutes, importance: score };
  });
  return { dayLoad, weekUsed, enriched };
}

function buildPrompt(items, dates, dailyCapacityMinutes, weekly, isMax, weekMax) {
  const daysList = dates.map((d, i) => `- ${d} (${WEEKDAY_LABELS_FR[i]})`).join('\n');
  const itemsList = items.map((it) => `- id ${it.id} : ${it.label}`).join('\n');
  const goalLines = weekly && weekly.text
    ? ['Objectif de la semaine : ' + weekly.text + (weekly.description ? '\nDescription : ' + weekly.description : ''), '']
    : [];
  return [
    "Tu planifies une semaine de travail pour une seule personne, à partir de tâches qu'elle a déjà écrites elle-même.",
    '',
    ...goalLines,
    'Jours disponibles cette semaine :',
    daysList,
    '',
    isMax ? `Maximum par jour fixé par la personne : ${dailyCapacityMinutes} minutes. Chaque jour, vise ce maximum sans JAMAIS le dépasser.` : `Capacité indicative par jour : environ ${dailyCapacityMinutes} minutes (une indication, pas une limite stricte — regrouper des tâches liées sur le même jour est plus important que respecter ce chiffre au minute près).`,
    weekMax ? `Budget total de la semaine fixé par la personne : ${weekMax} minutes. Le total de la semaine prime sur le maximum par jour : ne dépasse jamais l'un ni l'autre, quitte à laisser des jours vides.` : '',
    '',
    'Tâches à répartir (ne jamais changer leur texte, ne jamais en ajouter ni en retirer) :',
    itemsList,
    '',
    'Réponds UNIQUEMENT avec un objet JSON de cette forme exacte, sans texte autour, sans balises markdown :',
    '{"assignments":[{"itemId": <id numérique>, "date": "YYYY-MM-DD"}, ...]}',
    "Chaque id de la liste ci-dessus doit apparaître EXACTEMENT une fois, avec une date parmi celles listées plus haut. N'invente aucun id, aucune date hors de la liste.",
  ].join('\n');
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return null;
  }
}

// Validation stricte de la réponse du modèle : rejette toute ligne qui ne
// correspond pas à un id demandé ou une date proposée — jamais une écriture
// en base d'un id ou d'une date inventée par le modèle. Les items non
// couverts par une réponse valide sont renvoyés séparément pour repli
// déterministe, plutôt que silencieusement ignorés.
function validateAssignments(raw, items, dates) {
  const validIds = new Set(items.map((it) => it.id));
  const validDates = new Set(dates);
  const seen = new Set();
  const valid = [];
  const list = raw && Array.isArray(raw.assignments) ? raw.assignments : [];
  list.forEach((entry) => {
    const itemId = Number(entry && entry.itemId);
    const date = entry && typeof entry.date === 'string' ? entry.date : null;
    if (!validIds.has(itemId) || !validDates.has(date) || seen.has(itemId)) return;
    seen.add(itemId);
    valid.push({ itemId, date });
  });
  const missing = items.filter((it) => !seen.has(it.id));
  return { valid, missing };
}

async function callModel(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName(),
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body && body.error && body.error.message ? body.error.message : '';
      } catch (err) {
        // Réponse non-JSON — pas d'information supplémentaire.
      }
      throw new Error(`Anthropic a refusé l'appel (HTTP ${res.status})${detail ? ' : ' + detail : ''}.`);
    }
    const body = await res.json();
    const textBlock = Array.isArray(body.content) ? body.content.find((b) => b.type === 'text') : null;
    return textBlock ? textBlock.text : '';
  } finally {
    clearTimeout(timer);
  }
}

// Point d'entrée. Ne lève JAMAIS pour une panne IA (clé absente, timeout,
// erreur réseau, réponse inexploitable) : repli déterministe systématique
// dans ces cas, avec usedAi: false dans le résultat pour que l'appelant
// puisse en informer l'utilisateur. Ne lève QUE pour une erreur de portée
// (objectif introuvable) ou d'entrée invalide.
async function generateDailyPlanForWeekly(activityId, weeklyId, requestingUserId) {
  const weekly = loadWeeklyForActivity(activityId, weeklyId);
  const items = undatedItemsForWeekly(weekly.id);
  if (!items.length) {
    return { assigned: 0, total: 0, usedAi: false, message: 'Aucune tâche à dater : tout est déjà placé ou aucune tâche ne dépend encore de cet objectif.' };
  }

  const dates = weekDates(weekly.periodStart, weekly.weekIndex);
  const capacityUserId = weekly.assignedUserId || requestingUserId;
  // goalsauto est requis ici plutôt qu'en tête de fichier pour éviter tout
  // risque de dépendance circulaire (goalsauto n'a aujourd'hui aucune raison
  // de requérir ce fichier, mais goals.js est déjà requis par les deux).
  const goalsauto = require('./goalsauto');
  const weeklyCapacity = goalsauto.capacityMinutesForMember(activityId, weekly.category, capacityUserId);
  let dailyCapacity = Math.max(1, Math.round(weeklyCapacity / 7));
  // Max quotidien posé (Gérer mon temps) : c'est lui qui compte — viser ce maximum sans le dépasser.
  let dailyMax = null;
  let weekMax = null;
  try {
    const capsRow = require('./timecaps').getCaps(capacityUserId, activityId, weekly.category);
    dailyMax = capsRow.maxDayMinutes || null;
    weekMax = capsRow.maxWeekMinutes || null;
  } catch (e) { dailyMax = null; weekMax = null; }
  // La Cible saisie sur CET objectif hebdomadaire prime sur le plafond de semaine, pour cette semaine seulement.
  try {
    const own = db.prepare('SELECT estimateMinutes, estimateSource FROM goal_weekly WHERE id = ?').get(weekly.id);
    if (own && own.estimateSource === 'manual' && own.estimateMinutes > 0) weekMax = own.estimateMinutes;
  } catch (e) { /* non bloquant */ }
  if (dailyMax) dailyCapacity = dailyMax;

  let assignments = [];
  let usedAi = false;
  let aiError = null;

  if (configured() && items.length <= MAX_ITEMS_PER_CALL) {
    try {
      const prompt = buildPrompt(items, dates, dailyCapacity, weekly, !!dailyMax, weekMax);
      const text = await callModel(prompt);
      const parsed = extractJson(text);
      const { valid, missing } = validateAssignments(parsed, items, dates);
      assignments = valid;
      if (missing.length) assignments = assignments.concat(deterministicAssignments(missing, dates));
      usedAi = valid.length > 0;
    } catch (err) {
      aiError = err.message;
    }
  }

  if (!assignments.length) {
    assignments = deterministicAssignments(items, dates);
    usedAi = false;
  }

  // Limites jour/semaine : la semaine prime, les tâches qui ne rentrent plus restent sans date.
  let skippedForCaps = 0;
  if (dailyMax || weekMax) {
    try {
      const today = todayLocal();
      const ctx = capContextForWeek(activityId, weekly, capacityUserId, dates, items, { dayMax: dailyMax, weekMax }, today);
      const dateOf = new Map(assignments.map((a) => [a.itemId, a.date]));
      const r = placeWithinCaps({
        items: ctx.enriched.map((e) => Object.assign({}, e, { date: dateOf.get(e.id) })),
        dates, today, dayLoad: ctx.dayLoad, weekUsed: ctx.weekUsed, dayMax: dailyMax, weekMax,
      });
      assignments = r.placed;
      skippedForCaps = r.skipped.length;
    } catch (e) { /* repli : plan sans contrôle de limites */ }
  }

  const now = new Date().toISOString();
  const update = db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = 1 WHERE id = ? AND goalWeeklyId = ? AND (dueDate IS NULL OR dueDateAuto = 2)');
  let written = 0;
  assignments.forEach((a) => {
    const info = update.run(a.date, a.itemId, weekly.id);
    written += info.changes;
  });

  return {
    assigned: written,
    total: items.length,
    usedAi,
    aiError: usedAi ? null : aiError,
    skippedForCaps,
    generatedAt: now,
  };
}

module.exports = {
  configured,
  modelName,
  generateDailyPlanForWeekly,
  placeWithinCaps,
  spanParts,
};
