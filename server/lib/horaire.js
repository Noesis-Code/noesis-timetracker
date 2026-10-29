// Module « Horaire » : couche données (gestionnaire seul). Chaque fonction reçoit le userId de la SESSION et filtre
// toutes ses requêtes par lui ; un id fourni par le client n'est jamais utilisé sans vérifier qu'il appartient au compte.
// Données du personnel = confidentielles (Loi 25) : jamais envoyées à l'IA, à la Communauté, au partage ni aux journaux ;
// exportées par server/lib/dataexport.js, effacées par server/lib/accountdeletion.js. Génération : ./horaire-generation.js.
const db = require('../db');
const gen = require('./horaire-generation');

const nowIso = () => new Date().toISOString();
const LIMITS = { name: 80, label: 120, employees: 500, positions: 50, csvChars: 200000, csvRows: 5000, shifts: 14, constraint: 500 };

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
  return db.prepare('SELECT id, name, maxWeekMinutes, active, dayforceId, wantShiftsMin, wantShiftsMax, wantShiftsTarget, wantHoursMin, wantHoursTarget, wantHoursMax, constraintNote, noDouble, restAfterShift, sortOrder, createdAt FROM horaire_employees WHERE userId = ? ORDER BY name COLLATE NOCASE, id').all(u)
    .map((e) => ({ ...e, active: !!e.active, noDouble: !!e.noDouble, restAfterShift: !!e.restAfterShift }));
}
// G3 : deux employés actifs du même nom (casse et accents ignorés) sont refusés. exceptId = l'employé modifié.
function nameTaken(u, name, exceptId) {
  const k = fold(name).replace(/s+/g, ' ');
  return listEmployees(u).some((e) => e.active && e.id !== Number(exceptId) && fold(e.name).replace(/s+/g, ' ') === k);
}
function countEmployees(u) { return db.prepare('SELECT COUNT(*) AS n FROM horaire_employees WHERE userId = ?').get(u).n; }
const orNull = (v) => (v === undefined ? null : v);
function createEmployee(u, { name, maxWeekMinutes, dayforceId, wantShiftsMin, wantShiftsMax, wantShiftsTarget, wantHoursMin, wantHoursTarget, wantHoursMax, constraintNote, noDouble, restAfterShift }) {
  const r = db.prepare('INSERT INTO horaire_employees (userId, name, maxWeekMinutes, active, dayforceId, wantShiftsMin, wantShiftsMax, wantShiftsTarget, wantHoursMin, wantHoursTarget, wantHoursMax, constraintNote, noDouble, restAfterShift, createdAt) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(u, name, orNull(maxWeekMinutes), dayforceId || null, orNull(wantShiftsMin), orNull(wantShiftsMax), orNull(wantShiftsTarget), orNull(wantHoursMin), orNull(wantHoursTarget), orNull(wantHoursMax), constraintNote || null, noDouble ? 1 : 0, restAfterShift ? 1 : 0, nowIso());
  return listEmployees(u).find((e) => e.id === Number(r.lastInsertRowid));
}
function updateEmployee(u, id, f) {
  const e = ownEmployee(u, id);
  if (!e) return null;
  const pick = (k) => (f[k] !== undefined ? f[k] : e[k]);
  const flag = (k) => (f[k] !== undefined ? (f[k] ? 1 : 0) : (e[k] ? 1 : 0));
  db.prepare('UPDATE horaire_employees SET name = ?, maxWeekMinutes = ?, active = ?, dayforceId = ?, wantShiftsMin = ?, wantShiftsMax = ?, wantShiftsTarget = ?, wantHoursMin = ?, wantHoursTarget = ?, wantHoursMax = ?, constraintNote = ?, noDouble = ?, restAfterShift = ?, sortOrder = ? WHERE id = ? AND userId = ?').run(
    pick('name'), pick('maxWeekMinutes'),
    f.active !== undefined ? (f.active ? 1 : 0) : e.active,
    f.dayforceId !== undefined ? (f.dayforceId || null) : e.dayforceId,
    pick('wantShiftsMin'), pick('wantShiftsMax'), pick('wantShiftsTarget'), pick('wantHoursMin'), pick('wantHoursTarget'), pick('wantHoursMax'),
    f.constraintNote !== undefined ? (f.constraintNote || null) : e.constraintNote,
    flag('noDouble'), flag('restAfterShift'), pick('sortOrder'), e.id, u);
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
// Retrait depuis la grille (28 oct. 2026) : l'employé devient inactif (plus proposé ni placé) ; ses quarts à partir de today sont retirés ;
// les semaines passées gardent leurs quarts et son nom. Aucune autre donnée n'est effacée (disponibilités, note, qualifications restent).
function retireEmployee(u, id, today) {
  const e = ownEmployee(u, id);
  if (!e) return null;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE horaire_employees SET active = 0 WHERE id = ? AND userId = ?').run(e.id, u);
    const removed = db.prepare('DELETE FROM horaire_assignments WHERE employeeId = ? AND userId = ? AND day >= ?').run(e.id, u, today).changes;
    db.exec('COMMIT');
    return { removed };
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}
function deleteEmployee(u, id) {
  const i = Number(id);
  return cascade(u, [
    ['DELETE FROM horaire_qualifications WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_availabilities WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_timeoff WHERE employeeId = ? AND userId = ?', i],
    ['DELETE FROM horaire_employee_rules WHERE employeeId = ? AND userId = ?', i],
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
// Postes du volet (28 oct. 2026, demande d'Émilien) : créés s'ils manquent (comparaison sans casse ni accents), sans toucher aux postes
// existants ni à leurs données. « Serveur » d'abord (poste principal d'un compte neuf), puis les autres.
const DEFAULT_POSITIONS = ['Serveur', 'Barman', 'Commis', 'Hôte/Hôtesse', 'Suiteur'];
// 29 oct. 2026 : le gestionnaire ajoute, renomme et retire lui-même ses postes. Les postes par défaut ne sont créés qu'une fois, au tout
// premier chargement d'un compte SANS aucun poste ; ensuite (positionsInit), plus jamais (un poste retiré ne revient pas).
function ensureDefaultPositions(u) {
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  const s = db.prepare('SELECT positionsInit FROM horaire_settings WHERE userId = ?').get(u);
  if (!s.positionsInit) {
    if (!countPositions(u)) DEFAULT_POSITIONS.forEach((name) => { if (countPositions(u) < LIMITS.positions) createPosition(u, { name }); });
    db.prepare('UPDATE horaire_settings SET positionsInit = 1 WHERE userId = ?').run(u);
  }
  return listPositions(u);
}
// Nom de poste déjà pris (casse, accents et espaces ignorés) ; exceptId : le poste renommé.
function positionTaken(u, name, exceptId) {
  const k = fold(name).replace(/\s+/g, ' ');
  return listPositions(u).some((p) => p.id !== Number(exceptId) && fold(p.name).replace(/\s+/g, ' ') === k);
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
// Retirer un poste : ses besoins, qualifications, quarts (et rotation), ses règles de types d'événements et ses nombres de planchers
// partent avec lui ; un ancien événement d'une ligne sur ce poste perd son poste. Au moins un poste reste toujours (null sinon).
function deletePosition(u, id) {
  const i = Number(id);
  if (!ownPosition(u, i)) return false;
  if (countPositions(u) <= 1) return null;
  return cascade(u, ['horaire_qualifications', 'horaire_needs', 'horaire_rotation', 'horaire_assignments', 'horaire_event_type_ratios', 'horaire_floor_counts']
    .map((t) => ['DELETE FROM ' + t + ' WHERE positionId = ? AND userId = ?', i])
    .concat([['UPDATE horaire_events SET positionId = NULL WHERE positionId = ? AND userId = ?', i], ['DELETE FROM horaire_positions WHERE id = ? AND userId = ?', i]]));
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

// ---------- règles par employé : liste fermée (CATEGORY_RULES, appliquée par la génération) ou 'free' (texte libre, lu par l'IA) ----------
const RULE_TEXT_MAX = 300;
function listEmployeeRules(u) {
  return db.prepare('SELECT id, employeeId, rule, text FROM horaire_employee_rules WHERE userId = ? ORDER BY employeeId, id').all(u);
}
function addEmployeeRule(u, employeeId, rule, text) {
  if (rule !== 'free') {
    const dup = db.prepare('SELECT id FROM horaire_employee_rules WHERE userId = ? AND employeeId = ? AND rule = ?').get(u, employeeId, rule);
    if (dup) return listEmployeeRules(u).find((r) => r.id === dup.id);
  }
  const r = db.prepare('INSERT INTO horaire_employee_rules (userId, employeeId, rule, text, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(u, Number(employeeId), rule, rule === 'free' ? text : null, nowIso());
  return listEmployeeRules(u).find((x) => x.id === Number(r.lastInsertRowid));
}
function removeEmployeeRule(u, id) {
  return db.prepare('DELETE FROM horaire_employee_rules WHERE id = ? AND userId = ?').run(Number(id), u).changes > 0;
}
// ---------- règles du restaurant : une liste de textes (28 oct. 2026, simplification d'Émilien) ----------
// Affichée à la page 1 et reprise telle quelle dans le prompt pour l'IA ; le générateur ne la lit pas (logique interne fixe).
// Liste de départ : les 9 règles d'origine, puis les anciennes règles libres. Les anciens réglages (off, prefOrder, free) restent en base, ignorés.
const DEFAULT_RESTAURANT_RULES = [
  'Jamais sur un service où l’employé est indisponible.', 'Jamais plus que son maximum, sauf pour qui veut plus (cible au-dessus du max) et seulement s’il reste des quarts.', 'En dernier recours, jusqu’au maximum pour ceux dont la cible est plus basse.',
  'Les notes des employés priment sur toutes les règles.', 'Exactement le nombre demandé à chaque heure d’arrivée.',
  'Le plus de soirs à la catégorie 1, puis 2, 3 et 4.', 'Éviter les doubles (matin et soir le même jour).', 'Éviter fermeture puis ouverture le lendemain.',
  'Au-delà de son maximum, seulement jusqu’à sa cible, s’il reste des quarts, catégorie 1 d’abord.', 'En dernier recours, proposer un employé indisponible à qui demander.',
];
// Arrivées du soir (28 oct. 2026, demande d'Émilien) : appliquées par la génération aux postes de leur portée (Serveur par défaut).
const ARRIVAL_RULES = [
  'Le soir, la catégorie 1 commence toujours à 16:00 ; elle ne prend une arrivée plus tardive que s’il n’y a plus de place à 16:00.',
  'La catégorie 2 a ensuite la priorité sur les arrivées après 16:00 et prend les places de 16:00 laissées libres ; les catégories 3 et 4 suivent, dans l’ordre.',
];
const RESTAURANT_RULES_MAX = 50;
function readRestaurantRules(u) {
  const row = db.prepare('SELECT restaurantRules FROM horaire_settings WHERE userId = ?').get(u);
  let v = {};
  try { v = JSON.parse((row && row.restaurantRules) || '{}') || {}; } catch (e) { v = {}; }
  return v;
}
// Une règle = { text, positions } ; positions = null (tous les postes) ou liste de noms de postes. Une ancienne ligne en texte vaut pour tous.
function normRule(x) {
  if (typeof x === 'string') return x.trim() ? { text: x, positions: null } : null;
  if (!x || typeof x.text !== 'string' || !x.text.trim()) return null;
  const pos = Array.isArray(x.positions) ? [...new Set(x.positions.filter((p) => typeof p === 'string' && p.trim()))] : null;
  return { text: x.text, positions: pos && pos.length ? pos : null };
}
function getRestaurantRules(u) {
  const v = readRestaurantRules(u);
  let list;
  if (Array.isArray(v.list)) list = v.list.map(normRule).filter(Boolean);
  else list = DEFAULT_RESTAURANT_RULES.concat((Array.isArray(v.free) ? v.free : []).map((x) => x && x.text)).map(normRule).filter(Boolean);
  // Règles d'arrivée du soir : ajoutées une seule fois en fin de liste (Serveur), seulement si elles n'y sont pas déjà.
  if (!v.arrivalRulesAdded) {
    ARRIVAL_RULES.forEach((t) => { if (!list.some((r) => r.text === t)) list.push({ text: t, positions: ['Serveur'] }); });
    const next = Object.assign(v, { list, arrivalRulesAdded: true });
    db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
    db.prepare('UPDATE horaire_settings SET restaurantRules = ?, updatedAt = ? WHERE userId = ?').run(JSON.stringify(next), nowIso(), u);
  }
  return { list };
}
// Postes où s'appliquent les règles d'arrivée du soir : portée des lignes correspondantes ; ligne absente = Serveur.
function arrivalPositionIds(u) {
  const list = getRestaurantRules(u).list;
  const lines = list.filter((r) => ARRIVAL_RULES.includes(r.text));
  const all = listPositions(u);
  if (!lines.length) return all.filter((p) => /^serveur$/i.test(p.name)).map((p) => p.id);
  if (lines.some((r) => !r.positions)) return all.map((p) => p.id);
  const names = new Set([].concat(...lines.map((r) => r.positions)));
  return all.filter((p) => names.has(p.name)).map((p) => p.id);
}
function setRestaurantRules(u, list) {
  const v = Object.assign(readRestaurantRules(u), { list });
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  db.prepare('UPDATE horaire_settings SET restaurantRules = ?, updatedAt = ? WHERE userId = ?').run(JSON.stringify(v), nowIso(), u);
  return getRestaurantRules(u);
}
// Poste principal du compte (28 oct. 2026 : plus d'interface de postes) : le premier par ordre de comblement, créé (« Serveur ») s'il manque.
function mainPosition(u) {
  return listPositions(u)[0] || createPosition(u, { name: 'Serveur' });
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
// Conservation minimale (Loi 25, 28 oct. 2026) : un événement dont la date est passée (jour civil de Montréal) est SUPPRIMÉ, avec ses
// lignes. Purge au chargement du module, toutes les 6 h et à chaque lecture. Les quarts déjà générés ne sont jamais touchés.
// HORAIRE_TODAY (AAAA-MM-JJ) : jour fixé pour les tests seulement (jamais posé en production).
function montrealToday(d) {
  if (!d && /^\d{4}-\d{2}-\d{2}$/.test(process.env.HORAIRE_TODAY || '')) return process.env.HORAIRE_TODAY;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d || new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return g('year') + '-' + g('month') + '-' + g('day');
}
function purgePastEvents(today) {
  const t = today || montrealToday();
  const ids = db.prepare('SELECT id FROM horaire_events WHERE day < ?').all(t).map((r) => r.id);
  if (!ids.length) return 0;
  const delNeeds = db.prepare('DELETE FROM horaire_needs WHERE eventId = ?');
  const delEv = db.prepare('DELETE FROM horaire_events WHERE id = ?');
  db.exec('BEGIN');
  try { ids.forEach((id) => { delNeeds.run(id); delEv.run(id); }); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  return ids.length;
}
try { purgePastEvents(); } catch (e) { /* base pas encore prête : la prochaine lecture purge */ }
setInterval(() => { try { purgePastEvents(); } catch (e) { /* réessayé au prochain passage */ } }, 6 * 3600 * 1000).unref();
function listEvents(u, from, to) {
  purgePastEvents();
  const evs = (from && to)
    ? db.prepare('SELECT id, day, label, service, extra, positionId, covers, sourceKey, zoneId, status, manual, mailHint, typeId, typeIds, clients, price, lineManual, time, floorIds FROM horaire_events WHERE userId = ? AND day >= ? AND day <= ? ORDER BY day, id').all(u, from, to)
    : db.prepare('SELECT id, day, label, service, extra, positionId, covers, sourceKey, zoneId, status, manual, mailHint, typeId, typeIds, clients, price, lineManual, time, floorIds FROM horaire_events WHERE userId = ? ORDER BY day, id').all(u);
  const needs = db.prepare('SELECT eventId, positionId, start, end, count FROM horaire_needs WHERE userId = ? AND eventId IS NOT NULL ORDER BY start').all(u);
  // lines (événement d'un service) : ses lignes « poste · +N » ; ancienne ligne (positionId, extra) = un événement d'une seule ligne.
  let dt = null; // types qui comptent au moins un poste de leur famille en dollars (lus une fois)
  const dollarTypes = () => dt || (dt = (() => {
    const pn = new Map(listPositions(u).map((p) => [p.id, fold(p.name)]));
    return listEventTypes(u).filter((t) => Object.keys(t.dollars).some((pid) => TYPE_FAMILIES[t.family].includes(pn.get(Number(pid))))).map((t) => t.id);
  })());
  return evs.map((e) => {
    e.floorIds = evFloorIds(e); e.floorId = e.floorIds.length ? e.floorIds[0] : null; // planchers occupés ; floorId = le premier (ancien champ)
    e.pending = e.status === 'pending'; // reçu par courriel, « à valider »
    let lm = []; try { lm = JSON.parse(e.lineManual || '[]'); } catch (x) { lm = []; }
    e.manualPositions = lm; // postes dont la ligne a été modifiée à la main (jamais recalculée)
    e.typeIds = evTypeIds(e); e.typeId = e.typeIds.length ? e.typeIds[0] : null; // plusieurs types ; typeId = le premier (ancien champ)
    // Prix manquant : un de ses types compte un poste de sa famille en dollars et l'événement n'a pas de prix par personne.
    e.priceMissing = !!(e.typeIds.length && e.clients && !(e.price > 0) && dollarTypes().some((t) => e.typeIds.includes(t)));
    const own = needs.filter((n) => n.eventId === e.id).map(({ eventId, ...n }) => n);
    const lines = e.service ? (own.length ? own.map((n) => ({ positionId: n.positionId, count: n.count })) : (e.extra > 0 ? [{ positionId: e.positionId, count: e.extra }] : [])) : own.map((n) => ({ positionId: n.positionId, count: n.count }));
    // Ancien événement sans service (ses besoins remplacent le modèle) : affiché dans le calendrier sous le service de ses besoins
    // (shownService), pour qu'on puisse le voir, le modifier ou le supprimer ; la génération le traite toujours comme avant.
    if (!e.service) e.shownService = own.length && gen.toMin(own[0].start) >= gen.EVENING_FROM ? 'soir' : 'matin';
    return { ...e, needs: own, lines };
  });
}
// Événement d'un service (28 oct. 2026) : { day, service, covers (facultatif), lines: [{ positionId, count }] } ; ses lignes sont
// enregistrées comme besoins de l'événement (heure du service ; la génération les place à la première arrivée du poste).
const SERVICE_SPAN = { matin: ['10:30', '16:00'], soir: ['16:00', '23:59'] };
// name : nom affiché (label) ; à la création, « Événement N » (premier numéro libre du service ce jour-là). floorIds / floorId :
// planchers occupés (voir evFloorIds ; [] ou null = aucun). undefined = inchangé.
// time : heure du groupe (HH:MM ou null) ; undefined = inchangée.
// Planchers d'un événement (29 oct. 2026, plusieurs planchers) : colonne floorIds (JSON) ; un ancien événement garde son zoneId.
function evFloorIds(e) {
  let a = null; try { a = JSON.parse(e.floorIds || 'null'); } catch (x) { a = null; }
  if (Array.isArray(a)) return [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return e.zoneId != null ? [Number(e.zoneId)] : [];
}
const cleanIds = (ids) => [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
// floorIds : liste des planchers occupés ([] = aucun) ; floorId (ancien champ) : un plancher ou null. undefined = inchangé.
function writeServiceEvent(u, id, { day, service, covers, lines, name, floorId, floorIds, time }) {
  const fl = floorIds !== undefined ? cleanIds(floorIds) : (floorId !== undefined ? (floorId == null ? [] : [Number(floorId)]) : undefined);
  db.exec('BEGIN');
  try {
    let eventId = id;
    const c = covers == null ? null : covers;
    if (eventId) {
      db.prepare('UPDATE horaire_events SET day = ?, service = ?, covers = ?, extra = NULL, positionId = NULL WHERE id = ? AND userId = ?').run(day, service, c, eventId, u);
      if (name !== undefined) db.prepare('UPDATE horaire_events SET label = ? WHERE id = ? AND userId = ?').run(name, eventId, u);
      if (fl !== undefined) db.prepare('UPDATE horaire_events SET zoneId = ?, floorIds = ? WHERE id = ? AND userId = ?').run(fl.length ? fl[0] : null, JSON.stringify(fl), eventId, u);
      if (time !== undefined) db.prepare('UPDATE horaire_events SET time = ? WHERE id = ? AND userId = ?').run(time, eventId, u);
    } else {
      let label = name;
      if (!label) {
        const taken = new Set(db.prepare('SELECT label FROM horaire_events WHERE userId = ? AND day = ? AND service = ?').all(u, day, service).map((r) => r.label));
        let k = 1; while (taken.has('Événement ' + k)) k++;
        label = 'Événement ' + k;
      }
      const f0 = fl || [];
      eventId = Number(db.prepare('INSERT INTO horaire_events (userId, day, label, service, covers, zoneId, floorIds, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(u, day, label, service, c, f0.length ? f0[0] : null, JSON.stringify(f0), time || null).lastInsertRowid);
    }
    db.prepare('DELETE FROM horaire_needs WHERE userId = ? AND eventId = ?').run(u, eventId);
    const ins = db.prepare('INSERT INTO horaire_needs (userId, positionId, weekday, eventId, start, end, count) VALUES (?, ?, NULL, ?, ?, ?, ?)');
    const [s, e] = SERVICE_SPAN[service];
    lines.forEach((l) => ins.run(u, Number(l.positionId), eventId, s, e, l.count));
    db.exec('COMMIT');
    return listEvents(u).find((x) => x.id === eventId);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
function writeEvent(u, id, { day, label, needs, service, extra, positionId }) {
  db.exec('BEGIN');
  try {
    let eventId = id;
    const pid = positionId == null ? null : Number(positionId);
    if (eventId) db.prepare('UPDATE horaire_events SET day = ?, label = ?, service = ?, extra = ?, positionId = ? WHERE id = ? AND userId = ?').run(day, label, service || null, extra == null ? null : extra, pid, eventId, u);
    else eventId = Number(db.prepare('INSERT INTO horaire_events (userId, day, label, service, extra, positionId) VALUES (?, ?, ?, ?, ?, ?)').run(u, day, label, service || null, extra == null ? null : extra, pid).lastInsertRowid);
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
  // Refus d'un événement reçu par courriel : son fil est ignoré par la suite (les courriels suivants ne recréent rien).
  db.prepare('UPDATE horaire_inbound_threads SET refused = 1 WHERE userId = ? AND eventId = ?').run(u, i);
  return cascade(u, [['DELETE FROM horaire_needs WHERE eventId = ? AND userId = ?', i], ['DELETE FROM horaire_events WHERE id = ? AND userId = ?', i]]);
}

// ---------- heures de fin des services, par poste, jour et service (défauts : ./horaire-generation.js defaultServiceEnd) ----------
function getServiceEnds(u) {
  const r = db.prepare('SELECT serviceEnds FROM horaire_settings WHERE userId = ?').get(u);
  try { const o = JSON.parse((r && r.serviceEnds) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function setServiceEnd(u, positionId, weekday, service, end) {
  const o = getServiceEnds(u);
  o[Number(positionId) + '|' + Number(weekday) + '|' + service] = end;
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  db.prepare('UPDATE horaire_settings SET serviceEnds = ? WHERE userId = ?').run(JSON.stringify(o), u);
  return o;
}

// ---------- planchers (liste commune : table horaire_zones ; nombres par poste : horaire_floor_counts) ----------
// Postes concernés : Serveur, Barman, Commis (casse et accents ignorés). Saisie seule (la génération ne s'en sert pas encore).
const FLOOR_POSITIONS = ['serveur', 'barman', 'commis'];
// ---------- notes du compte (liste réutilisable pour tous les employés ; jamais appliquées par la génération) ----------
function listNotes(u) { return db.prepare('SELECT id, text FROM horaire_notes WHERE userId = ? ORDER BY id').all(u); }
// Nouvelle note : texte d'une ligne (« ; » remplacé par « , » : il sépare les notes d'un employé), 500 caractères. Une note déjà là
// (casse, accents et espaces ignorés) ou égale à une des six formules n'est pas recréée : on rend celle qui existe ({ text }).
function createNote(u, text) {
  const t = String(text || '').replace(/[;\r\n]+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,\s*|,\s*$/g, '').slice(0, LIMITS.constraint);
  if (!t) return null;
  const { RULES, fold: nf } = require('./horaire-note'); // même lecture que la génération (apostrophes comprises)
  const k = nf(t).replace(/[.!]+$/, '').trim();
  const rule = RULES.find(([, l]) => nf(l) === k);
  if (rule) return { id: null, text: rule[1] };
  const same = listNotes(u).find((n) => nf(n.text).replace(/[.!]+$/, '').trim() === k);
  if (same) return same;
  if (listNotes(u).length >= 200) return undefined;
  const id = Number(db.prepare('INSERT INTO horaire_notes (userId, text, createdAt) VALUES (?, ?, ?)').run(u, t, nowIso()).lastInsertRowid);
  return { id, text: t };
}
// Supprimer une note du compte (propriétaire seul ; null sinon) : elle quitte la liste ET la note de chaque employé qui l'utilise
// (les autres morceaux de sa note restent tels quels). Les six formules ne sont jamais des notes du compte. -> { removedFrom }.
function deleteNote(u, id) {
  const note = db.prepare('SELECT id, text FROM horaire_notes WHERE id = ? AND userId = ?').get(Number(id), u);
  if (!note) return null;
  const nf = require('./horaire-note').fold;
  const k = nf(note.text).replace(/[.!]+$/, '').trim();
  let removedFrom = 0;
  db.exec('BEGIN');
  try {
    db.prepare("SELECT id, constraintNote FROM horaire_employees WHERE userId = ? AND constraintNote IS NOT NULL AND constraintNote != ''").all(u).forEach((e) => {
      const parts = String(e.constraintNote).split(/[;\n]/).map((p) => p.trim()).filter(Boolean);
      const kept = parts.filter((p) => nf(p).replace(/[.!]+$/, '').trim() !== k);
      if (kept.length === parts.length) return;
      removedFrom += 1;
      db.prepare('UPDATE horaire_employees SET constraintNote = ? WHERE id = ? AND userId = ?').run(kept.length ? kept.join('; ') : null, e.id, u);
    });
    db.prepare('DELETE FROM horaire_notes WHERE id = ? AND userId = ?').run(note.id, u);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { removedFrom };
}
// Modifier le texte d'une note du compte (mêmes nettoyages que la création) ; chaque employé qui l'utilisait reçoit le nouveau texte.
// -> { note, changed } ; null si la note n'est pas à ce compte ; undefined si le texte est vide ou déjà pris (autre note ou formule).
function updateNote(u, id, text) {
  const note = db.prepare('SELECT id, text FROM horaire_notes WHERE id = ? AND userId = ?').get(Number(id), u);
  if (!note) return null;
  const t = String(text || '').replace(/[;\r\n]+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,\s*|,\s*$/g, '').slice(0, LIMITS.constraint);
  if (!t) return undefined;
  const { RULES, fold: nf } = require('./horaire-note');
  const key = (x) => nf(x).replace(/[.!]+$/, '').trim();
  const k = key(t), old = key(note.text);
  if (RULES.some(([, l]) => nf(l) === k)) return undefined;
  if (k !== old && listNotes(u).some((n) => n.id !== note.id && key(n.text) === k)) return undefined;
  let changed = 0;
  db.exec('BEGIN');
  try {
    db.prepare("SELECT id, constraintNote FROM horaire_employees WHERE userId = ? AND constraintNote IS NOT NULL AND constraintNote != ''").all(u).forEach((e) => {
      const parts = String(e.constraintNote).split(/[;\n]/).map((p) => p.trim()).filter(Boolean);
      if (!parts.some((p) => key(p) === old)) return;
      const out = [];
      parts.forEach((p) => { const v = key(p) === old ? t : p; if (!out.some((o) => key(o) === key(v))) out.push(v); });
      changed += 1;
      db.prepare('UPDATE horaire_employees SET constraintNote = ? WHERE id = ? AND userId = ?').run(out.join('; '), e.id, u);
    });
    db.prepare('UPDATE horaire_notes SET text = ? WHERE id = ? AND userId = ?').run(t, note.id, u);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { note: { id: note.id, text: t }, changed };
}
function listFloors(u) { return db.prepare('SELECT id, name FROM horaire_zones WHERE userId = ? ORDER BY id').all(u); }
const ownFloor = (u, id) => db.prepare('SELECT id, name FROM horaire_zones WHERE id = ? AND userId = ?').get(Number(id), u) || null;
function listFloorCounts(u) { return db.prepare('SELECT floorId, positionId, weekday, service, count FROM horaire_floor_counts WHERE userId = ?').all(u); }
function createFloor(u, name) {
  const r = db.prepare('INSERT INTO horaire_zones (userId, name, createdAt) VALUES (?, ?, ?)').run(u, name || '', nowIso());
  return ownFloor(u, r.lastInsertRowid);
}
function renameFloor(u, id, name) {
  const f = ownFloor(u, id);
  if (!f) return null;
  db.prepare('UPDATE horaire_zones SET name = ? WHERE id = ? AND userId = ?').run(name, f.id, u);
  return ownFloor(u, f.id);
}
// Supprimer un plancher (pour les trois postes) : ses nombres partent avec lui.
function deleteFloor(u, id) {
  const f = ownFloor(u, id);
  if (!f) return false;
  // Il quitte les événements qui l'occupaient (les autres planchers de l'événement restent).
  db.prepare('SELECT id, zoneId, floorIds FROM horaire_events WHERE userId = ?').all(u).filter((e) => evFloorIds(e).includes(f.id)).forEach((e) => {
    const rest = evFloorIds(e).filter((x) => x !== f.id);
    db.prepare('UPDATE horaire_events SET zoneId = ?, floorIds = ? WHERE id = ? AND userId = ?').run(rest.length ? rest[0] : null, JSON.stringify(rest), e.id, u);
  });
  return cascade(u, [['DELETE FROM horaire_floor_counts WHERE floorId = ? AND userId = ?', f.id], ['UPDATE horaire_events SET zoneId = NULL WHERE zoneId = ? AND userId = ?', f.id], ['DELETE FROM horaire_zones WHERE id = ? AND userId = ?', f.id]]);
}
function isFloorPosition(p) { return !!p && FLOOR_POSITIONS.includes(fold(p.name)); }
function setFloorCount(u, floorId, positionId, weekday, service, count) {
  db.prepare(`INSERT INTO horaire_floor_counts (userId, floorId, positionId, weekday, service, count) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, floorId, positionId, weekday, service) DO UPDATE SET count = excluded.count`).run(u, Number(floorId), Number(positionId), weekday, service, count);
  return listFloorCounts(u);
}

// ---------- génération et lecture d'une semaine ----------
function getSchedule(u, weekStart) {
  const s = db.prepare('SELECT id, weekStart, status, alerts, generatedAt FROM horaire_schedules WHERE userId = ? AND weekStart = ?').get(u, weekStart);
  if (!s) return null;
  const assignments = db.prepare(`SELECT a.id, a.employeeId, e.name AS employeeName, a.positionId, p.name AS positionName, a.day, a.start, a.end
    FROM horaire_assignments a JOIN horaire_employees e ON e.id = a.employeeId JOIN horaire_positions p ON p.id = a.positionId
    WHERE a.userId = ? AND a.scheduleId = ? ORDER BY a.day, a.start, p.fillOrder`).all(u, s.id);
  // Alertes recalculées à chaque lecture (G1) à partir des quarts enregistrés : une modification manuelle met à jour « À vérifier »,
  // « À demander » et le résumé sans regénérer l'horaire.
  const alerts0 = checkWeek(u, weekStart, assignments).alerts;
  const emp = new Map(listEmployees(u).map((e) => [e.id, e.name]));
  const pos = new Map(listPositions(u).map((p) => [p.id, p.name]));
  const alerts = alerts0.map((a) => (a.type === 'trou' ? { ...a, positionName: pos.get(a.positionId) || null, askNames: (a.ask || []).map((id) => emp.get(id)).filter(Boolean) } : { ...a, employeeName: emp.get(a.employeeId) || null }));
  return { weekStart: s.weekStart, status: s.status, generatedAt: s.generatedAt, assignments, alerts };
}

// Génère et ENREGISTRE le brouillon de la semaine (remplace le brouillon précédent, modifications manuelles comprises :
// seulement quand le gestionnaire relance « Générer »). Chaque génération fait avancer la rotation.
function weekInput(u, weekStart) {
  const days = gen.weekDays(weekStart);
  const employees = db.prepare('SELECT id, wantHoursMin, wantHoursTarget, wantHoursMax, noDouble, restAfterShift, constraintNote AS note FROM horaire_employees WHERE userId = ? AND active = 1').all(u)
    .map((e) => ({ ...e, noDouble: !!e.noDouble, restAfterShift: !!e.restAfterShift }));
  const rot = {};
  db.prepare('SELECT positionId, rank, lastEmployeeId FROM horaire_rotation WHERE userId = ?').all(u)
    .forEach((r) => { rot[r.positionId + ':' + r.rank] = r.lastEmployeeId; });
  return {
    weekStart,
    positions: listPositions(u),
    employees,
    qualifications: listQualifications(u),
    availabilities: getAvailabilities(u, weekStart),
    timeoff: getTimeoff(u, weekStart),
    needs: listNeeds(u),
    events: listEvents(u, days[0], days[6]).filter((e) => !e.pending), // un événement « à valider » n'entre pas dans l'horaire
    rotation: rot,
    arrivalPositions: arrivalPositionIds(u),
    serviceEnds: getServiceEnds(u),
    floorCounts: listFloorCounts(u),
    floorPositions: listPositions(u).filter(isFloorPosition).map((p) => p.id),
    groupPositionId: (serverPosition(u) || {}).id || null, // poste dont les serveurs du groupe arrivent une heure avant son heure
  };
}
// Vérification d'un horaire enregistré (aucune écriture) : quarts posés tels quels, alertes et raisons recalculées.
function checkWeek(u, weekStart, assignments) {
  return gen.generateSchedule(Object.assign(weekInput(u, weekStart), { fixed: assignments.map((a) => ({ employeeId: a.employeeId, positionId: a.positionId, day: a.day, start: a.start, end: a.end })) }));
}
// Employés pour un créneau (menus de l'horaire, G1) : les qualifiés au poste (actifs), chacun avec ses raisons ; except = quart
// à remplacer (il ne compte pas). En tête les possibles (aucune raison), puis les autres ; chaque groupe par catégorie puis nom.
function candidates(u, weekStart, slot, except) {
  const sid = scheduleId(u, weekStart);
  const rows = sid ? db.prepare('SELECT id, employeeId, positionId, day, start, end FROM horaire_assignments WHERE userId = ? AND scheduleId = ?').all(u, sid) : [];
  const check = checkWeek(u, weekStart, rows.filter((a) => a.id !== Number(except)));
  const rank = new Map(listQualifications(u).filter((q) => q.positionId === Number(slot.positionId)).map((q) => [q.employeeId, q.rank]));
  return listEmployees(u).filter((e) => e.active !== false && e.active !== 0 && rank.has(e.id))
    .map((e) => ({ employeeId: e.id, name: e.name, rank: rank.get(e.id), why: check.reasonsFor(e.id, slot) }))
    .sort((a, b) => (Math.sign(a.why.length) - Math.sign(b.why.length)) || (a.rank - b.rank) || a.name.localeCompare(b.name, 'fr'));
}
function generate(u, weekStart) {
  const out = gen.generateSchedule(weekInput(u, weekStart));
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
// Un employé indisponible placé à la main produit « demander à X » au recalcul des alertes (getSchedule).
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
  // Consignes de base et liste des quarts SEULEMENT (B2, 28 oct. 2026) : ni règles du restaurant, ni notes des employés (aucune note
  // de santé ne part chez l'IA ; on ne lui demande pas de juger).
  return require('./horaire-prompt').buildRegistrationPrompt({ weekStart, assignments: s.assignments });
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
    importPrompt: { text: r.importPrompt ? P.modernWeek(r.importPrompt) : P.IMPORT_PROMPT, isDefault: !r.importPrompt },
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
  wantShiftsTarget: ['quarts cible', 'cible quarts', 'shifts target'],
  wantHoursMin: ['heures min', 'min heures', 'hours min'],
  wantHoursTarget: ['cible', 'heures cible', 'cible heures', 'target', 'hours target'],
  wantHoursMax: ['heures max', 'max heures', 'hours max'],
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
// Heures d'une semaine : nombre de 0 à 168 (virgule acceptée), au demi-heure près ; '' ou null = effacé ; undefined = invalide.
function hoursValue(v) {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s*h$/i, '').trim());
  if (!Number.isFinite(n) || n < 0 || n > 168) return undefined;
  return Math.round(n * 2) / 2;
}
// Seule contrainte : min ≤ max. La cible est la volonté de l'employé (décision d'Émilien, 28 oct. 2026) : elle peut dépasser le max
// ou rester sous le min ; la génération ne dépasse jamais le max et applique toujours le min.
function hoursOrdered(lo, tg, hi) {
  return !(lo != null && hi != null && lo > hi);
}
function setRulesFromImport(u, empId, f) {
  ['noDouble', 'restAfterShift'].forEach((k) => {
    if (f[k] === true) addEmployeeRule(u, empId, k);
    else if (f[k] === false) db.prepare('DELETE FROM horaire_employee_rules WHERE userId = ? AND employeeId = ? AND rule = ?').run(u, empId, k);
  });
  if (f.constraintNote) {
    const has = db.prepare("SELECT 1 FROM horaire_employee_rules WHERE userId = ? AND employeeId = ? AND rule = 'free' AND text = ?").get(u, empId, f.constraintNote);
    if (!has) addEmployeeRule(u, empId, 'free', f.constraintNote);
  }
}
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
        more[k] = k === 'constraintNote' ? constraintText(raw) : (k === 'noDouble' || k === 'restAfterShift') ? yesNo(raw) : /^wantHours/.test(k) ? hoursValue(raw) : shiftCount(raw);
        if (more[k] === undefined) { res.skipped.push({ line: n + 1, reason: EXTRA_ERRORS[k] || 'quarts souhaités illisibles (0 à ' + LIMITS.shifts + ')' }); return; }
      }
      let emp = findEmployeeByName(u, name);
      const lo = more.wantShiftsMin !== undefined ? more.wantShiftsMin : (emp ? emp.wantShiftsMin : null);
      const hi = more.wantShiftsMax !== undefined ? more.wantShiftsMax : (emp ? emp.wantShiftsMax : null);
      if (lo != null && hi != null && lo > hi) { res.skipped.push({ line: n + 1, reason: 'quarts min supérieur au max' }); return; }
      const tg = more.wantShiftsTarget !== undefined ? more.wantShiftsTarget : (emp ? emp.wantShiftsTarget : null);
      if (tg != null && ((lo != null && tg < lo) || (hi != null && tg > hi))) { res.skipped.push({ line: n + 1, reason: 'cible hors du min et du max' }); return; }
      const hv = (k) => (more[k] !== undefined ? more[k] : (emp ? emp[k] : null));
      if (!hoursOrdered(hv('wantHoursMin'), hv('wantHoursTarget'), hv('wantHoursMax'))) { res.skipped.push({ line: n + 1, reason: 'heures : min ≤ max' }); return; }
      // Cases et note de l'import : deviennent des règles de l'employé (28 oct. 2026).
      const asRules = { noDouble: more.noDouble, restAfterShift: more.restAfterShift, constraintNote: more.constraintNote };
      delete more.noDouble; delete more.restAfterShift; delete more.constraintNote;
      if (emp) { updateEmployee(u, emp.id, { maxWeekMinutes: maxH === '' ? undefined : maxM, ...more }); res.updated += 1; }
      else {
        if (countEmployees(u) >= LIMITS.employees) { res.skipped.push({ line: n + 1, reason: 'limite d\'employés atteinte' }); return; }
        emp = createEmployee(u, { name, maxWeekMinutes: maxM, ...more }); res.created += 1;
      }
      setRulesFromImport(u, emp.id, asRules);
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
  const res = { employees: 0, intervals: 0, timeoff: 0, unknown: [], skipped: [], otherWeeks: {}, otherLines: 0 };
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
    // Date d'une autre semaine : comptée pour le signaler (jamais ignorée en silence).
    if (!day && isDate(String(cells[idx.day] || '').trim())) { const d = String(cells[idx.day]).trim(); res.otherWeeks[gen.addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7))] = 1; res.otherLines += 1; return; }
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
  res.otherWeeks = Object.keys(res.otherWeeks).sort();
  return res;
}

// Réservations de GROUPE reçues par courriel (receiveReservations) : chaque groupe devient UN événement (couverts notés) avec une ligne
// « Serveur · +N », N = arrondi au-dessus de (couverts ÷ ratio) ; ratio = openTableCovers du poste Serveur, 20 par défaut.
const COVERS_RATIO = 20;
function serverPosition(u) {
  return listPositions(u).find((p) => /^serveur$/i.test(String(p.name).trim())) || mainPosition(u);
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
// Lecture souple d'un rapport de réservations (CSV) : [{ day, time, size, number }] ; annulées et absentes ignorées ; jamais le nom
// du client ni ses notes (colonnes non lues). number = numéro de réservation s'il existe (ni un nom ni une donnée personnelle).
function readReservations(text) {
  const rows = parseCsv(text);
  const out = { rows: [], skipped: [], error: null };
  if (!rows.length) return out;
  const head = rows[0].map(fold);
  const spec = {
    date: ['date', 'reservation date', 'date de reservation', 'date de la reservation', 'jour', 'day'],
    time: ['heure', 'time', 'reservation time', 'heure de reservation', 'heure de la reservation'],
    size: ['taille du groupe', 'taille', 'party size', 'size', 'couverts', 'covers', 'nombre de personnes', 'personnes', 'convives', 'guests'],
    status: ['statut', 'status', 'etat'],
    number: ['numero', 'numero de reservation', 'numero de confirmation', 'no', 'confirmation', 'confirmation number', 'confirmation #', 'conf #', 'reservation id', 'reservation number', 'id'],
  };
  const idx = {};
  for (const [k, names] of Object.entries(spec)) { const i = head.findIndex((x) => names.includes(x)); if (i >= 0) idx[k] = i; }
  if (idx.date === undefined || idx.time === undefined || idx.size === undefined) {
    out.error = 'Colonnes non reconnues : il faut une date, une heure et la taille du groupe dans la première ligne.';
    return out;
  }
  rows.slice(1).forEach((cells, n) => {
    if (idx.status !== undefined && CANCELLED.includes(fold(cells[idx.status]))) return;
    const day = normDate(cells[idx.date]);
    const time = normTime(String(cells[idx.time] || '').replace(/^(\d{1,2}:\d{2}):\d{2}/, '$1'));
    const size = Number(String(cells[idx.size] || '').trim());
    if (!day || !time || !Number.isInteger(size) || size < 1 || size > 500) { out.skipped.push({ line: n + 2, reason: 'date, heure ou taille illisible' }); return; }
    const number = idx.number !== undefined ? String(cells[idx.number] || '').trim().replace(/[^\w-]/g, '').slice(0, 40) : '';
    out.rows.push({ day, time, size, number });
  });
  return out;
}

// ---------- réception automatique du rapport de réservations (courriel entrant ; fournisseur à choisir par Émilien) ----------
// Adresse secrète par compte : horaire-<jeton>@<HORAIRE_INBOUND_DOMAIN>. Le jeton (32 octets aléatoires) est créé à la première
// lecture et se révoque (nouveau jeton). Sans HORAIRE_INBOUND_DOMAIN : « bientôt disponible » (aucune adresse affichée).
const GROUP_MIN = 10;
// Adresse de l'utilisateur à relier (forwardFrom) : indication pour la mise en place du transfert seulement (défaut : courriel du profil).
// JAMAIS utilisée pour authentifier ni filtrer la réception : seul le jeton fait foi (userForInboundToken).
if (!db.prepare('PRAGMA table_info(horaire_settings)').all().some((c) => c.name === 'forwardFrom')) db.exec('ALTER TABLE horaire_settings ADD COLUMN forwardFrom TEXT');
// Dernier code (ou lien) de confirmation de transfert Gmail reçu à l'adresse du compte : un seul, gardé 1 heure (purge à la lecture et
// au démarrage), visible du seul propriétaire (GET /horaire/inbound, avec session), effacé avec le compte, jamais exporté ni journalisé.
for (const col of ['gmailConfirm', 'gmailConfirmAt']) {
  if (!db.prepare('PRAGMA table_info(horaire_settings)').all().some((c) => c.name === col)) db.exec('ALTER TABLE horaire_settings ADD COLUMN ' + col + ' TEXT');
}
const GMAIL_CONFIRM_MS = 3600 * 1000;
function purgeGmailConfirm(u) {
  const limit = new Date(Date.now() - GMAIL_CONFIRM_MS).toISOString();
  if (u) db.prepare('UPDATE horaire_settings SET gmailConfirm = NULL, gmailConfirmAt = NULL WHERE userId = ? AND gmailConfirmAt IS NOT NULL AND gmailConfirmAt < ?').run(u, limit);
  else db.prepare('UPDATE horaire_settings SET gmailConfirm = NULL, gmailConfirmAt = NULL WHERE gmailConfirmAt IS NOT NULL AND gmailConfirmAt < ?').run(limit);
}
purgeGmailConfirm();
function gmailConfirmOf(u) {
  purgeGmailConfirm(u);
  const r = db.prepare('SELECT gmailConfirm, gmailConfirmAt FROM horaire_settings WHERE userId = ?').get(u);
  if (!r || !r.gmailConfirm) return null;
  let v = null; try { v = JSON.parse(r.gmailConfirm); } catch (e) { v = null; }
  return v && v.value ? { kind: v.kind, value: v.value, until: new Date(Date.parse(r.gmailConfirmAt) + GMAIL_CONFIRM_MS).toISOString() } : null;
}
function inboundInfo(u) {
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  let r = db.prepare('SELECT inboundToken, inboundLastAt, groupMin, forwardFrom FROM horaire_settings WHERE userId = ?').get(u);
  if (!r.inboundToken) {
    db.prepare('UPDATE horaire_settings SET inboundToken = ? WHERE userId = ?').run(require('crypto').randomBytes(32).toString('hex'), u);
    r = db.prepare('SELECT inboundToken, inboundLastAt, groupMin, forwardFrom FROM horaire_settings WHERE userId = ?').get(u);
  }
  const domain = String(process.env.HORAIRE_INBOUND_DOMAIN || '').trim();
  const me = db.prepare('SELECT email FROM users WHERE id = ?').get(u);
  return { address: domain ? 'horaire-' + r.inboundToken + '@' + domain : null, lastAt: r.inboundLastAt || null, groupMin: r.groupMin || GROUP_MIN,
    forwardFrom: r.forwardFrom || (me && me.email) || '', gmailConfirm: gmailConfirmOf(u) };
}
// v : adresse déjà validée par la route ; '' = revenir au courriel du profil.
function setForwardFrom(u, v) {
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  db.prepare('UPDATE horaire_settings SET forwardFrom = ? WHERE userId = ?').run(v || null, u);
  return inboundInfo(u);
}
function revokeInbound(u) {
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  db.prepare('UPDATE horaire_settings SET inboundToken = ? WHERE userId = ?').run(require('crypto').randomBytes(32).toString('hex'), u);
  return inboundInfo(u);
}
function setGroupMin(u, n) {
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  db.prepare('UPDATE horaire_settings SET groupMin = ? WHERE userId = ?').run(n, u);
  return inboundInfo(u);
}
// ---------- types d'événements : « 1 [poste] pour N clients » (vide = aucun personnel de ce poste pour ce type) ----------
// Par défaut (une seule fois par compte) : « Family style », « Canapés », « Bar ouvert », sans aucun ratio (rien n'est inventé).
const DEFAULT_EVENT_TYPES = ['Family style', 'Canapés', 'Bar ouvert'];
function listEventTypes(u) {
  db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
  const s = db.prepare('SELECT eventTypesInit FROM horaire_settings WHERE userId = ?').get(u);
  if (!s.eventTypesInit) {
    const ins = db.prepare('INSERT INTO horaire_event_types (userId, name, family, createdAt) VALUES (?, ?, ?, ?)');
    DEFAULT_EVENT_TYPES.forEach((n) => ins.run(u, n, n === 'Bar ouvert' ? 'bar' : 'service', nowIso()));
    db.prepare('UPDATE horaire_settings SET eventTypesInit = 1 WHERE userId = ?').run(u);
  }
  const ratios = db.prepare('SELECT typeId, positionId, perClients, perDollars FROM horaire_event_type_ratios WHERE userId = ?').all(u);
  // ratios : { poste: N } (« 1 pour N clients ») ; dollars : { poste: M } (« 1 pour M $ ») ; une case vide n'y figure pas.
  return db.prepare('SELECT id, name, family FROM horaire_event_types WHERE userId = ? ORDER BY id').all(u)
    .map((t) => {
      const own = ratios.filter((r) => r.typeId === t.id);
      return { ...t, family: typeFamily(t), ratios: Object.fromEntries(own.filter((r) => r.perClients > 0).map((r) => [r.positionId, r.perClients])), dollars: Object.fromEntries(own.filter((r) => r.perDollars > 0).map((r) => [r.positionId, r.perDollars])) };
    });
}
// Famille d'un type (29 oct. 2026, règle d'Émilien) : « service » (personnel de salle : Serveur, Commis) ou « bar » (Barman). Ancien type
// sans famille : « bar » si son nom commence par « bar » (Bar ouvert), sinon « service » (Family style, Canapés).
const TYPE_FAMILIES = { service: ['serveur', 'commis'], bar: ['barman'] };
function typeFamily(t) { return TYPE_FAMILIES[t.family] ? t.family : (/^bar\b/.test(fold(t.name)) ? 'bar' : 'service'); }
const ownEventType = (u, id) => db.prepare('SELECT id, name FROM horaire_event_types WHERE id = ? AND userId = ?').get(Number(id), u) || null;
function createEventType(u, name, family) {
  listEventTypes(u); // défauts posés avant le premier ajout
  const id = Number(db.prepare('INSERT INTO horaire_event_types (userId, name, family, createdAt) VALUES (?, ?, ?, ?)').run(u, name, TYPE_FAMILIES[family] ? family : 'service', nowIso()).lastInsertRowid);
  return listEventTypes(u).find((t) => t.id === id);
}
// La famille d'un type se choisit à sa création et ne change plus (spécification d'Émilien, 29 oct. 2026).
// Vider les cases d'un type : tous ses chiffres partent ; le type et sa famille restent ; ses événements à venir sont recalculés.
function clearEventType(u, id) {
  if (!ownEventType(u, id)) return null;
  db.prepare('DELETE FROM horaire_event_type_ratios WHERE typeId = ? AND userId = ?').run(Number(id), u);
  listEvents(u).filter((e) => e.typeIds.includes(Number(id)) && e.clients && e.service).forEach((e) => recomputeEventLines(u, e.id));
  return listEventTypes(u).find((t) => t.id === Number(id));
}
function renameEventType(u, id, name) {
  if (!ownEventType(u, id)) return null;
  db.prepare('UPDATE horaire_event_types SET name = ? WHERE id = ? AND userId = ?').run(name, Number(id), u);
  return listEventTypes(u).find((t) => t.id === Number(id));
}
// Types d'un événement (29 oct. 2026, plusieurs types) : colonne typeIds (JSON) ; un ancien événement sans typeIds garde son typeId.
function evTypeIds(e) {
  let a = null; try { a = JSON.parse(e.typeIds || 'null'); } catch (x) { a = null; }
  if (Array.isArray(a)) return [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return e.typeId != null ? [Number(e.typeId)] : [];
}
function writeTypeIds(u, id, ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  db.prepare('UPDATE horaire_events SET typeIds = ?, typeId = ? WHERE id = ? AND userId = ?').run(JSON.stringify(list), list.length ? list[0] : null, Number(id), u);
}
// Supprimer un type : ses ratios partent ; il quitte les événements qui l'avaient (sans autre type : « Aucun ») ; ils GARDENT leurs lignes.
function deleteEventType(u, id) {
  if (!ownEventType(u, id)) return false;
  db.prepare('SELECT id, typeId, typeIds FROM horaire_events WHERE userId = ?').all(u)
    .filter((e) => evTypeIds(e).includes(Number(id))).forEach((e) => writeTypeIds(u, e.id, evTypeIds(e).filter((t) => t !== Number(id))));
  return cascade(u, [['DELETE FROM horaire_event_type_ratios WHERE typeId = ? AND userId = ?', Number(id)], ['UPDATE horaire_events SET typeId = NULL WHERE typeId = ? AND userId = ?', Number(id)], ['DELETE FROM horaire_event_types WHERE id = ? AND userId = ?', Number(id)]]);
}
// Deux cases par poste : perClients (« 1 pour N clients ») et perDollars (« 1 pour M $ ») ; entier ≥ 1, null (case vide) ou undefined
// (inchangée). Les deux vides : la ligne part. Les événements à venir de ce type sont recalculés.
function setEventTypeRatio(u, typeId, positionId, perClients, perDollars) {
  const cur = db.prepare('SELECT perClients, perDollars FROM horaire_event_type_ratios WHERE userId = ? AND typeId = ? AND positionId = ?').get(u, Number(typeId), Number(positionId)) || {};
  const c = perClients !== undefined ? (perClients || 0) : (cur.perClients || 0);
  const d = perDollars !== undefined ? (perDollars || null) : (cur.perDollars || null);
  if (!c && !d) db.prepare('DELETE FROM horaire_event_type_ratios WHERE userId = ? AND typeId = ? AND positionId = ?').run(u, Number(typeId), Number(positionId));
  else db.prepare(`INSERT INTO horaire_event_type_ratios (userId, typeId, positionId, perClients, perDollars) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(userId, typeId, positionId) DO UPDATE SET perClients = excluded.perClients, perDollars = excluded.perDollars`).run(u, Number(typeId), Number(positionId), c, d);
  listEvents(u).filter((e) => e.typeIds.includes(Number(typeId)) && e.clients && e.service).forEach((e) => recomputeEventLines(u, e.id));
  return listEventTypes(u);
}
// Lignes calculées d'un événement typé : par type, pour chaque poste de SA famille (Service : Serveur, Commis ; Bar : Barman), arrondi
// supérieur de clients ÷ N. Plusieurs types (liste typeIds, ou un seul typeId) : dans une même famille, seul le plus gros l'emporte
// (personnel total le plus élevé ; à égalité, le premier coché), jamais d'addition ; puis les familles s'ADDITIONNENT (plafond 50 par
// poste). Chaque poste : Clients -> arrondi supérieur de clients ÷ N ; Dollars -> arrondi supérieur de prix par personne × clients ÷ M,
// ignoré sans prix (l'événement le signale : priceMissing) ; les deux remplies : la plus grande des deux. Une ligne modifiée à la main (manualPositions) garde sa valeur ; une ligne d'un autre poste, ajoutée à la main, reste.
function computedLines(u, typeIds, clients, price) {
  const ids = (Array.isArray(typeIds) ? typeIds : (typeIds == null ? [] : [typeIds])).map(Number);
  const all = listEventTypes(u);
  const ts = ids.map((i) => all.find((x) => x.id === i)).filter(Boolean);
  if (!ts.length || !(clients > 0)) return null;
  const posName = new Map(listPositions(u).map((p) => [p.id, fold(p.name)]));
  const best = {};
  ts.forEach((t) => {
    const pids = [...new Set(Object.keys(t.ratios).concat(Object.keys(t.dollars)))];
    const lines = pids.map((pid) => {
      const byClients = t.ratios[pid] ? Math.ceil(clients / t.ratios[pid]) : 0;
      const byDollars = t.dollars[pid] && price > 0 ? Math.ceil(Math.round(price * clients * 100) / 100 / t.dollars[pid]) : 0;
      return { positionId: Number(pid), count: Math.max(byClients, byDollars) };
    })
      .filter((l) => l.count > 0 && TYPE_FAMILIES[t.family].includes(posName.get(l.positionId)));
    const total = lines.reduce((s, l) => s + l.count, 0);
    if (!best[t.family] || total > best[t.family].total) best[t.family] = { total, lines };
  });
  const sum = new Map();
  Object.values(best).forEach((b) => b.lines.forEach((l) => sum.set(l.positionId, (sum.get(l.positionId) || 0) + l.count)));
  return [...sum].map(([positionId, c]) => ({ positionId, count: Math.min(50, c) }));
}
function recomputeEventLines(u, id) {
  const e = listEvents(u).find((x) => x.id === Number(id));
  if (!e || !e.service) return null;
  const calc = computedLines(u, e.typeIds, e.clients, e.price);
  if (!calc) return e;
  const manual = new Set(e.manualPositions);
  const lines = calc.filter((l) => !manual.has(l.positionId));
  (e.lines || []).forEach((l) => { if (manual.has(l.positionId)) lines.push(l); });
  return writeServiceEvent(u, e.id, { day: e.day, service: e.service, covers: e.covers, lines });
}
// Après une retouche des lignes : les postes dont le nombre diffère du calcul deviennent « manuels » (jamais recalculés).
function markManualLines(u, id, lines) {
  const e = listEvents(u).find((x) => x.id === Number(id));
  if (!e) return;
  const calc = computedLines(u, e.typeIds, e.clients, e.price) || [];
  const m = new Set(e.manualPositions);
  lines.forEach((l) => { const c = calc.find((x) => x.positionId === Number(l.positionId)); if (!c || c.count !== l.count) m.add(Number(l.positionId)); });
  calc.forEach((c) => { if (!lines.some((l) => Number(l.positionId) === c.positionId)) m.add(c.positionId); }); // ligne retirée à la main
  db.prepare('UPDATE horaire_events SET lineManual = ? WHERE id = ? AND userId = ?').run(JSON.stringify([...m]), Number(id), u);
}
// f.typeIds : liste de types ([] = « Aucun ») ; f.typeId (ancien champ, un type ou null) est lu comme une liste d'un type.
function setEventTypeClients(u, id, f) {
  const ids = f.typeIds !== undefined ? f.typeIds : (f.typeId !== undefined ? (f.typeId == null ? [] : [f.typeId]) : undefined);
  if (ids !== undefined) writeTypeIds(u, id, ids);
  if (f.clients !== undefined) db.prepare('UPDATE horaire_events SET clients = ? WHERE id = ? AND userId = ?').run(f.clients, Number(id), u);
  if (f.price !== undefined) db.prepare('UPDATE horaire_events SET price = ? WHERE id = ? AND userId = ?').run(f.price, Number(id), u);
  return recomputeEventLines(u, id);
}

// ---------- événements reçus par COURRIEL (boîte info@ du restaurant ; fournisseur à brancher par Émilien) ----------
// Un fil (References / In-Reply-To, sinon sujet sans « RE: ») = UN événement « à valider », mis à jour à chaque courriel du fil : ce qu'un
// courriel plus récent dit remplace ce qu'un plus ancien disait. Extraction par règles (./horaire-mail.js). Loi 25 : le corps n'est
// jamais gardé ; seuls les champs extraits, des identifiants HACHÉS et un sujet sans nom propre le sont.
const M = require('./horaire-mail');
// Une modification à la main d'un événement (nom, postes, plancher) n'est jamais écrasée par un courriel : on note les champs touchés.
function markManual(u, id, keys) {
  const e = db.prepare('SELECT manual FROM horaire_events WHERE id = ? AND userId = ?').get(Number(id), u);
  if (!e) return;
  let m = []; try { m = JSON.parse(e.manual || '[]'); } catch (x) { m = []; }
  keys.forEach((k) => { if (!m.includes(k)) m.push(k); });
  db.prepare('UPDATE horaire_events SET manual = ? WHERE id = ? AND userId = ?').run(JSON.stringify(m), Number(id), u);
}
function validateEvent(u, id) {
  return db.prepare("UPDATE horaire_events SET status = NULL WHERE id = ? AND userId = ? AND status = 'pending'").run(Number(id), u).changes > 0;
}
function receiveMail(u, raw) {
  const mail = M.normalizeMail(raw);
  // Confirmation de transfert Gmail : seul le code (ou le lien) est gardé, 1 heure ; jamais d'événement ni de fil.
  const gc = M.gmailForwardConfirm(mail);
  if (gc) {
    db.prepare('INSERT OR IGNORE INTO horaire_settings (userId) VALUES (?)').run(u);
    db.prepare('UPDATE horaire_settings SET gmailConfirm = ?, gmailConfirmAt = ? WHERE userId = ?').run(JSON.stringify(gc), nowIso(), u);
    return { ignored: true, gmailConfirm: true };
  }
  const hash = (v) => require('crypto').createHash('sha256').update(u + '|' + v).digest('hex').slice(0, 32);
  const ids = [mail.messageId, mail.inReplyTo, ...mail.references].filter(Boolean).map(hash);
  const subj = M.cleanSubject(mail.subject);
  const subjectKey = subj ? hash('s:' + M.fold(subj).replace(/\s+/g, ' ').trim()) : null;
  const threads = db.prepare('SELECT * FROM horaire_inbound_threads WHERE userId = ?').all(u);
  let t = threads.find((x) => { let k = []; try { k = JSON.parse(x.msgIds); } catch (e) { k = []; } return ids.some((i) => k.includes(i)); })
    || (subjectKey ? threads.find((x) => x.subjectKey === subjectKey) : null);
  const now = nowIso();
  if (!t) {
    const id = Number(db.prepare('INSERT INTO horaire_inbound_threads (userId, msgIds, subjectKey, createdAt) VALUES (?, ?, ?, ?)').run(u, '[]', subjectKey, now).lastInsertRowid);
    t = db.prepare('SELECT * FROM horaire_inbound_threads WHERE id = ?').get(id);
  }
  let known = []; try { known = JSON.parse(t.msgIds); } catch (e) { known = []; }
  db.prepare('UPDATE horaire_inbound_threads SET msgIds = ? WHERE id = ?').run(JSON.stringify([...new Set(known.concat(ids))].slice(-200)), t.id);
  if (t.refused) return { ignored: true, thread: t.id };
  const floors = listFloors(u);
  const types = listEventTypes(u);
  const ex = M.extract({ subject: mail.subject, text: mail.text }, montrealToday(), floors, types);
  // Ordre des courriels : un courriel plus ancien que le dernier lu ne fait que compléter les champs vides.
  const at = Date.parse(mail.date) ? new Date(Date.parse(mail.date)).toISOString() : now;
  const newer = !t.lastAt || at >= t.lastAt;
  let f = {}; try { f = JSON.parse(t.fields || '{}'); } catch (e) { f = {}; }
  const put = (k, v) => { if (v == null || v === false) return; if (newer || f[k] == null) f[k] = v; };
  put('day', ex.day); put('time', ex.time); put('service', ex.service); put('covers', ex.covers);
  put('floorIds', ex.floorIds && ex.floorIds.length ? ex.floorIds : null); put('typeIds', ex.typeIds && ex.typeIds.length ? ex.typeIds : null); put('price', ex.price); if (ex.confirm) f.confirm = true;
  db.prepare('UPDATE horaire_inbound_threads SET fields = ?, lastAt = ? WHERE id = ?').run(JSON.stringify(f), newer ? at : t.lastAt, t.id);
  if (!f.day) return { thread: t.id, eventId: null }; // pas encore de date : rien dans le calendrier
  const fFloors = f.floorIds || (f.floorId != null ? [f.floorId] : []); // planchers cités (ancien fil : un seul)
  const pos = serverPosition(u);
  const ratio = (pos && pos.openTableCovers) || COVERS_RATIO;
  // Types reconnus (tous ceux cités ; ancien fil : typeId) : lignes calculées par leurs ratios additionnés ; sinon l'ancien ratio
  // « 1 serveur pour 20 couverts » (seulement sans type).
  const fTypes = f.typeIds || (f.typeId ? [f.typeId] : []);
  const typed = fTypes.length && f.covers ? computedLines(u, fTypes, f.covers, f.price != null ? f.price : null) : null;
  const serverLine = typed || (f.covers && pos && !fTypes.length ?[{ positionId: pos.id, count: Math.min(50, Math.ceil(f.covers / ratio)) }] : []);
  const hint = f.confirm ? 'confirmé probable' : null;
  const ev = t.eventId ? db.prepare('SELECT * FROM horaire_events WHERE id = ? AND userId = ?').get(t.eventId, u) : null;
  if (!ev) {
    const name = M.anonymousSubject(mail.subject) || M.fallbackName(f.day);
    const e = writeServiceEvent(u, null, { day: f.day, service: f.service || 'soir', covers: f.covers || null, lines: serverLine, name, floorIds: fFloors, time: f.time || null });
    db.prepare("UPDATE horaire_events SET status = 'pending', mailHint = ?, clients = ? WHERE id = ?").run(hint, fTypes.length ? (f.covers || null) : null, e.id);
    writeTypeIds(u, e.id, fTypes);
    if (f.price != null) db.prepare('UPDATE horaire_events SET price = ? WHERE id = ?').run(f.price, e.id);
    db.prepare('UPDATE horaire_inbound_threads SET eventId = ? WHERE id = ?').run(e.id, t.id);
    return { thread: t.id, eventId: e.id, created: true };
  }
  let manual = []; try { manual = JSON.parse(ev.manual || '[]'); } catch (e) { manual = []; }
  const cur = listEvents(u).find((x) => x.id === ev.id) || { lines: [] };
  if (!manual.length) {
    // Aucune retouche à la main : le fil fait foi (date, service, couverts, plancher, ligne Serveur).
    writeServiceEvent(u, ev.id, { day: f.day, service: f.service || ev.service || 'soir', covers: f.covers || null, lines: serverLine.length ? serverLine : cur.lines, floorIds: fFloors, time: f.time || null });
  } else {
    // Retouché à la main : seuls les champs encore vides se remplissent.
    writeServiceEvent(u, ev.id, { day: ev.day, service: ev.service, covers: ev.covers != null ? ev.covers : (f.covers || null), lines: (cur.lines && cur.lines.length) || manual.includes('lines') ? cur.lines : serverLine, floorIds: evFloorIds(ev).length || manual.includes('floorId') || manual.includes('floorIds') || !fFloors.length ? undefined : fFloors, time: ev.time || manual.includes('time') ? undefined : (f.time || undefined) });
  }
  db.prepare('UPDATE horaire_events SET mailHint = ? WHERE id = ? AND userId = ?').run(hint, ev.id, u);
  // Type et clients : remplis s'ils sont vides (ou si l'événement n'a jamais été retouché à la main).
  if (fTypes.length && (!manual.length || !evTypeIds(ev).length)) writeTypeIds(u, ev.id, fTypes);
  if (f.price != null && (!manual.length || ev.price == null)) db.prepare('UPDATE horaire_events SET price = ? WHERE id = ? AND userId = ?').run(f.price, ev.id, u);
  if (fTypes.length && f.covers && (!manual.length || ev.clients == null)) db.prepare('UPDATE horaire_events SET clients = ? WHERE id = ? AND userId = ?').run(f.covers, ev.id, u);
  return { thread: t.id, eventId: ev.id, updated: true };
}

// Compte d'un jeton (comparaison exacte, jeton hexadécimal de 64 caractères) ; null si inconnu.
function userForInboundToken(token) {
  if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
  const r = db.prepare('SELECT userId FROM horaire_settings WHERE inboundToken = ?').get(token);
  return r ? r.userId : null;
}
// Rapport reçu : chaque réservation de GROUPE (couverts ≥ seuil), datée d'aujourd'hui ou plus tard, devient un événement (ligne Serveur,
// +N = couverts ÷ ratio arrondi au-dessus) ; clé date|heure|couverts|numéro : un rapport reçu deux fois ne crée rien de plus.
function receiveReservations(u, text) {
  const read = readReservations(text);
  const res = { groups: 0, created: 0, duplicates: 0, small: 0, past: 0, skipped: read.skipped.length, error: read.error };
  if (read.error) return res;
  const info = inboundInfo(u);
  const pos = serverPosition(u);
  const ratio = (pos && pos.openTableCovers) || COVERS_RATIO;
  const today = montrealToday();
  const seen = new Set(db.prepare('SELECT sourceKey FROM horaire_events WHERE userId = ? AND sourceKey IS NOT NULL').all(u).map((r) => r.sourceKey));
  for (const r of read.rows) {
    if (r.size < info.groupMin) { res.small += 1; continue; }
    if (r.day < today) { res.past += 1; continue; }
    res.groups += 1;
    const key = [r.day, r.time, r.size, r.number].join('|');
    if (seen.has(key)) { res.duplicates += 1; continue; }
    seen.add(key);
    const ev = writeServiceEvent(u, null, { day: r.day, service: gen.toMin(r.time) >= gen.EVENING_FROM ? 'soir' : 'matin', covers: r.size, lines: pos ? [{ positionId: pos.id, count: Math.min(50, Math.ceil(r.size / ratio)) }] : [] });
    db.prepare('UPDATE horaire_events SET sourceKey = ? WHERE id = ? AND userId = ?').run(key, ev.id, u);
    res.created += 1;
  }
  db.prepare('UPDATE horaire_settings SET inboundLastAt = ? WHERE userId = ?').run(nowIso(), u);
  return res;
}

function importReservationsCsv(u, text) {
  // Même lecteur souple que la réception automatique (readReservations).
  const read = readReservations(text);
  const res = { days: 0, covers: 0, reservations: 0, skipped: read.skipped, error: read.error };
  if (read.error) return res;
  const totals = new Map(); // 'jour|service' -> couverts
  read.rows.forEach(({ day, time, size }) => {
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

// Mise à jour ponctuelle demandée et acceptée par Émilien (29 oct. 2026) : dans SA liste de règles (compte staging), la règle exacte
// « Jamais plus que son maximum d'heures. » est remplacée par les deux nouvelles (mêmes postes). Une seule fois (horaire_migrations) ;
// aucun autre compte ni aucune autre règle n'est touché. Sans ce compte dans la base (production, autres environnements) : rien.
(function updateEmilienMaxRule() {
  const NAME = 'emilien-regle-max-2026-10-29', ID = 'b0632977-add9-401d-97de-f4311173f711', OLD = 'Jamais plus que son maximum d’heures.';
  const NEW = ['Jamais plus que son maximum, sauf pour qui veut plus (cible au-dessus du max) et seulement s’il reste des quarts.', 'En dernier recours, jusqu’au maximum pour ceux dont la cible est plus basse.'];
  try {
    if (db.prepare('SELECT 1 FROM horaire_migrations WHERE name = ?').get(NAME)) return;
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(ID)) return;
    const v = readRestaurantRules(ID);
    if (Array.isArray(v.list)) {
      const i = v.list.findIndex((r) => (typeof r === 'string' ? r : r && r.text) === OLD);
      if (i >= 0) {
        const pos = typeof v.list[i] === 'string' ? null : (v.list[i].positions || null);
        v.list.splice(i, 1, ...NEW.map((text) => ({ text, positions: pos })));
        db.prepare('UPDATE horaire_settings SET restaurantRules = ? WHERE userId = ?').run(JSON.stringify(v), ID);
      }
    }
    db.prepare('INSERT INTO horaire_migrations (name, doneAt) VALUES (?, ?)').run(NAME, nowIso());
  } catch (e) { /* réessayé au prochain démarrage */ }
})();

module.exports = {
  importReservationsCsv, weekCovers, normDate,
  LIMITS, isDate, isMonday, isTime, cleanName, maxMinutes, shiftCount, constraintText, ownEmployee, ownPosition, ownEvent, weekPrompt,
  listEmployees, countEmployees, createEmployee, updateEmployee, deleteEmployee, retireEmployee,
  listPositions, countPositions, createPosition, updatePosition, deletePosition, ensureDefaultPositions, positionTaken, DEFAULT_POSITIONS,
  listQualifications, setQualification, removeQualification,
  getAvailabilities, setAvailabilities, getTimeoff, availSummary,
  CATEGORY_RULES, listCategoryRules, addCategoryRule, removeCategoryRule,
  listEmployeeRules, addEmployeeRule, removeEmployeeRule, RULE_TEXT_MAX, mainPosition,
  DEFAULT_RESTAURANT_RULES, ARRIVAL_RULES, RESTAURANT_RULES_MAX, getRestaurantRules, setRestaurantRules, normRule,
  listNeeds, createNeed, updateNeed, deleteNeed,
  listEvents, writeEvent, deleteEvent,
  listNotes, createNote, updateNote, deleteNote, listFloors, ownFloor, listFloorCounts, createFloor, renameFloor, deleteFloor, isFloorPosition, setFloorCount, nameTaken, candidates, listEventTypes, ownEventType, createEventType, renameEventType, clearEventType, deleteEventType, setEventTypeRatio, computedLines, recomputeEventLines, markManualLines, setEventTypeClients, receiveMail, markManual, validateEvent, getServiceEnds, setServiceEnd, purgePastEvents, montrealToday, readReservations, inboundInfo, revokeInbound, setGroupMin, setForwardFrom, userForInboundToken, receiveReservations, GROUP_MIN, serverPosition, writeServiceEvent, COVERS_RATIO, generate, getSchedule, getSettings, setSettings, exportDayforce,
  ownAssignment, addAssignment, updateAssignment, deleteAssignment,
  getPrompts, setPrompts, promptText, PROMPT_MAX,
  parseCsv, normTime, normDay, importEmployeesCsv, importAvailabilitiesCsv, hoursValue, hoursOrdered,
};
