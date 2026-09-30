// 30 sept. 2026 (demande d'Emilien) : applique les nouvelles couleurs de profil « crayeuses » aux profils DÉJÀ
// existants, sur STAGING uniquement (jamais en production : RAILWAY_ENVIRONMENT_NAME absent ou "production" = no-op).
// Idempotent : on ne remappe que les anciennes couleurs connues (par index) vers les nouvelles ; une fois fait,
// plus aucune ligne ne correspond. Les couleurs d'activités ne sont PAS touchées.
const db = require('../db');

const OLD_PROFILE = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];
const OLD_DARK = ['#9E2E2E', '#9B5D27', '#8B7923', '#328540', '#2E828A', '#3659A1', '#573EA3', '#833B9B'];
const V1_PROFILE = ['#7FA07B', '#7A9BB5', '#B9705F', '#C4A062', '#A08BAE', '#77A89E', '#BC8D6B', '#8E86B8']; // 1re version, trop pâle
const NEW_PROFILE = ['#6E9669', '#6A93B5', '#B5604D', '#C49A4A', '#9678AC', '#5F9E92', '#BC8158', '#7E74B5'];

function applyProfileColorsOnStaging() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!env || env === 'production') return 0;
  const upd = db.prepare('UPDATE users SET color = ? WHERE UPPER(color) = UPPER(?)');
  let n = 0;
  [OLD_PROFILE, OLD_DARK, V1_PROFILE].forEach((old) => {
    old.forEach((c, i) => { n += Number(upd.run(NEW_PROFILE[i], c).changes || 0); });
  });
  // Compte persistant « Emilien » de staging : couleur forcée si elle n'est pas déjà dans la palette actuelle.
  n += Number(db.prepare("UPDATE users SET color = ? WHERE name LIKE 'Emilien%' AND color NOT IN (" + NEW_PROFILE.map(() => '?').join(',') + ')').run(NEW_PROFILE[2], ...NEW_PROFILE).changes || 0);
  if (n) console.log('[profilecolors-staging] ' + n + ' profil(s) recoloré(s) (teint crayeux)');
  return n;
}

module.exports = { applyProfileColorsOnStaging };
