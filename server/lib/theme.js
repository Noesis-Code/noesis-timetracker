// Palettes de couleurs d'activités, une par thème (clair / sombre).
//
// Les 8 couleurs suivent l'ordre de l'arc-en-ciel (rouge, orange, jaune,
// vert, cyan, bleu, indigo, violet). Chaque couleur sombre a une couleur
// claire "jumelle" au même index (même teinte / même saturation) : seule sa
// luminosité change. Ainsi, quand un profil bascule de thème, une activité
// peut garder "la même couleur" (au sens : la même identité de teinte) tout
// en respectant la palette du nouveau thème — voir pairedColor() plus bas,
// qui s'appuie sur cette correspondance par index.
//
// Marge de contraste : en mode sombre, ces couleurs ont une luminosité
// comprise entre ~80 et ~117 (sur 0-255) avec un texte blanc fixe qui reste
// lisible dessus (contraste WCAG vérifié ≥ 4.3:1 sur les 8) ; en mode clair,
// entre ~149 et ~192 avec un texte foncé fixe qui reste lisible (contraste
// WCAG ≥ 5.2:1 sur les 8). Comme la couleur est contrainte à l'une de ces
// deux listes, on n'a plus besoin de calculer une couleur de texte au cas
// par cas (voir textColorForTheme côté client) : c'est uniquement le thème
// actif qui détermine si le texte est blanc ou foncé.
//
// IMPORTANT : ces deux listes sont dupliquées côté client dans public/app.js
// (PALETTES). Si tu modifies une couleur ici, modifie-la aussi là-bas — en
// conservant le même ordre (même index = même teinte dans les deux listes).

const DARK_PALETTE = [
  '#9E2E2E', // rouge foncé
  '#9B5D27', // orange foncé
  '#8B7923', // jaune foncé
  '#328540', // vert foncé
  '#2E828A', // cyan foncé
  '#3659A1', // bleu foncé
  '#573EA3', // indigo foncé
  '#833B9B', // violet foncé
];

const LIGHT_PALETTE = [
  '#D87979', // rouge clair
  '#DAA06C', // orange clair
  '#D8C564', // jaune clair
  '#7ACD88', // vert clair
  '#75C9D1', // cyan clair
  '#85A0D6', // bleu clair
  '#9B89D2', // indigo clair
  '#C089D2', // violet clair
];

function paletteFor(theme) {
  return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
}

function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16) || 0;
  return { r: (num >> 16) & 0xFF, g: (num >> 8) & 0xFF, b: num & 0xFF };
}

// Couleur la plus proche dans la palette du thème donné (distance euclidienne
// en RGB) — utilisée uniquement quand on ne sait pas d'où vient la couleur
// (migration d'une ancienne couleur libre qui ne fait partie d'aucune des
// deux palettes actuelles).
function nearestPaletteColor(hex, theme) {
  const target = hexToRgb(hex);
  const palette = paletteFor(theme);
  let best = palette[0];
  let bestDist = Infinity;
  palette.forEach((candidate) => {
    const c = hexToRgb(candidate);
    const dist = (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2;
    if (dist < bestDist) { bestDist = dist; best = candidate; }
  });
  return best;
}

// Couleur "jumelle" dans la palette d'un autre thème : si hex fait partie de
// la palette de fromTheme, renvoie la couleur au même index dans la palette
// de toTheme (même teinte, luminosité différente — c'est ce qui permet à un
// profil de garder "la même" couleur d'activité en changeant de thème). Si
// hex ne fait partie d'aucune des deux palettes connues (cas résiduel), on
// se rabat sur la couleur la plus proche dans la palette cible.
function pairedColor(hex, fromTheme, toTheme) {
  const from = paletteFor(fromTheme);
  const h = String(hex || '').toUpperCase();
  const idx = from.findIndex((c) => c.toUpperCase() === h);
  if (idx !== -1) return paletteFor(toTheme)[idx];
  return nearestPaletteColor(hex, toTheme);
}

// Une couleur n'est valide pour un thème que si elle fait partie de sa
// palette (comparaison insensible à la casse) — pas de couleur libre.
function isInPalette(hex, theme) {
  const h = String(hex || '').toUpperCase();
  return paletteFor(theme).some((c) => c.toUpperCase() === h);
}

module.exports = { DARK_PALETTE, LIGHT_PALETTE, paletteFor, nearestPaletteColor, pairedColor, isInPalette };