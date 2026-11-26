// « Ajuste ton temps » (décision d'Émilien, 15 nov. 2026) : UNE seule fenêtre, une seule règle (plus de 20 % du total hebdomadaire de l'objectif), deux causes.
//   - « Planifié » : la somme des durées des tâches ouvertes de l'objectif (saisies à la main ou calculées par l'IA), ramenée à la semaine jusqu'à son échéance, dépasse son temps de plus de 20 %.
//   - « Réel »     : le Chrono dépasse le temps de l'objectif de plus de 20 %, 4 semaines de suite (objectifs-ecart.js).
// « Planifié » passe avant « Réel ». UN affichage par période et par objectif : toute action (✕ ou Modifier) le mémorise (table objectif_ajuste_refus) ; rien d'autre n'est écrit.
// SOUS-UTILISATION du Chrono : RIEN (décision d'Émilien, 17 nov. 2026) : ni fenêtre, ni réduction automatique, ni ligne d'information. Les heures fixées par l'utilisateur ne changent que par lui.
// LE TEMPS D'UN OBJECTIF VIT À UN SEUL ENDROIT : metaJson.hoursPerWeek de l'objectif, écrit par objectifs.parametres() (comme les réglages) ;
// l'arbre, les heures, le Chrono contre l'objectif, les statistiques et le Bilan le lisent tous de là. La table objectif_ajuste_info (anciennes lignes d'information) n'est plus lue : ses données restent.
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
function evaluatePlanned(totalMinutes, weeksLeft, hoursPerWeek, threshold) {
  const hpwMin = Math.round(Number(hoursPerWeek) * 60);
  if (!(hpwMin > 0) || !(totalMinutes > 0) || !(weeksLeft > 0)) return null;
  const perWeek = Math.ceil(totalMinutes / weeksLeft);
  if (!(perWeek > hpwMin * (1 + (threshold != null ? threshold : THRESHOLD)))) return null;
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
  const CS = require('./categorie-strategie'), reg = CS.regleActive(row.activityId, CS.keyOfObjective(row), 'planifie-ecart'); // seuil et activation de la stratégie de la catégorie
  if (!reg.actif) return null;
  return evaluatePlanned(total, weeksLeft, meta.hoursPerWeek, reg.seuil / 100);
}

function labelsOf(row) {
  const goals = require('./goals');
  const act = db.prepare('SELECT name FROM activities WHERE id = ?').get(row.activityId) || {};
  let cat = null;
  try { const k = row.level === 'secteur' ? row.categoryKey : row.level === 'pole' ? row.poleKey : null; cat = k ? goals.categoryLabelFor(row.activityId, k) : null; } catch (e) { cat = null; }
  return { activite: act.name || '', categorie: cat };
}

// Lecture pour l'écran : { fenetre: null | { objectifId, cause: 'planifie' | 'reel', activite, categorie, level, objectifMin, mesureMin, pct } }. Aucun effet de bord : rien n'est écrit en lisant.
function lire(userId, today) {
  today = today || require('./dates').userToday();
  const ecart = require('./objectifs-ecart');
  let ecarts = []; try { ecarts = ecart.evaluate(userId, today); } catch (e) { ecarts = []; }
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
  return { fenetre };
}

// ✕ ou « Modifier » : la fenêtre n'est plus montrée pour cet objectif pendant la période en cours.
function refuser(userId, objectifId, today) {
  const row = db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(Number(objectifId), userId);
  if (!row) throw Object.assign(new Error('Objectif introuvable.'), { statusCode: 404 });
  db.prepare('INSERT OR IGNORE INTO objectif_ajuste_refus (userId, objectifId, periodKey, at) VALUES (?, ?, ?, ?)').run(userId, row.id, periodKey(row, today || require('./dates').userToday()), new Date().toISOString());
  return { ok: true };
}

module.exports = { THRESHOLD, evaluatePlanned, periodKey, lire, refuser };
