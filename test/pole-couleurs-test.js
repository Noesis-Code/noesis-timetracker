// Couleurs de pôles (règle R47) : le standard design est la règle « plus clair / plus foncé » de l'ancienne fonction subProjectShade (public/app.js au commit 1efce081), déplacée à l'identique dans
// public/theme-palette.js (source unique) : TMT.poleColor(couleurActivité, index) donne EXACTEMENT les mêmes valeurs. Table ci-dessous = 9 couleurs d'activité × 5 rangs, calculées depuis 1efce081.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const P = require('../public/theme-palette.js');
const OLD = {"#A04B52":["#f0dee0","#debabd","#cd9499","#bc7076","#54282b"],"#A0674B":["#eddfd9","#d9bdae","#c59984","#6c4533","#482e22"],"#A0864B":["#e9e2d1","#d1c19c","#7c683a","#5d4d2b","#3d341d"],"#83A04B":["#dde7cb","#b6ca8e","#5d7135","#455428","#2e391a"],"#4BA075":["#cfe8dc","#98ceb3","#387657","#295840","#1b3b2b"],"#4B98A0":["#d0e7e9","#9acbd0","#39737a","#2a555a","#1c393d"],"#4B75A0":["#dae4ee","#b0c5da","#87a7c7","#34526f","#23364b"],"#594BA0":["#e3e1f1","#c4bfe1","#a59dd1","#877cc2","#362d61"],"#914BA0":["#ecddef","#d7b9de","#c293cc","#ad6dbb","#4a2652"]};

const LUXE = ['#531D28', '#7D3C2C', '#957637', '#183F2B', '#1A5854', '#659ECA', '#202E65', '#311B4B', '#9F323A'];
assert(P.DARK_PALETTE.length === 9 && P.DARK_PALETTE.every((c, i) => c === LUXE[i]) && P.LIGHT_PALETTE.length === 9 && P.LEGACY_MINERAL_PALETTE.length === 9 && P.LEGACY_MINERAL_PALETTE[0] === '#A04B52', 'palette Luxe (9 couleurs) ; ancienne palette Minéral gardée en LEGACY_MINERAL_PALETTE');
const L = (c) => P.labLightness(c);
let bad = 0;
P.DARK_PALETTE.forEach((c) => {
  const r = [0, 1, 2, 3, 4].map((i) => P.poleColor(c, i)), l = r.map(L);
  const ok = l.every((v, i) => i === 0 || v < l[i - 1]) && r[4] === c && Math.abs(l[0] - 90) < 1.5 && new Set(r).size === 5;
  if (!ok) { bad++; console.log('    écart ' + c + ' : ' + r.join(' ')); }
});
assert(bad === 0, 'chaque couleur d’activité est le rang LE PLUS FONCÉ de ses 5 nuances (toutes différentes, la plus claire à L* 90)');
assert(P.poleColor('#531D28', 5) === P.poleColor('#531D28', 0) && P.poleColor('#531D28', 6) === P.poleColor('#531D28', 1) && P.poleColor('#531D28', -1) === P.poleColor('#531D28', 4), 'au-delà de 5 pôles : index % 5');
assert(P.poleColor('#531D28', null) === '#531D28' && P.poleColor('#531D28', undefined) === '#531D28', 'sans index : la couleur de l’activité elle-même');
assert(P.poleColor('pas-une-couleur', 1) === 'pas-une-couleur', 'valeur invalide : rendue telle quelle');
assert(P.LIGHT_PALETTE.every((c) => /^#[0-9a-f]{6}$/i.test(P.poleColor(c, 2))) && P.LEGACY_DARK_PALETTE.every((c) => /^#[0-9a-f]{6}$/i.test(P.poleColor(c, 3))), 'toute couleur d’activité (claire, LEGACY_*) donne ses 5 nuances par la même règle');
assert(P.POLE_TINTS === undefined, 'aucun tableau de teintes inventé (POLE_TINTS supprimé)');
const h = (a) => require('crypto').createHash('sha1').update(a.join(',')).digest('hex');
assert(P.LEGACY_DARK_PALETTE.length === 16 && P.LEGACY_LIGHT_PALETTE.length === 8 && P.LEGACY_PROFILE_PALETTE.length === 9 && P.LEGACY_DARK_PALETTE[0] === '#9E2E2E' && P.LEGACY_LIGHT_PALETTE[7] === '#C089D2' && P.LEGACY_PROFILE_PALETTE[8] === '#A678B0', 'palettes LEGACY_* intactes');
const pal = fs.readFileSync(path.join(__dirname, '..', 'public', 'theme-palette.js'), 'utf8');
assert(pal.includes('var HI = 90;') && pal.includes('POLE_SHADE_COUNT = 5') && pal.includes('rank === POLE_SHADE_COUNT - 1'), 'la règle : 5 rangs, la couleur de l’activité = le rang le plus foncé (28 nov. 2026)');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' || e.name === '.git' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const files = ['public', 'trade-tracker/public'].filter((d) => fs.existsSync(path.join(__dirname, '..', d))).flatMap((d) => walk(path.join(__dirname, '..', d))).filter((p) => p.endsWith('.js') || p.endsWith('.html'));
const BAN = ['subProjectShade', 'SUB_PROJECT_SHADE_COUNT', 'POLE_TINTS', 'function hexToHsl', 'function hslToHex'];
const old = files.filter((p) => !p.endsWith('theme-palette.js') && BAN.some((x) => fs.readFileSync(p, 'utf8').includes(x)));
assert(old.length === 0, 'une seule source : aucune copie de la règle ni ancien nom ailleurs que dans theme-palette.js (' + (old.length ? old.map((p) => path.basename(p)).join(', ') : 'rien') + ')');
const users = files.filter((p) => fs.readFileSync(p, 'utf8').includes('TMT.poleColor(')).map((p) => path.basename(p)).sort();
assert(['app.js', 'aujourdhui.js', 'composants.js', 'objectifs-creer.js', 'objectifs-document-taches.js', 'objectifs-page2-objectif.js', 'stats-avance.js'].every((n) => users.indexOf(n) >= 0), 'tous les appels passent par TMT.poleColor (' + users.join(', ') + ')');
assert(pal.includes('root.TMT.poleColor = root.NOESIS_THEME_PALETTES.poleColor'), 'TMT.poleColor est publiée par theme-palette.js (chargé avant app.js)');
console.log(failed ? '\npole-couleurs-test : ' + failed + ' ÉCHEC(S)' : '\npole-couleurs-test : OK');
process.exit(failed ? 1 : 0);
