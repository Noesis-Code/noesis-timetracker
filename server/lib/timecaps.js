// Plafonds de temps facultatifs par pôle/secteur (7 oct. 2026, demande d'Emilien) :
// max par jour et max par semaine (minutes), par utilisateur. NULL = aucun plafond.
// Le temps d'un secteur compte aussi dans son pôle. Un dépassement ne REFUSE jamais
// rien : il alimente le plan PROPOSÉ de goalsoverload.js (validation obligatoire).

const db = require('../db');
const goals = require('./goals');

db.exec(`CREATE TABLE IF NOT EXISTS goal_time_caps (
  userId TEXT NOT NULL, activityId INTEGER NOT NULL, category TEXT NOT NULL,
  maxDayMinutes INTEGER, maxWeekMinutes INTEGER,
  PRIMARY KEY (userId, activityId, category)
)`);

const AVG_DAYS = 28;

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function isKnownKey(activityId, key) {
  return goals.isValidCategoryForActivity(activityId, key) || goals.isValidSecteurForActivity(activityId, key);
}

function cleanMinutes(v, name) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) {
    throw Object.assign(new Error('Plafond invalide (' + name + ') : entier de minutes >= 0 ou vide.'), { statusCode: 400 });
  }
  return n;
}

// Moyenne historique (28 derniers jours terminés) du temps chronométré de l'utilisateur,
// via categorystats.categoryBreakdownForRange (déjà utilisé par la Répartition).
// Un pôle cumule ses secteurs.
function averages(userId, activityId, key) {
  const categorystats = require('./categorystats'); // paresseux : évite un cycle de chargement
  const today = todayLocal();
  const bd = categorystats.categoryBreakdownForRange(userId, activityId, goals.addDays(today, -AVG_DAYS), goals.addDays(today, -1));
  const isPole = goals.isValidCategoryForActivity(activityId, key);
  const seconds = bd.categories.reduce((s, c) => s + ((c.category === key || (isPole && c.parentKey === key)) ? c.seconds : 0), 0);
  const perDay = Math.round(seconds / 60 / AVG_DAYS);
  return { avgDayMinutes: perDay, avgWeekMinutes: Math.round(seconds / 60 / (AVG_DAYS / 7)) };
}

// Minutes réellement chronométrées dans [startIso, endIso] pour UN pôle (secteurs cumulés) ou UN secteur.
function minutesInRange(userId, activityId, key, startIso, endIso) {
  const categorystats = require('./categorystats');
  const bd = categorystats.categoryBreakdownForRange(userId, activityId, startIso, endIso);
  const isPole = goals.isValidCategoryForActivity(activityId, key);
  const seconds = bd.categories.reduce((s, c) => s + ((c.category === key || (isPole && c.parentKey === key)) ? c.seconds : 0), 0);
  return Math.round(seconds / 60);
}

// Moyenne historique du temps chronométré par période de 4 semaines (28 jours) pour un pôle
// (secteurs cumulés) ou un secteur : on remonte jusqu'à 13 fenêtres terminées et on moyenne
// depuis la plus ancienne fenêtre où du temps existe. null tant qu'aucun temps n'est enregistré.
function periodAverage(userId, activityId, key) {
  const today = todayLocal();
  const wins = [];
  for (let i = 0; i < 13; i++) {
    const end = goals.addDays(today, -1 - i * AVG_DAYS);
    const start = goals.addDays(end, -(AVG_DAYS - 1));
    wins.push(minutesInRange(userId, activityId, key, start, end));
  }
  let oldest = -1;
  wins.forEach((m, i) => { if (m > 0) oldest = i; });
  if (oldest < 0) return null;
  const used = wins.slice(0, oldest + 1);
  return Math.round(used.reduce((a, b) => a + b, 0) / used.length);
}

function getCaps(userId, activityId, key) {
  if (!isKnownKey(activityId, key)) {
    throw Object.assign(new Error('Pôle ou secteur invalide pour cette activité.'), { statusCode: 400 });
  }
  const row = db.prepare('SELECT maxDayMinutes, maxWeekMinutes FROM goal_time_caps WHERE userId = ? AND activityId = ? AND category = ?')
    .get(userId, activityId, key);
  return {
    key,
    maxDayMinutes: row ? row.maxDayMinutes : null,
    maxWeekMinutes: row ? row.maxWeekMinutes : null,
    ...averages(userId, activityId, key),
  };
}

function setCaps(userId, activityId, key, body) {
  if (!isKnownKey(activityId, key)) {
    throw Object.assign(new Error('Pôle ou secteur invalide pour cette activité.'), { statusCode: 400 });
  }
  const b = body || {};
  const day = cleanMinutes(b.maxDayMinutes, 'par jour');
  const week = cleanMinutes(b.maxWeekMinutes, 'par semaine');
  if (day === null && week === null) {
    db.prepare('DELETE FROM goal_time_caps WHERE userId = ? AND activityId = ? AND category = ?').run(userId, activityId, key);
  } else {
    db.prepare(`INSERT INTO goal_time_caps (userId, activityId, category, maxDayMinutes, maxWeekMinutes) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId, activityId, category) DO UPDATE SET maxDayMinutes = excluded.maxDayMinutes, maxWeekMinutes = excluded.maxWeekMinutes`)
      .run(userId, activityId, key, day, week);
  }
  return getCaps(userId, activityId, key);
}

// Tous les plafonds de l'utilisateur sur l'activité : [{ key, maxDayMinutes, maxWeekMinutes }].
function listCaps(userId, activityId) {
  return db.prepare('SELECT category AS key, maxDayMinutes, maxWeekMinutes FROM goal_time_caps WHERE userId = ? AND activityId = ?')
    .all(userId, activityId);
}

// Plafond hebdomadaire (minutes) d'un pôle/secteur, ou null.
function weeklyCapFor(userId, activityId, key) {
  const row = db.prepare('SELECT maxWeekMinutes FROM goal_time_caps WHERE userId = ? AND activityId = ? AND category = ?')
    .get(userId, activityId, key);
  return row && row.maxWeekMinutes != null ? row.maxWeekMinutes : null;
}

// 8 oct. 2026 (Émilien) : la « Cible » saisie sur un objectif hebdomadaire (goal_weekly.estimateSource
// = 'manual') PRIME sur le plafond de semaine de « Gérer mon temps », pour CETTE semaine seulement.
// Renvoie { lundi ISO : minutes } pour le pôle/secteur `key` (un pôle regroupe ses secteurs).
function weekCapsFor(activityId, key) {
  const out = {};
  const rows = db.prepare(`
    SELECT w.weekIndex, w.estimateMinutes, p.startDate, p.category FROM goal_weekly w
    JOIN goal_periods p ON p.id = w.periodId
    WHERE p.activityId = ? AND w.carriedOverFromId IS NULL AND w.estimateSource = 'manual' AND w.estimateMinutes > 0
  `).all(activityId);
  const isPole = goals.isValidCategoryForActivity(activityId, key);
  rows.forEach((r) => {
    if (!(r.category === key || (isPole && goals.resolveToPole(activityId, r.category) === key))) return;
    out[goals.mostRecentMonday(goals.weekBounds(r.startDate, r.weekIndex).start)] = r.estimateMinutes;
  });
  return out;
}

// PURE. caps : [{key, label, isPole, poleKey, maxDayMinutes, maxWeekMinutes, weekCaps?}] ;
// tasks : [{id,label,category,poleOf (pôle de la tâche),dueDate,minutes,dueDateAuto,long?,importance?}].
// Une tâche compte dans le plafond de sa catégorie ET dans celui de son pôle.
// Seules les tâches posées par le moteur (dueDateAuto) bougent. Renvoie [{id,to,capKey,capLabel}].
function computeCapMoves({ today, caps, tasks, horizon = 60 }) {
  if (!caps.length) return [];
  const cur = new Map();
  tasks.forEach((t) => { if (t.dueDate) cur.set(t.id, t.dueDate < today ? today : t.dueDate); });
  const inCap = (c, t) => t.category === c.key || (c.isPole && t.poleOf === c.key);
  const capsOf = (t) => caps.filter((c) => inCap(c, t));
  const dayLoad = (c, d) => tasks.reduce((s, t) => s + (inCap(c, t) && cur.get(t.id) === d ? t.minutes : 0), 0);
  const weekOf = (d) => goals.mostRecentMonday(d);
  const weekCap = (c, d) => (c.weekCaps && c.weekCaps[weekOf(d)] != null ? c.weekCaps[weekOf(d)] : c.maxWeekMinutes);
  const weekLoad = (c, d) => { const w = weekOf(d); return tasks.reduce((s, t) => s + (inCap(c, t) && cur.has(t.id) && weekOf(cur.get(t.id)) === w ? t.minutes : 0), 0); };
  const fits = (t, d) => capsOf(t).every((c) => (c.maxDayMinutes == null || dayLoad(c, d) + t.minutes <= c.maxDayMinutes)
    && (weekCap(c, d) == null || weekLoad(c, d) + t.minutes <= weekCap(c, d)));
  const movable = (t) => !t.long && !!t.dueDateAuto;
  const moved = new Map();
  const reasons = new Map();

  const tryMove = (c, from, pickLatest) => {
    const cands = tasks.filter((t) => movable(t) && inCap(c, t) && (pickLatest ? weekOf(cur.get(t.id)) === weekOf(from) && cur.get(t.id) >= today : cur.get(t.id) === from))
      .sort((a, b) => (cur.get(b.id) < cur.get(a.id) ? -1 : cur.get(b.id) > cur.get(a.id) ? 1 : b.id - a.id));
    for (const t of cands) {
      const src = cur.get(t.id);
      for (let i = 1; i <= horizon; i += 1) {
        const d = goals.addDays(src, i);
        if (fits(t, d)) { cur.set(t.id, d); moved.set(t.id, d); reasons.set(t.id, c); return true; }
      }
    }
    return false;
  };

  for (let i = 0; i <= horizon; i += 1) {
    const d = goals.addDays(today, i);
    caps.forEach((c) => {
      let guard = 200;
      while (c.maxDayMinutes != null && dayLoad(c, d) > c.maxDayMinutes && guard-- > 0) { if (!tryMove(c, d, false)) break; }
      guard = 200;
      while (weekCap(c, d) != null && weekLoad(c, d) > weekCap(c, d) && guard-- > 0) { if (!tryMove(c, d, true)) break; }
    });
  }
  const out = [];
  tasks.forEach((t) => {
    if (!moved.has(t.id) || moved.get(t.id) === (t.dueDate < today ? today : t.dueDate)) return;
    const c = reasons.get(t.id);
    out.push({ id: t.id, to: moved.get(t.id), capKey: c.key, capLabel: c.label });
  });
  return out;
}

module.exports = {
  periodAverage, weekCapsFor, getCaps, setCaps, listCaps, weeklyCapFor, computeCapMoves, averages, minutesInRange };
