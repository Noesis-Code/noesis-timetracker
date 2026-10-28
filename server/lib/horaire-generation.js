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
// - règles du prompt (27 oct. 2026, REGLES de ./horaire-prompt.js) : strictes = jamais un jour de congé, jamais plus de
//   quarts que wantShiftsMax, noDouble (jamais matin et soir le même jour), restAfterShift (aucun quart la veille ni le
//   lendemain d'un quart) ; préférences = éviter les doubles, éviter soir puis matin du lendemain ; les soirs, traités en
//   premier, vont au meilleur groupe (rang) ;
// - remplissage en 3 passes sur les seuls créneaux restés vides (28 oct. 2026) : 1. chacun atteint son MIN de quarts, à tout prix
//   (préférences puis max d'heures assouplis), meilleur rang d'abord ; 2. jusqu'à sa CIBLE, rang par rang ; 3. au-delà de la cible
//   jusqu'au MAX, meilleur rang d'abord. Le max de quarts est strict : un créneau sans personne reste un trou. L'horaire est toujours
//   produit, avec la liste des alertes (trous, dépassements d'heures, minimum non atteint).

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

// Créneaux à combler pour la semaine. Groupe (événement avec service et extra, 28 oct. 2026) : AJOUTE extra serveurs à la première heure
// d'arrivée de son service ce jour-là (à défaut 10:30–16:00 le matin, 16:00–23:59 le soir, au poste mainPositionId).
// Ancien événement (avec ses besoins) : REMPLACE le modèle normal de son SERVICE
// (matin ou soir, d'après l'heure d'arrivée de ses besoins ; pour tous les postes) ; l'autre service garde ses besoins normaux
// (maquette du 28 oct. 2026 : « Un événement remplace les besoins de son service »).
const serviceOf = (start) => (toMin(start) >= EVENING_FROM ? 'soir' : 'matin');
// opts.zones [{id, morning, evening}] et opts.serverPositionId : pour les SERVEURS d'un événement qui occupe une zone (zoneId), seuls
// max(0, serveurs de l'événement − serveurs habituels de la zone pour ce service) s'ajoutent ; plusieurs événements sur une même zone
// ne la retirent qu'une fois (les premiers événements, par id, consomment les serveurs habituels). Les autres postes s'additionnent.
function zoneExtra(lines, zones, serverPositionId) {
  const usual = new Map((zones || []).map((z) => [Number(z.id), z]));
  const left = new Map();
  return lines.map((l) => {
    const z = l.g.zoneId != null && usual.get(Number(l.g.zoneId));
    if (!z || serverPositionId == null || l.pid !== Number(serverPositionId)) return l;
    const key = z.id + '|' + l.g.service;
    const rem = left.has(key) ? left.get(key) : Math.max(0, Number(l.g.service === 'soir' ? z.evening : z.morning) || 0);
    const take = Math.min(rem, l.count);
    left.set(key, rem - take);
    return Object.assign({}, l, { count: l.count - take, replaced: take });
  });
}
function buildSlots(weekStart, needs, events, mainPositionId, opts) {
  const days = weekDays(weekStart);
  const slots = [];
  days.forEach((day, weekday) => {
    const dayEvents = (events || []).filter((e) => e.day === day);
    const fromEvents = dayEvents.filter((e) => !e.service).flatMap((e) => (e.needs || []).map((n) => Object.assign({ eventId: e.id }, n)));
    const replaced = new Set(fromEvents.map((n) => serviceOf(n.start)));
    const source = fromEvents.concat((needs || []).filter((n) => Number(n.weekday) === weekday && !replaced.has(serviceOf(n.start))));
    // Événement d'un service (plusieurs par service possibles, tous additionnés) : ses lignes « poste · +N » (besoins de l'événement) ;
    // ancien groupe sans ligne : une seule ligne (positionId, extra).
    const base = source.slice();
    const lines0 = dayEvents.filter((e) => e.service).sort((a, b) => a.id - b.id).flatMap((g) => ((g.needs && g.needs.length) ? g.needs : (Number(g.extra) > 0 ? [{ positionId: g.positionId, count: g.extra }] : []))
      .map((l) => ({ g, pid: l.positionId == null ? null : Number(l.positionId), count: Number(l.count) })));
    const lines = zoneExtra(lines0, opts && opts.zones, opts && opts.serverPositionId);
    for (const { g, pid, count } of lines) {
      if (!(count > 0)) continue;
      // Ligne d'un poste : la première arrivée de ce poste dans le service ; ancien groupe (sans poste) : tous postes confondus.
      const first = base.filter((n) => serviceOf(n.start) === g.service && (pid == null || Number(n.positionId) === pid)).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
      if (first) source.push({ positionId: first.positionId, start: first.start, end: first.end, count, eventId: g.id });
      else if ((pid != null ? pid : mainPositionId) != null) source.push({ positionId: pid != null ? pid : mainPositionId, start: g.service === 'soir' ? '16:00' : '10:30', end: g.service === 'soir' ? '23:59' : '16:00', count, eventId: g.id });
    }
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
 *   weekStart 'YYYY-MM-DD' (lundi) ; positions [{id, fillOrder}] ;
 *   employees [{id, wantHoursMin|null, wantHoursTarget|null, wantHoursMax|null (heures/semaine), noDouble, restAfterShift, note}] ;
 *   note : texte libre ; ses expressions reconnues (server/lib/horaire-note.js) s'appliquent : noDouble, restAfterShift, noMorning,
 *   noEvening (strictes) ; eveningsFirst, morningsFirst (préférences) ;
 *   qualifications [{employeeId, positionId, rank}] ; availabilities [{employeeId, day, start, end}] ; timeoff [{employeeId, day}] ;
 *   needs [{positionId, weekday 0..6, start, end, count}] ; events [{id, day, needs:[{positionId, start, end, count}]}] ;
 *   rotation { '<positionId>:<rank>': dernierEmployeeId } ;
 *   arrivalPositions [positionId] : postes où valent les arrivées du soir (catégorie 1 d'abord à 16:00, catégorie 2 d'abord après 16:00).
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
  // catégorie = meilleur rang (1 = priorité la plus haute) de l'employé, tous postes confondus
  const best = new Map();
  for (const m of qual.values()) for (const [id, rank] of m) if (!best.has(id) || rank < best.get(id)) best.set(id, rank);
  // Logique interne fixe (28 oct. 2026 : les règles du restaurant ne sont plus qu'un texte pour l'IA) : toutes les règles s'appliquent ;
  // les préférences (éviter les doubles, éviter fermeture puis ouverture) cèdent ensemble au niveau 1.
  const active = () => true;
  const prefOn = (k, level) => level < 1;
  // Note de l'employé : les expressions reconnues (server/lib/horaire-note.js) s'appliquent comme des règles ; plus de règles de catégorie.
  const { parseNote } = require('./horaire-note');
  const noteRules = new Map(employees.map((e) => [e.id, parseNote(e.note).rules]));
  const rule = (empId, name) => { const p = noteRules.get(empId); return !!(p && p.has(name)); };
  // congés : jour entier, l'employé est indisponible ce jour-là
  const off = new Set((input.timeoff || []).map((t) => t.employeeId + '|' + t.day));

  const slots = buildSlots(input.weekStart, input.needs, input.events, positions.length ? positions[0].id : null, { zones: input.zones, serverPositionId: input.serverPositionId });
  const posRank = new Map(positions.map((p, i) => [p.id, i]));
  // Ordre de traitement : poste (ordre de comblement), puis criticité décroissante, puis jour et heure.
  const ordered = slots.filter((s) => posRank.has(s.positionId)).sort((a, b) =>
    (posRank.get(a.positionId) - posRank.get(b.positionId))
    || (criticality(b.weekday, b.from, !!b.eventId) - criticality(a.weekday, a.from, !!a.eventId))
    || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)
    || (a.from - b.from));

  const arrival = new Set((input.arrivalPositions || []).map(Number));
  const minutesOf = new Map(employees.map((e) => [e.id, 0]));
  const shiftsOf = new Map(employees.map((e) => [e.id, 0]));
  const dayPost = new Map(); // 'employeeId|day' -> positionId (un seul poste par jour)
  const busy = new Map(); // 'employeeId|day' -> [slot]
  const assignments = [];
  const evening = (s) => s.from >= EVENING_FROM;
  const has = (n) => n !== null && n !== undefined;

  // Plafond de quarts d'une passe : min (0 si absent), cible (sinon le max), max (sans limite si absent) ; jamais au-delà du max.
  // Plafond d'une passe, en MINUTES (heures visées × 60) : min (0 si absent), cible (sinon le max), max (sans limite si absent).
  const mins = (h) => (has(h) ? Math.round(h * 60) : null);
  function capOf(e, phase) {
    const max = active('r2') && has(e.wantHoursMax) ? mins(e.wantHoursMax) : Infinity;
    const min = has(e.wantHoursMin) ? mins(e.wantHoursMin) : 0;
    if (phase === 'min') return Math.min(min, max);
    if (phase === 'target') return Math.min(max, Math.max(min, has(e.wantHoursTarget) ? mins(e.wantHoursTarget) : max));
    return max;
  }
  // level : 0 = tout respecté ; 1 = préférences assouplies.
  // ignoreAvail : candidats « à demander » (règle 9) — seules les disponibilités sont ignorées ; congé, max et règles strictes restent.
  function eligible(empId, slot, level, phase, ignoreAvail) {
    const e = empById.get(empId);
    const k = empId + '|' + slot.day;
    if (off.has(k)) return false;
    if (dayPost.has(k) && dayPost.get(k) !== slot.positionId) return false;
    const same = busy.get(k) || [];
    if (same.some((s) => overlaps(s, slot))) return false;
    if (!ignoreAvail && !(avail.get(k) || []).some(([f, t]) => f <= slot.from && slot.to <= t)) return false;
    const before = busy.get(empId + '|' + addDays(slot.day, -1)) || [];
    const after = busy.get(empId + '|' + addDays(slot.day, 1)) || [];
    if (rule(empId, evening(slot) ? 'noEvening' : 'noMorning')) return false;
    if (((e.restAfterShift && active('r3')) || rule(empId, 'restAfterShift')) && (before.length || after.length)) return false;
    const double = same.some((s) => evening(s) !== evening(slot));
    if (((e.noDouble && active('r3')) || rule(empId, 'noDouble')) && double) return false;
    // Heures : le max n'est jamais dépassé ; passe « min » tant que le min n'est pas atteint ; passes « cible » et « max » sans dépasser leur plafond.
    const done = minutesOf.get(empId);
    if (done + slot.minutes > capOf(e, 'max')) return false;
    if (phase === 'min' ? done >= capOf(e, 'min') : done + slot.minutes > capOf(e, phase)) return false;
    // préférence de catégorie : « Soirs d'abord » évite les matins, « Matins d'abord » évite les soirs (assoupli dès la 2e passe)
    if (level < 1 && rule(empId, evening(slot) ? 'morningsFirst' : 'eveningsFirst')) return false;
    // r6 : éviter les doubles ; r7 : fermeture suivie d'une ouverture (soir la veille puis matin, ou soir puis matin le lendemain)
    if (prefOn('r6', level) && double) return false;
    if (prefOn('r7', level) && (evening(slot) ? after.some((s) => !evening(s)) : before.some(evening))) return false;
    return true;
  }

  function pick(slot, level, phase) {
    const q = qual.get(slot.positionId);
    if (!q) return null;
    // r5 désactivée : un soir ne va plus d'abord à la meilleure catégorie (tous les qualifiés dans un seul tourniquet).
    const flat = evening(slot) && !active('r5');
    let ranks = flat ? [0] : [...new Set(q.values())].sort((a, b) => a - b);
    // Arrivées du soir (postes de leur portée) : après 16:00, la catégorie 2 passe devant la catégorie 1 ; la catégorie 1 garde
    // les arrivées de 16:00 (traitées avant, chaque soir) et ne vient plus tard que s'il reste de la place pour elle.
    if (!flat && evening(slot) && slot.from > EVENING_FROM && arrival.has(slot.positionId) && ranks.includes(2)) ranks = [2].concat(ranks.filter((r) => r !== 2));
    for (const rank of ranks) {
      const group = employees.filter((e) => q.has(e.id) && (flat || q.get(e.id) === rank)).map((e) => e.id); // ordre stable (id)
      const key = slot.positionId + ':' + (flat ? 0 : rank);
      const last = group.indexOf(rotation[key]);
      // Tourniquet : on commence juste après le dernier employé servi dans ce groupe ; préférence de catégorie
      // (« Soirs d'abord », « Matins d'abord ») : ceux qui préfèrent ce service d'abord, ceux qui préfèrent l'autre en dernier.
      const turn = [];
      for (let i = 1; i <= group.length; i++) turn.push(group[(last + i + group.length) % group.length]);
      const want = evening(slot) ? 'eveningsFirst' : 'morningsFirst', other = evening(slot) ? 'morningsFirst' : 'eveningsFirst';
      const tier = (id) => (rule(id, want) ? 0 : rule(id, other) ? 2 : 1);
      turn.sort((a, b) => tier(a) - tier(b)); // tri stable : le tourniquet est gardé dans chaque niveau
      for (const id of turn) {
        if (eligible(id, slot, level, phase)) { rotation[key] = id; return id; }
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
    shiftsOf.set(empId, shiftsOf.get(empId) + 1);
    assignments.push({ employeeId: empId, positionId: slot.positionId, day: slot.day, start: slot.start, end: slot.end, eventId: slot.eventId });
  }

  let holes = ordered;
  const levels = [0, 1]; // 0 = tout respecté ; 1 = préférences assouplies
  const PASSES = [['min', levels], ['target', levels], ['max', levels]];
  for (const [phase, levels] of PASSES) {
    for (const level of levels) { // chaque passe ne reprend que les créneaux restés vides
      if (!holes.length) break;
      const left = [];
      for (const slot of holes) {
        // B3 : un soir n'est jamais donné par la passe « min » (elle volerait les meilleurs soirs aux catégories supérieures) ;
        // les soirs vont d'abord à la catégorie 1, puis 2, 3 et 4, dans les passes « cible » et « max ».
        const id = phase === 'min' && evening(slot) ? null : pick(slot, level, phase);
        if (id === null) left.push(slot); else assign(slot, id);
      }
      holes = left;
    }
  }

  // Règle 9 (active par défaut) : pour chaque trou, les employés qui ne sont empêchés QUE par leurs disponibilités (qualifiés, pas en congé,
  // sous leur max, sans règle stricte violée), triés par catégorie puis par heures restantes avant leur cible. Jamais placés d'office.
  const isAvail = (id, slot) => (avail.get(id + '|' + slot.day) || []).some(([f, t]) => f <= slot.from && slot.to <= t);
  function askFor(slot) {
    if (!active('r9')) return [];
    const q = qual.get(slot.positionId);
    if (!q) return [];
    const left = (e) => { const tg = capOf(e, 'target'); return (tg === Infinity ? 1e9 : tg) - minutesOf.get(e.id); };
    return employees.filter((e) => q.has(e.id) && !isAvail(e.id, slot) && eligible(e.id, slot, 99, 'max', true))
      .sort((a, b) => ((best.get(a.id) || 99) - (best.get(b.id) || 99)) || (left(b) - left(a)) || (a.id - b.id))
      .map((e) => e.id);
  }
  const alerts = [];
  const holeKey = new Map();
  for (const s of holes) {
    const k = [s.positionId, s.day, s.start, s.end].join('|');
    if (holeKey.has(k)) holeKey.get(k).missing += 1;
    else { const a = { type: 'trou', positionId: s.positionId, day: s.day, start: s.start, end: s.end, missing: 1, ask: askFor(s) }; holeKey.set(k, a); alerts.push(a); }
  }
  for (const e of employees) {
    if (has(e.wantHoursMin) && minutesOf.get(e.id) < mins(e.wantHoursMin)) {
      alerts.push({ type: 'minimum', employeeId: e.id, minutes: minutesOf.get(e.id), wantHoursMin: e.wantHoursMin });
    }
  }
  assignments.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || (toMin(a.start) - toMin(b.start)) || (posRank.get(a.positionId) - posRank.get(b.positionId)));
  return { assignments, alerts, rotation };
}

module.exports = { generateSchedule, buildSlots, zoneExtra, criticality, toMin, range, addDays, weekDays, WEEKEND, EVENING_FROM };
