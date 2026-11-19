// Barre des volets : le « + » est le bouton d'action du volet affiché ; ajout/retrait/ordre des volets = Réglages > Modules (18 nov. 2026). Usage : node test/barre-bouton-action-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const bar = rd('public/js/barre-volets.js'), mod = rd('public/js/modules.js'), today = rd('public/js/aujourdhui.js'), css = rd('public/css/barre-volets.css') + rd('public/css/aujourdhui.css') + rd('public/css/bureau.css') + rd('public/css/objectifs-page2-taches.css'), i18n = rd('public/i18n.js');
// 1. Plus d'appui long, de mode édition de la barre, de « + » d'ajout ni de styles R17bis de la barre
assert(!/LONG_MS|MOVE_PX|startDrag|addX|barX|barGhost|barPlus|barAdding|barEdit|barSolo|setAdding|askAdd|askRemove|justEdited/.test(bar), 'barre : appui long, poignée, croix rouge et pop-up d\'ajout supprimés');
assert(!/barGhost|barPlus|barAdding|barEdit|barSolo|cmpAddBadge|barX|tabBtnAdd\.barPaid|tabbarHasPlus/.test(css) && !/tabbarHasPlus/.test(rd('public/js/objectifs-page2-taches.js')), 'CSS et page 2 : styles de l\'ajout par le « + » supprimés');
assert(!i18n.includes('Retirer de la barre') && !i18n.includes("'Ajouter un onglet'"), 'i18n : textes de l\'ancien « + » retirés');
// 2. Le bouton n'existe que sur la Feuille de route (Tâches / Objectifs) ; action selon la vue
assert(bar.includes("btnOf('tasks')") && bar.includes("btnOf('objectives')") && bar.includes("classList.contains('active')") && bar.includes("TMT.todayView.toggleComposer ? 'tasks' : null") && bar.includes("? 'tree' : null") && bar.includes("addBtn.classList.toggle('barNoAdd', !kind)"), 'bouton présent seulement sur le volet Feuille de route, absent ailleurs');
assert(bar.includes("shown(byId('goalsTodayView'))") && bar.includes("shown(byId('goalsActivitiesView'))") && bar.includes("goalsActOpen"), 'action selon la vue : Tâches ou Objectifs, rien dans la page d\'une activité');
assert(bar.includes('TMT.todayView.toggleComposer()') && bar.includes('a.setEdit(!a.isEdit())') && bar.includes('a && a.setEdit && a.isEdit'), 'Tâches = zone d\'écriture ; Objectifs = TMT.objectifsArbre.setEdit(!isEdit()), garde défensive');
assert(bar.includes("'tmt:arbre-edit'") && bar.includes('e.detail.on') && bar.includes('aria-pressed') && css.includes('.tabbar .tabBtnAdd[aria-pressed="true"]'), 'état enfoncé reflété (tmt:arbre-edit, tmt:composer) avec les jetons de verre existants');
// 3. Zone d'écriture : cachée par défaut, apparition de droite à gauche, désactivée en mouvement réduit
assert(today.includes('(composerOpen || flowOn())') && today.includes('toggleComposer:') && today.includes('composerOpen:') && today.includes('setComposer(false); resetDay();'), 'zone d\'écriture des tâches : cachée par défaut, ouverte par le bouton, refermée en quittant la vue');
assert(css.includes('@keyframes tasksDockIn') && css.includes('translateX(48px)') && css.includes('.22s') && /prefers-reduced-motion: reduce\) \{ \.tasksDock\.tasksDockIn \{ animation: none/.test(css), 'animation de droite à gauche (~220 ms), désactivée en prefers-reduced-motion');
// 4. Réglages > Modules : ordre = ordre de la barre, glisser-déposer existant, « Ajouter » en .cmpAdd
assert(mod.includes('TMT.navBar') && mod.includes('nb.order().forEach') && mod.includes('TMT.ui.groupDrag(handle, row') && mod.includes('nb.setOrder('), 'Modules : une ligne par volet dans l\'ordre de la barre, réordonnée par glisser-déposer (groupDrag)');
assert(mod.includes("className = 'cmpAdd'") && mod.includes("addButton('Ajouter un volet'") && mod.includes('nb.add(tab)'), 'Modules : « Ajouter un volet » en haut avec le composant .cmpAdd');
assert(bar.includes('function setOrder(tabs)') && bar.includes('TMT.navBar = {') && bar.includes('function firstTab()') && bar.includes("visibleOrder().filter(function (t) { return t !== 'trade'; })[0]"), 'la barre garde l\'ordre mémorisé ; l\'onglet le plus à gauche s\'ouvre en premier');
assert(bar.includes("var KEEP = ['chrono', 'tasks', 'objectives', 'horaire']") && bar.includes('function mayRemove'), 'règle R18 : au moins un de Chrono / Feuille de route / Horaire reste');
console.log(failed ? '\n' + failed + ' échec(s)' : 'barre-bouton-action-test OK'); process.exit(failed ? 1 : 0);
