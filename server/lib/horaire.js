// Module « Horaire » : couche données (gestionnaire seul). Chaque fonction reçoit le userId de la SESSION et filtre
// toutes ses requêtes par lui ; un id fourni par le client n'est jamais utilisé sans vérifier qu'il appartient au compte.
// Données du personnel = confidentielles (Loi 25) : jamais envoyées à l'IA, à la Communauté, au partage ni aux journaux ;
// exportées par server/lib/dataexport.js, effacées par server/lib/accountdeletion.js. Génération : ./horaire-generation.js.
const db = require('../db');
const gen = require('./horaire-generation');

const nowIso = () => new Date().toISOString();
const LIMITS = { name: 80, label: 120, employees: 500, positions: 50, csvChars: 200000, csvRows: 5000 };

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

// ---------- propriété ----------
const ownEmployee = (u, id) => db.prepare('SELECT * FROM horaire_employees WHERE id = ? AND userId = ?').get(Number(id), u) || null;
const ownPosition = (u, id) => db.prepare('SELECT * FROM horaire_positions WHERE id = ? AND userId = ?').get(Number(id), u) || null;
const ownEvent = (u, id) => db.prepare('SELECT * FROM horaire_events WHERE id = ? AND userId = ?').get(Number(id), u) || null;

// ---------- employés (le max hebdo, en minutes, est un champ de l'employé) ----------
function listEmployees(u) {
  return db.prepare('SELECT id, name, maxWeekMinutes, active, dayforceId, createdAt FROM horaire_employees WHERE userId = ? ORDER BY name COLLATE NOCASE, id').all(u)
    .map((e) => ({ ...e, active: !!e.active }));
}
function countEmployees(u) { return db.prepare('SELECT COUNT(*) AS n FROM horaire_employees WHERE userId = ?').get(u).n; }
function createEmployee(u, { name, maxWeekMinutes, dayforceId }) {
  const r = db.prepare('INSERT INTO horaire_employees (userId, name, maxWeekMinutes, active, dayforceId, createdAt) VALUES (?, ?, ?, 1, ?, ?)')
    .run(u, name, maxWeekMinutes === undefined ? null : maxWeekMinutes, dayforceId || null, nowIso());
  return listEmployees(u).find((e) => e.id === Number(r.lastInsertRowid));
}
function updateEmployee(u, id, f) {
  const e = ownEmployee(u, id);
  if (!e) return null;
  db.prepare('UPDATE horaire_employees SET name = ?, maxWeekMinutes = ?, active = ?, dayforceId = ? WHERE id = ? AND userId = ?').run(
    f.name !== undefined ? f.name : e.name,
    f.maxWeekMinutes !== undefined ? f.maxWeekMinutes : e.maxWeekMinutes,
    f.active !== undefined ? (f.active ? 1 : 0) : e.active,
    f.dayforceId !== undefined ? (f.dayforceId || null) : e.dayforceId, e.id, u);
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
// Effacement réel (droit à l'effacement de l'employé) : ses qualifications, disponibilités et quarts partent avec lui.
function deleteEmployee(u, id) {
  const i = Number(id);
  return cascade(u, [
    ['DELETE FROM horaire_qualifications WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_availabilities WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_assignments WHERE employeeId = ? AND userId = ?', i],
    ['UPDATE horaire_rotation SET lastEmployeeId = NULL WHERE lastEmployeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_employees WHERE id = ? AND userId = ?', i],
  ]);
}

// ---------- postes (ordre de comblement = fillOrder croissant) ----------
function listPositions(u) {
  return db.prepare('SELECT id, name, fillOrder, dayforceCode, createdAt FROM horaire_positions WHERE userId = ? ORDER BY fillOrder, id').all(u);
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
  db.prepare('UPDATE horaire_positions SET name = ?, fillOrder = ?, dayforceCode = ? WHERE id = ? AND userId = ?')
    .run(f.name !== undefined ? f.name : p.name, f.fillOrder !== undefined ? f.fillOrder : p.fillOrder,
      f.dayforceCode !== undefined ? (f.dayforceCode || null) : p.dayforceCode, p.id, u);
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
// Remplace les disponibilités d'UN employé pour la semaine. intervals déjà validés : [{day, start, end}].
function setAvailabilities(u, weekStart, employeeId, intervals) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM horaire_availabilities WHERE userId = ? AND weekStart = ? AND employeeId = ?').run(u, weekStart, Number(employeeId));
    const ins = db.prepare('INSERT INTO horaire_availabilities (userId, employeeId, weekStart, day, start, end) VALUES (?, ?, ?, ?, ?, ?)');
    intervals.forEach((i) => ins.run(u, Number(employeeId), weekStart, i.day, i.start, i.end));
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return getAvailabilities(u, weekStart).filter((a) => a.employeeId === Number(employeeId));
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

// Génère et ENREGISTRE le brouillon de la semaine (remplace le brouillon précédent). Chaque génération fait avancer la rotation.
function generate(u, weekStart) {
  const days = gen.weekDays(weekStart);
  const employees = db.prepare('SELECT id, maxWeekMinutes FROM horaire_employees WHERE userId = ? AND active = 1').all(u);
  const rot = {};
  db.prepare('SELECT positionId, rank, lastEmployeeId FROM horaire_rotation WHERE userId = ?').all(u)
    .forEach((r) => { rot[r.positionId + ':' + r.rank] = r.lastEmployeeId; });
  const out = gen.generateSchedule({
    weekStart,
    positions: listPositions(u),
    employees,
    qualifications: listQualifications(u),
    availabilities: getAvailabilities(u, weekStart),
    needs: listNeeds(u),
    events: listEvents(u, days[0], days[6]),
    rotation: rot,
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

// ---------- export Dayforce (format centralisé dans ./horaire-dayforce.js) ----------
// Code d'unité (lieu) Dayforce : un par compte (colonne users.horaireDayforceLocation).
function getSettings(u) {
  const r = db.prepare('SELECT horaireDayforceLocation AS dayforceLocation FROM users WHERE id = ?').get(u);
  return { dayforceLocation: (r && r.dayforceLocation) || null };
}
function setSettings(u, { dayforceLocation }) {
  if (dayforceLocation !== undefined) db.prepare('UPDATE users SET horaireDayforceLocation = ? WHERE id = ?').run(dayforceLocation || null, u);
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

// ---------- import CSV (format souple, documenté dans docs/basic/module-horaire.md) ----------
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Séparateur détecté sur la 1re ligne (; , ou tabulation) ; guillemets "..." gérés ; lignes vides ignorées.
function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
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
// Un nom déjà connu met l'employé à jour (pas de doublon) ; un poste inconnu est créé à la fin de l'ordre de comblement.
function importEmployeesCsv(u, text) {
  const rows = parseCsv(text);
  if (!rows.length) return { created: 0, updated: 0, skipped: [] };
  const { idx, data } = columns(rows, {
    name: ['nom', 'name', 'employe', 'employee', 'prenom et nom'],
    max: ['max', 'max heures', 'max_heures', 'heures max', 'heures', 'max hours', 'hours'],
    positions: ['postes', 'poste', 'positions', 'position', 'role', 'roles'],
  });
  const res = { created: 0, updated: 0, skipped: [] };
  db.exec('BEGIN');
  try {
    data.forEach((cells, n) => {
      const name = cleanName(cells[idx.name]);
      if (!name) { res.skipped.push({ line: n + 1, reason: 'nom manquant' }); return; }
      const maxH = idx.max !== undefined ? String(cells[idx.max] || '').replace(/h$/i, '').trim() : '';
      const maxM = maxH === '' ? null : maxMinutes(Number(maxH.replace(',', '.')) * 60);
      if (maxM === undefined) { res.skipped.push({ line: n + 1, reason: 'max d\'heures illisible' }); return; }
      let emp = findEmployeeByName(u, name);
      if (emp) { updateEmployee(u, emp.id, { maxWeekMinutes: maxH === '' ? undefined : maxM }); res.updated += 1; }
      else {
        if (countEmployees(u) >= LIMITS.employees) { res.skipped.push({ line: n + 1, reason: 'limite d\'employés atteinte' }); return; }
        emp = createEmployee(u, { name, maxWeekMinutes: maxM }); res.created += 1;
      }
      const posCells = idx.positions !== undefined ? cells.slice(idx.positions) : [];
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

// Disponibilités d'une semaine : nom ; jour (date ou nom du jour) ; début ; fin. Une ligne par plage.
// Remplace les disponibilités de la semaine des seuls employés présents dans le fichier.
function importAvailabilitiesCsv(u, weekStart, text) {
  const rows = parseCsv(text);
  const res = { employees: 0, intervals: 0, unknown: [], skipped: [] };
  if (!rows.length) return res;
  const { idx, data } = columns(rows, {
    name: ['nom', 'name', 'employe', 'employee'],
    day: ['jour', 'date', 'day'],
    start: ['debut', 'de', 'start', 'from', 'heure debut'],
    end: ['fin', 'a', 'end', 'to', 'heure fin'],
  });
  const byEmp = new Map();
  data.forEach((cells, n) => {
    const name = cleanName(cells[idx.name]);
    const emp = name && findEmployeeByName(u, name);
    if (!emp) { if (name && !res.unknown.includes(name)) res.unknown.push(name); return; }
    const day = normDay(cells[idx.day], weekStart);
    const start = normTime(cells[idx.start]);
    const end = normTime(cells[idx.end]);
    if (!day || !start || !end || start === end) { res.skipped.push({ line: n + 1, reason: 'jour ou heures illisibles' }); return; }
    if (!byEmp.has(emp.id)) byEmp.set(emp.id, []);
    byEmp.get(emp.id).push({ day, start, end });
  });
  for (const [empId, list] of byEmp) { setAvailabilities(u, weekStart, empId, list); res.employees += 1; res.intervals += list.length; }
  return res;
}

module.exports = {
  LIMITS, isDate, isMonday, isTime, cleanName, maxMinutes, ownEmployee, ownPosition, ownEvent,
  listEmployees, countEmployees, createEmployee, updateEmployee, deleteEmployee,
  listPositions, countPositions, createPosition, updatePosition, deletePosition,
  listQualifications, setQualification, removeQualification,
  getAvailabilities, setAvailabilities,
  listNeeds, createNeed, updateNeed, deleteNeed,
  listEvents, writeEvent, deleteEvent,
  generate, getSchedule, getSettings, setSettings, exportDayforce,
  parseCsv, normTime, normDay, importEmployeesCsv, importAvailabilitiesCsv,
};
