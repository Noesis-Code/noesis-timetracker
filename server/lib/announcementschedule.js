// Envoi PROGRAMME d'une annonce (5 octobre 2026) : équivalent automatique de
// scripts/send-announcement.js, déclenché à une heure fixée par variables d'environnement.
//
//   NOESIS_ANNOUNCE_AT    instant d'envoi, ISO avec fuseau (ex. 2026-10-05T14:00:00Z)
//   NOESIS_ANNOUNCE_TEXT  texte complet (modale + page Communauté)
//   NOESIS_ANNOUNCE_PUSH  texte court de la notification (<= 140 car.)
//
// Sans ces 3 variables : ne fait rien. Envoi UNE seule fois : l'annonce est insérée dans
// `announcements` avant le push, et un texte déjà présent n'est jamais renvoyé (redémarrages
// inclus). Fenêtre de 12 h après l'heure prévue : au-delà, l'envoi est abandonné plutôt que
// de partir par surprise. Sans clés VAPID : rien n'est inséré ni envoyé.

const db = require('../db');
const push = require('./push');

const WINDOW_MS = 12 * 3600 * 1000;
let timer = null;

async function tick() {
  const at = Date.parse(process.env.NOESIS_ANNOUNCE_AT || '');
  const text = (process.env.NOESIS_ANNOUNCE_TEXT || '').trim();
  const pushText = (process.env.NOESIS_ANNOUNCE_PUSH || '').trim() || text;
  if (!at || !text) return;
  const now = Date.now();
  if (now < at || now > at + WINDOW_MS) return;
  if (!push.pushEnabled()) return;
  if (db.prepare('SELECT 1 FROM announcements WHERE body = ?').get(text)) {
    stop();
    return;
  }
  db.prepare('INSERT INTO announcements (title, body, createdAt) VALUES (?, ?, ?)')
    .run('Noèsis', text, new Date().toISOString());
  stop();
  const n = await push.notifyAnnouncement(pushText);
  console.log('[annonce programmée] envoyée : push à ' + n + ' profil(s).');
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

function startAnnouncementSchedule() {
  if (!process.env.NOESIS_ANNOUNCE_AT || !process.env.NOESIS_ANNOUNCE_TEXT) return;
  timer = setInterval(() => { tick().catch((e) => console.error('[annonce programmée]', e.message)); }, 30 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = { startAnnouncementSchedule };
