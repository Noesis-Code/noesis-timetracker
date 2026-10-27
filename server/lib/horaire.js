// Module « Horaire » : couche données (gestionnaire seul). Chaque fonction reçoit le userId de la SESSION et filtre
// toutes ses requêtes par lui ; un id fourni par le client n'est jamais utilisé sans vérifier qu'il appartient au compte.
// Données du personnel = confidentielles (Loi 25) : jamais envoyées à l'IA, à la Communauté, au partage ni aux journaux ;
// exportées par server/lib/dataexport.js, effacées par server/lib/accountdeletion.js. Génération : ./horaire-generation.js.
const db = require('../db');
const gen = require('./horaire-generation');

const nowIso = () => new Date().toISOString();
const LIMITS = { name: 80, label: 120, employees: 500, positions: 50, csvChars: 200000, csvRows: 5000, shifts: 14, constraint: 200 };

// ---------- validation (utilisée par server/routes/horaire.js) ----------
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const isMonday = (s) => isDate(s) && new Date(s + 'T00:00:00Z').getUTCDay() === 1;
const isTime = (s) => typeof s === 'string' && gen.toMin(s) !== null;
const cleanName = (s, max) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, max || LIMITS.name) : '');
// Heures hebdo max -> minutes ; null = aucune limite ; undefined = invalide.
function maxMinutes(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 168 * 60 ? Math.round(n) : undefined;
}
// Quarts souhaités par semaine (min ou max) : entier 0 à 14 ; null = non renseigné ; undefined = invalide.
function shiftCount(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n >= 0 && n <= LIMITS.shifts ? n : undefined;
}
// Contrainte particulière : texte court libre (une ligne) ; '' ou null = effacée ; undefined = invalide.
function constraintText(v) {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ');
  return s.length <= LIMITS.constraint ? (s || null) : undefined;
}

// ---------- propriété ----------
const ownEmployee = (u, id) => db.prepare('SELECT * FROM horaire_employees WHERE id = ? AND userId = ?').get(Number(id), u) || null;
const ownPosition = (u, id) => db.prepare('SELECT * FROM horaire_positions WHERE id = ? AND userId = ?').get(Number(id), u) || null;
const ownEvent = (u, id) => db.prepare('SELECT * FROM horaire_events WHERE id = ? AND userId = ?').get(Number(id), u) || null;

// ---------- employés (le max hebdo, en minutes, est un champ de l'employé) ----------
// Quarts souhaités (wantShiftsMin, wantShiftsMax, par semaine) : wantShiftsMax est une limite stricte de la génération.
// noDouble (jamais matin et soir le même jour) et restAfterShift (un jour de repos après chaque quart) : contraintes strictes
// de la génération. constraintNote : note libre permanente, jamais lue par la génération ni touchée par un import de disponibilités.
function listEmployees(u) {
  return db.prepare('SELECT id, name, maxWeekMinutes, active, dayforceId, wantShiftsMin, wantShiftsMax, wantShiftsTarget, constraintNote, noDouble, restAfterShift, createdAt FROM horaire_employees WHERE userId = ? ORDER BY name COLLATE NOCASE, id').all(u)
    .map((e) => ({ ...e, active: !!e.active, noDouble: !!e.noDouble, restAfterShift: !!e.restAfterShift }));
}
function countEmployees(u) { return db.prepare('SELECT COUNT(*) AS n FROM horaire_employees WHERE userId = ?').get(u).n; }
const orNull = (v) => (v === undefined ? null : v);
function createEmployee(u, { name, maxWeekMinutes, dayforceId, wantShiftsMin, wantShiftsMax, wantShiftsTarget, constraintNote, noDouble, restAfterShift }) {
  const r = db.prepare('INSERT INTO horaire_employees (userId, name, maxWeekMinutes, active, dayforceId, wantShiftsMin, wantShiftsMax, wantShiftsTarget, constraintNote, noDouble, restAfterShift, createdAt) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(u, name, orNull(maxWeekMinutes), dayforceId || null, orNull(wantShiftsMin), orNull(wantShiftsMax), orNull(wantShiftsTarget), constraintNote || null, noDouble ? 1 : 0, restAfterShift ? 1 : 0, nowIso());
  return listEmployees(u).find((e) => e.id === Number(r.lastInsertRowid));
}
function updateEmployee(u, id, f) {
  const e = ownEmployee(u, id);
  if (!e) return null;
  const pick = (k) => (f[k] !== undefined ? f[k] : e[k]);
  const flag = (k) => (f[k] !== undefined ? (f[k] ? 1 : 0) : (e[k] ? 1 : 0));
  db.prepare('UPDATE horaire_employees SET name = ?, maxWeekMinutes = ?, active = ?, dayforceId = ?, wantShiftsMin = ?, wantShiftsMax = ?, wantShiftsTarget = ?, constraintNote = ?, noDouble = ?, restAfterShift = ? WHERE id = ? AND userId = ?').run(
    pick('name'), pick('maxWeekMinutes'),
    f.active !== undefined ? (f.active ? 1 : 0) : e.active,
    f.dayforceId !== undefined ? (f.dayforceId || null) : e.dayforceId,
    pick('wantShiftsMin'), pick('wantShiftsMax'), pick('wantShiftsTarget'),
    f.constraintNote !== undefined ? (f.constraintNote || null) : e.constraintNote,
    flag('noDouble'), flag('restAfterShift'), e.id, u);
  return listEmployees(u).find((x) => x.id === e.id);
}
// Suppression en cascade, toujours bornée au compte (pas de clé étrangère entre tables du module : chaque DELETE filtre userId).
function cascade(u, steps) {
  db.exec('BEGIN');
  try {
    let n = 0;
    for (const [sql, ...args] of steps) n = db.prepare(sql).run(...args, u).changes;
    db.exec('COMMIT');
    return n > 0;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
// Effacement réel (droit à l'effacement de l'employé) : ses qualifications, disponibilités, congés et quarts partent avec lui.
function deleteEmployee(u, id) {
  const i = Number(id);
  return cascade(u, [
    ['DELETE FROM horaire_qualifications WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_availabilities WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_timeoff WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_assignments WHERE employeeId = ? AND userId = ?', i],
    ['UPDATE horaire_rotation SET lastEmployeeId = NULL WHERE lastEmployeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_employees WHERE id = ? AND userId = ?', i],
  ]);
}

// ---------- postes (ordre de comblement = fillOrder croissant) ----------
function listPositions(u) {
  return db.prepare('SELECT id, name, fillOrder, dayforceCode, openTableCovers, createdAt FROM horaire_positions WHERE userId = ? ORDER BY fillOrder, id').all(u);
}
function countPositions(u) { return db.prepare('SELECT COUNT(*) AS n FROM horaire_positions WHERE userId = ?').get(u).n; }
function createPosition(u, { name, fillOrder, dayforceCode }) {
  const order = Number.isInteger(fillOrder) ? fillOrder
    : (db.prepare('SELECT COALESCE(MAX(fillOrder), -1) + 1 AS n FROM horaire_positions WHERE userId = ?').get(u).n);
  const r = db.prepare('INSERT INTO horaire_positions (userId, name, fillOrder, dayforceCode, createdAt) VALUES (?, ?, ?, ?, ?)').run(u, name, order, dayforceCode || null, nowIso());
  return listPositions(u).find((p) => p.id === Number(r.lastInsertRowid));
}
function updatePosition(u, id, f) {
  const p = ownPosition(u, id);
  if (!p) return null;
  db.prepare('UPDATE horaire_positions SET name = ?, fillOrder = ?, dayforceCode = ?, openTableCovers = ? WHERE id = ? AND userId = ?')
    .run(f.name !== undefined ? f.name : p.name, f.fillOrder !== undefined ? f.fillOrder : p.fillOrder,
      f.dayforceCode !== undefined ? (f.dayforceCode || null) : p.dayforceCode,
      f.openTableCovers !== undefined ? f.openTableCovers : p.openTableCovers, p.id, u);
  return listPositions(u).find((x) => x.id === p.id);
}
function deletePosition(u, id) {
  const i = Number(id);
  return cascade(u, ['horaire_qualifications', 'horaire_needs', 'horaire_rotation', 'horaire_assignments']
    .map((t) => ['DELETE FROM ' + t + ' WHERE positionId = ? AND userId = ?', i])
    .concat([['DELETE FROM horaire_positions WHERE id = ? AND userId = ?', i]]));
}

// ---------- qualifications (rang par employé ET par poste ; 1 = meilleur) ----------
function listQualifications(u) {
  return db.prepare('SELECT employeeId, positionId, rank FROM horaire_qualifications WHERE userId = ? ORDER BY positionId, rank, employeeId').all(u);
}
function setQualification(u, employeeId, positionId, rank) {
  db.prepare(`INSERT INTO horaire_qualifications (userId, employeeId, positionId, rank) VALUES (?, ?, ?, ?)
    ON CONFLICT(employeeId, positionId) DO UPDATE SET rank = excluded.rank`).run(u, Number(employeeId), Number(positionId), rank);
  return { employeeId: Number(employeeId), positionId: Number(positionId), rank };
}
function removeQualification(u, employeeId, positionId) {
  return db.prepare('DELETE FROM horaire_qualifications WHERE userId = ? AND employeeId = ? AND positionId = ?')
    .run(u, Number(employeeId), Number(positionId)).changes > 0;
}

// ---------- disponibilités (saisies par semaine) ----------
function getAvailabilities(u, weekStart) {
  return db.prepare('SELECT employeeId, day, start, end FROM horaire_availabilities WHERE userId = ? AND weekStart = ? ORDER BY employeeId, day, start').all(u, weekStart);
}
// Congés de la semaine (jour entier : vacances, maladie, absence) : [{employeeId, day}].
function getTimeoff(u, weekStart) {
  return db.prepare('SELECT employeeId, day FROM horaire_timeoff WHERE userId = ? AND weekStart = ? ORDER BY employeeId, day').all(u, weekStart);
}
// Remplace les disponibilités et/ou les congés d'UN employé pour la semaine (undefined = inchangé). Valeurs déjà validées :
// intervals [{day, start, end}], timeoff ['AAAA-MM-JJ']. Un jour de congé n'a aucune plage (une case = un seul état).
function setAvailabilities(u, weekStart, employeeId, intervals, timeoff) {
  const emp = Number(employeeId);
  db.exec('BEGIN');
  try {
    if (intervals !== undefined) {
      db.prepare('DELETE FROM horaire_availabilities WHERE userId = ? AND weekStart = ? AND employeeId = ?').run(u, weekStart, emp);
      const ins = db.prepare('INSERT INTO horaire_availabilities (userId, employeeId, weekStart, day, start, end, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const at = nowIso();
      intervals.filter((i) => !(timeoff || []).includes(i.day)).forEach((i) => ins.run(u, emp, weekStart, i.day, i.start, i.end, at));
    }
    if (timeoff !== undefined) {
      db.prepare('DELETE FROM horaire_timeoff WHERE userId = ? AND weekStart = ? AND employeeId = ?').run(u, weekStart, emp);
      const ins = db.prepare('INSERT INTO horaire_timeoff (userId, employeeId, weekStart, day, createdAt) VALUES (?, ?, ?, ?, ?)');
      const delDay = db.prepare('DELETE FROM horaire_availabilities WHERE userId = ? AND weekStart = ? AND employeeId = ? AND day = ?');
      const at = nowIso();
      [...new Set(timeoff)].forEach((d) => { ins.run(u, emp, weekStart, d, at); delDay.run(u, weekStart, emp, d); });
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return getAvailabilities(u, weekStart).filter((a) => a.employeeId === emp);
}

// Ligne d'état de la page : nombre d'employés ayant des disponibilités ou des congés cette semaine, et date de la dernière lecture.
function availSummary(u, weekStart) {
  const r = db.prepare(`SELECT COUNT(DISTINCT employeeId) AS n, MAX(createdAt) AS at FROM (
    SELECT employeeId, createdAt FROM horaire_availabilities WHERE userId = ? AND weekStart = ?
    UNION ALL SELECT employeeId, createdAt FROM horaire_timeoff WHERE userId = ? AND weekStart = ?)`).get(u, weekStart, u, weekStart);
  return { employees: r.n || 0, at: r.at || null };
}

// ---------- règles de catégorie (catégorie = rang de qualification) ----------
const CATEGORY_RULES = ['noDouble', 'restAfterShift', 'noMorning', 'noEvening', 'eveningsFirst', 'morningsFirst'];
function listCategoryRules(u) {
  return db.prepare('SELECT rank, rule FROM horaire_category_rules WHERE userId = ? ORDER BY rank, rule').all(u);
}
function addCategoryRule(u, rank, rule) {
  db.prepare('INSERT OR IGNORE INTO horaire_category_rules (userId, rank, rule) VALUES (?, ?, ?)').run(u, rank, rule);
  return listCategoryRules(u);
}
function removeCategoryRule(u, rank, rule) {
  return db.prepare('DELETE FROM horaire_category_rules WHERE userId = ? AND rank = ? AND rule = ?').run(u, rank, rule).changes > 0;
}

// ---------- besoins (modèle normal : weekday 0 = lundi ... 6 = dimanche) ----------
function listNeeds(u) {
  return db.prepare('SELECT id, positionId, weekday, start, end, count FROM horaire_needs WHERE userId = ? AND eventId IS NULL ORDER BY weekday, start, positionId').all(u);
}
const ownNeed = (u, id) => db.prepare('SELECT * FROM horaire_needs WHERE id = ? AND userId = ? AND eventId IS NULL').get(Number(id), u) || null;
function createNeed(u, n) {
  const r = db.prepare('INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES (?, ?, ?, NULL, ?, ?, ?)')
    .run(u, n.positionId, n.weekday, n.start, n.end, n.count);
  return listNeeds(u).find((x) => x.id === Number(r.lastInsertRowid));
}
function updateNeed(u, id, f) {
  const n = ownNeed(u, id);
  if (!n) return null;
  const v = Object.assign({}, n, Object.fromEntries(Object.entries(f).filter(([, x]) => x !== undefined)));
  db.prepare('UPDATE horaire_needs SET positionId = ?, weekday = ?, start = ?, end = ?, count = ? WHERE id = ? AND userId = ?')
    .run(v.positionId, v.weekday, v.start, v.end, v.count, n.id, u);
  return listNeeds(u).find((x) => x.id === n.id);
}
function deleteNeed(u, id) {
  return db.prepare('DELETE FROM horaire_needs WHERE id = ? AND userId = ? AND eventId IS NULL').run(Number(id), u).changes > 0;
}

// ---------- événements spéciaux (remplacent le modèle normal pour leur date) ----------
function listEvents(u, from, to) {
  const evs = (from && to)
    ? db.prepare('SELECT id, day, label FROM horaire_events WHERE userId = ? AND day >= ? AND day <= ? ORDER BY day, id').all(u, from, to)
    : db.prepare('SELECT id, day, label FROM horaire_events WHERE userId = ? ORDER BY day, id').all(u);
  const needs = db.prepare('SELECT eventId, positionId, start, end, count FROM horaire_needs WHERE userId = ? AND eventId IS NOT NULL ORDER BY start').all(u);
  return evs.map((e) => ({ ...e, needs: needs.filter((n) => n.eventId === e.id).map(({ eventId, ...n }) => n) }));
}
function writeEvent(u, id, { day, label, needs }) {
  db.exec('BEGIN');
  try {
    let eventId = id;
    if (eventId) db.prepare('UPDATE horaire_events SET day = ?, label = ? WHERE id = ? AND userId = ?').run(day, label, eventId, u);
    else eventId = Number(db.prepare('INSERT INTO horaire_events (userId, day, label) VALUES (?, ?, ?)').run(u, day, label).lastInsertRowid);
    if (needs) {
      db.prepare('DELETE FROM horaire_needs WHERE userId = ? AND eventId = ?').run(u, eventId);
      const ins = db.prepare('INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES (?, ?, NULL, ?, ?, ?, ?)');
      needs.forEach((n) => ins.run(u, n.positionId, eventId, n.start, n.end, n.count));
    }
    db.exec('COMMIT');
    return listEvents(u).find((e) => e.id === eventId);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function deleteEvent(u, id) {
  const i = Number(id);
  return cascade(u, [['DELETE FROM horaire_needs WHERE eventId = ? AND userId = ?', i], ['DELETE FROM horaire_events WHERE id = ? AND userId = ?', i]]);
}

// ---------- génération et lecture d'une semaine ----------
function getSchedule(u, weekStart) {
  const s = db.prepare('SELECT id, weekStart, status, alerts, generatedAt FROM horaire_schedules WHERE userId = ? AND weekStart = ?').get(u, weekStart);
  if (!s) return null;
  const assignments = db.prepare(`SELECT a.id, a.employeeId, e.name AS employeeName, a.positionId, p.name AS positionName, a.day, a.start, a.end
    FROM horaire_assignments a JOIN horaire_employees e ON e.id = a.employeeId JOIN horaire_positions p ON p.id = a.positionId
    WHERE a.userId = ? AND a.scheduleId = ? ORDER BY a.day, a.start, p.fillOrder`).all(u, s.id);
  let alerts = [];
  try { alerts = JSON.parse(s.alerts || '[]'); } catch (e) { /* illisible : vide */ }
  const emp = new Map(listEmployees(u).map((e) => [e.id, e.name]));
  const pos = new Map(listPositions(u).map((p) => [p.id, p.name]));
  alerts = alerts.map((a) => (a.type === 'trou' ? { ...a, positionName: pos.get(a.positionId) || null } : { ...a, employeeName: emp.get(a.employeeId) || null }));
  return { weekStart: s.weekStart, status: s.status, generatedAt: s.generatedAt, assignments, alerts };
}

// Génère et ENREGISTRE le brouillon de la semaine (remplace le brouillon précédent, modifications manuelles comprises :
// seulement quand le gestionnaire relance « Générer »). Chaque génération fait avancer la rotation.
function generate(u, weekStart) {
  const days = gen.weekDays(weekStart);
  const employees = db.prepare('SELECT id, maxWeekMinutes, wantShiftsMin, wantShiftsMax, wantShiftsTarget, noDouble, restAfterShift FROM horaire_employees WHERE userId = ? AND active = 1').all(u)
    .map((e) => ({ ...e, noDouble: !!e.noDouble, restAfterShift: !!e.restAfterShift }));
  const rot = {};
  db.prepare('SELECT positionId, rank, lastEmployeeId FROM horaire_rotation WHERE userId = ?').all(u)
    .forEach((r) => { rot[r.positionId + ':' + r.rank] = r.lastEmployeeId; });
  const out = gen.generateSchedule({
    weekStart,
    positions: listPositions(u),
    employees,
    qualifications: listQualifications(u),
    availabilities: getAvailabilities(u, weekStart),
    timeoff: getTimeoff(u, weekStart),
    needs: listNeeds(u),
    events: listEvents(u, days[0], days[6]),
    rotation: rot,
    categoryRules: listCategoryRules(u),
  });
  db.exec('BEGIN');
  try {
    const now = nowIso();
    db.prepare(`INSERT INTO horaire_schedules (userId, weekStart, status, alerts, generatedAt) VALUES (?, ?, 'draft', ?, ?)
      ON CONFLICT(userId, weekStart) DO UPDATE SET status = 'draft', alerts = excluded.alerts, generatedAt = excluded.generatedAt`)
      .run(u, weekStart, JSON.stringify(out.alerts), now);
    const sid = db.prepare('SELECT id FROM horaire_schedules WHERE userId = ? AND weekStart = ?').get(u, weekStart).id;
    db.prepare('DELETE FROM horaire_assignments WHERE userId = ? AND scheduleId = ?').run(u, sid);
    const ins = db.prepare('INSERT INTO horaire_assignments (userId, scheduleId, employeeId, positionId, day, start, end) VALUES (?, ?, ?, ?, ?, ?, ?)');
    out.assignments.forEach((a) => ins.run(u, sid, a.employeeId, a.positionId, a.day, a.start, a.end));
    const up = db.prepare(`INSERT INTO horaire_rotation (userId, positionId, rank, lastEmployeeId) VALUES (?, ?, ?, ?)
      ON CONFLICT(userId, positionId, rank) DO UPDATE SET lastEmployeeId = excluded.lastEmployeeId`);
    Object.entries(out.rotation).forEach(([k, empId]) => { const [p, r] = k.split(':').map(Number); if (ownPosition(u, p)) up.run(u, p, r, empId); });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return getSchedule(u, weekStart);
}

// ---------- modification manuelle de l'horaire généré (jamais écrasée sauf par une nouvelle génération demandée) ----------
const scheduleId = (u, weekStart) => (db.prepare('SELECT id FROM horaire_schedules WHERE userId = ? AND weekStart = ?').get(u, weekStart) || {}).id || null;
// Quart du compte ET de la semaine ; null sinon.
function ownAssignment(u, weekStart, id) {
  const sid = scheduleId(u, weekStart);
  return sid ? (db.prepare('SELECT * FROM horaire_assignments WHERE id = ? AND userId = ? AND scheduleId = ?').get(Number(id), u, sid) || null) : null;
}
const oneAssignment = (u, weekStart, id) => (getSchedule(u, weekStart) || { assignments: [] }).assignments.find((a) => a.id === Number(id)) || null;
// a : { employeeId, positionId, day, start, end } déjà validés (appartenance comprise). null si la semaine n'a pas d'horaire.
function addAssignment(u, weekStart, a) {
  const sid = scheduleId(u, weekStart);
  if (!sid) return null;
  const r = db.prepare('INSERT INTO horaire_assignments (userId, scheduleId, employeeId, positionId, day, start, end) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(u, sid, Number(a.employeeId), Number(a.positionId), a.day, a.start, a.end);
  return oneAssignment(u, weekStart, r.lastInsertRowid);
}
// f : { employeeId?, start?, end? } déjà validés ; undefined = inchangé.
function updateAssignment(u, weekStart, id, f) {
  const cur = ownAssignment(u, weekStart, id);
  if (!cur) return null;
  db.prepare('UPDATE horaire_assignments SET employeeId = ?, start = ?, end = ? WHERE id = ? AND userId = ?')
    .run(f.employeeId !== undefined ? Number(f.employeeId) : cur.employeeId, f.start !== undefined ? f.start : cur.start, f.end !== undefined ? f.end : cur.end, cur.id, u);
  return oneAssignment(u, weekStart, cur.id);
}
function deleteAssignment(u, weekStart, id) {
  const cur = ownAssignment(u, weekStart, id);
  return cur ? db.prepare('DELETE FROM horaire_assignments WHERE id = ? AND userId = ?').run(cur.id, u).changes > 0 : false;
}

// ---------- export Dayforce (format centralisé dans ./horaire-dayforce.js) ----------
// Code d'unité (lieu) Dayforce : un par compte (colonne users.horaireDayforceLocation). Réglages de la configuration guidée
// (table horaire_settings, une ligne par compte) : drapeau configured, étape courante (reprise après ✕), événements, hébergement
// au Canada, fichier modèle d'import Dayforce (texte, seulement le nom est renvoyé). Aucun n'agit encore sur la génération.
const SETTING_COLS = ['configured', 'setupStep', 'eventsSource', 'eventsNoticeDays', 'eventsStaffRule', 'dataInCanada'];
function getSettings(u) {
  const r = db.prepare('SELECT horaireDayforceLocation AS dayforceLocation FROM users WHERE id = ?').get(u);
  const s = db.prepare('SELECT ' + SETTING_COLS.join(', ') + ', dayforceTemplateName FROM horaire_settings WHERE userId = ?').get(u) || {};
  return {
    dayforceLocation: (r && r.dayforceLocation) || null,
    configured: !!s.configured, setupStep: s.setupStep || 0,
    eventsSource: s.eventsSource || null, eventsNoticeDays: s.eventsNoticeDays == null ? null : s.eventsNoticeDays,
    eventsStaffRule: s.eventsStaffRule || null, dataInCanada: s.dataInCanada || null,
    dayforceTemplateName: s.dayforceTemplateName || null,
  };
}
// f : champs déjà validés par la route ; undefined = inchangé. dayforceTemplate : { name, content } ou null (retiré).
function setSettings(u, f) {
  if (f.dayforceLocation !== undefined) db.prepare('UPDATE users SET horaireDayforceLocation = ? WHERE id = ?').run(f.dayforceLocation || null, u);
  const sets = [], args = [];
  SETTING_COLS.forEach((c) => { if (f[c] !== undefined) { sets.push(c + ' = ?'); args.push(typeof f[c] === 'boolean' ? (f[c] ? 1 : 0) : f[c]); } });
  if (f.dayforceTemplate !== undefined) {
    sets.push('dayforceTemplateName = ?', 'dayforceTemplate = ?');
    args.push(f.dayforceTemplate ? f.dayforceTemplate.name : null, f.dayforceTemplate ? f.dayforceTemplate.content : null);
  }
  if (sets.length) {
    db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
    db.prepare('UPDATE horaire_settings SET ' + sets.join(', ') + ', updatedAt = ? WHERE userId = ?').run(...args, nowIso(), u);
  }
  return getSettings(u);
}
// CSV de l'horaire enregistré de la semaine ; null si aucun horaire. Seuls les quarts sont exportés (jamais les trous).
function exportDayforce(u, weekStart) {
  const s = db.prepare('SELECT id FROM horaire_schedules WHERE userId = ? AND weekStart = ?').get(u, weekStart);
  if (!s) return null;
  const assignments = db.prepare(`SELECT a.employeeId, e.dayforceId, a.positionId, p.dayforceCode, p.fillOrder, a.day, a.start, a.end
    FROM horaire_assignments a JOIN horaire_employees e ON e.id = a.employeeId AND e.userId = a.userId
    JOIN horaire_positions p ON p.id = a.positionId AND p.userId = a.userId
    WHERE a.userId = ? AND a.scheduleId = ?`).all(u, s.id);
  return require('./horaire-dayforce').buildDayforceCsv(assignments, getSettings(u).dayforceLocation);
}

// ---------- prompt d'inscription pour l'IA du gestionnaire (texte assemblé par ./horaire-prompt.js ; le serveur ne l'envoie à aucune IA) ----------
// Inscrit l'horaire ENREGISTRÉ de la semaine tel quel ; null si la semaine n'a pas encore d'horaire.
// Consignes personnalisées par le gérant si elles existent ; la semaine et les quarts sont toujours ajoutés par l'app.
function weekPrompt(u, weekStart) {
  const s = getSchedule(u, weekStart);
  if (!s) return null;
  return require('./horaire-prompt').buildRegistrationPrompt({ weekStart, assignments: s.assignments, instructions: getPrompts(u).entryPrompt.text });
}

// ---------- prompts modifiables par le gérant (NULL = version de base) ----------
const PROMPT_MAX = 8000;
// Texte de prompt : caractères de contrôle retirés (sauf retour à la ligne et tabulation), fins de ligne \n ;
// null ou '' = version de base (null) ; undefined = invalide (pas une chaîne ou plus de PROMPT_MAX caractères).
function promptText(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  if (s.length > PROMPT_MAX) return undefined;
  return s.trim() ? s : null;
}
function getPrompts(u) {
  const P = require('./horaire-prompt');
  const r = db.prepare('SELECT importPrompt, entryPrompt FROM horaire_settings WHERE userId = ?').get(u) || {};
  return {
    importPrompt: { text: r.importPrompt || P.IMPORT_PROMPT, isDefault: !r.importPrompt },
    entryPrompt: { text: r.entryPrompt || P.ENTRY_PROMPT, isDefault: !r.entryPrompt },
  };
}
// f : { importPrompt?, entryPrompt? } déjà passés par promptText ; undefined = inchangé, null = version de base.
function setPrompts(u, f) {
  const sets = [], args = [];
  ['importPrompt', 'entryPrompt'].forEach((k) => { if (f[k] !== undefined) { sets.push(k + ' = ?'); args.push(f[k]); } });
  if (sets.length) {
    db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
    db.prepare('UPDATE horaire_settings SET ' + sets.join(', ') + ', updatedAt = ? WHERE userId = ?').run(...args, nowIso(), u);
  }
  return getPrompts(u);
}

// ---------- import CSV (format souple, documenté dans docs/basic/module-horaire.md) ----------
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Séparateur détecté sur la 1re ligne (; , ou tabulation) ; guillemets "..." gérés ; lignes vides ignorées. Texte collé
// accepté (27 oct. 2026) : bloc de code entouré de ``` (avec ou sans langue) et espaces autour ignorés.
function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*```/.test(l));
  if (!lines.length) return [];
  const first = lines[0];
  const sep = [';', '\t', ','].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  return lines.slice(0, LIMITS.csvRows + 1).map((line) => {
    const cells = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }).filter((cells) => cells.some(Boolean)); // ligne faite de séparateurs seuls : ignorée
}

// Repère les colonnes d'après l'en-tête (si la 1re ligne en est un), sinon ordre par défaut.
function columns(rows, spec) {
  const head = rows[0].map(fold);
  const found = {};
  for (const [key, names] of Object.entries(spec)) {
    const i = head.findIndex((h) => names.includes(h));
    if (i >= 0) found[key] = i;
  }
  if (Object.keys(found).length) return { idx: found, data: rows.slice(1) };
  return { idx: Object.fromEntries(Object.keys(spec).map((k, i) => [k, i])), data: rows };
}

// '17', '17h', '17h30', '17:30', '1730', '5 pm' -> 'HH:MM' ; null si illisible.
function normTime(s) {
  let t = fold(s).replace(/\s+/g, '');
  const pm = /pm$/.test(t), am = /am$/.test(t);
  t = t.replace(/(am|pm)$/, '');
  let m = /^(\d{1,2})(?:[:h.](\d{2})?)?$/.exec(t) || /^(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]); const mi = Number(m[2] || 0);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  const out = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  return isTime(out) ? out : null;
}

const WEEKDAYS = [['lundi', 'lun', 'monday', 'mon'], ['mardi', 'mar', 'tuesday', 'tue'], ['mercredi', 'mer', 'wednesday', 'wed'],
  ['jeudi', 'jeu', 'thursday', 'thu'], ['vendredi', 'ven', 'friday', 'fri'], ['samedi', 'sam', 'saturday', 'sat'], ['dimanche', 'dim', 'sunday', 'sun']];
// Jour d'une ligne : date AAAA-MM-JJ de la semaine, ou nom du jour (fr/en, complet ou abrégé).
function normDay(s, weekStart) {
  const v = fold(s).replace(/\.$/, '');
  const days = gen.weekDays(weekStart);
  if (days.includes(v)) return v;
  const i = WEEKDAYS.findIndex((names) => names.includes(v));
  return i >= 0 ? days[i] : null;
}

const findEmployeeByName = (u, name) => db.prepare('SELECT * FROM horaire_employees WHERE userId = ? AND name = ? COLLATE NOCASE').get(u, name) || null;

// Employés : nom ; max d'heures hebdo (facultatif) ; postes (facultatif, « Serveur:1 | Hôte:2 » ou une colonne par poste).
// Avec en-tête seulement (27 oct. 2026) : quarts min, quarts max (souhaités par semaine), contrainte, « jamais de double » et
// « repos après un quart » (oui/non), à n'importe quelle place.
// Un nom déjà connu met l'employé à jour (pas de doublon ; cellule vide = inchangé) ; un poste inconnu est créé à la fin de l'ordre de comblement.
const EXTRA_EMPLOYEE_COLS = {
  wantShiftsMin: ['quarts min', 'quarts souhaites min', 'min quarts', 'shifts min', 'min shifts'],
  wantShiftsMax: ['quarts max', 'quarts souhaites max', 'max quarts', 'shifts max', 'max shifts'],
  wantShiftsTarget: ['cible', 'quarts cible', 'cible quarts', 'target', 'shifts target'],
  constraintNote: ['contrainte', 'contrainte particuliere', 'constraint'],
  noDouble: ['jamais de double', 'pas de double', 'no double'],
  restAfterShift: ['repos apres un quart', 'repos apres chaque quart', 'rest after shift'],
};
// oui/non (aussi yes/no, 1/0, vrai/faux) -> booléen ; undefined = illisible.
function yesNo(v) {
  const s = fold(v);
  if (['oui', 'o', 'yes', 'y', '1', 'vrai', 'true', 'x'].includes(s)) return true;
  if (['non', 'n', 'no', '0', 'faux', 'false'].includes(s)) return false;
  return undefined;
}
const EXTRA_ERRORS = { constraintNote: 'contrainte trop longue', noDouble: 'jamais de double : oui ou non', restAfterShift: 'repos après un quart : oui ou non' };
function importEmployeesCsv(u, text) {
  const rows = parseCsv(text);
  if (!rows.length) return { created: 0, updated: 0, skipped: [] };
  const { idx, data } = columns(rows, {
    name: ['nom', 'name', 'employe', 'employee', 'prenom et nom'],
    max: ['max', 'max heures', 'max_heures', 'heures max', 'heures', 'max hours', 'hours'],
    positions: ['postes', 'poste', 'positions', 'position', 'role', 'roles'],
  });
  // Colonnes facultatives : reconnues par l'en-tête seulement (un fichier sans en-tête garde l'ordre nom ; max ; postes...).
  const head = rows[0].map(fold);
  const extra = {};
  if (data.length < rows.length) {
    Object.entries(EXTRA_EMPLOYEE_COLS).forEach(([k, names]) => { const i = head.findIndex((x) => names.includes(x)); if (i >= 0) extra[k] = i; });
  }
  // Les postes s'étendent jusqu'à la colonne reconnue suivante (une colonne par poste possible).
  const posEnd = idx.positions === undefined ? 0
    : Math.min(...Object.values(idx).concat(Object.values(extra)).filter((i) => i > idx.positions), Infinity);
  const res = { created: 0, updated: 0, skipped: [] };
  db.exec('BEGIN');
  try {
    data.forEach((cells, n) => {
      const name = cleanName(cells[idx.name]);
      if (!name) { res.skipped.push({ line: n + 1, reason: 'nom manquant' }); return; }
      const maxH = idx.max !== undefined ? String(cells[idx.max] || '').replace(/h$/i, '').trim() : '';
      const maxM = maxH === '' ? null : maxMinutes(Number(maxH.replace(',', '.')) * 60);
      if (maxM === undefined) { res.skipped.push({ line: n + 1, reason: 'max d\'heures illisible' }); return; }
      const more = {};
      for (const [k, i] of Object.entries(extra)) {
        const raw = String(cells[i] || '').trim();
        if (raw === '') continue;
        more[k] = k === 'constraintNote' ? constraintText(raw) : (k === 'noDouble' || k === 'restAfterShift') ? yesNo(raw) : shiftCount(raw);
        if (more[k] === undefined) { res.skipped.push({ line: n + 1, reason: EXTRA_ERRORS[k] || 'quarts souhaités illisibles (0 à ' + LIMITS.shifts + ')' }); return; }
      }
      let emp = findEmployeeByName(u, name);
      const lo = more.wantShiftsMin !== undefined ? more.wantShiftsMin : (emp ? emp.wantShiftsMin : null);
      const hi = more.wantShiftsMax !== undefined ? more.wantShiftsMax : (emp ? emp.wantShiftsMax : null);
      if (lo != null && hi != null && lo > hi) { res.skipped.push({ line: n + 1, reason: 'quarts min supérieur au max' }); return; }
      const tg = more.wantShiftsTarget !== undefined ? more.wantShiftsTarget : (emp ? emp.wantShiftsTarget : null);
      if (tg != null && ((lo != null && tg < lo) || (hi != null && tg > hi))) { res.skipped.push({ line: n + 1, reason: 'cible hors du min et du max' }); return; }
      if (emp) { updateEmployee(u, emp.id, { maxWeekMinutes: maxH === '' ? undefined : maxM, ...more }); res.updated += 1; }
      else {
        if (countEmployees(u) >= LIMITS.employees) { res.skipped.push({ line: n + 1, reason: 'limite d\'employés atteinte' }); return; }
        emp = createEmployee(u, { name, maxWeekMinutes: maxM, ...more }); res.created += 1;
      }
      const posCells = idx.positions !== undefined ? cells.slice(idx.positions, posEnd) : [];
      posCells.join('|').split(/[|/]/).map((s) => s.trim()).filter(Boolean).forEach((tok) => {
        const m = /^(.*?)\s*[:=]\s*(\d+)$/.exec(tok);
        const pname = cleanName(m ? m[1] : tok);
        const rank = m ? Math.max(1, Number(m[2])) : 1;
        if (!pname) return;
        let pos = db.prepare('SELECT * FROM horaire_positions WHERE userId = ? AND name = ? COLLATE NOCASE').get(u, pname);
        if (!pos) { if (countPositions(u) >= LIMITS.positions) return; pos = createPosition(u, { name: pname }); }
        setQualification(u, emp.id, pos.id, rank);
      });
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return res;
}

// Correspondance tolérante d'un nom (import des disponibilités) : casse, accents, espaces et ordre des mots ignorés,
// « Nom, Prénom » = « Prénom Nom ». Deux employés de même clé : ambigu, aucun n'est choisi.
const nameKey = (s) => fold(s).replace(/,/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
function employeeMatcher(u) {
  const byKey = new Map();
  db.prepare('SELECT id, name FROM horaire_employees WHERE userId = ?').all(u).forEach((e) => {
    const k = nameKey(e.name);
    byKey.set(k, byKey.has(k) ? null : e);
  });
  return (name) => byKey.get(nameKey(name)) || null;
}

// Disponibilités d'une semaine : nom ; jour (date ou nom du jour) ; début ; fin ; type (facultatif). Une ligne par plage.
// type « vacances », « congé », « maladie » ou « absence » = jour de congé entier (début et fin ignorés). Format rendu par
// le prompt fixe de lecture (./horaire-prompt.js IMPORT_PROMPT). Remplace les disponibilités ET les congés de la semaine des
// seuls employés présents dans le fichier ; un employé avec seulement des congés est valide. La note libre de l'employé
// (constraintNote) n'est jamais touchée.
const TIMEOFF_TYPES = ['vacances', 'conge', 'conges', 'maladie', 'absence'];
function importAvailabilitiesCsv(u, weekStart, text) {
  const rows = parseCsv(text);
  const res = { employees: 0, intervals: 0, timeoff: 0, unknown: [], skipped: [] };
  if (!rows.length) return res;
  const { idx, data } = columns(rows, {
    name: ['nom', 'name', 'employe', 'employee'],
    day: ['jour', 'date', 'day'],
    start: ['debut', 'de', 'start', 'from', 'heure debut'],
    end: ['fin', 'a', 'end', 'to', 'heure fin'],
    type: ['type'],
  });
  const match = employeeMatcher(u);
  const byEmp = new Map();
  data.forEach((cells, n) => {
    const name = cleanName(cells[idx.name]);
    const emp = name && match(name);
    if (!emp) { if (name && !res.unknown.includes(name)) res.unknown.push(name); return; }
    const day = normDay(cells[idx.day], weekStart);
    const type = idx.type !== undefined ? fold(cells[idx.type]) : '';
    if (!byEmp.has(emp.id)) byEmp.set(emp.id, { intervals: [], timeoff: [] });
    if (type && TIMEOFF_TYPES.includes(type)) {
      if (!day) { res.skipped.push({ line: n + 1, reason: 'jour illisible' }); return; }
      byEmp.get(emp.id).timeoff.push(day);
      return;
    }
    const start = normTime(cells[idx.start]);
    const end = normTime(cells[idx.end]);
    if (!day || !start || !end || start === end) { res.skipped.push({ line: n + 1, reason: type ? 'type inconnu' : 'jour ou heures illisibles' }); return; }
    byEmp.get(emp.id).intervals.push({ day, start, end });
  });
  for (const [empId, v] of byEmp) {
    if (!v.intervals.length && !v.timeoff.length) continue; // aucune ligne lisible : on ne vide pas sa semaine
    const timeoff = [...new Set(v.timeoff)];
    const intervals = v.intervals.filter((i) => !timeoff.includes(i.day));
    setAvailabilities(u, weekStart, empId, intervals, timeoff);
    res.employees += 1; res.intervals += intervals.length; res.timeoff += timeoff.length;
  }
  return res;
}

// Réservations OpenTable (rapport « Réservations » de GuestCenter, export CSV) : date, heure et taille du groupe (+ statut facultatif).
// Format souple (en-têtes français ou anglais, séparateur ; , ou tabulation). Seuls ces champs sont lus : jamais le nom du client ni ses notes.
// Une réservation annulée ou « no show » ne compte pas. Les totaux des jours présents dans le fichier REMPLACENT les anciens (réimporter est sans danger).
const CANCELLED = ['annule', 'annulee', 'cancelled', 'canceled', 'cancel', 'no show', 'no-show', 'noshow', 'absent', 'absente'];
// 'AAAA-MM-JJ' ou 'JJ/MM/AAAA' (jour d'abord, comme au Québec) ou 'AAAA/MM/JJ' ; null si illisible.
function normDate(s) {
  const v = String(s || '').trim().split(/[ T]/)[0];
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(v);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; } // JJ/MM impossible : c'était MM/JJ
  }
  const out = String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  return isDate(out) ? out : null;
}
function importReservationsCsv(u, text) {
  const rows = parseCsv(text);
  const res = { days: 0, covers: 0, reservations: 0, skipped: [], error: null };
  if (!rows.length) return res;
  const head = rows[0].map(fold);
  const spec = {
    date: ['date', 'reservation date', 'date de reservation', 'date de la reservation', 'jour', 'day'],
    time: ['heure', 'time', 'reservation time', 'heure de reservation', 'heure de la reservation'],
    size: ['taille du groupe', 'taille', 'party size', 'size', 'couverts', 'covers', 'nombre de personnes', 'personnes', 'convives', 'guests'],
    status: ['statut', 'status', 'etat'],
  };
  const idx = {};
  for (const [k, names] of Object.entries(spec)) { const i = head.findIndex((x) => names.includes(x)); if (i >= 0) idx[k] = i; }
  if (idx.date === undefined || idx.time === undefined || idx.size === undefined) {
    res.error = 'Colonnes non reconnues : il faut une date, une heure et la taille du groupe dans la première ligne.';
    return res;
  }
  const totals = new Map(); // 'jour|service' -> couverts
  rows.slice(1).forEach((cells, n) => {
    if (idx.status !== undefined && CANCELLED.includes(fold(cells[idx.status]))) return;
    const day = normDate(cells[idx.date]);
    const time = normTime(String(cells[idx.time] || '').replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1'));
    const size = Number(String(cells[idx.size] || '').trim());
    if (!day || !time || !Number.isInteger(size) || size < 1 || size > 500) { res.skipped.push({ line: n + 2, reason: 'date, heure ou taille illisible' }); return; }
    const key = day + '|' + (gen.toMin(time) >= 16 * 60 ? 'soir' : 'jour');
    totals.set(key, (totals.get(key) || 0) + size);
    res.reservations += 1;
  });
  const days = [...new Set([...totals.keys()].map((k) => k.split('|')[0]))];
  db.exec('BEGIN');
  try {
    const del = db.prepare('DELETE FROM horaire_covers WHERE userId = ? AND day = ?');
    const ins = db.prepare('INSERT INTO horaire_covers (userId, day, service, covers, updatedAt) VALUES (?, ?, ?, ?, ?)');
    days.forEach((d) => del.run(u, d));
    const now = nowIso();
    for (const [key, covers] of totals) { const [d, svc] = key.split('|'); ins.run(u, d, svc, covers, now); res.covers += covers; }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.days = days.length;
  return res;
}
// Totaux de la semaine : [{ day, service: 'jour'|'soir', covers }].
function weekCovers(u, weekStart) {
  return db.prepare('SELECT day, service, covers FROM horaire_covers WHERE userId = ? AND day >= ? AND day <= ? ORDER BY day, service')
    .all(u, weekStart, gen.addDays(weekStart, 6));
}

module.exports = {
  importReservationsCsv, weekCovers, normDate,
  LIMITS, isDate, isMonday, isTime, cleanName, maxMinutes, shiftCount, constraintText, ownEmployee, ownPosition, ownEvent, weekPrompt,
  listEmployees, countEmployees, createEmployee, updateEmployee, deleteEmployee,
  listPositions, countPositions, createPosition, updatePosition, deletePosition,
  listQualifications, setQualification, removeQualification,
  getAvailabilities, setAvailabilities, getTimeoff, availSummary,
  CATEGORY_RULES, listCategoryRules, addCategoryRule, removeCategoryRule,
  listNeeds, createNeed, updateNeed, deleteNeed,
  listEvents, writeEvent, deleteEvent,
  generate, getSchedule, getSettings, setSettings, exportDayforce,
  ownAssignment, addAssignment, updateAssignment, deleteAssignment,
  getPrompts, setPrompts, promptText, PROMPT_MAX,
  parseCsv, normTime, normDay, importEmployeesCsv, importAvailabilitiesCsv,
};
