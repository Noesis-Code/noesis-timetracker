// Routes du module « Horaire » (/api/horaire/...) : validation d'entrée et codes HTTP seulement, la logique vit dans
// server/lib/horaire.js. Gestionnaire seul : tout est filtré par req.userId (session). Refusé (403 module_off) si le module
// « horaire » n'est pas actif pour le compte : règle dans server/lib/modulegate.js. Aucune donnée n'est journalisée (Loi 25).
const express = require('express');
const { requireAuth } = require('../lib/session');
const h = require('../lib/horaire');
const router = express.Router();

// ---------- réception automatique du rapport de réservations (courriel entrant, SANS session : le jeton secret fait foi) ----------
// POST /api/horaire/inbound/reservations/:jeton : JSON générique des fournisseurs de courriel entrant (Postmark, Mailgun en JSON, Worker
// Cloudflare) : pièce jointe CSV en base64 (attachments/Attachments : content|Content|data) ou texte du corps (text, TextBody,
// body-plain, plain). Taille limitée (2 Mo de CSV), débit limité (30 rapports par heure et par jeton) ; jeton inconnu : 404 sans rien d'autre.
const inboundHits = new Map();
function inboundText(b) {
  const atts = [].concat(b.attachments || b.Attachments || []).filter(Boolean);
  for (const a of atts) {
    const name = String(a.filename || a.Name || a.name || '').toLowerCase(), type = String(a.contentType || a.ContentType || a['content-type'] || '').toLowerCase();
    const data = a.content || a.Content || a.data;
    if (typeof data !== 'string' || !(name.endsWith('.csv') || type.includes('csv') || type.startsWith('text/'))) continue;
    if (data.length > 3 * 1024 * 1024) return null;
    return Buffer.from(data, 'base64').toString('utf8');
  }
  const t = b.text || b.TextBody || b['body-plain'] || b.plain;
  return typeof t === 'string' ? t : '';
}
router.post('/horaire/inbound/reservations/:token', (req, res) => {
  const u = h.userForInboundToken(req.params.token);
  if (!u || !require('../lib/modules').isHoraireAllowed(u)) return res.status(404).end(); // jeton inconnu ou compte non entreprise
  const now = Date.now(), k = req.params.token;
  const hits = (inboundHits.get(k) || []).filter((t) => now - t < 3600 * 1000);
  if (hits.length >= 30) return res.status(429).end();
  hits.push(now); inboundHits.set(k, hits);
  const text = inboundText(req.body || {});
  if (text === null || text.length > 2 * 1024 * 1024) return res.status(413).end();
  const out = h.receiveReservations(u, text);
  res.json({ ok: !out.error, created: out.created, duplicates: out.duplicates, ignored: out.small });
});

router.use('/horaire', requireAuth);
// Horaire : comptes entreprise seulement (exception hors production : HORAIRE_ALLOW_USER_IDS, server/lib/modules.js).
router.use('/horaire', (req, res, next) => (require('../lib/modules').isHoraireAllowed(req.userId) ? next() : res.status(403).json({ error: 'Réservé aux comptes entreprise.' })));

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
  // Quarts souhaités par semaine (min, max) et contrainte particulière : lus par le prompt pour l'IA seulement.
  for (const k of ['wantShiftsMin', 'wantShiftsMax', 'wantShiftsTarget']) {
    if (body[k] === undefined) continue;
    out[k] = h.shiftCount(body[k]);
    if (out[k] === undefined) { bad(res, 'Quarts souhaités invalides (entier, 0 à ' + h.LIMITS.shifts + ').'); return null; }
  }
  if (body.constraintNote !== undefined) {
    out.constraintNote = h.constraintText(body.constraintNote);
    if (out.constraintNote === undefined) { bad(res, 'Contrainte trop longue (' + h.LIMITS.constraint + ' caractères au plus).'); return null; }
  }
  // Heures visées par semaine (grille Horaire) : min, cible, max.
  for (const k of ['wantHoursMin', 'wantHoursTarget', 'wantHoursMax']) {
    if (body[k] === undefined) continue;
    out[k] = h.hoursValue(body[k]);
    if (out[k] === undefined) { bad(res, 'Heures invalides (0 à 168).'); return null; }
  }
  // Ordre dans la catégorie (grille Horaire) : entier de 0 à 100 000.
  if (body.sortOrder !== undefined) {
    if (!(Number.isInteger(body.sortOrder) && body.sortOrder >= 0 && body.sortOrder <= 100000)) { bad(res, 'Ordre invalide.'); return null; }
    out.sortOrder = body.sortOrder;
  }
  // Contraintes strictes de la génération : jamais de double, repos après un quart.
  for (const k of ['noDouble', 'restAfterShift']) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== 'boolean') { bad(res, 'Valeur « ' + k + ' » invalide (oui ou non).'); return null; }
    out[k] = body[k];
  }
  return out;
}
// Min ≤ cible ≤ max, sinon refusé (valeurs fusionnées avec l'employé existant pour une modification).
// Seuls les champs envoyés sont contrôlés : une valeur ancienne incohérente ne bloque jamais l'enregistrement d'un autre champ.
function shiftsOrdered(res, v, cur) {
  const sent = (keys) => keys.some((k) => v[k] !== undefined);
  if (!sent(['wantShiftsMin', 'wantShiftsMax', 'wantShiftsTarget', 'wantHoursMin', 'wantHoursTarget', 'wantHoursMax'])) return true;
  if (!sent(['wantShiftsMin', 'wantShiftsMax', 'wantShiftsTarget'])) return hoursCheck(res, v, cur);
  const lo = v.wantShiftsMin !== undefined ? v.wantShiftsMin : (cur ? cur.wantShiftsMin : null);
  const hi = v.wantShiftsMax !== undefined ? v.wantShiftsMax : (cur ? cur.wantShiftsMax : null);
  if (lo != null && hi != null && lo > hi) { bad(res, 'Quarts souhaités : le minimum dépasse le maximum.'); return false; }
  return hoursCheck(res, v, cur);
}
function hoursCheck(res, v, cur) {
  if (!['wantHoursMin', 'wantHoursTarget', 'wantHoursMax'].some((k) => v[k] !== undefined)) return true;
  const hv = (k) => (v[k] !== undefined ? v[k] : (cur ? cur[k] : null));
  if (!h.hoursOrdered(hv('wantHoursMin'), hv('wantHoursTarget'), hv('wantHoursMax'))) { bad(res, 'Heures : min ≤ max.'); return false; }
  return true;
}
router.get('/horaire/employees', (req, res) => res.json({ employees: h.listEmployees(req.userId) }));
router.post('/horaire/employees', (req, res) => {
  const v = employeeInput(res, req.body || {}, false); if (!v) return;
  if (!shiftsOrdered(res, v, null)) return;
  if (h.countEmployees(req.userId) >= h.LIMITS.employees) return res.status(409).json({ error: 'Limite d\'employés atteinte.' });
  if (h.nameTaken(req.userId, v.name)) return res.status(409).json({ error: 'Ce nom existe déjà.' });
  res.status(201).json({ employee: h.createEmployee(req.userId, v) });
});
router.put('/horaire/employees/:id', (req, res) => {
  const v = employeeInput(res, req.body || {}, true); if (!v) return;
  const cur = h.ownEmployee(req.userId, req.params.id);
  if (!cur) return notFound(res, 'Employé');
  if (!shiftsOrdered(res, v, cur)) return;
  if (v.name !== undefined && h.nameTaken(req.userId, v.name, cur.id)) return res.status(409).json({ error: 'Ce nom existe déjà.' });
  const e = h.updateEmployee(req.userId, req.params.id, v);
  return e ? res.json({ employee: e }) : notFound(res, 'Employé');
});
// Retirer de l'horaire : { today: 'AAAA-MM-JJ' } (date du jour de l'écran ; à défaut celle du serveur) ; quarts passés gardés.
router.post('/horaire/employees/:id/retire', (req, res) => {
  const b = req.body || {};
  const d = new Date();
  const today = h.isDate(b.today) ? b.today : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const r = h.retireEmployee(req.userId, req.params.id, today);
  return r ? res.json({ ok: true, removed: r.removed }) : notFound(res, 'Employé');
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
  // OpenTable : couverts par service qui justifient une personne de plus à ce poste (null = non renseigné). Pas encore lu par la génération.
  if (body.openTableCovers !== undefined) {
    const v = body.openTableCovers;
    if (!(v === null || (Number.isInteger(v) && v >= 1 && v <= 1000))) { bad(res, 'Nombre de couverts invalide (1 à 1 000).'); return null; }
    out.openTableCovers = v;
  }
  return out;
}
router.get('/horaire/positions', (req, res) => res.json({ positions: h.listPositions(req.userId) }));
// Postes du volet créés s'ils manquent (Barman, Commis, Hôte/Hôtesse, Serveur, Suiteur) ; existants intacts.
router.post('/horaire/positions/defaults', (req, res) => res.json({ positions: h.ensureDefaultPositions(req.userId) }));
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

// ---------- règles par employé : { employeeId, rule (liste fermée ou 'free'), text (si 'free') } ----------
router.get('/horaire/employee-rules', (req, res) => res.json({ rules: h.listEmployeeRules(req.userId) }));
router.post('/horaire/employee-rules', (req, res) => {
  const b = req.body || {};
  if (!h.ownEmployee(req.userId, b.employeeId)) return notFound(res, 'Employé');
  if (b.rule !== 'free' && !h.CATEGORY_RULES.includes(b.rule)) return bad(res, 'Règle inconnue.');
  const text = b.rule === 'free' ? h.cleanName(b.text, h.RULE_TEXT_MAX) : null;
  if (b.rule === 'free' && !text) return bad(res, 'Texte de la règle requis.');
  res.status(201).json({ rule: h.addEmployeeRule(req.userId, Number(b.employeeId), b.rule, text) });
});
router.delete('/horaire/employee-rules/:id', (req, res) => (h.removeEmployeeRule(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Règle')));
// Règles du restaurant : { list: [textes] } (remplace la liste ; une ligne vide est retirée).
router.get('/horaire/restaurant-rules', (req, res) => res.json({ rules: h.getRestaurantRules(req.userId) }));
router.put('/horaire/restaurant-rules', (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.list) || b.list.length > h.RESTAURANT_RULES_MAX) return bad(res, 'Liste de règles invalide (' + h.RESTAURANT_RULES_MAX + ' au plus).');
  // Ligne : texte, ou { text, positions: null | [noms de postes] } (null = tous les postes).
  const names = new Set(h.listPositions(req.userId).map((p) => p.name));
  const list = b.list.map((x) => {
    const text = h.cleanName(typeof x === 'string' ? x : x && x.text, h.RULE_TEXT_MAX);
    if (!text) return null;
    const pos = x && typeof x === 'object' && Array.isArray(x.positions) ? x.positions.filter((p) => names.has(p)) : null;
    return { text, positions: pos && pos.length ? pos : null };
  }).filter(Boolean);
  res.json({ rules: h.setRestaurantRules(req.userId, list) });
});
// Poste principal (créé « Serveur » s'il manque) : sert à l'ajout d'un employé et aux besoins.
router.post('/horaire/main-position', (req, res) => res.json({ position: h.mainPosition(req.userId) }));

// ---------- règles de catégorie : { rank 1..5, rule } (liste fermée h.CATEGORY_RULES) ----------
function categoryRuleInput(res, b) {
  const rank = Number(b && b.rank), rule = b && b.rule;
  if (!(Number.isInteger(rank) && rank >= 1 && rank <= 5)) { bad(res, 'Catégorie invalide (1 à 5).'); return null; }
  if (!h.CATEGORY_RULES.includes(rule)) { bad(res, 'Règle inconnue.'); return null; }
  return { rank, rule };
}
router.get('/horaire/category-rules', (req, res) => res.json({ rules: h.listCategoryRules(req.userId) }));
router.put('/horaire/category-rules', (req, res) => {
  const v = categoryRuleInput(res, req.body || {}); if (!v) return;
  res.json({ rules: h.addCategoryRule(req.userId, v.rank, v.rule) });
});
router.delete('/horaire/category-rules/:rank/:rule', (req, res) => {
  const v = categoryRuleInput(res, { rank: Number(req.params.rank), rule: req.params.rule }); if (!v) return;
  return h.removeCategoryRule(req.userId, v.rank, v.rule) ? res.json({ rules: h.listCategoryRules(req.userId) }) : notFound(res, 'Règle');
});

// ---------- disponibilités (par semaine) ----------
router.get('/horaire/weeks/:weekStart/availabilities', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  res.json({ weekStart: w, availabilities: h.getAvailabilities(req.userId, w), timeoff: h.getTimeoff(req.userId, w), summary: h.availSummary(req.userId, w) });
});
// Correction manuelle : { intervals?: [{day, start, end}], timeoff?: ['AAAA-MM-JJ'] } (au moins l'un des deux ; absent = inchangé).
// Une case du tableau : disponible (plage), indisponible (rien) ou vacances (jour dans timeoff, ses plages sont retirées).
router.put('/horaire/weeks/:weekStart/availabilities/:employeeId', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  if (!h.ownEmployee(req.userId, req.params.employeeId)) return notFound(res, 'Employé');
  const { intervals: list, timeoff } = req.body || {};
  if (list === undefined && timeoff === undefined) return bad(res, 'Plages ou congés attendus.');
  if (list !== undefined && (!Array.isArray(list) || list.length > 50)) return bad(res, 'Liste de plages invalide (50 au plus).');
  const days = require('../lib/horaire-generation').weekDays(w);
  for (const i of list || []) {
    if (!i || !days.includes(i.day) || !h.isTime(i.start) || !h.isTime(i.end) || i.start === i.end) return bad(res, 'Plage invalide : jour de la semaine et heures HH:MM attendus.');
  }
  if (timeoff !== undefined && (!Array.isArray(timeoff) || timeoff.length > 7 || !timeoff.every((d) => days.includes(d)))) return bad(res, 'Congés invalides : jours de la semaine attendus.');
  const availabilities = h.setAvailabilities(req.userId, w, req.params.employeeId,
    list === undefined ? undefined : list.map((i) => ({ day: i.day, start: i.start, end: i.end })), timeoff);
  const emp = Number(req.params.employeeId);
  res.json({ availabilities, timeoff: h.getTimeoff(req.userId, w).filter((t) => t.employeeId === emp) });
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
  // Jamais dans le passé (jour civil de Montréal) : un événement passé est supprimé (conservation minimale).
  if (day < h.montrealToday()) { bad(res, 'Date passée : un événement se crée aujourd’hui ou plus tard.'); return null; }
  // Événement d'un service (28 oct. 2026) : { day, service, covers?, lines: [{ positionId, count 1..50 }] } ; plusieurs par service.
  if (body.lines !== undefined || body.covers !== undefined || body.name !== undefined || body.floorId !== undefined || (current && current.service && body.extra === undefined)) {
    const service = body.service !== undefined ? body.service : current && current.service;
    if (service !== 'matin' && service !== 'soir') { bad(res, 'Service invalide (matin ou soir).'); return null; }
    const covers = body.covers !== undefined ? body.covers : (current ? current.covers : null);
    if (!(covers == null || (Number.isInteger(covers) && covers >= 1 && covers <= 5000))) { bad(res, 'Couverts invalides (1 à 5 000).'); return null; }
    const lines = body.lines !== undefined ? body.lines : (current ? (h.listEvents(req.userId).find((e) => e.id === current.id) || {}).lines || [] : []);
    if (!Array.isArray(lines) || lines.length > 20) { bad(res, "Postes de l'événement invalides (20 au plus)."); return null; }
    for (const l of lines) {
      if (!l || !h.ownPosition(req.userId, l.positionId)) { notFound(res, 'Poste'); return null; }
      if (!(Number.isInteger(l.count) && l.count >= 1 && l.count <= 50)) { bad(res, 'Nombre invalide (1 à 50).'); return null; }
    }
    // Nom (80 caractères au plus ; vide = inchangé) et plancher occupé (un plancher du compte, ou null = « Aucun »).
    let name;
    if (body.name !== undefined) { name = h.cleanName(String(body.name || ''), 80); if (!name) name = undefined; }
    let floorId;
    if (body.floorId !== undefined) {
      if (body.floorId !== null && !h.ownFloor(req.userId, body.floorId)) { notFound(res, 'Plancher'); return null; }
      floorId = body.floorId === null ? null : Number(body.floorId);
    }
    return { serviceEvent: true, day, service, covers, name, floorId, lines: lines.map((l) => ({ positionId: Number(l.positionId), count: l.count })) };
  }
  // Groupe (28 oct. 2026, ancienne forme) : { day, service: 'matin' | 'soir', extra: 1..50 } ; libellé « Groupe », aucun besoin propre.
  if (body.service !== undefined || body.extra !== undefined) {
    const service = body.service !== undefined ? body.service : current && current.service;
    const extra = body.extra !== undefined ? body.extra : current && current.extra;
    if (service !== 'matin' && service !== 'soir') { bad(res, 'Service invalide (matin ou soir).'); return null; }
    if (!(Number.isInteger(extra) && extra >= 1 && extra <= 50)) { bad(res, 'Serveurs en plus invalides (1 à 50).'); return null; }
    const positionId = body.positionId !== undefined ? body.positionId : current && current.positionId;
    if (positionId != null && !h.ownPosition(req.userId, positionId)) { notFound(res, 'Poste'); return null; }
    return { day, label: 'Groupe', needs: [], service, extra, positionId: positionId == null ? null : Number(positionId) };
  }
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
// Réception automatique : { address (null tant qu'aucun domaine n'est configuré), lastAt, groupMin } ; PUT { groupMin 1..500 } ;
// POST revoke : nouveau jeton (l'ancienne adresse ne reçoit plus rien).
router.get('/horaire/inbound', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(h.inboundInfo(req.userId)); });
router.put('/horaire/inbound', (req, res) => {
  const n = (req.body || {}).groupMin;
  if (!(Number.isInteger(n) && n >= 1 && n <= 500)) return bad(res, 'Seuil invalide (1 à 500 couverts).');
  res.json(h.setGroupMin(req.userId, n));
});
router.post('/horaire/inbound/revoke', (req, res) => res.json(h.revokeInbound(req.userId)));
// Heures de fin des services : GET { ends: { '<posteId>|<jour>|<service>': 'HH:MM' } } (absent = défaut) ;
// PUT { positionId, weekday 0..6, service 'matin'|'soir', end 'HH:MM' } (00:00 = minuit ; 24:00 accepté et rangé en 00:00).
router.get('/horaire/service-ends', (req, res) => res.json({ ends: h.getServiceEnds(req.userId) }));
router.put('/horaire/service-ends', (req, res) => {
  const b = req.body || {};
  if (!h.ownPosition(req.userId, b.positionId)) return notFound(res, 'Poste');
  if (!(Number.isInteger(b.weekday) && b.weekday >= 0 && b.weekday <= 6)) return bad(res, 'Jour invalide (0 à 6).');
  if (b.service !== 'matin' && b.service !== 'soir') return bad(res, 'Service invalide (matin ou soir).');
  const end = b.end === '24:00' ? '00:00' : b.end;
  if (!/^\d{2}:\d{2}$/.test(String(end)) || !h.isTime(end)) return bad(res, 'Heure invalide (HH:MM).');
  res.json({ ends: h.setServiceEnd(req.userId, b.positionId, b.weekday, b.service, end) });
});
// ---------- planchers : liste commune ; nombre de personnes par poste (Serveur, Barman, Commis), jour et service ----------
router.get('/horaire/floors', (req, res) => res.json({ floors: h.listFloors(req.userId), counts: h.listFloorCounts(req.userId) }));
router.post('/horaire/floors', (req, res) => {
  if (h.listFloors(req.userId).length >= 50) return res.status(409).json({ error: 'Limite de planchers atteinte.' });
  res.status(201).json({ floor: h.createFloor(req.userId, h.cleanName((req.body || {}).name || '', h.LIMITS.name)) });
});
router.put('/horaire/floors/:id', (req, res) => {
  const f = h.renameFloor(req.userId, req.params.id, h.cleanName((req.body || {}).name || '', h.LIMITS.name));
  return f ? res.json({ floor: f }) : notFound(res, 'Plancher');
});
router.delete('/horaire/floors/:id', (req, res) => (h.deleteFloor(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Plancher')));
router.put('/horaire/floor-counts', (req, res) => {
  const b = req.body || {};
  if (!h.ownFloor(req.userId, b.floorId)) return notFound(res, 'Plancher');
  const p = h.ownPosition(req.userId, b.positionId);
  if (!h.isFloorPosition(p)) return bad(res, 'Poste sans plancher (Serveur, Barman ou Commis seulement).');
  if (!(Number.isInteger(b.weekday) && b.weekday >= 0 && b.weekday <= 6)) return bad(res, 'Jour invalide (0 à 6).');
  if (b.service !== 'matin' && b.service !== 'soir') return bad(res, 'Service invalide (matin ou soir).');
  if (!(Number.isInteger(b.count) && b.count >= 0 && b.count <= 50)) return bad(res, 'Nombre invalide (0 à 50).');
  res.json({ counts: h.setFloorCount(req.userId, b.floorId, p.id, b.weekday, b.service, b.count) });
});
router.get('/horaire/events', (req, res) => res.json({ events: h.listEvents(req.userId) }));
router.post('/horaire/events', (req, res) => {
  const v = eventInput(req, res, req.body || {}, false, null); if (!v) return;
  res.status(201).json({ event: v.serviceEvent ? h.writeServiceEvent(req.userId, null, v) : h.writeEvent(req.userId, null, v) });
});
router.put('/horaire/events/:id', (req, res) => {
  const cur = h.ownEvent(req.userId, req.params.id);
  if (!cur) return notFound(res, 'Événement');
  const v = eventInput(req, res, req.body || {}, true, cur); if (!v) return;
  res.json({ event: v.serviceEvent ? h.writeServiceEvent(req.userId, cur.id, v) : h.writeEvent(req.userId, cur.id, v) });
});
router.delete('/horaire/events/:id', (req, res) => (h.deleteEvent(req.userId, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Événement')));

// ---------- horaire d'une semaine ----------
router.get('/horaire/weeks/:weekStart', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  res.json({ schedule: h.getSchedule(req.userId, w) });
});
router.post('/horaire/weeks/:weekStart/generate', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  // G6 : jamais sans aucune disponibilité de la semaine (l'horaire serait vide ou faux).
  if (!h.availSummary(req.userId, w).employees) return res.status(409).json({ error: 'Colle d’abord les disponibilités de la semaine (Récupération).' });
  res.json({ schedule: h.generate(req.userId, w) });
});

// ---------- modification manuelle de l'horaire généré (jamais écrasée, sauf par « Générer » relancé par le gestionnaire) ----------
// Quart : { employeeId, positionId, day, start, end } ; employé et poste du compte, jour de la semaine. Réponse : { assignment }.
function assignmentInput(req, res, body, w, partial) {
  const out = {};
  if (body.employeeId !== undefined || !partial) {
    if (!h.ownEmployee(req.userId, body.employeeId)) { notFound(res, 'Employé'); return null; }
    out.employeeId = Number(body.employeeId);
  }
  if (!partial) {
    if (!h.ownPosition(req.userId, body.positionId)) { notFound(res, 'Poste'); return null; }
    out.positionId = Number(body.positionId);
    if (!require('../lib/horaire-generation').weekDays(w).includes(body.day)) { bad(res, 'Jour invalide : date de la semaine attendue (AAAA-MM-JJ).'); return null; }
    out.day = body.day;
  }
  for (const k of ['start', 'end']) {
    if (body[k] === undefined && partial) continue;
    if (!h.isTime(body[k])) { bad(res, 'Heure invalide (HH:MM).'); return null; }
    out[k] = body[k];
  }
  if (partial && !Object.keys(out).length) { bad(res, 'Rien à modifier.'); return null; }
  return out;
}
// Employés possibles puis les autres avec leurs raisons, pour un créneau : ?positionId=&day=&start=&end=[&except=id du quart remplacé].
router.get('/horaire/weeks/:weekStart/candidates', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  const q = req.query || {};
  if (!h.ownPosition(req.userId, q.positionId)) return notFound(res, 'Poste');
  if (!require('../lib/horaire-generation').weekDays(w).includes(q.day)) return bad(res, 'Jour invalide : date de la semaine attendue (AAAA-MM-JJ).');
  if (!h.isTime(q.start) || !h.isTime(q.end)) return bad(res, 'Heure invalide (HH:MM).');
  res.set('Cache-Control', 'no-store');
  res.json({ candidates: h.candidates(req.userId, w, { positionId: Number(q.positionId), day: q.day, start: q.start, end: q.end }, q.except) });
});
const noSchedule = (res) => res.status(409).json({ error: 'Génère d\'abord l\'horaire.' });
router.post('/horaire/weeks/:weekStart/assignments', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  if (!h.getSchedule(req.userId, w)) return noSchedule(res);
  const v = assignmentInput(req, res, req.body || {}, w, false); if (!v) return;
  if (v.start === v.end) return bad(res, 'Début et fin identiques.');
  res.status(201).json({ assignment: h.addAssignment(req.userId, w, v) });
});
router.put('/horaire/weeks/:weekStart/assignments/:id', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  const cur = h.ownAssignment(req.userId, w, req.params.id);
  if (!cur) return notFound(res, 'Quart');
  const v = assignmentInput(req, res, req.body || {}, w, true); if (!v) return;
  if ((v.start || cur.start) === (v.end || cur.end)) return bad(res, 'Début et fin identiques.');
  res.json({ assignment: h.updateAssignment(req.userId, w, cur.id, v) });
});
router.delete('/horaire/weeks/:weekStart/assignments/:id', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  return h.deleteAssignment(req.userId, w, req.params.id) ? res.json({ ok: true }) : notFound(res, 'Quart');
});

// Prompt fixe de LECTURE (texte brut, sans aucune donnée) : le gestionnaire le colle dans son IA, qui rend le CSV des
// disponibilités et congés de la semaine à importer (POST weeks/:lundi/import/availabilities).
router.get('/horaire/import-prompt', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // Texte du gérant s'il l'a modifié (sinon la version de base), daté de la semaine affichée (?week=AAAA-MM-JJ, un lundi).
  const w = h.isMonday(req.query.week) ? req.query.week : null;
  const p = h.getPrompts(req.userId).importPrompt;
  res.type('text/plain; charset=utf-8').send(require('../lib/horaire-prompt').importPromptFor(w, p.isDefault ? null : p.text));
});
// Prompts modifiables par le gérant : { importPrompt: {text, isDefault}, entryPrompt: {text, isDefault} } (entryPrompt = consignes
// seules, sans la semaine ni les quarts). PUT { importPrompt?, entryPrompt? } : null ou "" rétablit la version de base.
router.get('/horaire/prompts', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(h.getPrompts(req.userId));
});
router.put('/horaire/prompts', (req, res) => {
  const b = req.body || {};
  const v = {};
  for (const k of ['importPrompt', 'entryPrompt']) {
    if (b[k] === undefined) continue;
    v[k] = h.promptText(b[k]);
    if (v[k] === undefined) return bad(res, 'Prompt invalide (texte, ' + h.PROMPT_MAX + ' caractères au plus).');
  }
  if (!Object.keys(v).length) return bad(res, 'Rien à enregistrer.');
  res.json(h.setPrompts(req.userId, v));
});
// Prompt d'INSCRIPTION de l'horaire enregistré de la semaine (texte brut à coller dans sa propre IA ; server/lib/horaire-prompt.js).
router.get('/horaire/weeks/:weekStart/prompt', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  const text = h.weekPrompt(req.userId, w);
  if (text === null) return noSchedule(res);
  res.set('Cache-Control', 'no-store');
  res.type('text/plain; charset=utf-8').send(text);
});

// ---------- réglages du compte (code d'unité Dayforce + configuration guidée) ----------
// Texte court facultatif : '' ou null = effacé ; undefined = invalide.
function shortText(v, max) {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
  return s.length <= max ? (s || null) : undefined;
}
router.get('/horaire/settings', (req, res) => res.json({ settings: h.getSettings(req.userId) }));
router.put('/horaire/settings', (req, res) => {
  const b = req.body || {};
  const v = {};
  if (b.dayforceLocation !== undefined) {
    v.dayforceLocation = dayforceCode(b.dayforceLocation);
    if (v.dayforceLocation === undefined) return bad(res, 'Code d\'unité Dayforce invalide (64 caractères au plus).');
  }
  if (b.configured !== undefined) {
    if (typeof b.configured !== 'boolean') return bad(res, 'Valeur « configured » invalide.');
    v.configured = b.configured;
  }
  if (b.setupStep !== undefined) {
    if (!(Number.isInteger(b.setupStep) && b.setupStep >= 0 && b.setupStep <= 7)) return bad(res, 'Étape invalide (0 à 7).');
    v.setupStep = b.setupStep;
  }
  for (const [k, max] of [['eventsSource', 200], ['eventsStaffRule', 500]]) {
    if (b[k] === undefined) continue;
    v[k] = shortText(b[k], max);
    if (v[k] === undefined) return bad(res, 'Texte trop long (' + max + ' caractères au plus).');
  }
  if (b.eventsNoticeDays !== undefined) {
    if (!(b.eventsNoticeDays === null || (Number.isInteger(b.eventsNoticeDays) && b.eventsNoticeDays >= 0 && b.eventsNoticeDays <= 365))) return bad(res, 'Délai invalide (0 à 365 jours).');
    v.eventsNoticeDays = b.eventsNoticeDays;
  }
  if (b.dataInCanada !== undefined) {
    if (![null, 'oui', 'non', 'nsp'].includes(b.dataInCanada)) return bad(res, 'Réponse invalide (oui, non ou nsp).');
    v.dataInCanada = b.dataInCanada;
  }
  // Fichier modèle d'import Dayforce : texte (CSV), gardé pour fixer le format de l'export ; null = retiré.
  if (b.dayforceTemplate !== undefined) {
    const t = b.dayforceTemplate;
    if (t === null) v.dayforceTemplate = null;
    else {
      const name = t && shortText(t.name, 120);
      if (!name || typeof t.content !== 'string' || !t.content.trim()) return bad(res, 'Fichier modèle invalide.');
      if (t.content.length > h.LIMITS.csvChars) return res.status(413).json({ error: 'Fichier modèle trop volumineux.' });
      v.dayforceTemplate = { name, content: t.content };
    }
  }
  res.json({ settings: h.setSettings(req.userId, v) });
});

// ---------- export Dayforce (CSV, format : server/lib/horaire-dayforce.js) ----------
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
router.post('/horaire/import/reservations', (req, res) => {
  const t = csvText(req, res); if (t === null) return;
  const out = h.importReservationsCsv(req.userId, t);
  if (out.error) return bad(res, out.error);
  res.json(out);
});
router.get('/horaire/weeks/:weekStart/covers', (req, res) => {
  const w = weekParam(req, res); if (!w) return;
  res.set('Cache-Control', 'no-store');
  res.json({ covers: h.weekCovers(req.userId, w) });
});

module.exports = router;
