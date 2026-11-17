// Arbre : les cases passées ne sont masquées que par BLOCS ENTIERS du niveau le plus haut (18 nov. 2026). Usage : node test/arbre-passe-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8').replace(/\r\n/g, '\n');
assert(js.includes('lo = y1; hi = y13;') && !js.includes('lo = y13 < here.rank ? y1 : Math.max(y1, here.rank)'), 'arbre périodique d\'une année : les 13 périodes sont toujours visibles, passées incluses');
assert(js.includes('lo = focus.block * 100; hi = (focus.block + 4) * 100;') && !js.includes('Math.max(focus.block * 100, here.rank)'), 'arbre de l\'année dans son bloc : les 5 années sont toujours visibles, passées incluses');
assert(!js.includes("zoom === 'block' && e.b.rank < lo") && js.includes('un bloc de 5 ans ENTIÈREMENT passé a disparu'), 'vue pluriannuelle : un bloc de 5 ans entièrement passé n\'a plus de ligne (la ligne de départ est celle du présent)');
assert(!js.includes("ok = zoom === 'block' || o.endDate >= today || st === 'now' || st === 'future'") && js.includes('var ok = true;'), 'plus aucun objectif ou case passée masqué un à un');
assert(js.includes('function rowEnd(rw)') && js.includes('return iso > dayIso() ? iso : null;'), 'création toujours interdite dans le passé (fin de case passée = case sans « + »)');
// l'export garde tout (même test que objectifs-export-test.js : tous les objectifs, passés compris)
const ex = fs.readFileSync('test/objectifs-export-test.js', 'utf8');
assert(ex.includes('tous les objectifs sont exportés, passés et abandonnés compris'), 'l\'export contient les objectifs passés (donc ceux d\'un bloc masqué)');
assert(js.includes("'calc((100cqw - var(--ar-mw, 46px) - ' + (10 + 2 * GAP + 4) + 'px) / 3)'"), 'trois colonnes ou plus : TROIS colonnes entières à l’arrivée, le reste en défilant de côté');
assert(js.includes('function isLand()') && js.includes('safe-area-inset-top') && fs.readFileSync('public/css/objectifs-arbre.css', 'utf8').includes('@media (orientation: landscape) and (max-height: 500px)'), 'paysage : arbre plein écran dans les zones de sécurité, barres masquées en CSS');
assert(js.includes("'max(env(safe-area-inset-left, 0px), ' + Math.round(pr.left / 2) + 'px)'") && js.includes("'max(env(safe-area-inset-right, 0px), ' + Math.round((window.innerWidth - pr.right) / 2) + 'px)'"), 'portrait : bords latéraux de l’arbre moitié moins larges (20 px -> 10 px à 390 px), zones de sécurité gardées');
const cssL = fs.readFileSync('public/css/objectifs-arbre.css', 'utf8');
assert(js.includes("if (isLand() && n >= 3) { var kL = Math.max(3, Math.min(n, 7, Math.floor((window.innerWidth - 120) / 100)));") && js.includes("list.length < (isLand() ? 7 : MIN_ROWS)") && cssL.includes("min-height: 44px; }") && cssL.includes("--goalsGridGap: 8px;") && js.includes("landMq.addEventListener('change'"), "paysage : jusqu’à 7 colonnes entières (plancher ~100 px), au moins 7 lignes, lignes de 44 px au moins (R7), redessin au changement d’orientation");
assert(cssL.includes('html.arbreOn { background: radial-gradient(circle 260px at 50% calc(100% + 70px), var(--halo), transparent) fixed, var(--black); }') && cssL.includes('html.arbreOn #app::after { display: none; }'), 'bande noire en bas (zone de sécurité basse, onglet Objectifs) : <html> porte le halo violet, plus de voile noir sous la barre des volets');
console.log(failed ? '\n' + failed + ' échec(s)' : 'arbre-passe-test OK'); process.exit(failed ? 1 : 0);
