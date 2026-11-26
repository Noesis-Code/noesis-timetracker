// ÉCART DU CHRONO (décision d'Émilien, 14-15 nov. 2026) : dépassement = cause « Réel » de la fenêtre « Ajuste ton temps » ; sous-utilisation = rien (décision du 17 nov. 2026)
// (server/lib/objectifs-ajuste.js). L'ancienne table objectif_ecart_refus n'est plus lue : ses données restent.
// Après 2 semaines de rodage depuis le début de l'objectif, si le Chrono réel a dépassé OU est resté en dessous des heures prévues
// de plus de 20 % du total hebdomadaire, QUATRE semaines de suite dans le même sens. Aucun seuil en heures. Rien n'est écrit par l'évaluation.
// RÈGLE (Émilien, 14 nov. 2026) : une catégorie (secteur, pôle ou activité) n'a qu'UN objectif actif à la fois : l'objectif EST la catégorie sur une période ; le Chrono de la catégorie pendant la période de l'objectif est le Chrono de l'objectif.
// On compare donc, semaine par semaine, le Chrono de la catégorie de l'objectif (un pôle cumule ses secteurs, l'activité cumule tout) à ses heures prévues (hoursPerWeek).
const db = require('../db');

const WEEKS = 4, RODAGE_DAYS = 14, THRESHOLD = 0.2;
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
function lastWeeks(today, n) {
  const m = mondayOf(today), out = [];
  for (let i = n || WEEKS; i >= 1; i -= 1) out.push({ start: addDays(m, -7 * i), end: addDays(m, -7 * i + 6) });
  return out;
}
// PUR. Évalue une unité : weeks = [{ planned (minutes), real (minutes) }] sur 4 semaines. -> null ou { direction: 'depasse' | 'sous', pct, deltaMin (moyenne par semaine, signée), realMin, plannedMin }.
// opts (stratégie de la catégorie, règle « chrono-ecart ») : { threshold (fraction), weeks } ; sans opts : les défauts de Noèsis ci-dessus.
function evaluateWeeks(weeks, opts) {
  const TH = opts && opts.threshold != null ? opts.threshold : THRESHOLD, N = (opts && opts.weeks) || WEEKS;
  if (!Array.isArray(weeks) || weeks.length !== N || weeks.some((w) => !(w.planned > 0))) return null; // pas d'heures prévues une semaine : rien à comparer
  const d = weeks.map((w) => (w.real - w.planned) / w.planned);
  const over = d.every((x) => x > TH), under = d.every((x) => x < -TH);
  if (!over && !under) return null; // pas quatre semaines de suite dans le même sens, de plus de 20 %
  const P = weeks.reduce((a, w) => a + w.planned, 0), R = weeks.reduce((a, w) => a + w.real, 0);
  return { direction: over ? 'depasse' : 'sous', pct: Math.round(Math.abs(R - P) / P * 100), deltaMin: Math.round((R - P) / N), realMin: Math.round(R / N), plannedMin: Math.round(P / N) };
}
// Clés du Chrono d'une catégorie : un secteur est seul ; un pôle cumule ses secteurs ; l'activité (null) cumule tout.
function keysOf(o) {
  const goals = require('./goals');
  if ((o.level || 'activite') === 'secteur' && o.categoryKey) return [o.categoryKey];
  if (o.level === 'pole' && o.poleKey) return [o.poleKey].concat((goals.secteursForPole(o.activityId, o.poleKey) || []).map((x) => x.key));
  return null;
}
function realIn(userId, activityId, keys, start, end) {
  let q = 'SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ? AND durationSeconds >= 60', args = [userId, Number(activityId), start, end];
  if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
  return db.prepare(q).get(...args).s / 60;
}
// Évaluation de tous les objectifs actifs du membre : { objectifId, titre, activityId, activite, level, poleKey, categoryKey, categorie, direction, pct, deltaMin, realMin, plannedMin }.
function evaluate(userId, today) {
  today = today || require('./dates').userToday();
  const goals = require('./goals'), CS = require('./categorie-strategie'), out = [];
  db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND isMacro = 0 AND endDate >= ? AND startDate <= ?').all(userId, today, today).forEach((o) => {
    const m = parseMeta(o), hpw = Number(m.hoursPerWeek); if (m.abandoned || !(hpw > 0)) return;
    const reg = CS.regleActive(o.activityId, CS.keyOfObjective(o), 'chrono-ecart'); if (!reg.actif) return; // règle désactivée dans la stratégie de la catégorie
    const nw = Math.max(1, reg.duree), weeks = lastWeeks(today, nw);
    const ws = weeks.map((w) => ({ planned: o.startDate <= w.end && o.endDate >= w.start && addDays(o.startDate, RODAGE_DAYS) <= w.start ? hpw * 60 : 0, real: realIn(userId, o.activityId, keysOf(o), w.start, w.end) }));
    const ev = evaluateWeeks(ws, { threshold: reg.seuil / 100, weeks: nw }); if (!ev) return;
    const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(o.activityId) || {};
    let cat = null; try { const k = o.level === 'secteur' ? o.categoryKey : o.level === 'pole' ? o.poleKey : null; cat = k ? goals.categoryLabelFor(o.activityId, k) : null; } catch (e) { cat = null; }
    out.push(Object.assign({ objectifId: o.id, titre: o.title, activityId: o.activityId, activite: act.name || '', level: o.level || 'activite', poleKey: o.poleKey || null, categoryKey: o.categoryKey || null, categorie: cat }, ev));
  });
  return out;
}
module.exports = { WEEKS, RODAGE_DAYS, THRESHOLD, lastWeeks, evaluateWeeks, evaluate };
