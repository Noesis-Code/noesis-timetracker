// 22 sept. 2026 — brief "Objectifs — Logique métier", cadré avec Emilien
// (AskUserQuestion : source = flux ICS externe, portée = heures occupées
// uniquement, jamais le contenu des événements). Lecture d'un calendrier
// externe via une URL ICS d'abonnement — symétrique de server/lib/ical.js
// (qui, lui, PRODUIT un ICS sortant) : fichier séparé pour ne pas mélanger
// sortant/entrant. Aucune dépendance ajoutée : Node 24 fournit `fetch`
// nativement.
const db = require('../db');

function ensureTable() {
  // 9 oct. 2026 : userId est un identifiant TEXTE (uuid) ; l'ancienne colonne INTEGER refusait toute écriture.
  // La table n'a jamais pu contenir de ligne (aucun écran), on la recrée.
  try {
    const col = db.prepare('PRAGMA table_info(external_calendar_subscriptions)').all().find((c) => c.name === 'userId');
    if (col && /INT/i.test(col.type)) db.exec('DROP TABLE external_calendar_subscriptions');
  } catch (e) { /* table absente */ }
  db.exec(`CREATE TABLE IF NOT EXISTS external_calendar_subscriptions (
    userId TEXT PRIMARY KEY,
    icsUrl TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  // 9 oct. 2026 : PLUSIEURS adresses par personne (une ligne par adresse). L'ancienne table (une adresse) est reprise.
  db.exec(`CREATE TABLE IF NOT EXISTS external_calendar_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    icsUrl TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE (userId, icsUrl)
  )`);
  db.exec(`INSERT OR IGNORE INTO external_calendar_urls (userId, icsUrl, createdAt)
    SELECT userId, icsUrl, updatedAt FROM external_calendar_subscriptions`);
  db.exec('DELETE FROM external_calendar_subscriptions');
}
ensureTable();

const MAX_URLS = 10;

function listUrls(userId) {
  return db.prepare('SELECT id, icsUrl FROM external_calendar_urls WHERE userId = ? ORDER BY id').all(userId);
}

function addUrl(userId, icsUrl) {
  if (listUrls(userId).length >= MAX_URLS) {
    throw Object.assign(new Error('Tu peux enregistrer ' + MAX_URLS + ' adresses au maximum.'), { statusCode: 400 });
  }
  clearBusyCache(userId);
  db.prepare("INSERT OR IGNORE INTO external_calendar_urls (userId, icsUrl, createdAt) VALUES (?, ?, datetime('now'))").run(userId, icsUrl);
}

function removeUrl(userId, id) {
  clearBusyCache(userId);
  db.prepare('DELETE FROM external_calendar_urls WHERE userId = ? AND id = ?').run(userId, id);
}

// Parseur minimal : seuls DTSTART/DTEND de chaque VEVENT nous intéressent
// (décision Emilien : compter les heures occupées, jamais lire le contenu
// des événements — SUMMARY/DESCRIPTION ne sont même pas extraits). Pas de
// gestion de RRULE (récurrence) à ce stade — limitation connue et assumée,
// un événement récurrent ne compte que sur son occurrence explicitement
// listée (le cas échéant) dans le flux.
function parseIcsBusyIntervals(icsText) {
  // Dépliage des lignes ICS repliées (RFC 5545 : une continuation commence
  // par un espace ou une tabulation) avant tout découpage.
  const lines = String(icsText).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r\n|\n/);
  const intervals = [];
  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur && cur.start && cur.end) intervals.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = line.match(/^(DTSTART|DTEND)[^:]*:(.+)$/);
    if (!m) continue;
    const d = parseIcsDate(m[2].trim());
    if (d) cur[m[1] === 'DTSTART' ? 'start' : 'end'] = d;
  }
  return intervals;
}

function parseIcsDate(value) {
  // Formats gérés : YYYYMMDDTHHMMSSZ, YYYYMMDDTHHMMSS (traité comme UTC,
  // limite acceptée — pas de fuseau par utilisateur stocké sur ce projet,
  // même limite déjà acceptée par subscriptioncron.js/goal_period_due_reminders),
  // YYYYMMDD (événement journée entière).
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  if (!m[4]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[5], +m[6], +m[7]));
}

// Minutes occupées qui tombent dans la journée isoDate (heure serveur, même
// limite documentée ci-dessus).
function busyMinutesForDay(icsText, isoDate) {
  return busyMinutesForTexts([icsText], isoDate);
}

// Plusieurs agendas : l'union des plages (deux rendez-vous qui se chevauchent ne comptent qu'une fois).
function busyMinutesForTexts(texts, isoDate) {
  const dayStart = new Date(isoDate + 'T00:00:00Z');
  const dayEnd = new Date(isoDate + 'T23:59:59Z');
  const spans = [];
  texts.forEach((txt) => {
    for (const ev of parseIcsBusyIntervals(txt)) {
      const start = ev.start < dayStart ? dayStart : ev.start;
      const end = ev.end > dayEnd ? dayEnd : ev.end;
      if (end > start) spans.push([start.getTime(), end.getTime()]);
    }
  });
  spans.sort((a, b) => a[0] - b[0]);
  let minutes = 0; let curEnd = -Infinity;
  spans.forEach(([a, b]) => {
    const from = Math.max(a, curEnd);
    if (b > from) { minutes += (b - from) / 60000; curEnd = b; }
  });
  return Math.round(minutes);
}

// Va chercher le flux ICS de l'utilisateur et calcule ses minutes occupées
// pour isoDate. Retourne null si aucun abonnement n'est configuré (signal
// ABSENT, jamais zéro — pour que goalsdailypriority.js sache distinguer
// « pas de calendrier externe » de « journée libre »). Lève une erreur si le
// flux est injoignable — laissée à l'appelant (goalsdailypriority.js) de
// décider comment se replier (jamais bloquant pour le reste du calcul).
async function busyMinutesTodayForUser(userId, isoDate) {
  const urls = listUrls(userId);
  if (!urls.length) return null;
  const texts = [];
  for (const u of urls) {
    try {
      const res = await fetch(u.icsUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) texts.push(await res.text());
    } catch (e) { /* une adresse injoignable n'empêche pas les autres */ }
  }
  return texts.length ? busyMinutesForTexts(texts, isoDate) : null;
}

// Cache mémoire (15 min) des minutes occupées : le calcul de la liste du jour est synchrone, la lecture du flux ne l'est pas.
const busyCache = new Map();
const BUSY_TTL_MS = 15 * 60 * 1000;

function cachedBusyMinutes(userId, isoDate) {
  const hit = busyCache.get(userId + '|' + isoDate);
  return hit && Date.now() - hit.at < BUSY_TTL_MS ? hit.minutes : null;
}

// Jamais bloquant : flux injoignable -> on garde null (aucune réduction).
async function refreshBusy(userId, isoDate) {
  if (cachedBusyMinutes(userId, isoDate) != null || !listUrls(userId).length) return;
  try {
    const minutes = await busyMinutesTodayForUser(userId, isoDate);
    if (minutes != null) busyCache.set(userId + '|' + isoDate, { minutes, at: Date.now() });
  } catch (e) { /* ignoré */ }
}

function clearBusyCache(userId) {
  Array.from(busyCache.keys()).forEach((k) => { if (k.startsWith(userId + '|')) busyCache.delete(k); });
}

module.exports = {
  cachedBusyMinutes,
  refreshBusy,
  clearBusyCache,
  listUrls,
  addUrl,
  removeUrl,
  MAX_URLS,
  busyMinutesForTexts,
  parseIcsBusyIntervals,
  busyMinutesForDay,
  busyMinutesTodayForUser,
};
