// 22 sept. 2026 — brief "Objectifs — Logique métier", cadré avec Emilien
// (AskUserQuestion : source = flux ICS externe, portée = heures occupées
// uniquement, jamais le contenu des événements). Lecture d'un calendrier
// externe via une URL ICS d'abonnement — symétrique de server/lib/ical.js
// (qui, lui, PRODUIT un ICS sortant) : fichier séparé pour ne pas mélanger
// sortant/entrant. Aucune dépendance ajoutée : Node 24 fournit `fetch`
// nativement.
const db = require('../db');

function ensureTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS external_calendar_subscriptions (
    userId INTEGER PRIMARY KEY,
    icsUrl TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
}
ensureTable();

function getSubscription(userId) {
  return db.prepare('SELECT icsUrl FROM external_calendar_subscriptions WHERE userId = ?').get(userId) || null;
}

function setSubscription(userId, icsUrl) {
  db.prepare(`
    INSERT INTO external_calendar_subscriptions (userId, icsUrl, updatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(userId) DO UPDATE SET icsUrl = excluded.icsUrl, updatedAt = excluded.updatedAt
  `).run(userId, icsUrl);
}

function removeSubscription(userId) {
  db.prepare('DELETE FROM external_calendar_subscriptions WHERE userId = ?').run(userId);
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
  const dayStart = new Date(isoDate + 'T00:00:00Z');
  const dayEnd = new Date(isoDate + 'T23:59:59Z');
  let minutes = 0;
  for (const ev of parseIcsBusyIntervals(icsText)) {
    const start = ev.start < dayStart ? dayStart : ev.start;
    const end = ev.end > dayEnd ? dayEnd : ev.end;
    if (end > start) minutes += (end - start) / 60000;
  }
  return Math.round(minutes);
}

// Va chercher le flux ICS de l'utilisateur et calcule ses minutes occupées
// pour isoDate. Retourne null si aucun abonnement n'est configuré (signal
// ABSENT, jamais zéro — pour que goalsdailypriority.js sache distinguer
// « pas de calendrier externe » de « journée libre »). Lève une erreur si le
// flux est injoignable — laissée à l'appelant (goalsdailypriority.js) de
// décider comment se replier (jamais bloquant pour le reste du calcul).
async function busyMinutesTodayForUser(userId, isoDate) {
  const sub = getSubscription(userId);
  if (!sub) return null;
  const res = await fetch(sub.icsUrl, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Calendrier externe injoignable (' + res.status + ').');
  const text = await res.text();
  return busyMinutesForDay(text, isoDate);
}

module.exports = {
  getSubscription,
  setSubscription,
  removeSubscription,
  parseIcsBusyIntervals,
  busyMinutesForDay,
  busyMinutesTodayForUser,
};
