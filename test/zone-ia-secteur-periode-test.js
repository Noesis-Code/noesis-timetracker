// Non-régression (tâches d'Émilien #68 et #71, secteur Basic).
// #68 : la zone de texte libre IA (capture) doit défiler quand le texte dépasse, jamais le couper.
// #71 : cliquer une période d'un secteur ouvre la page mensuelle SUR CE SECTEUR (pas le premier).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };

// #68 : dernière déclaration d'overflow de la zone, toutes feuilles confondues, jamais "hidden".
const sel = /activityGoalsCategoryAutoTaskBubble\s+textarea\b[^{}]*\{([^{}]*)\}/g;
let overflows = [];
for (const f of ['styles.css', 'css/objectifs-page1.css', 'css/verre-calme.css']) {
  const css = read(f);
  let m;
  while ((m = sel.exec(css))) {
    const o = /overflow(-y)?\s*:\s*([a-z-]+)/.exec(m[1]);
    if (o) overflows.push(o[2]);
  }
}
check(overflows.length > 0 && overflows.every((v) => v !== 'hidden'), 'zone IA : aucune règle overflow:hidden');
check(overflows.includes('auto') || overflows.includes('scroll'), 'zone IA : overflow auto (défilement)');

// #71 : l'ouverture d'une période fixe le secteur cliqué et redessine les bulles de secteur.
const p3 = read('js/objectifs-page3.js');
const open = /function openGoalsDetail\(category, periodNumber\) \{([\s\S]*?)\n  \}/.exec(p3);
check(!!open, '#71 : openGoalsDetail trouvée');
const body = open ? open[1] : '';
check(/applyGoalsMonthState\(category, periodNumber\)/.test(body), '#71 : état du mois posé avec la catégorie cliquée');
check(/currentGoalsSelectedSecteurKey = category/.test(/function applyGoalsMonthState[\s\S]*?\n  \}/.exec(p3)[0]), '#71 : secteur sélectionné = secteur cliqué');
check(body.indexOf('setGoalsPage2Mode') < body.indexOf('renderGoalsMonthSectors()'), '#71 : bulles de secteur redessinées après le changement de page');
process.exit(bad ? 1 : 0);
