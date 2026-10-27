// Module « Horaire » : prompt pour l'IA du gestionnaire (27 oct. 2026, demande d'Émilien). Le maître d'hôtel copie ce texte
// et le colle dans SA propre IA (ChatGPT ou autre) ; le serveur ne l'envoie à aucune IA. Fonction PURE (aucune base, aucun
// réseau), testée par test/horaire-prompt-test.js. Données confidentielles du personnel (Loi 25) : rien n'est journalisé.
// Matin = quart qui commence avant 16 h ; soir = 16 h ou après (même seuil que horaire-generation.js).
const gen = require('./horaire-generation');

const EVENING_FROM = gen.EVENING_FROM;
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// 'AAAA-MM-JJ' -> 'J/M/AAAA'
const dmy = (iso) => { const [y, m, d] = iso.split('-').map(Number); return d + '/' + m + '/' + y; };
// 'HH:MM' -> '17 h 00'
const hm = (s) => { const m = gen.toMin(s); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };
const service = (start) => (gen.toMin(start) >= EVENING_FROM ? 'soir' : 'matin');

const CONSIGNE = 'Tu es l\'assistant du maître d\'hôtel d\'un restaurant. Prépare l\'horaire des serveurs pour la semaine décrite '
  + 'ci-dessous, en respectant strictement les règles. Avant de répondre, vérifie toi-même chaque règle serveur par serveur, '
  + 'puis corrige ton horaire si une règle n\'est pas respectée. Matin = quart qui commence avant 16 h ; soir = quart qui '
  + 'commence à 16 h ou après. Groupe 1 = priorité la plus haute.';

const REGLES = [
  '5. RÈGLES (dans l\'ordre d\'importance)',
  '1. (Stricte) Ne jamais placer un serveur en dehors de ses disponibilités.',
  '2. (Stricte) Ne jamais donner à un serveur plus de quarts que son maximum souhaité. Lui en donner moins est possible, en suivant l\'ordre des groupes (groupe 1 servi en premier).',
  '3. (Stricte) Respecter la contrainte particulière de chaque serveur.',
  '4. (Stricte) Placer exactement le nombre de serveurs demandé à chaque heure d\'arrivée.',
  '5. (Préférence) Donner le plus de soirs au groupe 1, puis au groupe 2, puis 3, puis 4.',
  '6. (Préférence) Éviter les doubles (matin et soir le même jour).',
  '7. (Préférence) Éviter les fermetures suivies d\'une ouverture (soir puis matin du lendemain).',
  '8. (Dernier recours) Un serveur qui souhaite 5 quarts peut en faire 6, en priorité dans le groupe 1.',
  '9. (Dernier recours) Proposer un service où le serveur est indisponible, en l\'indiquant « à demander ».',
];

const FORMAT = [
  '6. FORMAT DE TA RÉPONSE',
  'A. Horaire par jour : pour chaque jour, le matin puis le soir, une ligne par serveur avec son heure d\'arrivée.',
  'B. Tableau par serveur : nom, groupe, jours et heures, quarts attribués / quarts souhaités.',
  'C. Exceptions : chaque règle 6 à 9 utilisée, avec le nom et le jour (sinon « Aucune »).',
  'D. Services non comblés (sinon « Aucun »).',
  'E. Vérification : une ligne qui confirme le respect des règles 1 à 4.',
];

// Besoins de la semaine : un événement spécial d'une date REMPLACE le modèle normal de ce jour (comme la génération).
function weekNeeds(weekStart, needs, events) {
  return gen.weekDays(weekStart).flatMap((day, weekday) => {
    const evs = (events || []).filter((e) => e.day === day);
    const src = evs.length ? evs.flatMap((e) => e.needs || []) : (needs || []).filter((n) => Number(n.weekday) === weekday);
    return src.filter((n) => gen.toMin(n.start) !== null && Number(n.count) > 0).map((n) => ({ weekday, positionId: n.positionId, start: n.start, count: Math.floor(Number(n.count)) }));
  });
}

function needLines(weekStart, positions, needs, events) {
  const order = new Map(positions.map((p, i) => [p.id, i]));
  const name = new Map(positions.map((p) => [p.id, p.name]));
  const several = new Set(weekNeeds(weekStart, needs, events).map((n) => n.positionId)).size > 1 || positions.length > 1;
  const sum = new Map(); // même jour, poste et heure d'arrivée : additionnés
  weekNeeds(weekStart, needs, events).forEach((n) => {
    const k = n.weekday + '|' + n.positionId + '|' + n.start;
    sum.set(k, Object.assign({}, n, { count: ((sum.get(k) || {}).count || 0) + n.count }));
  });
  const list = [...sum.values()].sort((a, b) => a.weekday - b.weekday
    || (service(a.start) === service(b.start) ? 0 : service(a.start) === 'matin' ? -1 : 1)
    || gen.toMin(a.start) - gen.toMin(b.start) || (order.get(a.positionId) || 0) - (order.get(b.positionId) || 0));
  if (!list.length) return ['Aucun besoin saisi.'];
  return list.map((n) => {
    const who = several
      ? (name.get(n.positionId) || 'Poste') + ' : ' + n.count + ' ' + (n.count > 1 ? 'personnes' : 'personne')
      : n.count + ' ' + (n.count > 1 ? 'serveurs' : 'serveur');
    return '- ' + cap(DAYS[n.weekday]) + ' ' + service(n.start) + ' : ' + who + ' à ' + hm(n.start);
  });
}

// Disponibilités de la semaine -> « lundi soir, mardi matin, … » : une plage qui commence avant 16 h ouvre le matin,
// une plage qui finit après 16 h (ou traverse minuit) ouvre le soir.
function availText(weekStart, list) {
  const days = gen.weekDays(weekStart);
  const out = [];
  days.forEach((day, i) => {
    const mine = list.filter((a) => a.day === day);
    const morning = mine.some((a) => gen.toMin(a.start) < EVENING_FROM);
    const evening = mine.some((a) => { const r = gen.range(a.start, a.end); return r && r[1] > EVENING_FROM; });
    if (morning) out.push(DAYS[i] + ' matin');
    if (evening) out.push(DAYS[i] + ' soir');
  });
  return out.length ? out.join(', ') : 'aucune disponibilité saisie';
}

function wantText(e) {
  const lo = e.wantShiftsMin, hi = e.wantShiftsMax;
  if (lo == null && hi == null) return 'non précisé';
  if (lo != null && hi != null) return lo === hi ? String(lo) : lo + ' à ' + hi;
  return hi != null ? 'au plus ' + hi : 'au moins ' + lo;
}

function staffLines(weekStart, positions, employees, quals, avails) {
  const order = new Map(positions.map((p, i) => [p.id, i]));
  const name = new Map(positions.map((p) => [p.id, p.name]));
  const rows = employees.map((e) => {
    const q = quals.filter((x) => x.employeeId === e.id && name.has(x.positionId))
      .sort((a, b) => a.rank - b.rank || order.get(a.positionId) - order.get(b.positionId));
    const group = q.length ? q[0].rank : null;
    return { e, q, group };
  }).sort((a, b) => (a.group == null) - (b.group == null) || (a.group || 0) - (b.group || 0) || a.e.name.localeCompare(b.e.name, 'fr'));
  if (!rows.length) return ['Aucun serveur saisi.'];
  return rows.map(({ e, q, group }) => {
    const posts = q.length ? q.map((x) => name.get(x.positionId) + (x.rank !== group ? ' (groupe ' + x.rank + ')' : '')).join(', ') : 'aucun poste';
    const parts = [group == null ? 'Sans groupe' : 'Groupe ' + group, e.name, posts,
      'disponible : ' + availText(weekStart, avails.filter((a) => a.employeeId === e.id)),
      'quarts souhaités : ' + wantText(e)];
    if (e.constraintNote) parts.push(e.constraintNote);
    return '- ' + parts.join(' | ');
  });
}

function eventLines(events) {
  const list = (events || []).slice().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (!list.length) return ['Aucun'];
  return list.map((e) => {
    const wd = (new Date(e.day + 'T00:00:00Z').getUTCDay() + 6) % 7;
    return '- ' + (e.label || 'Événement spécial') + ' : ' + DAYS[wd] + ' ' + dmy(e.day);
  });
}

/**
 * @param {object} input weekStart (lundi 'AAAA-MM-JJ') ; positions [{id, name}] dans l'ordre de comblement ;
 *   employees [{id, name, wantShiftsMin, wantShiftsMax, constraintNote}] (actifs) ; qualifications [{employeeId, positionId, rank}] ;
 *   availabilities [{employeeId, day, start, end}] de la semaine ; needs [{positionId, weekday, start, end, count}] ;
 *   events [{day, label, needs:[...]}] de la semaine.
 * @returns {string} prompt en texte brut (fins de ligne \n).
 */
function buildPrompt(input) {
  const { weekStart } = input;
  const positions = input.positions || [];
  const events = (input.events || []).filter((e) => gen.weekDays(weekStart).includes(e.day));
  const sunday = gen.addDays(weekStart, 6);
  return [
    CONSIGNE,
    '',
    '1. SEMAINE',
    'Du lundi ' + dmy(weekStart) + ' au dimanche ' + dmy(sunday) + '.',
    '',
    '2. BESOINS PAR SERVICE',
    ...needLines(weekStart, positions, input.needs || [], events),
    '',
    '3. PERSONNEL',
    ...staffLines(weekStart, positions, input.employees || [], input.qualifications || [], input.availabilities || []),
    '',
    '4. CHANGEMENTS DE CETTE SEMAINE',
    ...eventLines(events),
    '',
    ...REGLES,
    '',
    ...FORMAT,
  ].join('\n') + '\n';
}

module.exports = { buildPrompt };
