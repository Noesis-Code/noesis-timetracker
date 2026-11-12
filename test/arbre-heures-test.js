// Arbre : colonne de droite « Heures » (lecture) : moyenne par semaine de la ligne, violet = réglé, gris = hérité. Usage : node test/arbre-heures-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8').replace(/\r\n/g, '\n'), css = fs.readFileSync('public/css/objectifs-arbre.css', 'utf8');
assert(js.includes("var railR = el('div', 'arRailR'), tbl = el('div', 'arTbl');") && js.includes("'/api/objectifs/allocation/lignes'"), 'colonne de droite alimentée par l\'API des lignes');
assert(js.includes("sp.classList.toggle('set', !!(r && r.own))") && js.includes("marks.push({ m: sp, rk: String(rw.rank) })"), 'violet = réglé sur la ligne ; posée au milieu de la ligne comme son repère');
assert(/\.arRailR \.arHrs\.set \{ color: var\(--purple\)/.test(css) && /\.arRailR \.arHrs \{[^}]*color: var\(--text-light\)/.test(css) && !/#[0-9a-f]{6}/i.test(css.slice(css.indexOf('.arRailR'))), 'aucune nouvelle couleur : jetons existants');
assert(!/⚠/.test(js.slice(js.indexOf('function hrsTxt'), js.indexOf('function cellSize'))), 'aucun avertissement dans la colonne');
assert(js.includes("tbl.appendChild(rail); tbl.appendChild(grid); tbl.appendChild(railR); hin.appendChild(tbl);") && !js.includes('body.appendChild(rail)'), 'repères à gauche et heures à droite dans le tableau qui défile (jamais en colonnes fixes)');
assert(!/position:s*sticky/.test(css.slice(css.indexOf('.arRailR'))) && !/.arRail {[^}]*sticky/.test(css), 'aucun position: sticky sur les repères ni sur les heures');
console.log(failed ? '\n' + failed + ' échec(s)' : 'arbre-heures-test OK'); process.exit(failed ? 1 : 0);
