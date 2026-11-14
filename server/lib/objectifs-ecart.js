// MESSAGE de dépassement ou de sous-utilisation (décision d'Émilien, 14 nov. 2026) : après 2 semaines de rodage depuis le début de l'objectif, si le Chrono réel a dépassé OU est resté en dessous des heures prévues
// de plus de 20 % du total hebdomadaire, QUATRE semaines de suite dans le même sens, un pop-up simple propose de redéfinir le temps. Aucun seuil en heures. « Non » = rien ne change, et la question n'est pas reposée
// pendant 4 semaines pour cet objectif (table objectif_ecart_refus). Rien n'est écrit par l'évaluation.
// RÈGLE (Émilien, 14 nov. 2026) : une catégorie (secteur, pôle ou activité) n'a qu'UN objectif actif à la fois : l'objectif EST la catégorie sur une période ; le Chrono de la catégorie pendant la période de l'objectif est le Chrono de l'objectif.
// On compare donc, semaine par semaine, le Chrono de la catégorie de l'objectif (un pôle cumule ses secteurs, l'activité cumule tout) à ses heures prévues (hoursPerWeek).
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
// Clés du Chrono d'une catégorie : un secteur est seul ; un pôle cumule ses secteurs ; l'activité (null) cumule tout.
function keysOf(o) {
  const goals = require('./goals');
  if ((o.level || 'activite') === 'secteur' && o.categoryKey) return [o.categoryKey];
  if (o.level === 'pole' && o.poleKey) return [o.poleKey].concat((goals.secteursForPole(o.activityId, o.poleKey) || []).map((x) => x.key));
  return null;
}
function realIn(userId, activityId, keys, start, end) {
  let q = 'SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ?', args = [userId, Number(activityId), start, end];
  if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
  return db.prepare(q).get(...args).s / 60;
}
// Évaluation de tous les objectifs actifs du membre : { objectifId, titre, activityId, activite, level, poleKey, categoryKey, categorie, direction, pct, deltaMin, realMin, plannedMin } (« Non » exclus pendant 28 jours).
function evaluate(userId, today) {
  today = today || require('./dates').userToday();
  const goals = require('./goals'), weeks = lastWeeks(today), out = [];
  db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND isMacro = 0 AND endDate >= ? AND startDate <= ?').all(userId, today, today).forEach((o) => {
    const m = parseMeta(o), hpw = Number(m.hoursPerWeek); if (m.abandoned || !(hpw > 0)) return;
    const ws = weeks.map((w) => ({ planned: o.startDate <= w.end && o.endDate >= w.start && addDays(o.startDate, RODAGE_DAYS) <= w.start ? hpw * 60 : 0, real: realIn(userId, o.activityId, keysOf(o), w.start, w.end) }));
    const ev = evaluateWeeks(ws); if (!ev) return;
    const muted = db.prepare('SELECT until FROM objectif_ecart_refus WHERE userId = ? AND objectifId = ?').get(userId, o.id);
    if (muted && muted.until >= today) return;
    const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(o.activityId) || {};
    let cat = null; try { const k = o.level === 'secteur' ? o.categoryKey : o.level === 'pole' ? o.poleKey : null; cat = k ? goals.categoryLabelFor(o.activityId, k) : null; } catch (e) { cat = null; }
    out.push(Object.assign({ objectifId: o.id, titre: o.title, activityId: o.activityId, activite: act.name || '', level: o.level || 'activite', poleKey: o.poleKey || null, categoryKey: o.categoryKey || null, categorie: cat }, ev));
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
