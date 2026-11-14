// MESSAGE de dépassement ou de sous-utilisation (décision d'Émilien, 14 nov. 2026) : après 2 semaines de rodage depuis le début de l'objectif, si le Chrono réel a dépassé OU est resté en dessous des heures prévues
// de plus de 20 % du total hebdomadaire, QUATRE semaines de suite dans le même sens, un pop-up simple propose de redéfinir le temps. Aucun seuil en heures. « Non » = rien ne change, et la question n'est pas reposée
// pendant 4 semaines pour cet objectif (table objectif_ecart_refus). Rien n'est écrit par l'évaluation.
// CHOIX (le Chrono est par CATÉGORIE, pas par objectif) : l'unité de comparaison est le PÔLE (ses secteurs compris), ou l'activité quand elle n'a aucun pôle ; le Chrono de l'unité est comparé à la SOMME des heures prévues
// (hoursPerWeek) des objectifs de l'unité actifs la semaine considérée (un enfant remplace son parent pendant sa durée : pas de double comptage ; un objectif compte après 14 jours de rodage) ; le pop-up est rattaché à
// l'objectif de l'unité qui demande le plus d'heures. Un objectif d'activité qui a des pôles n'est pas évalué (ses heures sont portées par ses enfants).
const db = require('../db');

const WEEKS = 4, RODAGE_DAYS = 14, THRESHOLD = 0.2, MUTE_DAYS = 28;
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * DAY);
const mondayOf = (d) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return addDays(d, -((w + 6) % 7)); };
const parseMeta = (r) => { try { return JSON.parse((r && r.metaJson) || '{}'); } catch (e) { return {}; } };

db.exec(`CREATE TABLE IF NOT EXISTS objectif_ecart_refus (
  userId TEXT NOT NULL,
  objectifId INTEGER NOT NULL,
  until TEXT NOT NULL,
  PRIMARY KEY (userId, objectifId)
)`);

// Les 4 dernières semaines COMPLÈTES (lundi à dimanche) avant la semaine en cours : [{ start, end }] de la plus ancienne à la plus récente.
function lastWeeks(today) {
  const m = mondayOf(today), out = [];
  for (let i = WEEKS; i >= 1; i -= 1) out.push({ start: addDays(m, -7 * i), end: addDays(m, -7 * i + 6) });
  return out;
}
// PUR. Évalue une unité : weeks = [{ planned (minutes), real (minutes) }] sur 4 semaines. -> null ou { direction: 'depasse' | 'sous', pct, deltaMin (moyenne par semaine, signée), realMin, plannedMin }.
function evaluateWeeks(weeks) {
  if (!Array.isArray(weeks) || weeks.length !== WEEKS || weeks.some((w) => !(w.planned > 0))) return null; // pas d'heures prévues une semaine : rien à comparer
  const d = weeks.map((w) => (w.real - w.planned) / w.planned);
  const over = d.every((x) => x > THRESHOLD), under = d.every((x) => x < -THRESHOLD);
  if (!over && !under) return null; // pas quatre semaines de suite dans le même sens, de plus de 20 %
  const P = weeks.reduce((a, w) => a + w.planned, 0), R = weeks.reduce((a, w) => a + w.real, 0);
  return { direction: over ? 'depasse' : 'sous', pct: Math.round(Math.abs(R - P) / P * 100), deltaMin: Math.round((R - P) / WEEKS), realMin: Math.round(R / WEEKS), plannedMin: Math.round(P / WEEKS) };
}
function keysOf(activityId, poleKey) {
  if (!poleKey) return null;
  const goals = require('./goals');
  return [poleKey].concat((goals.secteursForPole(activityId, poleKey) || []).map((s) => s.key));
}
function realIn(userId, activityId, keys, start, end) {
  let q = 'SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ?', args = [userId, Number(activityId), start, end];
  if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
  return db.prepare(q).get(...args).s / 60;
}
// Évaluation de tous les objectifs du membre : liste de { objectifId, titre, activityId, activite, poleKey, pole, direction, pct, deltaMin, realMin, plannedMin } (refusés « Non » exclus pendant 28 jours).
function evaluate(userId, today) {
  today = today || require('./dates').userToday();
  const goals = require('./goals'), weeks = lastWeeks(today), out = [];
  const rows = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND isMacro = 0').all(userId).filter((r) => { const m = parseMeta(r); return !m.abandoned && Number(m.hoursPerWeek) > 0; });
  const units = new Map();
  rows.forEach((r) => {
    const poles = goals.categoriesForActivity(r.activityId) || [];
    let pole = null;
    if (poles.length) { const k = r.poleKey || (r.categoryKey ? goals.resolveToPole(r.activityId, r.categoryKey) : null); if (!k) return; pole = k; } // objectif d'activité qui a des pôles : porté par ses enfants
    const key = r.activityId + '|' + (pole || '');
    if (!units.has(key)) units.set(key, { activityId: r.activityId, pole, rows: [] });
    units.get(key).rows.push(r);
  });
  units.forEach((u) => {
    const ws = weeks.map((w) => {
      const active = u.rows.filter((r) => r.startDate <= w.end && r.endDate >= w.start && addDays(r.startDate, RODAGE_DAYS) <= w.start);
      const kept = active.filter((r) => !active.some((c) => c.parentId === r.id)); // un enfant remplace son parent pendant sa durée
      return { planned: kept.reduce((a, r) => a + parseMeta(r).hoursPerWeek * 60, 0), real: realIn(userId, u.activityId, keysOf(u.activityId, u.pole), w.start, w.end) };
    });
    const ev = evaluateWeeks(ws); if (!ev) return;
    const current = u.rows.filter((r) => r.endDate >= today).sort((a, b) => parseMeta(b).hoursPerWeek - parseMeta(a).hoursPerWeek || b.id - a.id)[0]; // l'objectif de l'unité qui demande le plus d'heures
    if (!current) return;
    const muted = db.prepare('SELECT until FROM objectif_ecart_refus WHERE userId = ? AND objectifId = ?').get(userId, current.id);
    if (muted && muted.until >= today) return;
    const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(u.activityId) || {};
    let pole = null; try { pole = u.pole ? goals.categoryLabelFor(u.activityId, u.pole) : null; } catch (e) { pole = null; }
    out.push(Object.assign({ objectifId: current.id, titre: current.title, activityId: u.activityId, activite: act.name || '', poleKey: u.pole, pole }, ev));
  });
  return out;
}
// « Non » : la question n'est pas reposée pendant 4 semaines pour cet objectif.
function refuser(userId, objectifId, today) {
  const r = db.prepare('SELECT id FROM user_objectives WHERE id = ? AND userId = ?').get(Number(objectifId), userId);
  if (!r) throw Object.assign(new Error('Objectif introuvable.'), { statusCode: 404 });
  db.prepare('INSERT INTO objectif_ecart_refus (userId, objectifId, until) VALUES (?, ?, ?) ON CONFLICT(userId, objectifId) DO UPDATE SET until = excluded.until').run(userId, r.id, addDays(today || require('./dates').userToday(), MUTE_DAYS));
  return { ok: true };
}

module.exports = { WEEKS, RODAGE_DAYS, THRESHOLD, MUTE_DAYS, lastWeeks, evaluateWeeks, evaluate, refuser };
