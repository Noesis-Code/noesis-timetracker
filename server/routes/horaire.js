// Routes du module « Horaire » (/api/horaire/...) : validation d'entrée et codes HTTP seulement, la logique vit dans
// server/lib/horaire.js. Gestionnaire seul : tout est filtré par req.userId (session). Refusé (403 module_off) si le module
// « horaire » n'est pas actif pour le compte : règle dans server/lib/modulegate.js. Aucune donnée n'est journalisée (Loi 25).
const express = require('express');
const { requireAuth } = require('../lib/session');
const h = require('../lib/horaire');
const router = express.Router();

router.use('/horaire', requireAuth);

const bad = (res, msg) => res.status(400).json({ error: msg });
const notFound = (res, what) => res.status(404).json({ error: (what || 'Élément') + ' introuvable.' });
const intOr = (v, d) => (v === undefined ? d : (Number.isInteger(v) ? v : NaN));
// Code Dayforce (matricule, code de poste, code d'unité) : texte court ; '' ou null = effacé ; undefined = invalide.
function dayforceCode(v) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length <= 64 && !/[\u0000-\u001f\u007f]/.test(s) ? (s || null) : undefined;
}

function weekParam(req, res) {
  const w = req.params.weekStart;
  if (!h.isMonday(w)) { bad(res, 'Semaine invalide : date du lundi attendue (AAAA-MM-JJ).'); return null; }
  return w;
}

// Besoin : { positionId, start, end, count } (+ weekday pour le modèle normal). partial = mise à jour.
function needInput(req, res, body, { weekday, partial }) {
  const out = {};
  if (body.positionId !== undefined || !partial) {
    if (!h.ownPosition(req.userId, body.positionId)) { notFound(res, 'Poste'); return null; }
    out.positionId = Number(body.positionId);
  }
  if (weekday && (body.weekday !== undefined || !partial)) {
    if (!(Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6)) { bad(res, 'Jour invalide (0 = lundi ... 6 = dimanche).'); return null; }
    out.weekday = body.weekday;
  }
  for (const k of ['start', 'end']) {
    if (body[k] !== undefined || !partial) {
      if (!h.isTime(body[k])) { bad(res, 'Heure invalide (HH:MM).'); return null; }
      out[k] = body[k];
    }
  }
  if (body.count !== undefined || !partial) {
    const c = intOr(body.count, 1);
    if (!(c >= 1 && c <= 50)) { bad(res, 'Nombre de personnes invalide (1 à 50).'); return null; }
    out.count = c;
  }
  if (out.start && out.end && out.start === out.end) { bad(res, 'Début et fin identiques.'); return null; }
  return out;
}

// ---------- employés ----------
function employeeInput(res, body, partial) {
  const out = {};
  if (body.name !== undefined || !partial) {
    out.name = h.cleanName(body.name);
    if (!out.name) { bad(res, 'Nom requis.'); return null; }
  }
  if (body.maxWeekMinutes !== undefined) {
    out.maxWeekMinutes = h.maxMinutes(body.maxWeekMinutes);
    if (out.maxWeekMinutes === undefined) { bad(res, 'Maximum hebdomadaire invalide (minutes, 0 à 10 080).'); return null; }
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') { bad(res, 'Valeur « active » invalide.'); return null; }
    out.active = body.active;
  }
  if (body.dayforceId !== undefined) {
    out.dayforceId = dayforceCode(body.dayforceId);
    if (out.dayforceId === undefined) { bad(res, 'Matricule Dayforce invalide (64 caractères au plus).'); return null; }
  }
  return out;
}
router.get('/horaire/employees', (req, res) => res.json({ employees: h.listEmployees(req.userId) }));
router.post('/horaire/employees', (req, res) => {
  const v = employeeInput(res, req.body || {}, false); if (!v) return;
  if (h.countEmployees(req.userId) >= h.LIMITS.employees) return res.status(409).json({ error: 'Limite d\'employés atteinte.' });
  res.status(201).json({ employee: h.createEmployee(req.userId, v) });
});
router.put('/horaire/employees/:id', (req, res) => {
  const v = employeeInput(res, req.body || {}, true); if (!v) return;
  const e = h.updateEmployee(req.userId, req.params.id, v);
  return e ? res.json({ employee: e }) : notFound(res, 'Employé');
});
router.delete('/horaire/employees/:id', (req, res) => (h.deleteEmployee(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Employé')));

// ---------- postes ----------
function positionInput(res, body, partial) {
  const out = {};
  if (body.name !== undefined || !partial) {
    out.name = h.cleanName(body.name);
    if (!out.name) { bad(res, 'Nom du poste requis.'); return null; }
  }
  if (body.fillOrder !== undefined) {
    if (!(Number.isInteger(body.fillOrder) && body.fillOrder >= 0 && body.fillOrder <= 1000)) { bad(res, 'Ordre de comblement invalide.'); return null; }
    out.fillOrder = body.fillOrder;
  }
  if (body.dayforceCode !== undefined) {
    out.dayforceCode = dayforceCode(body.dayforceCode);
    if (out.dayforceCode === undefined) { bad(res, 'Code de poste Dayforce invalide (64 caractères au plus).'); return null; }
  }
  return out;
}
router.get('/horaire/positions', (req, res) => res.json({ positions: h.listPositions(req.userId) }));
router.post('/horaire/positions', (req, res) => {
  const v = positionInput(res, req.body || {}, false); if (!v) return;
  if (h.countPositions(req.userId) >= h.LIMITS.positions) return res.status(409).json({ error: 'Limite de postes atteinte.' });
  res.status(201).json({ position: h.createPosition(req.userId, v) });
});
router.put('/horaire/positions/:id', (req, res) => {
  const v = positionInput(res, req.body || {}, true); if (!v) return;
  const p = h.updatePosition(req.userId, req.params.id, v);
  return p ? res.json({ position: p }) : notFound(res, 'Poste');
});
router.delete('/horaire/positions/:id', (req, res) => (h.deletePosition(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Poste')));

// ---------- qualifications ----------
router.get('/horaire/qualifications', (req, res) => res.json({ qualifications: h.listQualifications(req.userId) }));
router.put('/horaire/qualifications', (req, res) => {
  const b = req.body || {};
  if (!h.ownEmployee(req.userId, b.employeeId)) return notFound(res, 'Employé');
  if (!h.ownPosition(req.userId, b.positionId)) return notFound(res, 'Poste');
  if (!(Number.isInteger(b.rank) && b.rank >= 1 && b.rank <= 20)) return bad(res, 'Rang invalide (1 = meilleur, jusqu\'à 20).');
  res.json({ qualification: h.setQualification(req.userId, b.employeeId, b.positionId, b.rank) });
});
router.delete('/horaire/qualifications/:employeeId/:positionId', (req, res) =>
  (h.removeQualification(req.userId, req.params.employeeId, req.params.positionId) ? res.json({ ok: true }) : notFound(res, 'Qualification')));

// ---------- disponibilités (par semaine) ----------
router.get('/horaire/weeks/:weekStart/availabilities', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  res.json({ weekStart: w, availabilities: h.getAvailabilities(req.userId, w) });
});
router.put('/horaire/weeks/:weekStart/availabilities/:employeeId', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  if (!h.ownEmployee(req.userId, req.params.employeeId)) return notFound(res, 'Employé');
  const list = (req.body || {}).intervals;
  if (!Array.isArray(list) || list.length > 50) return bad(res, 'Liste de plages invalide (50 au plus).');
  const days = require('../lib/horaire-generation').weekDays(w);
  for (const i of list) {
    if (!i || !days.includes(i.day) || !h.isTime(i.start) || !h.isTime(i.end) || i.start === i.end) return bad(res, 'Plage invalide : jour de la semaine et heures HH:MM attendus.');
  }
  res.json({ availabilities: h.setAvailabilities(req.userId, w, req.params.employeeId, list.map((i) => ({ day: i.day, start: i.start, end: i.end }))) });
});

// ---------- besoins (modèle normal) ----------
router.get('/horaire/needs', (req, res) => res.json({ needs: h.listNeeds(req.userId) }));
router.post('/horaire/needs', (req, res) => {
  const v = needInput(req, res, req.body || {}, { weekday: true, partial: false }); if (!v) return;
  if (h.listNeeds(req.userId).length >= 500) return res.status(409).json({ error: 'Limite de besoins atteinte.' });
  res.status(201).json({ need: h.createNeed(req.userId, v) });
});
router.put('/horaire/needs/:id', (req, res) => {
  const v = needInput(req, res, req.body || {}, { weekday: true, partial: true }); if (!v) return;
  const n = h.updateNeed(req.userId, req.params.id, v);
  return n ? res.json({ need: n }) : notFound(res, 'Besoin');
});
router.delete('/horaire/needs/:id', (req, res) => (h.deleteNeed(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Besoin')));

// ---------- événements spéciaux ----------
function eventInput(req, res, body, partial, current) {
  const day = body.day !== undefined ? body.day : current && current.day;
  if (!h.isDate(day)) { bad(res, 'Date invalide (AAAA-MM-JJ).'); return null; }
  const label = body.label !== undefined ? h.cleanName(body.label, h.LIMITS.label) : (current ? current.label : '');
  let needs = null;
  if (body.needs !== undefined || !partial) {
    if (!Array.isArray(body.needs) || body.needs.length > 100) { bad(res, 'Besoins de l\'événement invalides (100 au plus).'); return null; }
    needs = [];
    for (const n of body.needs) {
      const v = needInput(req, res, n || {}, { weekday: false, partial: false }); if (!v) return null;
      needs.push(v);
    }
  }
  return { day, label, needs };
}
router.get('/horaire/events', (req, res) => res.json({ events: h.listEvents(req.userId) }));
router.post('/horaire/events', (req, res) => {
  const v = eventInput(req, res, req.body || {}, false, null); if (!v) return;
  res.status(201).json({ event: h.writeEvent(req.userId, null, v) });
});
router.put('/horaire/events/:id', (req, res) => {
  const cur = h.ownEvent(req.userId, req.params.id);
  if (!cur) return notFound(res, 'Événement');
  const v = eventInput(req, res, req.body || {}, true, cur); if (!v) return;
  res.json({ event: h.writeEvent(req.userId, cur.id, v) });
});
router.delete('/horaire/events/:id', (req, res) => (h.deleteEvent(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Événement')));

// ---------- horaire d'une semaine ----------
router.get('/horaire/weeks/:weekStart', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  res.json({ schedule: h.getSchedule(req.userId, w) });
});
router.post('/horaire/weeks/:weekStart/generate', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  res.json({ schedule: h.generate(req.userId, w) });
});

// ---------- export Dayforce (CSV, format : server/lib/horaire-dayforce.js) ----------
router.get('/horaire/settings', (req, res) => res.json({ settings: h.getSettings(req.userId) }));
router.put('/horaire/settings', (req, res) => {
  const b = req.body || {};
  const loc = b.dayforceLocation === undefined ? undefined : dayforceCode(b.dayforceLocation);
  if (b.dayforceLocation !== undefined && loc === undefined) return bad(res, 'Code d\'unité Dayforce invalide (64 caractères au plus).');
  res.json({ settings: h.setSettings(req.userId, { dayforceLocation: loc }) });
});
router.get('/horaire/weeks/:weekStart/export/dayforce', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  const out = h.exportDayforce(req.userId, w);
  if (!out) return notFound(res, 'Horaire');
  // Codes manquants signalés en en-tête (nombres seulement, aucun nom) : la future interface pourra prévenir avant l'import.
  res.set('X-Dayforce-Missing', 'employees=' + out.missing.employees + ';positions=' + out.missing.positions + ';location=' + (out.missing.location ? 1 : 0));
  res.set('Cache-Control', 'no-store');
  res.attachment('horaire-dayforce-' + w + '.csv');
  res.type('text/csv; charset=utf-8').send(out.csv);
});

// ---------- import CSV : corps { csv: "texte" } ----------
function csvText(req, res) {
  const t = (req.body || {}).csv;
  if (typeof t !== 'string' || !t.trim()) { bad(res, 'Fichier CSV vide.'); return null; }
  if (t.length > h.LIMITS.csvChars) { res.status(413).json({ error: 'Fichier CSV trop volumineux.' }); return null; }
  return t;
}
router.post('/horaire/import/employees', (req, res) => {
  const t = csvText(req, res); if (t === null) return;
  res.json(h.importEmployeesCsv(req.userId, t));
});
router.post('/horaire/weeks/:weekStart/import/availabilities', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  const t = csvText(req, res); if (t === null) return;
  res.json(h.importAvailabilitiesCsv(req.userId, w, t));
});

module.exports = router;
