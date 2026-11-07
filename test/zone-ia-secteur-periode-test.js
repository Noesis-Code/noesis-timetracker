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

// #71 : la page mensuelle (page 3) est retirée (7 nov. 2026) : cliquer une période ou un secteur ouvre le calendrier de la vue Tâches, sur CE secteur (TMT.ouvrirCalendrierTaches, secteurKey = secteur cliqué).
const p3 = read('js/objectifs-page3.js'), p2o = read('js/objectifs-page2-objectif.js');
check(!p3.includes('function openGoalsDetail') && !(p3 + p2o).includes('TMT.openGoalsDetail'), '#71 : plus de page 3 (openGoalsDetail retirée)');
check(p2o.includes('ouvrirCalendrierTaches({ activityId: TMT.currentGoalsActivityId, poleKey: TMT.currentGoalsSelectedPoleKey, secteurKey: category'), '#71 : toucher une période ouvre le calendrier des Tâches sur le secteur cliqué');
check(p3.includes('TMT.currentGoalsSelectedSecteurKey = category'), '#71 : secteur sélectionné = secteur cliqué (calendrier intégré)');
process.exit(bad ? 1 : 0);
