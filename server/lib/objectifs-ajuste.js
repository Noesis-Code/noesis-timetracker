// « Ajuste ton temps » (décision d'Émilien, 15 nov. 2026) : UNE seule fenêtre, une seule règle (plus de 20 % du total hebdomadaire de l'objectif), deux causes.
//   - « Planifié » : la somme des durées des tâches ouvertes de l'objectif (saisies à la main ou calculées par l'IA), ramenée à la semaine jusqu'à son échéance, dépasse son temps de plus de 20 %.
//   - « Réel »     : le Chrono dépasse le temps de l'objectif de plus de 20 %, 4 semaines de suite (objectifs-ecart.js).
// « Planifié » passe avant « Réel ». UN affichage par période et par objectif : toute action (✕ ou Modifier) le mémorise (table objectif_ajuste_refus) ; rien d'autre n'est écrit.
// SOUS-UTILISATION du Chrono (plus de 20 % en dessous, 4 semaines de suite) : AUCUNE fenêtre ; le temps de l'objectif est réduit automatiquement au temps réel moyen et une ligne d'information
// (✕ seulement) est gardée dans objectif_ajuste_info. LE TEMPS D'UN OBJECTIF VIT À UN SEUL ENDROIT : metaJson.hoursPerWeek de l'objectif, écrit par objectifs.parametres() (comme les réglages) ;
// l'arbre, les heures, le Chrono contre l'objectif, les statistiques et le Bilan le lisent tous de là.
const db = require('../db');

const THRESHOLD = 0.2;
const DAY = 86400000;
const parse = (json, d) => { try { const v = JSON.parse(json); return v == null ? d : v; } catch (e) { return d; } };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);

db.exec(`CREATE TABLE IF NOT EXISTS objectif_ajuste_refus (
  userId TEXT NOT NULL,
  objectifId INTEGER NOT NULL,
  periodKey TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (userId, objectifId, periodKey)
)`);
db.exec(`CREATE TABLE IF NOT EXISTS objectif_ajuste_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  objectifId INTEGER NOT NULL,
  fromMin INTEGER NOT NULL,
  toMin INTEGER NOT NULL,
  at TEXT NOT NULL,
  dismissedAt TEXT
)`);

// La période de l'objectif en cours aujourd'hui (début), sinon le début de l'objectif : sert de clé « une fois par période ».
function periodKey(row, today) {
  const steps = parse(row.stepsJson, []);
  const p = Array.isArray(steps) ? steps.find((x) => x && x.startDate <= today && today <= x.endDate) : null;
  return (p && p.startDate) || row.startDate;
}

// PURE. Planifié par semaine (minutes) = somme des durées / semaines restantes ; fenêtre si plus de 20 % au-dessus du temps de l'objectif.
function evaluatePlanned(totalMinutes, weeksLeft, hoursPerWeek) {
  const hpwMin = Math.round(Number(hoursPerWeek) * 60);
  if (!(hpwMin > 0) || !(totalMinutes > 0) || !(weeksLeft > 0)) return null;
  const perWeek = Math.ceil(totalMinutes / weeksLeft);
  if (!(perWeek > hpwMin * (1 + THRESHOLD))) return null;
  return { objectifMin: hpwMin, mesureMin: perWeek, pct: Math.round((perWeek - hpwMin) / hpwMin * 100) };
}

function plannedFor(userId, row, today) {
  const meta = parse(row.metaJson, {});
  if (meta.abandoned || !(Number(meta.hoursPerWeek) > 0)) return null;
  const ids = parse(row.taskIdsJson, []);
  if (!Array.isArray(ids) || !ids.length) return null;
  const tasks = require('./goalsperiodlate').taskRows(row.activityId, ids).filter((t) => !t.dueDate || t.dueDate <= row.endDate);
  const total = tasks.reduce((s, t) => s + (Number(t.minutes) || 0), 0);
  const weeksLeft = Math.max(1, Math.ceil((daysBetween(today, row.endDate) + 1) / 7));
  return evaluatePlanned(total, weeksLeft, meta.hoursPerWeek);
}

function labelsOf(row) {
  const goals = require('./goals');
  const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(row.activityId) || {};
  let cat = null;
  try { const k = row.level === 'secteur' ? row.categoryKey : row.level === 'pole' ? row.poleKey : null; cat = k ? goals.categoryLabelFor(row.activityId, k) : null; } catch (e) { cat = null; }
  return { activite: act.name || '', categorie: cat };
}

// Réduit automatiquement le temps de l'objectif au temps réel moyen (au dixième d'heure, comme les réglages) et garde la ligne d'information.
function reduireSousUtilisation(userId, ev, today) {
  const O = require('./objectifs');
  const toH = Math.round(ev.realMin / 60 * 10) / 10;
  if (!(toH > 0) || ev.realMin >= ev.plannedMin) return false;
  try { O.parametres(userId, ev.objectifId, { hoursPerWeek: toH }); } catch (e) { return false; }
  db.prepare('INSERT INTO objectif_ajuste_info (userId, objectifId, fromMin, toMin, at) VALUES (?, ?, ?, ?, ?)').run(userId, ev.objectifId, ev.plannedMin, Math.round(toH * 60), new Date().toISOString());
  return true;
}

// Lecture pour l'écran : { fenetre: null | { objectifId, cause: 'planifie' | 'reel', activite, categorie, level, objectifMin, mesureMin, pct }, infos: [{ id, objectifId, activite, categorie, fromMin, toMin }] }.
// Effet de bord voulu : la sous-utilisation est appliquée ici (réduction automatique du temps de l'objectif).
function lire(userId, today) {
  today = today || require('./dates').userToday();
  const ecart = require('./objectifs-ecart');
  let ecarts = []; try { ecarts = ecart.evaluate(userId, today); } catch (e) { ecarts = []; }
  ecarts.filter((e) => e.direction === 'sous').forEach((e) => reduireSousUtilisation(userId, e, today));
  const refused = (row) => !!db.prepare('SELECT 1 FROM objectif_ajuste_refus WHERE userId = ? AND objectifId = ? AND periodKey = ?').get(userId, row.id, periodKey(row, today));
  const rows = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND isMacro = 0 AND endDate >= ? AND startDate <= ?').all(userId, today, today);
  let fenetre = null;
  for (const row of rows) { // « Planifié » d'abord
    if (refused(row)) continue;
    const ev = plannedFor(userId, row, today); if (!ev) continue;
    fenetre = Object.assign({ objectifId: row.id, cause: 'planifie', level: row.level || 'activite' }, labelsOf(row), ev); break;
  }
  if (!fenetre) {
    for (const e of ecarts.filter((x) => x.direction === 'depasse')) {
      const row = rows.find((r) => r.id === e.objectifId); if (!row || refused(row)) continue;
      fenetre = { objectifId: row.id, cause: 'reel', level: row.level || 'activite', activite: e.activite, categorie: e.categorie, objectifMin: e.plannedMin, mesureMin: e.realMin, pct: e.pct }; break;
    }
  }
  const infos = db.prepare('SELECT * FROM objectif_ajuste_info WHERE userId = ? AND dismissedAt IS NULL ORDER BY id').all(userId).map((i) => {
    const row = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(i.objectifId);
    return Object.assign({ id: i.id, objectifId: i.objectifId, fromMin: i.fromMin, toMin: i.toMin }, row ? labelsOf(row) : { activite: '', categorie: null });
  });
  return { fenetre, infos };
}

// ✕ ou « Modifier » : la fenêtre n'est plus montrée pour cet objectif pendant la période en cours.
function refuser(userId, objectifId, today) {
  const row = db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(Number(objectifId), userId);
  if (!row) throw Object.assign(new Error('Objectif introuvable.'), { statusCode: 404 });
  db.prepare('INSERT OR IGNORE INTO objectif_ajuste_refus (userId, objectifId, periodKey, at) VALUES (?, ?, ?, ?)').run(userId, row.id, periodKey(row, today || require('./dates').userToday()), new Date().toISOString());
  return { ok: true };
}
function infoVue(userId, id) {
  const r = db.prepare('UPDATE objectif_ajuste_info SET dismissedAt = ? WHERE id = ? AND userId = ? AND dismissedAt IS NULL').run(new Date().toISOString(), Number(id), userId);
  if (!r.changes) throw Object.assign(new Error('Information introuvable.'), { statusCode: 404 });
  return { ok: true };
}

module.exports = { THRESHOLD, evaluatePlanned, periodKey, lire, refuser, infoVue };
