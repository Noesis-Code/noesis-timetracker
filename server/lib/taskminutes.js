'use strict';
// Durée d'une tâche — POINT UNIQUE (phase 1 du plan docs/ia/durees-taches.md).
// Une tâche porte une fourchette optionnelle (minMinutes / medianMinutes / maxMinutes) issue de l'estimation de l'IA par micro-étapes.
// taskMinutes(task, fallback) : médiane stockée si présente, sinon l'estimation historique (fallback : nombre ou fonction), sinon 30 min.
// Module PUR (aucune dépendance au reste de server/) pour être réutilisable partout sans cycle d'import.
const DEFAULT_TASK_MINUTES = 30;   // dernier recours, jamais une erreur
const MIN_TASK_MINUTES = 5;
const MAX_TASK_MINUTES = 480;
const MAX_STEPS = 6;
const COLUMNS = 'minMinutes, medianMinutes, maxMinutes, durSource, durConfidence';

const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const call = (f) => { if (typeof f !== 'function') return f; try { return f(); } catch (e) { return null; } };

// Valide la sortie de l'IA : { min, max, steps?: [nombres], confidence? }. Le CODE contrôle (nombres finis, 5 <= min <= max <= 480) et calcule la médiane :
// somme des étapes (<= 6 étapes, nombres seulement) bornée dans [min, max] ; sans étapes valides, milieu de la fourchette. Renvoie null si invalide.
function validateEstimate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const min = Number(raw.min), max = Number(raw.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lo = Math.round(min), hi = Math.round(max);
  if (lo < MIN_TASK_MINUTES || hi > MAX_TASK_MINUTES || lo > hi) return null;
  let steps = Array.isArray(raw.steps) ? raw.steps.map(Number) : [];
  const stepsOk = steps.length > 0 && steps.length <= MAX_STEPS && steps.every((s) => Number.isFinite(s) && s > 0 && s <= MAX_TASK_MINUTES);
  const rawMedian = stepsOk ? steps.reduce((a, b) => a + b, 0) : (lo + hi) / 2;
  const median = Math.round(Math.min(hi, Math.max(lo, rawMedian)));
  let conf = Number(raw.confidence);
  conf = Number.isFinite(conf) && conf >= 0 && conf <= 100 ? Math.round(conf) : null;
  return { min: lo, max: hi, median, source: stepsOk ? 'ia-micro' : 'ia', confidence: conf };
}

// Tâche proposée avec sa durée (minutes) et sa fourchette facultative (min, max) : { min, median, max, source } ; null si la durée est invalide.
// Sans fourchette valide, la médiane est la durée elle-même (min et max restent vides : aucune fourchette inventée).
function fromProposal(minutes, min, max) {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m < MIN_TASK_MINUTES || m > MAX_TASK_MINUTES) return null;
  const lo = Math.round(Number(min)), hi = Math.round(Number(max));
  if (Number.isFinite(lo) && Number.isFinite(hi) && min != null && max != null && lo >= MIN_TASK_MINUTES && hi <= MAX_TASK_MINUTES && lo <= hi) return { min: lo, max: hi, median: Math.min(hi, Math.max(lo, m)), source: 'ia', confidence: null };
  return { min: null, max: null, median: m, source: 'ia', confidence: null };
}

// Lit « 20-45 | 10,10,15 » ou fragments (min-max puis étapes séparées par , + ; ou espaces). Tolérant, null si inexploitable.
function parseEstimateText(rangeText, stepsText) {
  const m = /(\d{1,3})\s*(?:-|–|à|a|to)\s*(\d{1,3})/i.exec(String(rangeText || ''));
  if (!m) return null;
  const steps = String(stepsText || '').split(/[^0-9]+/).filter(Boolean).map(Number);
  return validateEstimate({ min: Number(m[1]), max: Number(m[2]), steps });
}

// task : { medianMinutes, maxMinutes, ... } (ligne sub_project_items) ou null. fallback : nombre ou fonction (estimation historique).
function taskMinutes(task, fallback) {
  const med = task && pos(task.medianMinutes);
  if (med) return med;
  const fb = pos(call(fallback));
  return fb || DEFAULT_TASK_MINUTES;
}
// Borne haute (alertes de surcharge) : max stocké, sinon la même valeur que taskMinutes.
function taskMaxMinutes(task, fallback) {
  const mx = task && pos(task.maxMinutes);
  return mx || taskMinutes(task, fallback);
}

// Écriture : colonnes additives nullables ; jamais bloquant.
// ctx (facultatif) : { userId, activityId, categoryKey } d'une tâche NOUVELLE proposée par l'IA : sa durée est corrigée en silence par le facteur du Chrono (dureefacteur.js, borné 0,5 à 3, 1 sans données) ; l'estimation d'origine est gardée.
function store(db, itemId, est, source, ctx) {
  if (!est || !itemId) return false;
  try {
    const src = source || est.source || 'ia';
    let out = est, raw = null;
    if (ctx && ctx.userId && ctx.activityId != null && /^ia/.test(src)) {
      try { const f = require('./dureefacteur').factorFor(ctx.userId, ctx.activityId, ctx.categoryKey || null); if (f.factor !== 1) { out = require('./dureefacteur').scaleEstimate(est, f.factor); raw = est.median; } } catch (e) { out = est; raw = null; } // jamais bloquant
    }
    db.prepare('UPDATE sub_project_items SET minMinutes = ?, medianMinutes = ?, maxMinutes = ?, durSource = ?, durConfidence = ?, rawMedianMinutes = ? WHERE id = ?')
      .run(out.min, out.median, out.max, src, est.confidence == null ? null : est.confidence, raw, itemId);
    return true;
  } catch (e) { return false; }
}
function readMany(db, ids) {
  const out = {};
  const list = (ids || []).map(Number).filter(Number.isFinite);
  for (let i = 0; i < list.length; i += 400) {
    const part = list.slice(i, i + 400);
    try { db.prepare(`SELECT id, ${COLUMNS} FROM sub_project_items WHERE id IN (${part.map(() => '?').join(',')})`).all(...part).forEach((r) => { out[r.id] = r; }); } catch (e) { /* colonnes absentes : durée par défaut */ }
  }
  return out;
}

module.exports = { DEFAULT_TASK_MINUTES, MIN_TASK_MINUTES, MAX_TASK_MINUTES, MAX_STEPS, COLUMNS, validateEstimate, fromProposal, parseEstimateText, taskMinutes, taskMaxMinutes, store, readMany };
