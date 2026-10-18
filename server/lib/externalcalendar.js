// 22 sept. 2026 — brief "Objectifs — Logique métier", cadré avec Emilien
// (AskUserQuestion : source = flux ICS externe, portée = heures occupées
// uniquement, jamais le contenu des événements). Lecture d'un calendrier
// externe via une URL ICS d'abonnement — symétrique de server/lib/ical.js
// (qui, lui, PRODUIT un ICS sortant) : fichier séparé pour ne pas mélanger
// sortant/entrant. Aucune dépendance ajoutée : Node 24 fournit `fetch`
// nativement.
const db = require('../db');
const dates = require('./dates');

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
// Les TITRES des événements sont lus UNIQUEMENT pour les comparer, en mémoire, aux mots des règles de l'utilisateur
// ; ils ne sont ni stockés ni journalisés ni envoyés à l'IA.
//  - règle « aucune tâche » -> capacité 0 ; « temps limité » -> son maximum ; plusieurs règles le même jour : la plus restrictive gagne ;
//  - aucune règle applicable -> heures par défaut (« tous les autres jours »), ou pas de limite si vides.
const DEFAULT_VACATION_WORDS = ['vacances', 'congé', 'férié'];
const MAX_DAY_MINUTES = 1440;

db.exec(`CREATE TABLE IF NOT EXISTS external_calendar_settings (
  userId TEXT PRIMARY KEY,
  workPatterns TEXT NOT NULL DEFAULT '[]',
  vacationWords TEXT,
  workDayMinutes INTEGER,
  freeDayMinutes INTEGER
)`);
// 18 oct. 2026 : RÈGLES (« si le titre contient … -> aucune tâche / temps limité ») à la place des 4 champs.
// Colonne rules (JSON) ; freeDayMinutes devient les heures par défaut (« tous les autres jours »).
try { db.exec('ALTER TABLE external_calendar_settings ADD COLUMN rules TEXT'); } catch (e) { /* déjà ajoutée */ }

const MAX_RULES = 20;

function cleanWords(list) {
  const arr = Array.isArray(list) ? list : (typeof list === 'string' ? list.split(/[,;\n]/) : []);
  const seen = new Set();
  const out = [];
  arr.forEach((w) => {
    if (typeof w !== 'string') return;
    const v = w.trim().slice(0, 60);
    const k = v.toLowerCase();
    if (v && !seen.has(k)) { seen.add(k); out.push(v); }
  });
  return out.slice(0, 20);
}

function minutesOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_DAY_MINUTES) {
    throw Object.assign(new Error('Durée invalide : un nombre de minutes entre 0 et ' + MAX_DAY_MINUTES + '.'), { statusCode: 400 });
  }
  return n;
}

// Valide une liste de règles [{words, mode:'none'|'limit', maxMinutes}] ; lève 400 si hors limites.
function cleanRules(list) {
  if (!Array.isArray(list)) return [];
  if (list.length > MAX_RULES) throw Object.assign(new Error('Tu peux créer ' + MAX_RULES + ' règles au maximum.'), { statusCode: 400 });
  const out = [];
  list.forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const words = cleanWords(r.words);
    if (!words.length) return; // règle sans mot : ignorée
    if (r.mode !== 'none' && r.mode !== 'limit') throw Object.assign(new Error('Mode de règle invalide.'), { statusCode: 400 });
    if (r.mode === 'none') { out.push({ words, mode: 'none', maxMinutes: null }); return; }
    const m = minutesOrNull(r.maxMinutes);
    if (m == null) throw Object.assign(new Error('Indique un maximum d\u2019heures pour une règle à temps limité.'), { statusCode: 400 });
    out.push({ words, mode: 'limit', maxMinutes: m });
  });
  return out;
}

function parseJsonArray(v, d) { try { const a = JSON.parse(v); return Array.isArray(a) ? a : d; } catch (e) { return d; } }

// Migration (idempotente) : anciens réglages -> règles. Vacances = « aucune tâche » ; mots travail ailleurs + X h = « temps limité ».
function rulesFromLegacy(r) {
  const out = [];
  const vac = r.vacationWords != null ? cleanWords(parseJsonArray(r.vacationWords, DEFAULT_VACATION_WORDS)) : DEFAULT_VACATION_WORDS.slice();
  if (vac.length) out.push({ words: vac, mode: 'none', maxMinutes: null });
  const work = cleanWords(parseJsonArray(r.workPatterns, []));
  if (work.length && r.workDayMinutes != null) out.push({ words: work, mode: 'limit', maxMinutes: r.workDayMinutes });
  return out;
}

function migrateLegacySettings() {
  db.prepare('SELECT * FROM external_calendar_settings WHERE rules IS NULL').all().forEach((r) => {
    db.prepare('UPDATE external_calendar_settings SET rules = ? WHERE userId = ? AND rules IS NULL')
      .run(JSON.stringify(rulesFromLegacy(r)), r.userId);
  });
}
migrateLegacySettings();

function getSettings(userId) {
  const r = db.prepare('SELECT * FROM external_calendar_settings WHERE userId = ?').get(userId);
  if (!r) return { rules: [{ words: DEFAULT_VACATION_WORDS.slice(), mode: 'none', maxMinutes: null }], defaultMinutes: null };
  let rules;
  try { rules = r.rules != null ? cleanRules(parseJsonArray(r.rules, [])) : rulesFromLegacy(r); } catch (e) { rules = []; }
  return { rules, defaultMinutes: r.freeDayMinutes != null ? r.freeDayMinutes : null };
}

function setSettings(userId, body) {
  const b = body || {};
  const cur = getSettings(userId);
  const next = {
    rules: b.rules !== undefined ? cleanRules(b.rules) : cur.rules,
    defaultMinutes: b.defaultMinutes !== undefined ? minutesOrNull(b.defaultMinutes) : cur.defaultMinutes,
  };
  db.prepare(`INSERT INTO external_calendar_settings (userId, rules, freeDayMinutes) VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET rules = excluded.rules, freeDayMinutes = excluded.freeDayMinutes`)
    .run(userId, JSON.stringify(next.rules), next.defaultMinutes);
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
      if (cur && cur.start) { if (!cur.end) cur.end = new Date(cur.start.getTime() + 86400000); out.push({ start: cur.start, end: cur.end, summary: cur.summary || '', allDay: !!cur.allDay }); }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = line.match(/^(DTSTART|DTEND|SUMMARY)[^:]*:(.*)$/);
    if (!m) continue;
    if (m[1] === 'SUMMARY') { cur.summary = m[2].replace(/\\([,;nN\\])/g, (x, c) => (c === 'n' || c === 'N' ? ' ' : c)); continue; }
    const d = parseIcsDate(m[2].trim());
    if (d) { cur[m[1] === 'DTSTART' ? 'start' : 'end'] = d; if (m[1] === 'DTSTART') cur.allDay = /^\d{8}$/.test(m[2].trim()); }
  }
  return out;
}

// PURE. Capacité (minutes) d'un jour : chaque règle dont un mot figure dans le titre d'un événement du jour s'applique
// (« aucune tâche » = 0, « temps limité » = son maximum) ; la plus restrictive gagne ; aucune règle -> heures par défaut (ou null = pas de limite).
function dayCapacityFromTexts(texts, isoDate, settings, tz) {
  const dayStart = new Date(isoDate + 'T00:00:00Z').getTime();
  const dayEnd = dayStart + 86400000;
  const rules = (settings.rules || []).map((r) => ({
    words: (r.words || []).map(foldText).filter(Boolean),
    cap: r.mode === 'none' ? 0 : (Number.isFinite(r.maxMinutes) ? r.maxMinutes : null),
  })).filter((r) => r.words.length && r.cap != null);
  let best = null;
  texts.forEach((txt) => {
    parseIcsEvents(txt).forEach((ev) => {
      if (ev.allDay) { if (!(ev.start.getTime() < dayEnd && ev.end.getTime() > dayStart)) return; } // journée entière : date du calendrier, sans fuseau
      else {
        // Événement horodaté (UTC) : jours LOCAUX couverts, dans le fuseau de l'utilisateur.
        const zone = tz || dates.DEFAULT_TIMEZONE;
        const first = dates.isoDateOf(ev.start, zone);
        const lastD = dates.isoDateOf(new Date(Math.max(ev.start.getTime(), ev.end.getTime() - 1)), zone);
        if (isoDate < first || isoDate > lastD) return;
      }
      const title = foldText(ev.summary);
      rules.forEach((r) => { if (r.words.some((w) => title.includes(w)) && (best == null || r.cap < best)) best = r.cap; });
    });
  });
  if (best != null) return best;
  return settings.defaultMinutes != null ? settings.defaultMinutes : null;
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
async function dayCapacities(userId, days, tz) {
  try {
    const texts = await refreshTexts(userId);
    if (!texts) return {};
    const settings = getSettings(userId);
    const out = {};
    days.forEach((d) => { const c = dayCapacityFromTexts(texts, d, settings, tz); if (c != null) out[d] = c; });
    return out;
  } catch (e) { return {}; }
}

module.exports = {
  getSettings, setSettings, migrateLegacySettings, parseIcsEvents, dayCapacityFromTexts, dayCapacities, DEFAULT_VACATION_WORDS,
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
