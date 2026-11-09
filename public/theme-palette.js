// Palettes de couleurs d'activités, une par thème (clair / sombre).
//
// SOURCE UNIQUE (1er septembre 2026, Design) : ce fichier remplace deux
// copies qui vivaient jusque-là séparément dans server/lib/theme.js
// (DARK_PALETTE/LIGHT_PALETTE) et public/app.js (PALETTES) — signalé comme
// duplication à risque par l'audit doublons/code mort (déjà désynchronisées
// deux fois lors d'ajustements passés, voir noesis-timetracker-journal-design.md).
// Désormais servi tel quel comme fichier statique (Express sert déjà tout
// `public/` sans route dédiée) et consommé des deux côtés :
//   - côté serveur, `server/lib/theme.js` fait
//     `require('../../public/theme-palette.js')` (branche CommonJS ci-dessous) ;
//   - côté client, ce fichier est chargé via une balise <script> dans
//     index.html, avant app.js — même principe que public/i18n.js déjà en
//     place — et pose un global `window.NOESIS_THEME_PALETTES` (branche
//     navigateur ci-dessous).
// Pas d'aller-retour réseau ajouté : c'est un fichier statique chargé en une
// fois avec app.js/i18n.js, pas un appel API au démarrage.
//
// Si tu modifies une couleur, c'est ICI et seulement ici — plus besoin de
// répercuter le changement dans un second fichier.
//
// Les 8 couleurs suivent l'ordre de l'arc-en-ciel (rouge, orange, jaune,
// vert, cyan, bleu, indigo, violet). Chaque couleur sombre a une couleur
// claire "jumelle" au même index (même teinte / même saturation) : seule sa
// luminosité change. Ainsi, quand un profil bascule de thème, une activité
// peut garder "la même couleur" (au sens : la même identité de teinte) tout
// en respectant la palette du nouveau thème — voir pairedColor() dans
// server/lib/theme.js, qui s'appuie sur cette correspondance par index.
//
// Marge de contraste : en mode sombre, ces couleurs ont une luminosité
// comprise entre ~80 et ~117 (sur 0-255) avec un texte blanc fixe qui reste
// lisible dessus (contraste WCAG vérifié ≥ 4.3:1 sur les 8) ; en mode clair,
// entre ~149 et ~192 avec un texte foncé fixe qui reste lisible (contraste
// WCAG ≥ 5.2:1 sur les 8). Comme la couleur est contrainte à l'une de ces
// deux listes, on n'a plus besoin de calculer une couleur de texte au cas
// par cas (voir textColorForTheme côté client) : c'est uniquement le thème
// actif qui détermine si le texte est blanc ou foncé.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NOESIS_THEME_PALETTES = factory();
    root.TMT = root.TMT || {}; root.TMT.poleColor = root.NOESIS_THEME_PALETTES.poleColor; // fonction publique unique des couleurs de pôles
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // 30 sept. 2026 (demande d'Emilien) : palette « B · Minéral (froid dominant) », 9 couleurs, même ordre
  // partout. Les versions claires sont les jumelles (même teinte, éclaircies de 42 %). Toutes les anciennes
  // couleurs (LEGACY_*) restent VALIDES : jamais rejetées ni réécrites en production.
  var DARK_PALETTE = [
    '#A04B52', '#A0674B', '#A0864B', '#83A04B', '#4BA075', '#4B98A0', '#4B75A0', '#594BA0', '#914BA0',
  ];

  var LIGHT_PALETTE = [
    '#C8979B', '#C8A797', '#C8B997', '#B7C897', '#97C8AF', '#97C3C8', '#97AFC8', '#9F97C8', '#BF97C8',
  ];

  // Anciennes couleurs d'activité (sombre) : palette d'origine, puis palette « brique » (30 sept.).
  var LEGACY_DARK_PALETTE = [
    '#9E2E2E', '#9B5D27', '#8B7923', '#328540', '#2E828A', '#3659A1', '#573EA3', '#833B9B',
    '#A3432F', '#B0612F', '#B08A2E', '#7A5238', '#A8606A', '#6B7A3C', '#4A6A8A', '#8E4AA0',
  ];

  var LEGACY_LIGHT_PALETTE = [
    '#D87979', '#DAA06C', '#D8C564', '#7ACD88', '#75C9D1', '#85A0D6', '#9B89D2', '#C089D2',
  ];

  // Couleurs de profil pâles (1re version palette B, 30 sept.) : restent valides, remappées sur staging seulement.
  var LEGACY_PROFILE_PALETTE = [
    '#B0787D', '#B08B78', '#B09F78', '#9DB078', '#78B094', '#78ABB0', '#7894B0', '#8178B0', '#A678B0',
  ];

  // COULEURS DES PÔLES (9 nov. 2026, décision d'Émilien, règle R47) : chaque couleur d'activité de la palette sombre a 5 teintes STANDARDS FIXES pour ses 5 pôles au plus (rang 1 à 5),
  // lues ici, jamais calculées à la volée. Même famille de teinte que l'activité (écart de teinte ≤ 8°), TOUTES lisibles sur le fond #0B0A0A (contraste texte de 4,8 à 11,7:1, ≥ 4,5:1),
  // jamais pâles ni sombres, et deux pôles d'une même activité ne se ressemblent jamais (écart CIE76 ΔE ≥ 15). Le rang 1 est le plus soutenu, le rang 5 le plus clair.
  // Les secteurs reprennent la teinte de leur pôle. Une couleur d'activité qui n'est pas dans la palette sombre (jumelle claire, ancienne palette LEGACY_*) prend les teintes de la couleur
  // sombre de teinte la plus proche. Les palettes LEGACY_* ne sont jamais réécrites.
  var POLE_TINTS = {
    '#A04B52': ['#E34239', '#E96769', '#E98A84', '#EEA1B1', '#E2BEBC'],
    '#A0674B': ['#A57247', '#E66C4E', '#E0924E', '#EAA786', '#DFC0B4'],
    '#A0864B': ['#8F7D24', '#C98023', '#C29E70', '#DDB020', '#DAC76A'],
    '#83A04B': ['#5E8A2E', '#5FA117', '#95AE3A', '#82C91D', '#AED37A'],
    '#4BA075': ['#3B8B6D', '#18A64B', '#21BA81', '#79C69F', '#38E375'],
    '#4B98A0': ['#17899E', '#17A19B', '#1FB2DC', '#7DC1C7', '#43DADE'],
    '#4B75A0': ['#317CE2', '#4B96D2', '#7AAAC6', '#98B7ED', '#B9C8E1'],
    '#594BA0': ['#8C64E9', '#9E7DEC', '#A29AF1', '#B8AFEB', '#C5C4E6'],
    '#914BA0': ['#D620DE', '#D161E8', '#D486EE', '#DBA2E8', '#E0BBE2'],
  };

  function hueOf(hex) {
    var n = parseInt(String(hex).slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return null;
    var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; return h < 0 ? h + 360 : h;
  }
  function tintKey(color) {
    var c = String(color || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(c)) return null;
    if (POLE_TINTS[c]) return c;
    var li = LIGHT_PALETTE.map(function (x) { return x.toUpperCase(); }).indexOf(c);
    if (li >= 0) return DARK_PALETTE[li];
    var h = hueOf(c), best = null, bd = 999;
    if (h === null) return DARK_PALETTE[0];
    DARK_PALETTE.forEach(function (d) { var hd = hueOf(d), x = Math.abs(h - hd); x = Math.min(x, 360 - x); if (x < bd) { bd = x; best = d; } });
    return best;
  }
  // UNE fonction publique unique (TMT.poleColor côté navigateur) : couleur du pôle d'index « index » (0 = pôle 1 … 4 = pôle 5 ; au-delà de 5, on repart au rang 1) d'une activité de couleur « activityColor ».
  // Sans index (null / undefined) : la couleur de l'activité elle-même. Ne calcule rien : elle lit POLE_TINTS.
  function poleColor(activityColor, index) {
    if (index === null || index === undefined) return activityColor;
    var key = tintKey(activityColor);
    if (!key) return activityColor;
    var rank = ((Number(index) % 5) + 5) % 5;
    return POLE_TINTS[key][rank];
  }

  return { POLE_TINTS: POLE_TINTS, poleColor: poleColor, DARK_PALETTE: DARK_PALETTE, LIGHT_PALETTE: LIGHT_PALETTE, LEGACY_DARK_PALETTE: LEGACY_DARK_PALETTE, LEGACY_LIGHT_PALETTE: LEGACY_LIGHT_PALETTE, LEGACY_PROFILE_PALETTE: LEGACY_PROFILE_PALETTE };
});
