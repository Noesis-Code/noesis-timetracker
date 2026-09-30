// 30 sept. 2026 (demande d'Emilien) : applique les nouvelles couleurs de profil « crayeuses » aux profils DÉJÀ
// existants, sur STAGING uniquement (jamais en production : RAILWAY_ENVIRONMENT_NAME absent ou "production" = no-op).
// Idempotent : on ne remappe que les anciennes couleurs connues (par index) vers les nouvelles ; une fois fait,
// plus aucune ligne ne correspond. Les couleurs d'activités ne sont PAS touchées.
const db = require('../db');

const OLD_PROFILE = ['#4CAF50', '#3498db', '#E74C3C', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22', '#674EA7'];
const OLD_DARK = ['#9E2E2E', '#9B5D27', '#8B7923', '#328540', '#2E828A', '#3659A1', '#573EA3', '#833B9B'];
const V1_PROFILE = ['#7FA07B', '#7A9BB5', '#B9705F', '#C4A062', '#A08BAE', '#77A89E', '#BC8D6B', '#8E86B8']; // 1re version, trop pâle
const CHALKY_PROFILE = ['#6E9669', '#6A93B5', '#B5604D', '#C49A4A', '#9678AC', '#5F9E92', '#BC8158', '#7E74B5']; // version « crayeuse »
// 30 sept. 2026 : palette B « Minéral » (profils 9 couleurs ; activités 9 couleurs sombres + jumelles claires).
const PALE_B_PROFILE = ['#B0787D', '#B08B78', '#B09F78', '#9DB078', '#78B094', '#78ABB0', '#7894B0', '#8178B0', '#A678B0']; // B pâle (3fa87c5)
const NEW_PROFILE = ['#A04B52', '#A0674B', '#A0864B', '#83A04B', '#4BA075', '#4B98A0', '#4B75A0', '#594BA0', '#914BA0']; // = DARK_PALETTE
const { DARK_PALETTE, LIGHT_PALETTE, LEGACY_DARK_PALETTE, LEGACY_LIGHT_PALETTE } = require('../../public/theme-palette.js');

function applyProfileColorsOnStaging() {
  const env = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!env || env === 'production') return 0;
  const upd = db.prepare('UPDATE users SET color = ? WHERE UPPER(color) = UPPER(?)');
  let n = 0;
  [OLD_PROFILE, OLD_DARK, V1_PROFILE, CHALKY_PROFILE, PALE_B_PROFILE].forEach((old) => {
    old.forEach((c, i) => { n += Number(upd.run(NEW_PROFILE[i], c).changes || 0); });
  });
  // Couleurs d'activité (activity_members) : ancienne palette -> palette B, par index (8 anciennes -> 9 nouvelles).
  const updAct = db.prepare('UPDATE activity_members SET color = ? WHERE UPPER(color) = UPPER(?)');
  let na = 0;
  [[LEGACY_DARK_PALETTE.slice(0, 8), DARK_PALETTE], [LEGACY_DARK_PALETTE.slice(8), DARK_PALETTE], [LEGACY_LIGHT_PALETTE, LIGHT_PALETTE]].forEach((pair) => {
    pair[0].forEach((c, i) => { na += Number(updAct.run(pair[1][i], c).changes || 0); });
  });
  if (na) console.log('[profilecolors-staging] ' + na + ' couleur(s) d\'activité remappée(s) (palette B Minéral)');
  // Compte persistant « Emilien » de staging : couleur forcée si elle n'est pas déjà dans la palette actuelle.
  n += Number(db.prepare("UPDATE users SET color = ? WHERE name LIKE 'Emilien%' AND color NOT IN (" + NEW_PROFILE.map(() => '?').join(',') + ')').run(NEW_PROFILE[2], ...NEW_PROFILE).changes || 0);
  if (n) console.log('[profilecolors-staging] ' + n + ' profil(s) recoloré(s) (teint crayeux)');
  return n;
}

module.exports = { applyProfileColorsOnStaging };
