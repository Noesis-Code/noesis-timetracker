// 10 oct. 2026 (demande d'Emilien) : sur STAGING seulement, remise à zéro UNIQUE des invites de consentement
// (usage commercial) et de l'information IA pour le compte de test « Emilien Staging », afin de pouvoir les
// retester. Jamais en production. Un fichier marqueur empêche de recommencer aux déploiements suivants ;
// pour la rejouer, changer RESET_TOKEN.
const fs = require('fs');
const path = require('path');
const db = require('../db');

const RESET_TOKEN = 'prompts-reset-1';
const DATA_DIR = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, '..', '..', 'data');
const MARKER = path.join(DATA_DIR, '.staging-prompts-reset');

function resetStagingPromptsOnce() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!env || env === 'production') return;
  try {
    let done = '';
    try { done = fs.readFileSync(MARKER, 'utf8').trim(); } catch (e) { /* pas encore fait */ }
    if (done === RESET_TOKEN) return;
    const r = db.prepare("UPDATE users SET marketingConsent = 0, marketingConsentAt = NULL, marketingConsentVersion = NULL, aiNoticeAckAt = NULL, aiNoticeVersion = NULL WHERE name = 'Emilien' AND lastName = 'Staging'").run();
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MARKER, RESET_TOKEN);
    console.log('[staging] Invites de test remises à zéro pour Emilien Staging (' + r.changes + ' compte).');
  } catch (err) {
    console.error('[staging] Remise à zéro des invites impossible :', err.message);
  }
}

module.exports = { resetStagingPromptsOnce };
