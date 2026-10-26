// Module « Horaire » : génération de l'horaire d'une semaine (fonction PURE, aucune base, aucun réseau : testable seule,
// voir test/horaire-generation-test.js). Les données lues ici sont confidentielles (Loi 25) : jamais journalisées.
//
// Règles (décision d'Émilien, 26 oct. 2026, voir docs/basic/module-horaire.md) :
// - les postes sont comblés dans leur ordre de comblement (fillOrder croissant) ;
// - dans un poste, les créneaux sont traités par CRITICITÉ, pas dans l'ordre chronologique :
//   soir d'événement spécial, puis tous les autres soirs (à égalité, ordre chronologique), puis fin de semaine + jour
//   (brunch), puis semaine + jour (lunch) ;
// - contraintes strictes : un employé = un seul poste par jour (plusieurs quarts du même poste possibles s'ils ne se
//   chevauchent pas) ; jamais hors disponibilité ; jamais sans qualification pour le poste ;
// - meilleur rang d'abord (1 = meilleur) ; à rang égal, rotation (tourniquet par poste et par rang) ;
// - 1re passe : max d'heures hebdo respecté ; 2e passe sur les seuls créneaux restés vides : SEUL le max hebdo est
//   assoupli (dépassement signalé). L'horaire est toujours produit, avec la liste des alertes (trous, dépassements).

const WEEKEND = [5, 6]; // samedi, dimanche (lundi = 0)
const EVENING_FROM = 16 * 60; // un quart qui commence à 16 h ou plus tard est « de soir »

// 'HH:MM' -> minutes ; null si invalide.
function toMin(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

// Plage [début, fin) en minutes ; une fin <= début traverse minuit (ex. 17:00 -> 01:00).
function range(start, end) {
  const a = toMin(start), b = toMin(end);
  if (a === null || b === null) return null;
  return [a, b > a ? b : b + 24 * 60];
}

// 'YYYY-MM-DD' + n jours (calcul en UTC : aucune dépendance au fuseau du serveur).
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekDays(weekStart) {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i));
}

// Criticité : plus grand = traité plus tôt. Tous les soirs d'abord, à égalité entre eux, sauf un soir d'événement
// spécial qui passe devant ; puis la journée de fin de semaine (brunch), puis la journée en semaine (lunch).
function criticality(weekday, startMin, isEvent) {
  if (startMin >= EVENING_FROM) return isEvent ? 3 : 2;
  return WEEKEND.includes(weekday) ? 1 : 0;
}

// Créneaux à combler pour la semaine : un événement spécial d'une date REMPLACE le modèle normal de ce jour
// (pour tous les postes) ; sinon on prend les besoins normaux du jour de semaine.
function buildSlots(weekStart, needs, events) {
  const days = weekDays(weekStart);
  const slots = [];
  days.forEach((day, weekday) => {
    const dayEvents = (events || []).filter((e) => e.day === day);
    const source = dayEvents.length
      ? dayEvents.flatMap((e) => (e.needs || []).map((n) => Object.assign({ eventId: e.id }, n)))
      : (needs || []).filter((n) => Number(n.weekday) === weekday);
    for (const n of source) {
      const r = range(n.start, n.end);
      const count = Math.max(0, Math.floor(Number(n.count) || 0));
      if (!r || !count) continue;
      for (let k = 0; k < count; k++) {
        slots.push({ positionId: n.positionId, day, weekday, start: n.start, end: n.end, from: r[0], to: r[1], minutes: r[1] - r[0], eventId: n.eventId || null });
      }
    }
  });
  return slots;
}

function overlaps(a, b) { return a.from < b.to && b.from < a.to; }

/**
 * @param {object} input
 *   weekStart 'YYYY-MM-DD' (lundi) ; positions [{id, fillOrder}] ; employees [{id, maxWeekMinutes|null}] ;
 *   qualifications [{employeeId, positionId, rank}] ; availabilities [{employeeId, day, start, end}] ;
 *   needs [{positionId, weekday 0..6, start, end, count}] ; events [{id, day, needs:[{positionId, start, end, count}]}] ;
 *   rotation { '<positionId>:<rank>': dernierEmployeeId }.
 * @returns {{assignments: Array, alerts: Array, rotation: object}}
 */
function generateSchedule(input) {
  const positions = (input.positions || []).slice().sort((a, b) => (a.fillOrder - b.fillOrder) || (a.id - b.id));
  const employees = (input.employees || []).slice().sort((a, b) => a.id - b.id);
  const empById = new Map(employees.map((e) => [e.id, e]));
  const rotation = Object.assign({}, input.rotation || {});

  // qualifications : positionId -> Map(employeeId -> rang)
  const qual = new Map();
  for (const q of input.qualifications || []) {
    const rank = Math.floor(Number(q.rank));
    if (!empById.has(q.employeeId) || !(rank >= 1)) continue;
    if (!qual.has(q.positionId)) qual.set(q.positionId, new Map());
    qual.get(q.positionId).set(q.employeeId, rank);
  }

  // disponibilités : 'employeeId|day' -> [[de, à]]
  const avail = new Map();
  for (const a of input.availabilities || []) {
    const r = range(a.start, a.end);
    if (!r) continue;
    const k = a.employeeId + '|' + a.day;
    if (!avail.has(k)) avail.set(k, []);
    avail.get(k).push(r);
  }

  const slots = buildSlots(input.weekStart, input.needs, input.events);
  const posRank = new Map(positions.map((p, i) => [p.id, i]));
  // Ordre de traitement : poste (ordre de comblement), puis criticité décroissante, puis jour et heure.
  const ordered = slots.filter((s) => posRank.has(s.positionId)).sort((a, b) =>
    (posRank.get(a.positionId) - posRank.get(b.positionId))
    || (criticality(b.weekday, b.from, !!b.eventId) - criticality(a.weekday, a.from, !!a.eventId))
    || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)
    || (a.from - b.from));

  const minutesOf = new Map(employees.map((e) => [e.id, 0]));
  const dayPost = new Map(); // 'employeeId|day' -> positionId (un seul poste par jour)
  const busy = new Map(); // 'employeeId|day' -> [slot]
  const assignments = [];

  function eligible(empId, slot, relaxMax) {
    const k = empId + '|' + slot.day;
    if (dayPost.has(k) && dayPost.get(k) !== slot.positionId) return false;
    if ((busy.get(k) || []).some((s) => overlaps(s, slot))) return false;
    if (!(avail.get(k) || []).some(([f, t]) => f <= slot.from && slot.to <= t)) return false;
    const max = empById.get(empId).maxWeekMinutes;
    if (!relaxMax && max !== null && max !== undefined && minutesOf.get(empId) + slot.minutes > max) return false;
    return true;
  }

  function pick(slot, relaxMax) {
    const q = qual.get(slot.positionId);
    if (!q) return null;
    const ranks = [...new Set(q.values())].sort((a, b) => a - b);
    for (const rank of ranks) {
      const group = employees.filter((e) => q.get(e.id) === rank).map((e) => e.id); // ordre stable (id)
      const key = slot.positionId + ':' + rank;
      const last = group.indexOf(rotation[key]);
      // Tourniquet : on commence juste après le dernier employé servi dans ce groupe.
      for (let i = 1; i <= group.length; i++) {
        const id = group[(last + i + group.length) % group.length];
        if (eligible(id, slot, relaxMax)) { rotation[key] = id; return id; }
      }
    }
    return null;
  }

  function assign(slot, empId) {
    const k = empId + '|' + slot.day;
    dayPost.set(k, slot.positionId);
    if (!busy.has(k)) busy.set(k, []);
    busy.get(k).push(slot);
    minutesOf.set(empId, minutesOf.get(empId) + slot.minutes);
    assignments.push({ employeeId: empId, positionId: slot.positionId, day: slot.day, start: slot.start, end: slot.end, eventId: slot.eventId });
  }

  const pending = [];
  for (const slot of ordered) {
    const id = pick(slot, false);
    if (id === null) pending.push(slot); else assign(slot, id);
  }
  const holes = [];
  for (const slot of pending) { // 2e passe : seul le max hebdo est assoupli
    const id = pick(slot, true);
    if (id === null) holes.push(slot); else assign(slot, id);
  }

  const alerts = [];
  const holeKey = new Map();
  for (const s of holes) {
    const k = [s.positionId, s.day, s.start, s.end].join('|');
    if (holeKey.has(k)) holeKey.get(k).missing += 1;
    else { const a = { type: 'trou', positionId: s.positionId, day: s.day, start: s.start, end: s.end, missing: 1 }; holeKey.set(k, a); alerts.push(a); }
  }
  for (const e of employees) {
    const max = e.maxWeekMinutes;
    if (max !== null && max !== undefined && minutesOf.get(e.id) > max) {
      alerts.push({ type: 'depassement', employeeId: e.id, minutes: minutesOf.get(e.id), maxWeekMinutes: max });
    }
  }
  assignments.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (toMin(a.start) - toMin(b.start)) || (posRank.get(a.positionId) - posRank.get(b.positionId)));
  return { assignments, alerts, rotation };
}

module.exports = { generateSchedule, buildSlots, criticality, toMin, range, addDays, weekDays, WEEKEND, EVENING_FROM };
