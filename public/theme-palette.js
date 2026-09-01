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
  var DARK_PALETTE = [
    '#9E2E2E', // rouge foncé
    '#9B5D27', // orange foncé
    '#8B7923', // jaune foncé
    '#328540', // vert foncé
    '#2E828A', // cyan foncé
    '#3659A1', // bleu foncé
    '#573EA3', // indigo foncé
    '#833B9B', // violet foncé
  ];

  var LIGHT_PALETTE = [
    '#D87979', // rouge clair
    '#DAA06C', // orange clair
    '#D8C564', // jaune clair
    '#7ACD88', // vert clair
    '#75C9D1', // cyan clair
    '#85A0D6', // bleu clair
    '#9B89D2', // indigo clair
    '#C089D2', // violet clair
  ];

  return { DARK_PALETTE: DARK_PALETTE, LIGHT_PALETTE: LIGHT_PALETTE };
});
