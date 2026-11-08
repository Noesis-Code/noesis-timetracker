// Partage des tâches récurrentes d'une activité partagée (statistiques de groupe de la Feuille de route, 8 nov. 2026).
// SANS IA : répartition déterministe qui équilibre les heures par semaine selon le temps VOULU de chaque membre.
//  - « Tâches récurrentes » : combien de fois chaque membre a fait chaque tâche récurrente (comptes seulement) ;
//  - « Partager les tâches » : une ligne par tâche récurrente ouverte (h / sem. = fréquence x durée), responsable proposé,
//    puis Voulu / Total par membre. Rien ne change sans « Valider le partage » (geste explicite) : le responsable prévu
//    (plannedUserId) de l'occurrence ouverte est alors posé, et les occurrences suivantes le gardent (spawnNextOccurrence).
const db = require('../db');
require('./taskrecurrence'); // colonnes recurEvery / recurUnit
const goals = require('./goals');
const insights = require('./statsinsights');

const DEFAULT_OCCURRENCE_MINUTES = 30; // même durée par défaut que les cartes de statistiques (DEFAULT_TASK_MINUTES)
const MAX_MINUTES = 7 * 24 * 60;

db.exec(`CREATE TABLE IF NOT EXISTS task_share_wanted (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, minutes INTEGER NOT NULL,
  PRIMARY KEY (activityId, userId)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS task_share_minutes (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE, seriesKey TEXT NOT NULL, minutes INTEGER NOT NULL,
  PRIMARY KEY (activityId, seriesKey)
)`);

function norm(label) { return String(label || '').trim().toLowerCase(); }
function seriesKey(subProjectId, label) { return subProjectId + '|' + norm(label); }
function todayLocal() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function localDay(ts) { if (!ts) return null; const d = new Date(ts); return isNaN(d) ? null : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// Occurrences par semaine d'une récurrence { every, unit } (taskrecurrence).
function perWeek(every, unit) {
  const e = Math.max(1, Number(every) || 1);
  switch (unit) {
    case 'day': return 7 / e;
    case 'week': return 1 / e;
    case 'month': return 12 / 52 / e;
    case 'workday': return 5 / e;
    case 'perweek': return e;
    case 'permonth': return e * 12 / 52;
    case 'peryear': return e / 52;
    default: return 0;
  }
}

function members(activityId) {
  return db.prepare(`SELECT u.id AS userId, u.name AS name, u.color AS color FROM activity_members am JOIN users u ON u.id = am.userId
    WHERE am.activityId = ? ORDER BY am.joinedAt, u.id`).all(activityId);
}

// Tâches récurrentes de l'activité : l'occurrence OUVERTE porte la récurrence (une seule à la fois) ; les occurrences faites
// sont les tâches cochées du même sous-projet au même libellé.
function openSeries(activityId) {
  const rows = db.prepare(`SELECT i.id, i.label, i.subProjectId, i.plannedUserId, i.dueDate, i.recurEvery, i.recurUnit
    FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND sp.goalCategory IS NOT NULL AND i.done = 0 AND i.recurUnit IS NOT NULL
    ORDER BY i.position, i.id`).all(activityId);
  const seen = new Set();
  return rows.filter((r) => { const k = seriesKey(r.subProjectId, r.label); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((r) => ({ id: r.id, label: r.label, key: seriesKey(r.subProjectId, r.label), subProjectId: r.subProjectId, userId: r.plannedUserId || null, dueDate: r.dueDate || null, perWeek: perWeek(r.recurEvery, r.recurUnit) }));
}

// Tableau « Tâches récurrentes » : lignes = tâches récurrentes, colonnes = membres, valeur = occurrences faites dans la portée.
function recurringTable(activityId, scope) {
  const range = insights.scopeRange(scope);
  const ms = members(activityId);
  const series = openSeries(activityId);
  const byKey = {}; series.forEach((s) => { byKey[s.key] = {}; });
  db.prepare(`SELECT i.label, i.subProjectId, i.doneBy, i.plannedUserId, i.doneAt FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND i.done = 1`).all(activityId).forEach((r) => {
    const row = byKey[seriesKey(r.subProjectId, r.label)]; if (!row) return;
    const day = localDay(r.doneAt); if (!day) return;
    if ((range.start && day < range.start) || (range.end && day > range.end)) return;
    const who = r.doneBy || r.plannedUserId; if (!who) return;
    row[who] = (row[who] || 0) + 1;
  });
  return {
    scope: scope === 'all' || scope === 'period' || scope === 'week' ? scope : 'year',
    members: ms.map((m) => ({ userId: m.userId, name: m.name, color: m.color || null })),
    rows: series.map((s) => ({ id: s.id, label: s.label, counts: ms.map((m) => byKey[s.key][m.userId] || 0) })),
  };
}

// Répartition SANS IA. tasks : [{ id, minutes, userId (actuel) }] ; people : [{ userId, wanted }].
// Plus grosse tâche d'abord, donnée au membre le plus loin de son temps voulu (voulu - déjà donné) ; égalité : le moins chargé,
// puis le responsable actuel, puis l'ordre des membres. Même entrée => même sortie.
function share(tasks, people) {
  const given = {}; people.forEach((p) => { given[p.userId] = 0; });
  const order = tasks.map((t, i) => ({ t, i })).sort((a, b) => (b.t.minutes - a.t.minutes) || (a.i - b.i));
  const out = {};
  if (!people.length) return out;
  order.forEach(({ t }) => {
    let best = null;
    people.forEach((p, k) => {
      const c = { p, k, gap: p.wanted - given[p.userId], load: given[p.userId], cur: t.userId === p.userId ? 0 : 1 };
      if (!best || c.gap > best.gap || (c.gap === best.gap && (c.load < best.load || (c.load === best.load && (c.cur < best.cur || (c.cur === best.cur && c.k < best.k)))))) best = c;
    });
    out[t.id] = best.p.userId;
    given[best.p.userId] += t.minutes;
  });
  return out;
}

// Fenêtre du partage : semaine prochaine (lundi à dimanche) ou période suivante (28 jours à partir de lundi prochain).
function windowFor(mode) {
  const start = goals.addDays(goals.mostRecentMonday(todayLocal()), 7);
  return { mode: mode === 'period' ? 'period' : 'week', start, end: goals.addDays(start, mode === 'period' ? 27 : 6) };
}

// Proposition affichée dans « Partager les tâches » : tâches dont l'occurrence ouverte tombe dans la fenêtre (ou avant, ou sans date).
function proposal(activityId, mode) {
  const win = windowFor(mode);
  const ms = members(activityId);
  const saved = {}; db.prepare('SELECT seriesKey, minutes FROM task_share_minutes WHERE activityId = ?').all(activityId).forEach((r) => { saved[r.seriesKey] = r.minutes; });
  const tasks = openSeries(activityId).filter((s) => !s.dueDate || s.dueDate <= win.end).map((s) => ({
    id: s.id, label: s.label, currentUserId: s.userId,
    minutes: saved[s.key] != null ? saved[s.key] : Math.max(10, Math.round(s.perWeek * DEFAULT_OCCURRENCE_MINUTES / 10) * 10),
  }));
  const total = tasks.reduce((a, t) => a + t.minutes, 0);
  const wantedRows = {}; db.prepare('SELECT userId, minutes FROM task_share_wanted WHERE activityId = ?').all(activityId).forEach((r) => { wantedRows[r.userId] = r.minutes; });
  const even = ms.length ? Math.round(total / ms.length / 30) * 30 : 0; // par défaut : parts égales, à la demi-heure
  const people = ms.map((m) => ({ userId: m.userId, name: m.name, color: m.color || null, wanted: wantedRows[m.userId] != null ? wantedRows[m.userId] : even }));
  // Un responsable déjà posé (partage validé ou choix manuel) n'est jamais changé en silence : seules les tâches SANS responsable
  // sont réparties, en tenant compte du temps déjà donné. Le membre peut tout changer dans la fenêtre avant de valider.
  const memberIds = new Set(ms.map((m) => m.userId));
  const fixed = tasks.filter((t) => t.currentUserId && memberIds.has(t.currentUserId));
  const already = {}; fixed.forEach((t) => { already[t.currentUserId] = (already[t.currentUserId] || 0) + t.minutes; });
  const pick = share(tasks.filter((t) => !fixed.includes(t)).map((t) => ({ id: t.id, minutes: t.minutes, userId: null })),
    people.map((p) => ({ userId: p.userId, wanted: p.wanted - (already[p.userId] || 0) })));
  fixed.forEach((t) => { pick[t.id] = t.currentUserId; });
  return { mode: win.mode, start: win.start, end: win.end, members: people, tasks: tasks.map((t) => Object.assign(t, { userId: pick[t.id] || null })) };
}

function bad(msg) { return Object.assign(new Error(msg), { statusCode: 400 }); }
function minutesOf(v) { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0 || n > MAX_MINUTES) throw bad('Durée invalide.'); return n; }

// « Valider le partage » : temps voulus, durées par semaine et responsables. Seulement des membres et des tâches récurrentes ouvertes de l'activité.
function save(activityId, body) {
  const ms = new Set(members(activityId).map((m) => m.userId));
  const series = {}; openSeries(activityId).forEach((s) => { series[s.id] = s; });
  const wanted = body && typeof body.wanted === 'object' && body.wanted ? body.wanted : {};
  const tasks = Array.isArray(body && body.tasks) ? body.tasks : [];
  Object.keys(wanted).forEach((u) => { if (!ms.has(u)) throw bad('Membre inconnu.'); minutesOf(wanted[u]); });
  tasks.forEach((t) => {
    if (!t || !series[Number(t.id)]) throw bad('Tâche récurrente inconnue.');
    if (t.userId != null && !ms.has(String(t.userId))) throw bad('Membre inconnu.');
    if (t.minutes != null) minutesOf(t.minutes);
  });
  const upW = db.prepare('INSERT INTO task_share_wanted (activityId, userId, minutes) VALUES (?, ?, ?) ON CONFLICT(activityId, userId) DO UPDATE SET minutes = excluded.minutes');
  const upM = db.prepare('INSERT INTO task_share_minutes (activityId, seriesKey, minutes) VALUES (?, ?, ?) ON CONFLICT(activityId, seriesKey) DO UPDATE SET minutes = excluded.minutes');
  const setU = db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ? AND done = 0');
  db.exec('BEGIN');
  try {
    Object.keys(wanted).forEach((u) => upW.run(activityId, u, minutesOf(wanted[u])));
    tasks.forEach((t) => {
      const s = series[Number(t.id)];
      if (t.minutes != null) upM.run(activityId, s.key, minutesOf(t.minutes));
      if (t.userId !== undefined) setU.run(t.userId ? String(t.userId) : null, s.id);
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ok: true, updated: tasks.length };
}

module.exports = { perWeek, share, recurringTable, proposal, save, windowFor };
