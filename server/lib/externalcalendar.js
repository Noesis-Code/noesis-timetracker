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
  textCache.delete(userId);
  Array.from(busyCache.keys()).forEach((k) => { if (k.startsWith(userId + '|')) busyCache.delete(k); });
}

// ---------- Capacité par jour selon l'agenda (18 oct. 2026, demande d'Émilien, offre gratuite incluse) ----------
// Les TITRES des événements sont lus UNIQUEMENT pour les comparer, en mémoire, aux mots configurés par l'utilisateur
// (« motifs de travail » comme « Jacopo », mots de vacances) ; ils ne sont ni stockés ni journalisés ni envoyés à l'IA.
//  - un jour couvert par un événement de vacances -> capacité 0 (aucune tâche placée) ;
//  - sinon un événement dont le titre contient un motif de travail -> workDayMinutes (« heures chez moi ces jours-là ») ;
//  - sinon -> freeDayMinutes. Réglages vides = pas de limite imposée par l'agenda (comportement antérieur).
const DEFAULT_VACATION_WORDS = ['vacances', 'congé', 'férié'];
const MAX_DAY_MINUTES = 1440;

db.exec(`CREATE TABLE IF NOT EXISTS external_calendar_settings (
  userId TEXT PRIMARY KEY,
  workPatterns TEXT NOT NULL DEFAULT '[]',
  vacationWords TEXT,
  workDayMinutes INTEGER,
  freeDayMinutes INTEGER
)`);

function cleanWords(list) {
  const arr = Array.isArray(list) ? list : String(list || '').split(/[,;\n]/);
  return Array.from(new Set(arr.map((w) => String(w).trim().slice(0, 60)).filter(Boolean))).slice(0, 20);
}

function getSettings(userId) {
  const r = db.prepare('SELECT * FROM external_calendar_settings WHERE userId = ?').get(userId);
  const parse = (v, d) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : d; } catch (e) { return d; } };
  return {
    workPatterns: r ? parse(r.workPatterns, []) : [],
    vacationWords: r && r.vacationWords != null ? parse(r.vacationWords, DEFAULT_VACATION_WORDS) : DEFAULT_VACATION_WORDS.slice(),
    workDayMinutes: r && r.workDayMinutes != null ? r.workDayMinutes : null,
    freeDayMinutes: r && r.freeDayMinutes != null ? r.freeDayMinutes : null,
  };
}

function minutesOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_DAY_MINUTES) {
    throw Object.assign(new Error('Durée invalide : un nombre de minutes entre 0 et ' + MAX_DAY_MINUTES + '.'), { statusCode: 400 });
  }
  return n;
}

function setSettings(userId, body) {
  const b = body || {};
  const cur = getSettings(userId);
  const next = {
    workPatterns: b.workPatterns !== undefined ? cleanWords(b.workPatterns) : cur.workPatterns,
    vacationWords: b.vacationWords !== undefined ? cleanWords(b.vacationWords) : cur.vacationWords,
    workDayMinutes: b.workDayMinutes !== undefined ? minutesOrNull(b.workDayMinutes) : cur.workDayMinutes,
    freeDayMinutes: b.freeDayMinutes !== undefined ? minutesOrNull(b.freeDayMinutes) : cur.freeDayMinutes,
  };
  db.prepare(`INSERT INTO external_calendar_settings (userId, workPatterns, vacationWords, workDayMinutes, freeDayMinutes)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET workPatterns = excluded.workPatterns, vacationWords = excluded.vacationWords,
    workDayMinutes = excluded.workDayMinutes, freeDayMinutes = excluded.freeDayMinutes`)
    .run(userId, JSON.stringify(next.workPatterns), JSON.stringify(next.vacationWords), next.workDayMinutes, next.freeDayMinutes);
  return getSettings(userId);
}

function foldText(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Événements avec titre : [{start, end, summary}] (dates en UTC, même limite de fuseau que plus haut).
function parseIcsEvents(icsText) {
  const lines = String(icsText).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r\n|\n/);
  const out = [];
  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) { if (!cur.end) cur.end = new Date(cur.start.getTime() + 86400000); out.push({ start: cur.start, end: cur.end, summary: cur.summary || '' }); }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = line.match(/^(DTSTART|DTEND|SUMMARY)[^:]*:(.*)$/);
    if (!m) continue;
    if (m[1] === 'SUMMARY') { cur.summary = m[2].replace(/\\([,;nN\\])/g, (x, c) => (c === 'n' || c === 'N' ? ' ' : c)); continue; }
    const d = parseIcsDate(m[2].trim());
    if (d) cur[m[1] === 'DTSTART' ? 'start' : 'end'] = d;
  }
  return out;
}

// PURE. Capacité (minutes) d'un jour : 0 vacances, workDayMinutes, freeDayMinutes, ou null (pas de limite).
function dayCapacityFromTexts(texts, isoDate, settings) {
  const dayStart = new Date(isoDate + 'T00:00:00Z').getTime();
  const dayEnd = dayStart + 86400000;
  const vac = (settings.vacationWords || []).map(foldText).filter(Boolean);
  const work = (settings.workPatterns || []).map(foldText).filter(Boolean);
  let isVac = false; let isWork = false;
  texts.forEach((txt) => {
    parseIcsEvents(txt).forEach((ev) => {
      if (!(ev.start.getTime() < dayEnd && ev.end.getTime() > dayStart)) return;
      const title = foldText(ev.summary);
      if (vac.some((w) => title.includes(w))) isVac = true;
      else if (work.some((w) => title.includes(w))) isWork = true;
    });
  });
  if (isVac) return 0;
  if (isWork) return settings.workDayMinutes;
  return settings.freeDayMinutes;
}

// Cache mémoire (15 min) des TEXTES des flux : permet de calculer la capacité de plusieurs jours de façon synchrone.
const textCache = new Map();
async function refreshTexts(userId) {
  const hit = textCache.get(userId);
  if (hit && Date.now() - hit.at < BUSY_TTL_MS) return hit.texts;
  const urls = listUrls(userId);
  if (!urls.length) { textCache.delete(userId); return null; }
  const texts = [];
  for (const u of urls) {
    try {
      const res = await fetch(u.icsUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) texts.push(await res.text());
    } catch (e) { /* une adresse injoignable n'empêche pas les autres */ }
  }
  if (!texts.length) return null; // jamais bloquant : aucune capacité imposée
  textCache.set(userId, { texts, at: Date.now() });
  return texts;
}

// Capacités des jours demandés : { 'YYYY-MM-DD': minutes } (jours sans limite absents). Agenda absent/injoignable -> {}.
async function dayCapacities(userId, days) {
  try {
    const texts = await refreshTexts(userId);
    if (!texts) return {};
    const settings = getSettings(userId);
    const out = {};
    days.forEach((d) => { const c = dayCapacityFromTexts(texts, d, settings); if (c != null) out[d] = c; });
    return out;
  } catch (e) { return {}; }
}

module.exports = {
  getSettings, setSettings, parseIcsEvents, dayCapacityFromTexts, dayCapacities, DEFAULT_VACATION_WORDS,
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
