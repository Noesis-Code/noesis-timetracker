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

  // COULEURS DES PÔLES (R47, décision d'Émilien, 9 nov. 2026) : le standard design est la règle « plus clair / plus foncé » de l'activité, SOURCE UNIQUE ICI (déplacée à l'identique depuis public/app.js, ancienne
  // fonction subProjectShade) : MÊME teinte ET MÊME saturation que l'activité, 5 rangs (pôles 5 au plus, au-delà : index % 5), clarté CIE L* répartie de 90 à 22 hors d'une zone de ±11 autour de la couleur de base.
  // UNE fonction publique : TMT.poleColor(couleurActivité, index) (index 0 = pôle 1 … 4 = pôle 5 ; sans index : la couleur de l'activité). Les secteurs reprennent la teinte de leur pôle. Aucune autre règle de teinte.
  function hexToHsl(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    if (!m) return null;
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h, s: s, l: l };
  }

  function hslToHex(h, s, l) {
    function hue2rgb(p, q, tt) {
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    function hx(v) { return ('0' + Math.round(v * 255).toString(16)).slice(-2); }
    return '#' + hx(r) + hx(g) + hx(b);
  }

  function relLuminance(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
    if (!m) return 0;
    var c = [1, 2, 3].map(function (i) {
      var v = parseInt(m[i], 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function labLightness(hex) {
    var y = relLuminance(hex);
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  }

  var POLE_SHADE_COUNT = 5;
  var poleShadeCache = {};

  function poleColor(baseHex, index) {
    if (index === null || index === undefined) return baseHex;
    var hsl = hexToHsl(baseHex);
    if (!hsl) return baseHex;

    var rank = ((Number(index) % POLE_SHADE_COUNT) + POLE_SHADE_COUNT)
      % POLE_SHADE_COUNT;
    var cacheKey = baseHex + '|' + rank;
    if (poleShadeCache[cacheKey]) return poleShadeCache[cacheKey];

    // Bande de clarté : ni assez claire pour se confondre avec la carte en
    // thème clair, ni assez foncée pour se confondre avec le fond en thème
    // sombre. Vérifié : la nuance la plus claire reste à ΔE ≥ 13 du blanc pur,
    // la plus foncée à ΔE ≥ 18 d'un fond sombre.
    var LO = 22, HI = 90;      // en clarté CIE L*, pas en luminosité HSL
    var GAP = 11;              // écart minimal, en L*, avec la couleur de base

    // Teinte ET saturation sont conservées telles quelles : ce sont bien des
    // nuances de la couleur de l'activité (demande d'Emilien du 4 septembre),
    // et le balayage de réglages a montré qu'y toucher ne gagnait rien une
    // fois l'espacement fait dans le bon espace.
    var s = hsl.s;
    var lBase = labLightness(baseHex);

    // Deux segments : au-dessus et en dessous de la zone interdite autour de
    // la base (réservée au temps « Sans sous-projet »). L'un des deux peut
    // être vide si la couleur de l'activité est déjà à une extrémité. Les cinq
    // rangs se répartissent régulièrement sur leur concaténation, du plus clair
    // au plus foncé.
    var upLen = Math.max(0, HI - Math.max(lBase + GAP, LO));
    var loLen = Math.max(0, Math.min(lBase - GAP, HI) - LO);
    var total = upLen + loLen;

    var target;
    if (total <= 0) {
      target = lBase >= (HI + LO) / 2 ? LO : HI;   // cas dégénéré
    } else {
      var d = (rank / (POLE_SHADE_COUNT - 1)) * total;
      target = d <= upLen ? HI - d : Math.min(lBase - GAP, HI) - (d - upLen);
    }

    // Dichotomie sur la luminosité HSL pour atteindre la clarté L* visée :
    // L* est monotone en l à teinte et saturation fixées. 28 itérations
    // descendent bien en dessous du pas d'un entier de composante.
    var lo = 0, hi = 1;
    for (var k = 0; k < 28; k++) {
      var mid = (lo + hi) / 2;
      if (labLightness(hslToHex(hsl.h, s, mid)) < target) lo = mid; else hi = mid;
    }
    var out = hslToHex(hsl.h, s, (lo + hi) / 2);
    poleShadeCache[cacheKey] = out;
    return out;
  }

  return { poleColor: poleColor, relLuminance: relLuminance, labLightness: labLightness, DARK_PALETTE: DARK_PALETTE, LIGHT_PALETTE: LIGHT_PALETTE, LEGACY_DARK_PALETTE: LEGACY_DARK_PALETTE, LEGACY_LIGHT_PALETTE: LEGACY_LIGHT_PALETTE, LEGACY_PROFILE_PALETTE: LEGACY_PROFILE_PALETTE };
});
