// Encodage iCalendar (RFC 5545) — pur texte, aucune dépendance.
//
// Propriété : discussion "Calendrier des clôtures" (4 septembre 2026).
// Ce fichier ne connaît RIEN de Noèsis : il ne sait qu'assembler des lignes
// conformes au format. Ce qui se met dedans est décidé par
// server/lib/calendarfeed.js. Découpage volontaire : le format est la partie
// piégeuse et se teste seule (voir test16.js, qui RELIT le flux produit au
// lieu de le regarder).
//
// ===================== LES QUATRE PIÈGES DU FORMAT =====================
//
// 1. FINS DE LIGNE CRLF. La RFC impose \r\n, pas \n. Google et Apple sont
//    tolérants la plupart du temps, mais pas toujours, et un flux qui marche
//    chez l'un peut être refusé chez l'autre. On ne prend pas le risque :
//    tout passe par foldLine(), personne ne concatène de "\n" à la main.
//
// 2. PLIAGE À 75 OCTETS, PAS 75 CARACTÈRES. Une ligne plus longue est coupée
//    et poursuivie sur la suivante, précédée d'UNE espace. Le compte se fait
//    en OCTETS de l'encodage UTF-8 : "é" en vaut deux, "œ" en vaut deux,
//    un emoji jusqu'à quatre. Un nom de sous-projet un peu long avec des
//    accents suffit à déclencher le pliage — et couper au milieu d'un
//    caractère multi-octets produit un flux illisible. D'où le découpage
//    caractère par caractère en surveillant le poids en octets, plutôt qu'un
//    substring(0, 75) qui semble marcher jusqu'au jour où il casse.
//
// 3. ÉCHAPPEMENT DANS LES VALEURS TEXTE. Dans SUMMARY/DESCRIPTION, la
//    barre oblique inverse, la virgule, le point-virgule et le retour à la
//    ligne ont un sens pour le format. L'ordre compte : la barre oblique
//    inverse EN PREMIER, sinon on ré-échappe les barres que l'on vient
//    d'introduire. Le deux-points, lui, ne s'échappe pas (erreur fréquente).
//
// 4. DTEND EST EXCLUSIF sur un événement daté. Ce n'est pas géré ici mais
//    dans calendarfeed.js — voir le commentaire de addDay().

// Poids en octets d'une chaîne une fois encodée en UTF-8.
function byteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

// Plie une ligne logique en lignes physiques d'au plus 75 octets, les
// continuations commençant par une espace (RFC 5545 §3.1).
//
// La limite de 75 s'entend HORS CRLF. On avance caractère par caractère (via
// Array.from, qui itère par point de code et ne coupe donc jamais une paire
// de substitution d'emoji en deux) en cumulant le poids réel.
function foldLine(line) {
  const LIMIT = 75;
  const chars = Array.from(String(line));
  const out = [];
  let current = '';
  let weight = 0;
  // La première ligne dispose de 75 octets ; chaque continuation en perd un
  // pour l'espace qui l'introduit.
  let budget = LIMIT;

  for (const ch of chars) {
    const w = byteLength(ch);
    if (weight + w > budget) {
      out.push(current);
      current = '';
      weight = 0;
      budget = LIMIT - 1;
    }
    current += ch;
    weight += w;
  }
  out.push(current);

  return out[0] + out.slice(1).map((part) => '\r\n ' + part).join('');
}

// Échappement des valeurs texte (RFC 5545 §3.3.11).
// ⚠️ La barre oblique inverse en premier — voir le piège 3 en tête de fichier.
function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\\n')
    .replace(/[\r\n]/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// 'YYYY-MM-DD' -> 'YYYYMMDD', la forme attendue par DTSTART;VALUE=DATE.
// Renvoie null sur toute autre forme : un événement sans date valide ne doit
// pas être écrit du tout, plutôt qu'écrit de travers.
function toIcsDate(isoDay) {
  if (typeof isoDay !== 'string') return null;
  const v = isoDay.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v.replace(/-/g, '');
}

// Horodatage UTC complet, pour DTSTAMP uniquement (obligatoire, et c'est le
// SEUL champ de ce flux qui porte une heure — voir calendarfeed.js).
function toIcsTimestamp(date) {
  const d = date instanceof Date ? date : new Date();
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// Assemble un calendrier complet.
//
// `events` : [{ uid, startDate:'YYYY-MM-DD', endDate:'YYYY-MM-DD',
//               summary, description, url }]
// Les dates sont déjà calculées par l'appelant (y compris l'exclusivité de
// endDate) : ce fichier ne fait pas d'arithmétique de calendrier.
function buildCalendar(options) {
  const opts = options || {};
  const name = opts.name || 'Noesis';
  const events = Array.isArray(opts.events) ? opts.events : [];
  const stamp = toIcsTimestamp(opts.now);

  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Noesis//TimeTracker//FR');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  // X-WR-CALNAME n'est pas dans la RFC mais reste la seule façon pratique de
  // proposer un nom d'abonnement à Google et à Apple. Ignorée ailleurs, sans
  // dommage.
  lines.push('X-WR-CALNAME:' + escapeText(name));
  lines.push('X-WR-TIMEZONE:America/Toronto');

  for (const ev of events) {
    const start = toIcsDate(ev.startDate);
    const end = toIcsDate(ev.endDate);
    if (!start || !end) continue;

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + escapeText(ev.uid));
    lines.push('DTSTAMP:' + stamp);
    // VALUE=DATE : événement sur la journée, sans heure et donc sans fuseau.
    // C'est ce qui rend ce flux insensible au décalage horaire — le premier
    // générateur de bugs de ce format.
    lines.push('DTSTART;VALUE=DATE:' + start);
    lines.push('DTEND;VALUE=DATE:' + end);
    lines.push('SUMMARY:' + escapeText(ev.summary));
    if (ev.description) lines.push('DESCRIPTION:' + escapeText(ev.description));
    if (ev.url) lines.push('URL:' + escapeText(ev.url));
    lines.push('TRANSP:TRANSPARENT');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // Le CRLF final est requis : la dernière ligne se termine comme les autres.
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { buildCalendar, foldLine, escapeText, toIcsDate, toIcsTimestamp, byteLength };
