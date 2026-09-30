// 30 sept. 2026 (demande d'Emilien) : applique les nouvelles couleurs de profil « crayeuses » aux profils DÉJÀ
// existants, sur STAGING uniquement (jamais en production : RAILWAY_ENVIRONMENT_NAME absent ou "production" = no-op).
// Idempotent : on ne remappe que les anciennes couleurs connues (par index) vers les nouvelles ; une fois fait,
// plus aucune ligne ne correspond. Les couleurs d'activités ne sont PAS touchées.
const db = require('../db');

const OLD_PROFILE = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];
const OLD_DARK = ['#9E2E2E', '#9B5D27', '#8B7923', '#328540', '#2E828A', '#3659A1', '#573EA3', '#833B9B'];
const NEW_PROFILE = ['#7FA07B', '#7A9BB5', '#B9705F', '#C4A062', '#A08BAE', '#77A89E', '#BC8D6B', '#8E86B8'];

function applyProfileColorsOnStaging() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!env || env === 'production') return 0;
  const upd = db.prepare('UPDATE users SET color = ? WHERE UPPER(color) = UPPER(?)');
  let n = 0;
  [OLD_PROFILE, OLD_DARK].forEach((old) => {
    old.forEach((c, i) => { n += Number(upd.run(NEW_PROFILE[i], c).changes || 0); });
  });
  if (n) console.log('[profilecolors-staging] ' + n + ' profil(s) recoloré(s) (teint crayeux)');
  return n;
}

module.exports = { applyProfileColorsOnStaging };
