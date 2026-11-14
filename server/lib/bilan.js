// BILAN (14 nov. 2026, décision d'Émilien) : données des nouveaux blocs de la page Bilan. Lecture seule, aucun nom de tâche, aucune écriture.
//  - moyenneTaches : « Moyenne des tâches réalisées » (une activité) : Tous + chaque membre (activité sans autre membre : une seule ligne « Vous »), moyenne sur les 4 DERNIÈRES PÉRIODES COMPLÈTES ;
//    colonnes Jour = lundi à dimanche (tâches faites ce jour de la semaine, par semaine), colonnes Semaine = 1 à 4 (la semaine de la période, par période). Le vert / rouge (le plus / le moins) est posé par ligne côté écran.
//  - urgentes : « Tâches urgentes » (vue Toutes) : tableau par période de 4 semaines, avec le VRAI numéro de semaine de l'année (S42, celui de la grille de l'application), la période (P11), l'année et le nombre de
//    tâches ouvertes à échéance cette semaine-là (toutes les activités du membre). On navigue de période en période (offset).
//  - proportion : « proportion réelle contre demandée » par membre (remplace l'ancien simple nombre de tâches faites) : réelle = part des tâches faites par chacun sur les 4 dernières périodes ; demandée = part du
//    temps VOULU de chacun (task_share_wanted, la valeur déjà saisie dans « Partager les tâches »). Sans temps voulu : demandée vide (rien n'est inventé).
const db = require('../db');

// Proportion DEMANDÉE de chaque membre (« toi 60 %, moi 40 % »), saisie dans l'arbre (fiche de l'activité) : un pourcentage par membre, la somme ne dépasse pas 100.
db.exec(`CREATE TABLE IF NOT EXISTS task_share_pct (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pct INTEGER NOT NULL,
  PRIMARY KEY (activityId, userId)
)`);

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * DAY);
const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code || 400 });
const O = () => require('./objectifs');

function member(userId, activityId) {
  const a = db.prepare('SELECT a.id, a.name FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.id = ? AND a.active = 1').get(userId, Number(activityId));
  if (!a) throw err('Choisis une de tes activités.', 403);
  return a;
}
// Les 4 dernières périodes COMPLÈTES (28 jours chacune, grille de l'application) avant la période en cours : [{ start, end, n }] de la plus ancienne à la plus récente.
function lastPeriods(today) {
  const cur = O().periodStartOf(today), out = [];
  for (let i = 4; i >= 1; i -= 1) { const s = addDays(cur, -28 * i); out.push({ start: s, end: addDays(s, 27), n: O().gridOf(s).period, year: O().gridOf(s).year }); }
  return out;
}
const weekdayIdx = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // lundi = 0
const r1 = (v) => Math.round(v * 10) / 10;

function doneTasks(activityId, start, end) {
  return db.prepare(`SELECT i.id, i.doneBy, i.plannedUserId, substr(i.doneAt, 1, 10) AS day FROM sub_project_items i JOIN sub_project_sections s ON s.id = i.sectionId JOIN sub_projects sp ON sp.id = s.subProjectId
    WHERE sp.activityId = ? AND s.kind = 'tasks' AND i.done = 1 AND i.doneAt IS NOT NULL AND substr(i.doneAt, 1, 10) BETWEEN ? AND ?`).all(Number(activityId), start, end);
}
function membersOf(activityId) {
  return db.prepare('SELECT u.id AS id, u.name AS name FROM activity_members m JOIN users u ON u.id = m.userId WHERE m.activityId = ? ORDER BY m.joinedAt, u.id').all(Number(activityId));
}
// Une ligne : { jour: [7 moyennes], semaine: [4 moyennes] } à partir des tâches faites (liste) sur les 4 périodes.
function rowOf(list, periods) {
  const jour = [0, 0, 0, 0, 0, 0, 0], sem = [0, 0, 0, 0];
  list.forEach((t) => {
    jour[weekdayIdx(t.day)] += 1;
    const p = periods.find((x) => t.day >= x.start && t.day <= x.end); if (!p) return;
    sem[Math.min(3, Math.floor((Date.parse(t.day + 'T00:00:00Z') - Date.parse(p.start + 'T00:00:00Z')) / DAY / 7))] += 1;
  });
  return { jour: jour.map((v) => r1(v / (periods.length * 4))), semaine: sem.map((v) => r1(v / periods.length)), total: list.length };
}
function moyenneTaches(userId, activityId, today) {
  const act = member(userId, activityId), t = today || require('./dates').userToday(), periods = lastPeriods(t);
  const tasks = doneTasks(act.id, periods[0].start, periods[3].end), mem = membersOf(act.id);
  const resp = (x) => x.doneBy || x.plannedUserId || null;
  const rows = mem.length <= 1 ? [Object.assign({ key: 'moi', label: 'Vous' }, rowOf(tasks, periods))]
    : [Object.assign({ key: 'tous', label: 'Tous' }, rowOf(tasks, periods))].concat(mem.map((m) => Object.assign({ key: m.id, label: m.name, userId: m.id }, rowOf(tasks.filter((x) => resp(x) === m.id), periods))));
  return { activityId: act.id, periods: periods.map((p) => ({ start: p.start, end: p.end, n: p.n, year: p.year })), rows };
}
// Tâches urgentes à venir, une période de 4 semaines par page : offset 0 = la période en cours, 1 = la suivante, etc. (jamais avant la période en cours).
function urgentes(userId, offset, today) {
  const t = today || require('./dates').userToday(), off = Math.max(0, Math.min(26, Math.round(Number(offset) || 0))), cur = O().periodStartOf(t), start = addDays(cur, 28 * off), g = O().gridOf(start);
  const ids = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1').all(userId).map((x) => x.id);
  const weeks = [];
  for (let i = 0; i < 4; i += 1) {
    const ws = addDays(start, 7 * i), we = addDays(ws, 6), gw = O().gridOf(ws);
    let n = 0;
    if (ids.length) n = db.prepare(`SELECT COUNT(*) AS n FROM sub_project_items i JOIN sub_project_sections s ON s.id = i.sectionId JOIN sub_projects sp ON sp.id = s.subProjectId
      WHERE sp.activityId IN (${ids.map(() => '?').join(',')}) AND s.kind = 'tasks' AND i.done = 0 AND i.dueDate IS NOT NULL AND i.dueDate BETWEEN ? AND ?`).get(...ids, ws, we).n;
    weeks.push({ week: gw.week, label: 'S' + gw.week, start: ws, end: we, period: gw.period, year: gw.year, count: n });
  }
  return { offset: off, period: g.period, year: g.year, start, end: addDays(start, 27), weeks };
}
// Proportion réelle contre demandée par membre (activité partagée) : { rows: [{ userId, name, realPct, wantedPct }] }.
function proportion(userId, activityId, today) {
  const act = member(userId, activityId), t = today || require('./dates').userToday(), periods = lastPeriods(t);
  const mem = membersOf(act.id); if (mem.length < 2) return { activityId: act.id, rows: [] };
  const done = doneTasks(act.id, periods[0].start, periods[3].end), resp = (x) => x.doneBy || x.plannedUserId || null;
  const total = done.filter((x) => mem.some((m) => m.id === resp(x))).length;
  const wantedRows = {}; try { db.prepare('SELECT userId, minutes FROM task_share_wanted WHERE activityId = ?').all(act.id).forEach((r) => { wantedRows[r.userId] = r.minutes; }); } catch (e) { /* table créée par partagetaches.js */ }
  const entered = {}; db.prepare('SELECT userId, pct FROM task_share_pct WHERE activityId = ?').all(act.id).forEach((r) => { entered[r.userId] = r.pct; });
  const hasEntered = Object.keys(entered).length > 0;
  const wTotal = mem.reduce((a, m) => a + (wantedRows[m.id] > 0 ? wantedRows[m.id] : 0), 0);
  return { activityId: act.id, rows: mem.map((m) => ({ userId: m.id, name: m.name, realPct: total ? Math.round(done.filter((x) => resp(x) === m.id).length / total * 100) : null, wantedPct: hasEntered ? (entered[m.id] != null ? entered[m.id] : null) : (wTotal && wantedRows[m.id] > 0 ? Math.round(wantedRows[m.id] / wTotal * 100) : null), enteredPct: entered[m.id] != null ? entered[m.id] : null })) };
}

// Écriture de la proportion demandée (fiche de l'activité dans l'arbre) : parts = { userId: pourcentage 0 à 100 } ; un responsable règle celle de tous, un non-responsable seulement la sienne ; somme <= 100. null retire la valeur.
function setProportion(userId, activityId, parts) {
  const act = member(userId, activityId), mem = membersOf(act.id), isMgr = require('./responsables').isManager(userId, act.id);
  if (!parts || typeof parts !== 'object') throw err('Parts invalides.');
  const next = {}; db.prepare('SELECT userId, pct FROM task_share_pct WHERE activityId = ?').all(act.id).forEach((r) => { next[r.userId] = r.pct; });
  Object.keys(parts).forEach((uid) => {
    if (!mem.some((m) => m.id === uid)) throw err('Ce membre ne fait pas partie de l’activité.', 400);
    if (uid !== userId && !isMgr) throw err('Seul un responsable règle la part d’un autre membre.', 403);
    const v = parts[uid];
    if (v === null || v === '') { delete next[uid]; return; }
    const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 0 || n > 100) throw err('La part est un pourcentage de 0 à 100.');
    next[uid] = n;
  });
  if (Object.keys(next).reduce((a, k) => a + next[k], 0) > 100) throw err('Le total des parts ne peut pas dépasser 100 %.');
  const tx = db.prepare('DELETE FROM task_share_pct WHERE activityId = ?'), ins = db.prepare('INSERT INTO task_share_pct (activityId, userId, pct) VALUES (?, ?, ?)');
  tx.run(act.id); Object.keys(next).forEach((k) => ins.run(act.id, k, next[k]));
  return proportion(userId, act.id);
}

module.exports = { lastPeriods, moyenneTaches, urgentes, proportion, setProportion };
