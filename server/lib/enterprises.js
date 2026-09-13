// TimeTracker Entreprise — Module Horaires (Jacopo), couche données et
// contrôle d'accès. Cadrage : noesis-timetracker-entreprise-jacopo-horaires.md
// (12-13 septembre 2026). Périmètre de ce premier passage : entreprises,
// gestionnaires (principal + secondaires avec permissions), fiche employé,
// horaires hebdomadaires, quarts assignés, export CSV pour ressaisie
// Dayforce. Même découpage que server/lib/subprojects.js : toute la logique
// de données vit ici, server/routes/enterprises.js ne fait que la validation
// d'entrée et le codage des statuts HTTP.
//
// Disponibilités et besoins en personnel (saisis à neuf à chaque nouvel
// horaire, cadrage) : volontairement PAS dans ce premier passage — leur forme
// exacte dépend de l'écran de construction d'horaire, pas encore dessiné.
// Ajoutés dans une passe ultérieure, en même temps que cet écran, plutôt que
// de figer un schéma sans savoir ce que l'interface doit réellement capturer.

const db = require('../db');

const PERMISSIONS = ['canManageSchedules', 'canExportSchedules', 'canManageEmployees', 'canViewLaborCost'];

function nowIso() {
  return new Date().toISOString();
}

// ===================== GESTIONNAIRES =====================

function getManager(userId, enterpriseId) {
  if (!userId || !enterpriseId) return null;
  return db.prepare('SELECT * FROM enterprise_managers WHERE enterpriseId = ? AND userId = ?')
    .get(enterpriseId, userId) || null;
}

function isPrincipal(userId, enterpriseId) {
  const m = getManager(userId, enterpriseId);
  return !!(m && m.role === 'principal');
}

// Le principal a TOUJOURS toutes les permissions, même si les colonnes can*
// de sa propre ligne sont à 0 (elles ne servent qu'à configurer les
// secondaires — voir addManager) : un principal ne devrait jamais pouvoir se
// bloquer lui-même par erreur de saisie.
function hasPermission(userId, enterpriseId, permission) {
  const m = getManager(userId, enterpriseId);
  if (!m) return false;
  if (m.role === 'principal') return true;
  return !!m[permission];
}

function getEnterprise(enterpriseId) {
  return db.prepare('SELECT * FROM enterprises WHERE id = ?').get(enterpriseId) || null;
}

function enterprisesForUser(userId) {
  return db.prepare(`
    SELECT e.*, em.role, em.canManageSchedules, em.canExportSchedules,
           em.canManageEmployees, em.canViewLaborCost
    FROM enterprises e
    JOIN enterprise_managers em ON em.enterpriseId = e.id
    WHERE em.userId = ?
    ORDER BY e.createdAt DESC
  `).all(userId);
}

// Création en libre-service (cadrage) : à terme conditionnée à un abonnement
// payant (chantier "Paiement et abonnements", décidé séparément le
// 12-13 septembre 2026). En attendant, subscriptionActive démarre à 0 pour
// toute nouvelle entreprise — voir scripts/activate-enterprise.js pour
// l'activation manuelle le temps que ce chantier existe. Le créateur devient
// automatiquement principal, avec toutes les permissions (voir
// hasPermission : redondant pour un principal, mais explicite ici pour que
// la ligne en base reste lisible telle quelle).
function createEnterprise(name, creatorUserId) {
  const createdAt = nowIso();
  const info = db.prepare('INSERT INTO enterprises (name, subscriptionActive, createdBy, createdAt) VALUES (?, 0, ?, ?)')
    .run(name, creatorUserId, createdAt);
  const enterpriseId = Number(info.lastInsertRowid);
  db.prepare(`
    INSERT INTO enterprise_managers
      (enterpriseId, userId, role, canManageSchedules, canExportSchedules, canManageEmployees, canViewLaborCost, addedBy, addedAt)
    VALUES (?, ?, 'principal', 1, 1, 1, 1, ?, ?)
  `).run(enterpriseId, creatorUserId, creatorUserId, createdAt);
  return getEnterprise(enterpriseId);
}

function listManagers(enterpriseId) {
  return db.prepare(`
    SELECT em.userId, em.role, em.canManageSchedules, em.canExportSchedules,
           em.canManageEmployees, em.canViewLaborCost, em.addedAt,
           u.name AS userName
    FROM enterprise_managers em
    JOIN users u ON u.id = em.userId
    WHERE em.enterpriseId = ?
    ORDER BY (em.role = 'principal') DESC, em.addedAt ASC
  `).all(enterpriseId);
}

// Réservé au principal (server/routes/enterprises.js vérifie isPrincipal
// avant d'appeler ceci) : gérer QUI a accès n'est délégable à aucun
// secondaire, quelles que soient ses permissions — cadrage explicite.
function addManager(enterpriseId, userId, permissions, addedBy) {
  const addedAt = nowIso();
  const perms = PERMISSIONS.reduce((acc, key) => {
    acc[key] = permissions && permissions[key] ? 1 : 0;
    return acc;
  }, {});
  db.prepare(`
    INSERT INTO enterprise_managers
      (enterpriseId, userId, role, canManageSchedules, canExportSchedules, canManageEmployees, canViewLaborCost, addedBy, addedAt)
    VALUES (?, ?, 'secondary', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(enterpriseId, userId) DO UPDATE SET
      canManageSchedules = excluded.canManageSchedules,
      canExportSchedules = excluded.canExportSchedules,
      canManageEmployees = excluded.canManageEmployees,
      canViewLaborCost = excluded.canViewLaborCost
  `).run(enterpriseId, userId, perms.canManageSchedules, perms.canExportSchedules, perms.canManageEmployees, perms.canViewLaborCost, addedBy, addedAt);
  return getManager(userId, enterpriseId);
}

// Ne retire jamais le dernier principal : une entreprise sans principal n'a
// plus personne habilité à gérer les accès (voir la limite documentée sur
// enterprise_managers dans server/db.js pour le cas, distinct, de la
// suppression du COMPTE du principal).
function removeManager(enterpriseId, userId) {
  const target = getManager(userId, enterpriseId);
  if (!target) return { ok: false, reason: 'not_found' };
  if (target.role === 'principal') return { ok: false, reason: 'cannot_remove_principal' };
  db.prepare('DELETE FROM enterprise_managers WHERE enterpriseId = ? AND userId = ?').run(enterpriseId, userId);
  return { ok: true };
}

// ===================== EMPLOYÉS =====================

function listEmployees(enterpriseId, includeInactive) {
  if (includeInactive) {
    return db.prepare('SELECT * FROM enterprise_employees WHERE enterpriseId = ? ORDER BY name ASC').all(enterpriseId);
  }
  return db.prepare('SELECT * FROM enterprise_employees WHERE enterpriseId = ? AND active = 1 ORDER BY name ASC').all(enterpriseId);
}

function createEmployee(enterpriseId, { name, position, level, hourlyRate }, createdBy) {
  const createdAt = nowIso();
  const info = db.prepare(`
    INSERT INTO enterprise_employees (enterpriseId, name, position, level, hourlyRate, active, createdBy, createdAt)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(enterpriseId, name, position || '', level || '', (hourlyRate === undefined || hourlyRate === null || hourlyRate === '') ? null : Number(hourlyRate), createdBy, createdAt);
  return db.prepare('SELECT * FROM enterprise_employees WHERE id = ?').get(Number(info.lastInsertRowid));
}

function getEmployee(enterpriseId, employeeId) {
  return db.prepare('SELECT * FROM enterprise_employees WHERE id = ? AND enterpriseId = ?').get(employeeId, enterpriseId) || null;
}

function updateEmployee(enterpriseId, employeeId, fields) {
  const existing = getEmployee(enterpriseId, employeeId);
  if (!existing) return null;
  const name = fields.name !== undefined ? fields.name : existing.name;
  const position = fields.position !== undefined ? fields.position : existing.position;
  const level = fields.level !== undefined ? fields.level : existing.level;
  const hourlyRate = fields.hourlyRate !== undefined
    ? (fields.hourlyRate === null || fields.hourlyRate === '' ? null : Number(fields.hourlyRate))
    : existing.hourlyRate;
  const active = fields.active !== undefined ? (fields.active ? 1 : 0) : existing.active;
  db.prepare('UPDATE enterprise_employees SET name = ?, position = ?, level = ?, hourlyRate = ?, active = ? WHERE id = ?')
    .run(name, position, level, hourlyRate, active, employeeId);
  return getEmployee(enterpriseId, employeeId);
}

// ===================== HORAIRES =====================

function listSchedules(enterpriseId) {
  return db.prepare('SELECT * FROM enterprise_schedules WHERE enterpriseId = ? ORDER BY weekStart DESC').all(enterpriseId);
}

function getOrCreateSchedule(enterpriseId, weekStart, createdBy) {
  const existing = db.prepare('SELECT * FROM enterprise_schedules WHERE enterpriseId = ? AND weekStart = ?').get(enterpriseId, weekStart);
  if (existing) return existing;
  const createdAt = nowIso();
  const info = db.prepare(`
    INSERT INTO enterprise_schedules (enterpriseId, weekStart, status, createdBy, createdAt)
    VALUES (?, ?, 'draft', ?, ?)
  `).run(enterpriseId, weekStart, createdBy, createdAt);
  return db.prepare('SELECT * FROM enterprise_schedules WHERE id = ?').get(Number(info.lastInsertRowid));
}

function getSchedule(enterpriseId, scheduleId) {
  return db.prepare('SELECT * FROM enterprise_schedules WHERE id = ? AND enterpriseId = ?').get(scheduleId, enterpriseId) || null;
}

function shiftsForSchedule(scheduleId) {
  return db.prepare(`
    SELECT s.*, e.name AS employeeName
    FROM enterprise_shifts s
    JOIN enterprise_employees e ON e.id = s.employeeId
    WHERE s.scheduleId = ?
    ORDER BY s.date ASC, s.startTime ASC
  `).all(scheduleId);
}

function addShift(scheduleId, { employeeId, date, startTime, endTime, position }) {
  const createdAt = nowIso();
  const info = db.prepare(`
    INSERT INTO enterprise_shifts (scheduleId, employeeId, date, startTime, endTime, position, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(scheduleId, employeeId, date, startTime, endTime, position || '', createdAt);
  return db.prepare('SELECT * FROM enterprise_shifts WHERE id = ?').get(Number(info.lastInsertRowid));
}

function getShift(scheduleId, shiftId) {
  return db.prepare('SELECT * FROM enterprise_shifts WHERE id = ? AND scheduleId = ?').get(shiftId, scheduleId) || null;
}

function removeShift(scheduleId, shiftId) {
  const info = db.prepare('DELETE FROM enterprise_shifts WHERE id = ? AND scheduleId = ?').run(shiftId, scheduleId);
  return info.changes > 0;
}

// CSV minimal — colonnes structurées (employé, date, heure de début, heure de
// fin, poste), format volontairement simple en attendant la confirmation du
// format d'import réel de Dayforce (Bastien/administrateur Dayforce de
// Jacopo — voir cadrage). Le gestionnaire ressaisit manuellement dans
// Dayforce pour l'instant ; ce fichier n'est PAS transmis automatiquement
// nulle part.
function csvEscape(value) {
  const s = String(value === null || value === undefined ? '' : value);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportScheduleCsv(scheduleId) {
  const rows = shiftsForSchedule(scheduleId);
  const header = ['Employé', 'Date', 'Début', 'Fin', 'Poste'];
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) {
    lines.push([r.employeeName, r.date, r.startTime, r.endTime, r.position].map(csvEscape).join(','));
  }
  // \r\n : Dayforce comme la plupart des imports Windows attendent des fins
  // de ligne CRLF pour un CSV — évite un fichier qui s'ouvre mal si le
  // gestionnaire le glisse directement dans son navigateur d'import.
  return lines.join('\r\n');
}

function markScheduleExported(scheduleId) {
  db.prepare("UPDATE enterprise_schedules SET status = 'exported', exportedAt = ? WHERE id = ?").run(nowIso(), scheduleId);
}

// Quart traversant minuit (ex. 22:00 -> 02:00) : minutes négatives ramenées
// dans le jour suivant plutôt que traitées comme une erreur de saisie —
// courant en restauration (cas d'usage de Jacopo).
function hoursBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
}

// Estimation de coût de main-d'œuvre (permission canViewLaborCost du
// cadrage) : purement indicative, jamais transmise à Dayforce ni utilisée
// pour la paie réelle. `total` vaut null (jamais 0, même convention que
// percentOf dans lib/subprojects.js) quand l'horaire n'a encore aucun quart —
// distinct de "0 $ de coût", qui serait trompeur. `shiftsMissingRate` compte
// les quarts exclus du total faute de taux horaire renseigné sur l'employé,
// pour que l'écran puisse avertir plutôt que d'afficher un total
// silencieusement incomplet.
function estimateLaborCost(scheduleId) {
  const rows = db.prepare(`
    SELECT s.startTime, s.endTime, e.hourlyRate
    FROM enterprise_shifts s
    JOIN enterprise_employees e ON e.id = s.employeeId
    WHERE s.scheduleId = ?
  `).all(scheduleId);
  if (!rows.length) return { total: null, shiftCount: 0, shiftsMissingRate: 0 };
  let total = 0;
  let shiftsMissingRate = 0;
  for (const r of rows) {
    if (r.hourlyRate === null || r.hourlyRate === undefined) {
      shiftsMissingRate++;
      continue;
    }
    total += hoursBetween(r.startTime, r.endTime) * r.hourlyRate;
  }
  // Si AUCUN quart de l'horaire n'a de taux horaire connu, le total est
  // inconnu, pas "0 $" — même logique que le cas "aucun quart du tout"
  // ci-dessus. Un total partiel (certains quarts connus, d'autres non) reste
  // en revanche un vrai nombre : c'est shiftsMissingRate qui porte
  // l'avertissement de complétude, pas total lui-même.
  const total_ = shiftsMissingRate === rows.length ? null : Math.round(total * 100) / 100;
  return { total: total_, shiftCount: rows.length, shiftsMissingRate };
}

module.exports = {
  PERMISSIONS,
  getManager,
  isPrincipal,
  hasPermission,
  getEnterprise,
  enterprisesForUser,
  createEnterprise,
  listManagers,
  addManager,
  removeManager,
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  listSchedules,
  getOrCreateSchedule,
  getSchedule,
  shiftsForSchedule,
  addShift,
  getShift,
  removeShift,
  exportScheduleCsv,
  markScheduleExported,
  estimateLaborCost,
};
