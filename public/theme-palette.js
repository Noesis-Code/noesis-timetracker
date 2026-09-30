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

  return { DARK_PALETTE: DARK_PALETTE, LIGHT_PALETTE: LIGHT_PALETTE, LEGACY_DARK_PALETTE: LEGACY_DARK_PALETTE, LEGACY_LIGHT_PALETTE: LEGACY_LIGHT_PALETTE, LEGACY_PROFILE_PALETTE: LEGACY_PROFILE_PALETTE };
});
