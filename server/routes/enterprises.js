// TimeTracker Entreprise — Module Horaires (Jacopo), routes HTTP.
//
// Propriété : chantier "TimeTracker Entreprise — Module Horaires", cadrage
// 12-13 septembre 2026 (noesis-timetracker-entreprise-jacopo-horaires.md).
// Toute la logique de données vit dans server/lib/enterprises.js ; ce
// fichier ne fait que la validation d'entrée, le contrôle d'accès et le
// codage des statuts HTTP — même découpage que routes/subprojects.js.
//
// ⚠️ SÉCURITÉ (règle du projet, non négociable) : aucune route ci-dessous ne
// fait confiance à un identifiant fourni par le client pour savoir QUI
// appelle — uniquement req.userId, résolu par server/lib/session.js. Un
// identifiant de client (userName pour ajouter un gestionnaire, employeeId,
// scheduleId...) ne sert jamais qu'à désigner la RESSOURCE visée, jamais
// l'appelant, et est systématiquement revérifié comme appartenant à la bonne
// entreprise avant toute lecture/écriture.
//
// ⚠️ ORDRE DES ROUTES (piège Express déjà rencontré sur profile.js et
// subprojects.js) : aucune route littérale de même préfixe qu'une route à
// paramètre ici pour l'instant — à surveiller si on en ajoute.

const express = require('express');
const db = require('../db');
const ent = require('../lib/enterprises');
const { requireAuth } = require('../lib/session');

const router = express.Router();

const MAX_NAME_LENGTH = 120;

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Toutes les routes de ce module exigent une session valide — contrairement
// aux activités personnelles, il n'y a ici aucune vue publique.
router.use(requireAuth);

// Charge l'entreprise + la ligne enterprise_managers de l'appelant. Refuse
// (404, jamais 403) si l'entreprise n'existe pas OU si l'appelant n'en est
// pas gestionnaire — un 403 révélerait l'existence de l'entreprise à
// quelqu'un qui n'y a aucun droit.
function loadEnterpriseAccess(req, res, enterpriseId) {
  const enterprise = ent.getEnterprise(enterpriseId);
  const manager = enterprise ? ent.getManager(req.userId, enterpriseId) : null;
  if (!enterprise || !manager) {
    res.status(404).json({ error: 'Entreprise introuvable.' });
    return null;
  }
  return { enterprise, manager };
}

// Au-delà de "être gestionnaire", certaines actions exigent en plus une
// permission précise (ou le rôle principal, qui les a toutes — voir
// hasPermission dans server/lib/enterprises.js).
function requirePermission(req, res, enterpriseId, permission) {
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return null;
  if (!ent.hasPermission(req.userId, enterpriseId, permission)) {
    res.status(403).json({ error: "Tu n'as pas la permission nécessaire pour cette action." });
    return null;
  }
  return access;
}

// Employés/horaires/quarts n'ont de sens que pour une entreprise dont
// l'abonnement est actif (cadrage : création libre-service, mais usage
// conditionné au paiement — voir server/db.js, colonne subscriptionActive,
// et scripts/activate-enterprise.js pour l'activation manuelle en attendant
// le chantier "Paiement et abonnements"). La FICHE de l'entreprise et la
// liste des gestionnaires restent, elles, toujours consultables : un
// principal doit pouvoir voir/gérer ses gestionnaires même avant activation.
function requireActiveSubscription(req, res, enterprise) {
  if (!enterprise.subscriptionActive) {
    res.status(402).json({ error: "Abonnement non actif pour cette entreprise.", subscriptionRequired: true });
    return false;
  }
  return true;
}

function resolveUserByName(name) {
  return db.prepare('SELECT id, name FROM users WHERE name = ?').get(name) || null;
}

// ===================== ENTREPRISES =====================

router.get('/enterprises', (req, res) => {
  res.json({ enterprises: ent.enterprisesForUser(req.userId) });
});

router.post('/enterprises', (req, res) => {
  const name = str(req.body.name);
  if (!name) return res.status(400).json({ error: "Nom de l'entreprise requis." });
  if (name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: `Nom trop long (${MAX_NAME_LENGTH} caractères maximum).` });
  const enterprise = ent.createEnterprise(name, req.userId);
  res.status(201).json({ enterprise });
});

router.get('/enterprises/:enterpriseId', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  res.json({
    enterprise: access.enterprise,
    manager: access.manager,
    isPrincipal: access.manager.role === 'principal',
  });
});

// ===================== GESTIONNAIRES =====================

router.get('/enterprises/:enterpriseId/managers', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  res.json({ managers: ent.listManagers(enterpriseId) });
});

// Ajouter/modifier les permissions d'un gestionnaire SECONDAIRE. Réservé au
// principal — cadrage explicite : gérer les accès n'est délégable à aucun
// secondaire, quelles que soient ses propres permissions.
router.post('/enterprises/:enterpriseId/managers', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  if (access.manager.role !== 'principal') {
    return res.status(403).json({ error: 'Seul le gestionnaire principal peut gérer les accès.' });
  }
  const userName = str(req.body.userName);
  if (!userName) return res.status(400).json({ error: "Nom d'utilisateur requis." });
  const target = resolveUserByName(userName);
  if (!target) return res.status(404).json({ error: 'Aucun profil TimeTracker avec ce nom.' });
  if (target.id === req.userId) {
    return res.status(400).json({ error: 'Tu es déjà principal de cette entreprise.' });
  }
  const permissions = req.body.permissions && typeof req.body.permissions === 'object' ? req.body.permissions : {};
  const manager = ent.addManager(enterpriseId, target.id, permissions, req.userId);
  res.status(201).json({ manager: { ...manager, userName: target.name } });
});

router.delete('/enterprises/:enterpriseId/managers/:userId', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  if (access.manager.role !== 'principal') {
    return res.status(403).json({ error: 'Seul le gestionnaire principal peut gérer les accès.' });
  }
  const result = ent.removeManager(enterpriseId, req.params.userId);
  if (!result.ok && result.reason === 'not_found') return res.status(404).json({ error: 'Gestionnaire introuvable.' });
  if (!result.ok && result.reason === 'cannot_remove_principal') {
    return res.status(409).json({ error: 'Le gestionnaire principal ne peut pas être retiré.' });
  }
  res.json({ ok: true });
});

// ===================== EMPLOYÉS =====================

router.get('/enterprises/:enterpriseId/employees', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json({ employees: ent.listEmployees(enterpriseId, includeInactive) });
});

router.post('/enterprises/:enterpriseId/employees', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canManageEmployees');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const name = str(req.body.name);
  if (!name) return res.status(400).json({ error: "Nom de l'employé requis." });
  if (name.length > MAX_NAME_LENGTH) return res.status(400).json({ error: `Nom trop long (${MAX_NAME_LENGTH} caractères maximum).` });
  const hourlyRate = req.body.hourlyRate;
  if (hourlyRate !== undefined && hourlyRate !== null && hourlyRate !== '' && (typeof hourlyRate !== 'number' || !(hourlyRate >= 0))) {
    return res.status(400).json({ error: 'Taux horaire invalide.' });
  }
  const employee = ent.createEmployee(enterpriseId, {
    name,
    position: str(req.body.position),
    level: str(req.body.level),
    hourlyRate,
  }, req.userId);
  res.status(201).json({ employee });
});

router.put('/enterprises/:enterpriseId/employees/:employeeId', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canManageEmployees');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const employeeId = Number(req.params.employeeId);
  if (!ent.getEmployee(enterpriseId, employeeId)) return res.status(404).json({ error: 'Employé introuvable.' });

  const fields = {};
  if (req.body.name !== undefined) {
    const name = str(req.body.name);
    if (!name) return res.status(400).json({ error: "Le nom ne peut pas être vide." });
    fields.name = name;
  }
  if (req.body.position !== undefined) fields.position = str(req.body.position);
  if (req.body.level !== undefined) fields.level = str(req.body.level);
  if (req.body.hourlyRate !== undefined) fields.hourlyRate = req.body.hourlyRate;
  if (req.body.active !== undefined) fields.active = !!req.body.active;

  res.json({ employee: ent.updateEmployee(enterpriseId, employeeId, fields) });
});

// ===================== HORAIRES =====================

router.get('/enterprises/:enterpriseId/schedules', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  res.json({ schedules: ent.listSchedules(enterpriseId) });
});

// get-or-create par semaine (cadrage : un seul horaire "vivant" par semaine,
// on le modifie plutôt que d'en recréer un).
router.post('/enterprises/:enterpriseId/schedules', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canManageSchedules');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const weekStart = str(req.body.weekStart);
  if (!WEEK_START_RE.test(weekStart)) return res.status(400).json({ error: "Date de début de semaine invalide (AAAA-MM-JJ)." });
  res.status(201).json({ schedule: ent.getOrCreateSchedule(enterpriseId, weekStart, req.userId) });
});

router.get('/enterprises/:enterpriseId/schedules/:scheduleId', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = loadEnterpriseAccess(req, res, enterpriseId);
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const scheduleId = Number(req.params.scheduleId);
  const schedule = ent.getSchedule(enterpriseId, scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Horaire introuvable.' });
  res.json({ schedule, shifts: ent.shiftsForSchedule(scheduleId) });
});

router.post('/enterprises/:enterpriseId/schedules/:scheduleId/shifts', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canManageSchedules');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const scheduleId = Number(req.params.scheduleId);
  const schedule = ent.getSchedule(enterpriseId, scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Horaire introuvable.' });

  const employeeId = Number(req.body.employeeId);
  const employee = ent.getEmployee(enterpriseId, employeeId);
  if (!employee) return res.status(404).json({ error: 'Employé introuvable.' });

  const date = str(req.body.date);
  if (!WEEK_START_RE.test(date)) return res.status(400).json({ error: 'Date de quart invalide (AAAA-MM-JJ).' });
  const startTime = str(req.body.startTime);
  const endTime = str(req.body.endTime);
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return res.status(400).json({ error: 'Heure de début/fin invalide (HH:MM).' });
  }

  const shift = ent.addShift(scheduleId, {
    employeeId,
    date,
    startTime,
    endTime,
    position: str(req.body.position) || employee.position,
  });
  res.status(201).json({ shift: { ...shift, employeeName: employee.name } });
});

router.delete('/enterprises/:enterpriseId/schedules/:scheduleId/shifts/:shiftId', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canManageSchedules');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const scheduleId = Number(req.params.scheduleId);
  if (!ent.getSchedule(enterpriseId, scheduleId)) return res.status(404).json({ error: 'Horaire introuvable.' });
  const shiftId = Number(req.params.shiftId);
  if (!ent.getShift(scheduleId, shiftId)) return res.status(404).json({ error: 'Quart introuvable.' });
  ent.removeShift(scheduleId, shiftId);
  res.json({ ok: true });
});

// Export CSV pour ressaisie dans Dayforce (format encore à confirmer avec
// Bastien/l'administrateur Dayforce de Jacopo — voir le cadrage). Marque
// l'horaire 'exported' au passage, purement indicatif côté écran.
router.get('/enterprises/:enterpriseId/schedules/:scheduleId/export', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canExportSchedules');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const scheduleId = Number(req.params.scheduleId);
  const schedule = ent.getSchedule(enterpriseId, scheduleId);
  if (!schedule) return res.status(404).json({ error: 'Horaire introuvable.' });

  const csv = ent.exportScheduleCsv(scheduleId);
  ent.markScheduleExported(scheduleId);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="horaire-${schedule.weekStart}.csv"`);
  res.send(csv);
});

// Estimation de coût de main-d'œuvre — permission dédiée (canViewLaborCost) :
// distincte de canManageSchedules, un secondaire peut très bien construire
// l'horaire sans voir le coût associé, ou l'inverse (cadrage).
router.get('/enterprises/:enterpriseId/schedules/:scheduleId/labor-cost', (req, res) => {
  const enterpriseId = Number(req.params.enterpriseId);
  const access = requirePermission(req, res, enterpriseId, 'canViewLaborCost');
  if (!access) return;
  if (!requireActiveSubscription(req, res, access.enterprise)) return;
  const scheduleId = Number(req.params.scheduleId);
  if (!ent.getSchedule(enterpriseId, scheduleId)) return res.status(404).json({ error: 'Horaire introuvable.' });
  res.json(ent.estimateLaborCost(scheduleId));
});

module.exports = router;
