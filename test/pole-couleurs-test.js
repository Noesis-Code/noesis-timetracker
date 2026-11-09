// Couleurs de pôles (règle R46, 9 nov. 2026) : chaque couleur d'activité de la palette sombre a 5 teintes STANDARDS FIXES (public/theme-palette.js, source unique), lisibles sur le fond #0B0A0A (contraste >= 4,5:1),
// jamais pâles, de la même famille de teinte, et deux pôles d'une même activité ne se ressemblent jamais ; UNE fonction publique (TMT.poleColor) ; plus aucun calcul de teinte à la volée dans l'app.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const P = require('../public/theme-palette.js');
const BG = '#0B0A0A';
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const WP = [0.95047, 1, 1.08883]; const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const lab = (h) => { const [r, g, b] = rgb(h).map(lin); const x = [0.4124564 * r + 0.3575761 * g + 0.1804375 * b, 0.2126729 * r + 0.7151522 * g + 0.072175 * b, 0.0193339 * r + 0.119192 * g + 0.9503041 * b].map((v, i) => f(v / WP[i])); return [116 * x[1] - 16, 500 * (x[0] - x[1]), 200 * (x[1] - x[2])]; };
const dE = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const hue = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x *= 60; return x < 0 ? x + 360 : x; };

assert(P.DARK_PALETTE.length === 9 && Object.keys(P.POLE_TINTS).length === 9 && P.DARK_PALETTE.every((c) => P.POLE_TINTS[c] && P.POLE_TINTS[c].length === 5), '9 couleurs d’activité × 5 teintes de pôle');
let minContrast = 99, maxContrast = 0, minDe = 99, maxHue = 0;
P.DARK_PALETTE.forEach((base) => {
  const row = P.POLE_TINTS[base];
  row.forEach((c) => { const k = contrast(c, BG); minContrast = Math.min(minContrast, k); maxContrast = Math.max(maxContrast, k); const dh = Math.abs(hue(c) - hue(base)); maxHue = Math.max(maxHue, Math.min(dh, 360 - dh)); });
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) minDe = Math.min(minDe, dE(row[i], row[j]));
  assert(new Set(row).size === 5 && row.every((c) => /^#[0-9A-F]{6}$/.test(c)), base + ' : 5 teintes différentes, au format #RRGGBB');
});
console.log('  mesures : contraste ' + minContrast.toFixed(2) + ' à ' + maxContrast.toFixed(1) + ':1 · écart de teinte max ' + maxHue.toFixed(1) + '° · ΔE min entre deux pôles ' + minDe.toFixed(1));
assert(minContrast >= 4.5, 'toutes les teintes de pôle ont un contraste >= 4,5:1 sur le fond #0B0A0A (minimum ' + minContrast.toFixed(2) + ')');
assert(maxContrast <= 12.5, 'aucune teinte pâle (contraste <= 12,5:1)');
assert(minDe >= 12, 'deux pôles d’une même activité ne se ressemblent jamais (ΔE CIE76 minimum ' + minDe.toFixed(1) + ' >= 12)');
assert(maxHue <= 16, 'même famille de teinte que l’activité (écart de teinte maximum ' + maxHue.toFixed(1) + '° <= 16°)');

// TMT.poleColor : lit le tableau, ne calcule rien
assert(P.poleColor('#A04B52', 0) === P.POLE_TINTS['#A04B52'][0] && P.poleColor('#A04B52', 4) === P.POLE_TINTS['#A04B52'][4], 'rang 1 à 5 : les teintes du tableau, telles quelles');
assert(P.poleColor('#A04B52', 5) === P.POLE_TINTS['#A04B52'][0] && P.poleColor('#A04B52', -1) === P.POLE_TINTS['#A04B52'][4], 'au-delà de 5 pôles : on repart au rang 1');
assert(P.poleColor('#A04B52', null) === '#A04B52' && P.poleColor('#A04B52', undefined) === '#A04B52', 'sans pôle : la couleur de l’activité elle-même');
assert(P.LIGHT_PALETTE.every((c, i) => P.poleColor(c, 2) === P.POLE_TINTS[P.DARK_PALETTE[i]][2]), 'jumelle claire : mêmes teintes que sa couleur sombre');
const all = [].concat.apply([], Object.values(P.POLE_TINTS));
assert([].concat(P.LEGACY_DARK_PALETTE, P.LEGACY_LIGHT_PALETTE, P.LEGACY_PROFILE_PALETTE).every((c) => [0, 1, 2, 3, 4].every((i) => all.indexOf(P.poleColor(c, i)) >= 0)), 'anciennes couleurs (LEGACY_*) : teintes de la couleur sombre de teinte la plus proche, jamais calculées');
assert(P.poleColor('pas-une-couleur', 1) === 'pas-une-couleur', 'valeur invalide : rendue telle quelle');
// les palettes LEGACY_* ne sont jamais réécrites
const crypto = require('crypto');
const h = (a) => crypto.createHash('sha1').update(a.join(',')).digest('hex');
assert(P.LEGACY_DARK_PALETTE.length === 16 && P.LEGACY_LIGHT_PALETTE.length === 8 && P.LEGACY_PROFILE_PALETTE.length === 9 && P.LEGACY_DARK_PALETTE[0] === '#9E2E2E' && P.LEGACY_LIGHT_PALETTE[7] === '#C089D2' && P.LEGACY_PROFILE_PALETTE[8] === '#A678B0', 'palettes LEGACY_* intactes');

// Source unique : plus aucun calcul de teinte de pôle dans l'app ; tous les appels passent par TMT.poleColor
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (/node_modules|\.git/.test(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const files = ['public', 'trade-tracker/public'].filter((d) => fs.existsSync(path.join(__dirname, '..', d))).flatMap((d) => walk(path.join(__dirname, '..', d))).filter((p) => /\.(js|html)$/.test(p));
const old = files.filter((p) => /subProjectShade|SUB_PROJECT_SHADE_COUNT|function hexToHsl|function hslToHex/.test(fs.readFileSync(p, 'utf8')));
assert(old.length === 0, 'aucun ancien calcul de teinte (subProjectShade, hexToHsl, hslToHex) : ' + (old.length ? old.map((p) => path.basename(p)).join(', ') : 'rien'));
const users = files.filter((p) => /TMT\.poleColor\(/.test(fs.readFileSync(p, 'utf8'))).map((p) => path.basename(p)).sort();
assert(['app.js', 'aujourdhui.js', 'objectifs-arbre.js', 'objectifs-creer.js', 'objectifs-document-taches.js', 'objectifs-page2-objectif.js', 'objectifs-page2-taches.js', 'objectifs-page3.js', 'stats-avance.js'].every((n) => users.indexOf(n) >= 0), 'appels via TMT.poleColor dans : ' + users.join(', '));
const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'theme-palette.js'), 'utf8');
assert(/root\.TMT\.poleColor = root\.NOESIS_THEME_PALETTES\.poleColor/.test(sw), 'TMT.poleColor est publiée par theme-palette.js (chargé avant app.js)');
console.log(failed ? '\npole-couleurs-test : ' + failed + ' ÉCHEC(S)' : '\npole-couleurs-test : OK');
process.exit(failed ? 1 : 0);
