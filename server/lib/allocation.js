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
function lignes(userId, spec, dates) {
  const cols = colsOf(userId, spec);
  return (Array.isArray(dates) ? dates.slice(0, 80) : []).filter(isDay).map((d) => {
    let total = 0, any = false, own = false;
    const parts = cols.map((c) => { const e = effective(userId, c, d); if (e.minutes != null) { total += e.minutes; any = true; } if (e.own) own = true; return Object.assign({ poleKey: c.poleKey || null, categoryKey: c.categoryKey || null, activityId: c.activityId }, e); });
    return { date: d, totalMin: any ? total : null, own, cols: parts };
  });
}

module.exports = { MAX_MIN, START, effective, set, column, lignes, migrateLegacy };
