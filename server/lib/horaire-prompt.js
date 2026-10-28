// Module « Horaire » : prompts pour l'IA du gestionnaire (27 oct. 2026, demande d'Émilien). Le maître d'hôtel copie ces textes
// et les colle dans SA propre IA ; le serveur ne les envoie à aucune IA. Fonctions PURES (aucune base, aucun réseau), testées
// par test/horaire-prompt-test.js. Données confidentielles du personnel (Loi 25) : rien n'est journalisé.
// Flux : IMPORT_PROMPT (lecture des disponibilités et congés -> CSV importé) ; l'app génère l'horaire (./horaire-generation.js,
// qui applique les REGLES ci-dessous) ; buildRegistrationPrompt (inscription de cet horaire dans le logiciel d'horaire).
// buildPrompt (préparation de l'horaire par l'IA) n'est plus servi par la route ; ses REGLES restent la référence de la génération.
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

// Prompt FIXE de lecture (27 oct. 2026, texte d'Émilien) : le gestionnaire le colle dans son IA, qui lit les disponibilités et les
// congés de la semaine dans le logiciel d'horaire et rend un bloc CSV à copier-coller (nom;jour;début;fin;type) importé par importAvailabilitiesCsv
// (server/lib/horaire.js). Aucune donnée du personnel. Servi tel quel par GET /api/horaire/import-prompt.
const IMPORT_PROMPT = [
  "Tu aides le gestionnaire d'un restaurant. Ta seule mission : lire dans le logiciel d'horaire du restaurant les disponibilités et les congés du personnel pour la semaine qui commence le lundi suivant la date d'aujourd'hui (si aujourd'hui est lundi, prends le lundi suivant), puis me rendre un seul bloc de texte que je copie d'un clic et que je colle dans mon application. Tu ne modifies rien dans ce logiciel.",
  "",
  "ACCÈS",
  "1. Si tu peux naviguer toi-même : ouvre le logiciel d'horaire. À l'écran de connexion, arrête-toi et laisse-moi prendre la main ; je tape moi-même mon identifiant et mon mot de passe. Ne les lis pas, ne les écris nulle part.",
  "2. Si tu ne peux pas naviguer toi-même : lis la page que j'ai ouverte, puis dis-moi en une ligne quelle page ouvrir ensuite, jusqu'à avoir tout lu.",
  "3. Ne clique jamais sur Enregistrer, Approuver, Publier ou Supprimer, et ne change aucun réglage.",
  "",
  "CE QUE TU AS LE DROIT DE LIRE",
  "- Seulement la vue des disponibilités et la vue des congés ou absences approuvés de mon restaurant, pour cette semaine-là.",
  "- Jamais une fiche d'employé, la paie, les coordonnées ni aucune autre page. Si une vue n'est pas accessible, dis-le et continue avec le reste.",
  "",
  "POUR CHAQUE EMPLOYÉ AFFICHÉ, CHAQUE JOUR DU LUNDI AU DIMANCHE",
  "- Ses plages de disponibilité (heure de début et heure de fin).",
  "- Ses congés approuvés (vacances, congé, maladie ou autre absence approuvée). Une demande non approuvée ne compte pas.",
  "- Disponible toute la journée : 00:00 à 23:59.",
  "- Jour sans disponibilité ni congé : aucune ligne pour ce jour.",
  "",
  "LE BLOC À ME RENDRE",
  "- Un seul bloc de code (entre ``` et ```), pour que je le copie d'un clic. Pas de fichier, pas de tableau mis en forme.",
  "- Séparateur point-virgule. Première ligne exactement : nom;jour;début;fin;type",
  "- Une ligne par plage de disponibilité : nom;AAAA-MM-JJ;HH:MM;HH:MM;",
  "- Une ligne par jour de congé : nom;AAAA-MM-JJ;;;vacances",
  "- nom = prénom puis nom de famille, avec les accents, comme dans le logiciel (« Nom, Prénom » devient « Prénom Nom »).",
  "- Heures sur 24 h (17:30, jamais 5:30 PM). Une plage qui finit après minuit finit à 23:59.",
  "- Rien d'autre dans le bloc : pas de titre, pas de total, pas de commentaire.",
  "",
  "AVANT DE ME RENDRE LE BLOC",
  "- Chaque employé affiché apparaît au moins une fois, sauf s'il n'a ni disponibilité ni congé cette semaine.",
  "- Toutes les dates sont entre le lundi et le dimanche de la semaine.",
  "- Si tu t'es connecté toi-même, déconnecte-toi.",
  "- Sous le bloc, écris-moi en 3 lignes au plus : la semaine lue, le nombre d'employés, et ce que tu n'as pas pu lire (sinon « Rien »).",
].join('\n') + '\n';

const CONSIGNE = 'Tu es l\'assistant du maître d\'hôtel d\'un restaurant. Prépare l\'horaire des serveurs pour la semaine décrite '
  + 'ci-dessous, en respectant strictement les règles. Avant de répondre, vérifie toi-même chaque règle serveur par serveur, '
  + 'puis corrige ton horaire si une règle n\'est pas respectée. Matin = quart qui commence avant 16 h ; soir = quart qui '
  + 'commence à 16 h ou après. Groupe 1 = priorité la plus haute.';

const REGLES = [
  '5. RÈGLES (dans l\'ordre d\'importance)',
  '1. (Stricte) Ne jamais placer un serveur en dehors de ses disponibilités.',
  '2. (Stricte) Ne jamais donner à un serveur plus de quarts que son maximum. Chacun atteint d\'abord son minimum, puis sa cible, groupe 1 servi en premier.',
  '3. (Stricte) Respecter la contrainte particulière de chaque serveur.',
  '4. (Stricte) Placer exactement le nombre de serveurs demandé à chaque heure d\'arrivée.',
  '5. (Préférence) Donner le plus de soirs au groupe 1, puis au groupe 2, puis 3, puis 4.',
  '6. (Préférence) Éviter les doubles (matin et soir le même jour).',
  '7. (Préférence) Éviter les fermetures suivies d\'une ouverture (soir puis matin du lendemain).',
  '8. (Dernier recours) Au-delà de sa cible, donner des quarts jusqu\'à son maximum, groupe 1 d\'abord.',
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

// Prompt d'INSCRIPTION (27 oct. 2026, demande d'Émilien) : l'IA du gestionnaire, en mode agent, inscrit dans le logiciel
// d'horaire du restaurant EXACTEMENT les quarts de l'horaire généré par l'app (puis modifié par le gestionnaire), sans
// rien changer d'autre et sans publier. Aucune note de santé (constraintNote n'y figure jamais) ; ni le logiciel ni l'IA
// ne sont nommés. Fonction PURE.
// Consignes de base (version rétablie par « revenir à la base ») : modifiables par le gérant (horaire_settings.entryPrompt) ;
// la semaine et la liste des quarts sont toujours ajoutées après, jamais modifiables.
const ENTRY_PROMPT = [
  'Tu aides le gestionnaire d\'un restaurant. Ta seule mission : inscrire dans le logiciel d\'horaire du restaurant, tels quels, '
    + 'les quarts listés à la fin de ce message, pour la semaine indiquée à la fin. Tu ne changes rien d\'autre.',
  '',
  'ACCÈS',
  '1. Travaille en mode agent : ouvre toi-même le logiciel d\'horaire du restaurant. À l\'écran de connexion, arrête-toi et laisse-moi prendre la main ; je tape moi-même mon identifiant et mon mot de passe. Ne les lis pas, ne les écris nulle part.',
  '2. Va seulement sur la page de l\'horaire de cette semaine-là.',
  '3. Ne clique jamais sur Publier, Approuver ou Supprimer, et ne change aucun réglage.',
  '',
  'CE QUE TU AS LE DROIT DE FAIRE',
  '- Seulement ajouter, sur la page de l\'horaire de cette semaine, les quarts listés à la fin, exactement comme écrits (employé, date, heures, poste).',
  '- Ne modifie, ne déplace et ne supprime aucun autre quart.',
  '- Jamais une fiche d\'employé, la paie, les coordonnées ni aucune autre page.',
  '- Laisse l\'horaire non publié (brouillon) : enregistre les quarts, ne publie pas.',
  '',
  'SI UN QUART NE PEUT PAS ÊTRE INSCRIT',
  '- Employé ou poste introuvable, ou refus du logiciel : n\'invente rien, ne le remplace pas, note-le et passe au quart suivant.',
  '',
  'À LA FIN',
  '- Déconnecte-toi.',
  '- Puis réponds-moi avec deux listes : « Inscrits » (chaque quart inscrit, une ligne chacun) et « Échecs » (chaque quart non inscrit avec la raison en quelques mots, sinon « Aucun »).',
].join('\n') + '\n';

/**
 * @param {object} input weekStart (lundi 'AAAA-MM-JJ') ; assignments [{employeeName, positionName, day, start, end}]
 *   (« Nom, Prénom » est écrit « Prénom Nom ») ; instructions (consignes personnalisées ; absentes = ENTRY_PROMPT).
 * @returns {string} prompt en texte brut (fins de ligne \n) : consignes, puis semaine et quarts.
 */
function buildRegistrationPrompt(input) {
  const { weekStart } = input;
  const sunday = gen.addDays(weekStart, 6);
  const list = (input.assignments || []).slice().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)
    || gen.toMin(a.start) - gen.toMin(b.start) || String(a.positionName).localeCompare(String(b.positionName), 'fr')
    || String(a.employeeName).localeCompare(String(b.employeeName), 'fr'));
  const wd = (iso) => DAYS[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7];
  const shifts = list.length
    ? list.map((a) => '- ' + [String(a.employeeName || '').replace(/^\s*([^,]+?)\s*,\s*(.+?)\s*$/, '$2 $1'), a.day, wd(a.day), a.start, a.end, a.positionName || ''].join(' ; '))
    : ['- Aucun quart.'];
  const consignes = String(input.instructions || ENTRY_PROMPT).replace(/\s+$/, '');
  return [
    consignes,
    '',
    'SEMAINE : du lundi ' + weekStart + ' au dimanche ' + sunday + '.',
    '',
    'QUARTS À INSCRIRE (' + list.length + ')',
    'Une ligne par quart : Prénom Nom ; date AAAA-MM-JJ ; jour ; début ; fin ; poste. Heures sur 24 h ; une fin plus petite que le début finit le lendemain.',
    ...shifts,
    // Règles libres des employés placés (28 oct. 2026) : à vérifier par l'IA avant d'inscrire.
  ].join('\n') + '\n';
}

// Prompt de récupération pour la semaine affichée (B1) : la consigne « lundi suivant aujourd'hui » devient les dates de la semaine ;
// le reste du texte ne change pas.
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function frDate(iso, withYear) {
  const [y, m, d] = iso.split('-').map(Number);
  return (d === 1 ? '1er' : String(d)) + ' ' + MONTHS[m - 1] + (withYear ? ' ' + y : '');
}
function importPromptFor(weekStart) {
  if (!weekStart) return IMPORT_PROMPT;
  const sunday = gen.addDays(weekStart, 6);
  const span = 'pour la semaine du lundi ' + frDate(weekStart, weekStart.slice(0, 4) !== sunday.slice(0, 4)) + ' au dimanche ' + frDate(sunday, true);
  return IMPORT_PROMPT.replace("pour la semaine qui commence le lundi suivant la date d'aujourd'hui (si aujourd'hui est lundi, prends le lundi suivant)", span);
}

module.exports = { importPromptFor, frDate, buildPrompt, buildRegistrationPrompt, IMPORT_PROMPT, ENTRY_PROMPT };
