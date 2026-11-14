// ALLOCATION d'heures par catégorie (12 nov. 2026, décision d'Émilien) : chaque catégorie de l'arbre (activité, pôle, secteur) a une capacité ALLOUÉE en heures par semaine, saisie dans l'ARBRE SEUL, qui vaut pour toutes
// les périodes SUIVANTES jusqu'à ce qu'on la change (5 h en 2027, 8 h dès 2028, 3 h dès 2029 : 2030 et après = 3 h). Elle remplace l'ancienne capacité manuelle (migration non destructive : l'ancienne valeur devient
// l'allocation de départ, la colonne d'origine n'est jamais effacée). Les heures d'un objectif (metaJson.hoursPerWeek, « Objectifs ») sont une autre donnée : l'Alloué est l'intention, l'Objectifs la somme des rythmes.
// Modèle : une ligne = une valeur posée à une DATE (début de la ligne de l'arbre où elle a été saisie) ; l'allocation d'une date = la dernière valeur posée à une date <= celle-ci (héritage vers l'avant, jamais vers l'arrière).
const db = require('../db');

const MAX_MIN = 168 * 60;
const START = '2000-01-01'; // allocation de départ issue de l'ancienne capacité
const LEVELS = ['activite', 'pole', 'secteur'];
const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code || 400 });
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

db.exec(`CREATE TABLE IF NOT EXISTS hour_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  poleKey TEXT NOT NULL DEFAULT '',
  categoryKey TEXT NOT NULL DEFAULT '',
  fromDate TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(userId, activityId, level, poleKey, categoryKey, fromDate)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_hour_allocations_cat ON hour_allocations(userId, activityId, level, poleKey, categoryKey, fromDate)');
db.exec('CREATE TABLE IF NOT EXISTS hour_allocations_migration (name TEXT PRIMARY KEY, doneAt TEXT NOT NULL)');

// Migration NON DESTRUCTIVE et idempotente (une seule fois, marquée) : la capacité manuelle d'une personne qui n'a qu'UNE activité active devient l'allocation de départ de cette activité ;
// avec plusieurs activités elle ne peut pas être partagée sans deviner : elle reste lue comme total de la personne (weekplanner), aucune allocation n'est inventée. La colonne users.weeklyCapacityMinutes n'est jamais modifiée.
function migrateLegacy() {
  try {
    if (db.prepare("SELECT 1 FROM hour_allocations_migration WHERE name = 'capacite-manuelle'").get()) return 0;
    let n = 0;
    db.prepare('SELECT id, weeklyCapacityMinutes AS m FROM users WHERE weeklyCapacityMinutes IS NOT NULL AND weeklyCapacityMinutes > 0').all().forEach((u) => {
      const acts = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1').all(u.id);
      if (acts.length !== 1) return;
      const r = db.prepare("INSERT OR IGNORE INTO hour_allocations (userId, activityId, level, poleKey, categoryKey, fromDate, minutes, createdAt) VALUES (?, ?, 'activite', '', '', ?, ?, ?)").run(u.id, acts[0].id, START, Math.min(MAX_MIN, u.m), new Date().toISOString());
      n += r.changes;
    });
    db.prepare("INSERT OR IGNORE INTO hour_allocations_migration (name, doneAt) VALUES ('capacite-manuelle', ?)").run(new Date().toISOString());
    return n;
  } catch (e) { console.warn('[allocation] migration de la capacité manuelle :', e && e.message); return 0; }
}
migrateLegacy();

const keyOf = (level, poleKey, categoryKey) => ({ pk: level === 'activite' ? '' : String(poleKey || ''), ck: level === 'secteur' ? String(categoryKey || '') : '' });
function inScope(userId, activityId) {
  const a = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.id = ? AND a.active = 1').get(userId, Number(activityId));
  if (!a) throw err('Choisis une de tes activités.');
  return a;
}
function checkCat(userId, spec) {
  inScope(userId, spec.activityId);
  if (!LEVELS.includes(spec.level)) throw err('Niveau invalide.');
  const goals = require('./goals'), poles = goals.categoriesForActivity(Number(spec.activityId)) || [];
  if (spec.level !== 'activite' && !poles.some((p) => p.key === spec.poleKey)) throw err('Choisis un pôle de cette activité.');
  if (spec.level === 'secteur' && !(goals.secteursForPole(Number(spec.activityId), spec.poleKey) || []).some((s) => s.key === spec.categoryKey)) throw err('Choisis un secteur de ce pôle.');
}

// Allocation d'une catégorie à une DATE : { minutes, fromDate, own } (own = valeur posée exactement à cette date) ; minutes null si rien n'a jamais été posé.
function effective(userId, spec, date) {
  const k = keyOf(spec.level, spec.poleKey, spec.categoryKey);
  const r = db.prepare('SELECT minutes, fromDate FROM hour_allocations WHERE userId = ? AND activityId = ? AND level = ? AND poleKey = ? AND categoryKey = ? AND fromDate <= ? ORDER BY fromDate DESC LIMIT 1')
    .get(userId, Number(spec.activityId), spec.level, k.pk, k.ck, date);
  return r ? { minutes: r.minutes, fromDate: r.fromDate, own: r.fromDate === date } : { minutes: null, fromDate: null, own: false };
}
// Pose (ou retire, minutes = null) la valeur d'une catégorie à une date : vaut ensuite pour toutes les dates suivantes. Retirer une valeur posée = la catégorie reprend la précédente.
function set(userId, spec, fromDate, minutes) {
  checkCat(userId, spec);
  if (!isDay(fromDate)) throw err('Date invalide.');
  const k = keyOf(spec.level, spec.poleKey, spec.categoryKey), act = Number(spec.activityId);
  if (minutes === null || minutes === undefined || minutes === '') {
    db.prepare('DELETE FROM hour_allocations WHERE userId = ? AND activityId = ? AND level = ? AND poleKey = ? AND categoryKey = ? AND fromDate = ?').run(userId, act, spec.level, k.pk, k.ck, fromDate);
  } else {
    const v = Math.round(Number(minutes));
    if (!Number.isFinite(v) || v < 0 || v > MAX_MIN) throw err('Heures invalides : au plus 168 h par semaine.');
    db.prepare('INSERT INTO hour_allocations (userId, activityId, level, poleKey, categoryKey, fromDate, minutes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(userId, activityId, level, poleKey, categoryKey, fromDate) DO UPDATE SET minutes = excluded.minutes')
      .run(userId, act, spec.level, k.pk, k.ck, fromDate, v, new Date().toISOString());
  }
  return effective(userId, spec, fromDate);
}
// Colonne d'une catégorie sur plusieurs lignes (dates de début de ligne, croissantes) : l'allocation de chaque ligne et si elle est RÉGLÉE sur cette ligne (violet) ou héritée (gris).
function column(userId, spec, dates) {
  checkCat(userId, spec);
  return (Array.isArray(dates) ? dates.slice(0, 80) : []).filter(isDay).map((d) => Object.assign({ date: d }, effective(userId, spec, d)));
}
// Heures de l'ARBRE par ligne : le total des catégories affichées en colonnes (activités, ou pôles d'une activité, ou secteurs d'un pôle) ; réglé = au moins une valeur posée sur cette ligne.
// spec : { activityIds?, activityId, level ('activite' | 'pole' | 'secteur' : niveau des colonnes), poleKey } ; cols : catégories des colonnes.
function colsOf(userId, spec) {
  const goals = require('./goals');
  if (spec.level === 'activite') {
    const ids = (Array.isArray(spec.activityIds) && spec.activityIds.length ? spec.activityIds : db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1').all(userId).map((x) => x.id)).map(Number);
    return ids.map((id) => ({ activityId: id, level: 'activite' }));
  }
  inScope(userId, spec.activityId);
  const act = Number(spec.activityId);
  if (spec.level === 'pole') return (goals.categoriesForActivity(act) || []).map((p) => ({ activityId: act, level: 'pole', poleKey: p.key }));
  return (goals.secteursForPole(act, spec.poleKey) || []).map((s) => ({ activityId: act, level: 'secteur', poleKey: spec.poleKey, categoryKey: s.key }));
}
const DAY = 86400000;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
// MOYENNE par semaine d'une catégorie sur une ligne [start, end] : l'allocation change en cours de ligne (une ligne de 5 ans) ; chaque valeur compte au prorata de ses jours, les jours sans valeur ne comptent pas.
// own = une valeur a été posée DANS la ligne (violet) ; sinon la ligne reprend ce qui précède (gris).
function average(userId, spec, start, end) {
  const k = keyOf(spec.level, spec.poleKey, spec.categoryKey), act = Number(spec.activityId);
  const cuts = db.prepare('SELECT fromDate, minutes FROM hour_allocations WHERE userId = ? AND activityId = ? AND level = ? AND poleKey = ? AND categoryKey = ? AND fromDate > ? AND fromDate <= ? ORDER BY fromDate')
    .all(userId, act, spec.level, k.pk, k.ck, start, end);
  let cur = effective(userId, spec, start), from = start, sum = 0, days = 0;
  const seg = (to) => { const d = daysBetween(from, to); if (cur.minutes != null && d > 0) { sum += cur.minutes * d; days += d; } };
  cuts.forEach((c) => { seg(c.fromDate); from = c.fromDate; cur = { minutes: c.minutes }; });
  seg(addDays(end, 1));
  const own = cur.own === true || cuts.length > 0 || !!db.prepare('SELECT 1 FROM hour_allocations WHERE userId = ? AND activityId = ? AND level = ? AND poleKey = ? AND categoryKey = ? AND fromDate = ?').get(userId, act, spec.level, k.pk, k.ck, start);
  return { minutes: days ? Math.round(sum / days) : null, own };
}
// rows : [{ start, end }] (une ligne de l'arbre) ; compatible avec une simple liste de dates (ligne d'un jour).
const rowsOf = (input) => (Array.isArray(input) ? input.slice(0, 80) : []).map((r) => (typeof r === 'string' ? { start: r, end: r } : { start: r && r.start, end: r && r.end })).filter((r) => isDay(r.start) && isDay(r.end) && r.end >= r.start);
// Heures de l'ARBRE par ligne : MOYENNE par semaine de la ligne, total des catégories affichées en colonnes (activités, ou pôles d'une activité, ou secteurs d'un pôle).
function lignes(userId, spec, input) {
  const cols = colsOf(userId, spec);
  return rowsOf(input).map((r) => {
    let total = 0, any = false, own = false;
    const parts = cols.map((c) => { const e = average(userId, c, r.start, r.end); if (e.minutes != null) { total += e.minutes; any = true; } if (e.own) own = true; return { activityId: c.activityId, poleKey: c.poleKey || null, categoryKey: c.categoryKey || null, minutes: e.minutes, own: e.own }; });
    return { start: r.start, end: r.end, totalMin: any ? total : null, own, cols: parts };
  });
}

// ---- RÉPARTITION d'une ligne par catégorie du niveau où l'on est (donnée seulement : aucune interface de descente avant la maquette validée) ----
// Par catégorie : Alloué (moyenne par semaine, tableau ci-dessus), Objectifs (somme des rythmes hoursPerWeek des objectifs posés directement sur cette catégorie, au prorata de leurs jours dans la ligne),
// Chrono (temps mesuré par semaine sur la part écoulée de la ligne). Par MEMBRE, quand la catégorie appartient à une activité partagée : prévu (alloué au membre) et Chrono mesuré (moyenne des 4 dernières semaines), voir tempsmembres.js.
function objectifsAvg(userId, c, start, end) {
  const rows = db.prepare('SELECT startDate, endDate, level, poleKey, categoryKey, metaJson FROM user_objectives WHERE userId = ? AND activityId = ? AND isMacro = 0').all(userId, Number(c.activityId));
  const k = keyOf(c.level, c.poleKey, c.categoryKey), len = daysBetween(start, end) + 1;
  let sum = 0;
  rows.forEach((r) => {
    if ((r.level || 'activite') !== c.level || (r.poleKey || '') !== k.pk || (c.level === 'secteur' && (r.categoryKey || '') !== k.ck)) return;
    let m = {}; try { m = JSON.parse(r.metaJson || '{}'); } catch (e) { m = {}; }
    if (m.abandoned || !(Number(m.hoursPerWeek) > 0)) return;
    const a = r.startDate > start ? r.startDate : start, z = r.endDate < end ? r.endDate : end, d = daysBetween(a, z) + 1;
    if (d > 0) sum += Number(m.hoursPerWeek) * 60 * d / len;
  });
  return Math.round(sum);
}
function chronoAvg(userId, c, start, end, today) {
  const stop = end < today ? end : today; if (stop < start) return null;
  const weeks = Math.max(1, (daysBetween(start, stop) + 1) / 7), keys = c.level === 'activite' ? null : c.level === 'pole' ? [c.poleKey].concat((require('./goals').secteursForPole(Number(c.activityId), c.poleKey) || []).map((x) => x.key)) : [c.categoryKey];
  let q = 'SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ?', args = [userId, Number(c.activityId), start, stop];
  if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
  const m = db.prepare(q).get(...args).s / 60 / weeks; return m > 0 ? Math.round(m) : null;
}
// MEMBRES d'une catégorie pour une ligne (pop-up des heures, lecture seule) : seuls les membres qui ont du Chrono dans la catégorie sur la ligne (ou du temps prévu) y figurent ; un membre absent n'y apparaît pas.
// Chrono = temps mesuré par semaine de CE membre sur la part écoulée de la ligne ; plannedMin = temps prévu du membre (tempsmembres.js : activité et pôles seulement, null pour un secteur : rien n'est inventé).
// Les responsables existent par ACTIVITÉ (activity_managers) mais aucun lien « membre sous son responsable » n'est stocké : la liste est donc simple, avec isResponsable.
function membres(userId, c, start, end, today) {
  try {
    const goals = require('./goals'), act = Number(c.activityId);
    const keys = c.level === 'activite' ? null : c.level === 'pole' ? [c.poleKey].concat((goals.secteursForPole(act, c.poleKey) || []).map((x) => x.key)) : [c.categoryKey];
    const stop = end < today ? end : today, weeks = stop >= start ? Math.max(1, (daysBetween(start, stop) + 1) / 7) : null;
    const mem = db.prepare('SELECT m.userId, u.name FROM activity_members m JOIN users u ON u.id = m.userId WHERE m.activityId = ? ORDER BY m.joinedAt').all(act);
    let t = null; try { t = require('./tempsmembres').tableFor(act, userId, today); if (t && t.error) t = null; } catch (e) { t = null; }
    const lvl = t && c.level !== 'secteur' ? (t.levels || []).find((l) => l.key === (c.level === 'activite' ? null : c.poleKey)) : null;
    const resp = require('./responsables').ids(act) || [];
    return mem.map((m) => {
      let chrono = null;
      if (weeks) { let q = 'SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE userId = ? AND activityId = ? AND isoDate BETWEEN ? AND ?', args = [m.userId, act, start, stop]; if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); } const v = db.prepare(q).get(...args).s / 60 / weeks; chrono = v > 0 ? Math.round(v) : null; }
      const pr = lvl ? (lvl.rows.find((x) => x.userId === m.userId) || {}).plannedMin : undefined;
      return { userId: m.userId, name: m.name || null, plannedMin: pr == null ? null : pr, chronoMin: chrono, isResponsable: resp.indexOf(m.userId) >= 0 };
    }).filter((m) => m.chronoMin != null || (m.plannedMin != null && m.plannedMin > 0));
  } catch (e) { return null; }
}
function repartition(userId, spec, row, today) {
  const rr = rowsOf([row])[0]; if (!rr) throw err('Ligne invalide.');
  const t = isDay(today) ? today : require('./dates').userToday();
  const cols = colsOf(userId, spec).map((c) => {
    const a = average(userId, c, rr.start, rr.end), goals = require('./goals');
    const label = c.level === 'activite' ? (db.prepare('SELECT name FROM activities WHERE id = ?').get(c.activityId) || {}).name : ((c.level === 'pole' ? goals.categoriesForActivity(c.activityId) : goals.secteursForPole(c.activityId, c.poleKey)) || []).find((x) => x.key === (c.level === 'pole' ? c.poleKey : c.categoryKey));
    return { activityId: c.activityId, level: c.level, poleKey: c.poleKey || null, categoryKey: c.categoryKey || null, label: label && label.label ? label.label : (label || ''), alloueMin: a.minutes, own: a.own, objectifsMin: objectifsAvg(userId, c, rr.start, rr.end), chronoMin: chronoAvg(userId, c, rr.start, rr.end, t), membres: membres(userId, c, rr.start, rr.end, t) };
  });
  return { start: rr.start, end: rr.end, level: spec.level, categories: cols, totalMin: cols.some((c) => c.alloueMin != null) ? cols.reduce((n, c) => n + (c.alloueMin || 0), 0) : null };
}

module.exports = { MAX_MIN, START, effective, set, column, average, lignes, repartition, migrateLegacy };
