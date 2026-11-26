// Barre des volets, finitions (18 nov. 2026) : « + » animé (largeur), 5 volets visibles puis défilement, rien ne disparaît, bulle concentrique, « + » inchangé. Usage : node test/barre-finitions-test.js
const fs = require('fs'), vm = require('vm');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const css = rd('public/css/barre-volets.css'), js = rd('public/js/barre-volets.js'), today = rd('public/js/aujourdhui.js');
// 1. Animation du « + » : largeur transitionnée, fondu retardé, mouvement réduit désactivé
assert(/\.tabbar \.tabBtnAdd\.barNoAdd \{[^}]*width: 0[^}]*margin-left: 0[^}]*opacity: 0[^}]*transition: width var\(--bar-move\)/.test(css), '« + » absent : largeur 0, marge 0, fondu, transition de largeur');
assert(/\.tabbar \.tabBtnAdd \{ display: flex; transition: width var\(--bar-move\)[^}]*opacity \.25s ease \.15s/.test(css) && css.includes('--bar-move: .4s cubic-bezier(.4, 0, .2, 1)'), '« + » présent : même durée/courbe que la bulle, fondu avec petit délai');
assert(/prefers-reduced-motion: reduce\) \{[^}]*\.tabbar \.tabBtnAdd[^}]*transition: none/.test(css), 'mouvement réduit : pas de transition');
// 2. Défilement : touch-action pan-x (cause de la disparition : touch-action none bloquait le balayage), 5 visibles
assert(!/touch-action: none/.test(css) && css.includes('touch-action: pan-x'), 'les onglets n\'empêchent plus le balayage horizontal');
assert(js.includes('nShown > 5') && !js.includes('nShown > 4') && css.includes('/ 5)') && css.includes('scroll-padding-inline'), 'limite 5 volets, défilement, actif amené en vue avec marge');
// 3. Bulle concentrique : rayon = rayon de la barre moins l'espacement ; mêmes jetons partout
assert(css.includes('--bar-h: 52px; --bar-gap: 4px') && css.includes('border-radius: calc(var(--bar-h) / 2 - var(--bar-gap))') && css.includes('top: var(--bar-gap); bottom: var(--bar-gap)') && css.includes('padding: 0 var(--bar-gap)'), 'bulle : rayon = barre/2 - espacement, même espacement haut/bas/côtés');
// 4. « + » de la barre : plus de variante payée ; verre enfoncé conservé
assert(!/tabBtnAdd\.barPaid/.test(css) && !js.includes('barPaid') && !js.includes('expansionPaid') && !today.includes('expansionPaid'), '« + » de la barre : plus de variante barPaid / expansionPaid');
assert(css.includes('border: var(--cmp-dashed-lg) var(--cmp-dash); background: none; color: var(--purple, #9C8CC8);') && css.includes('.tabbar .tabBtnAdd[aria-pressed="true"], .arAddSlot[aria-pressed="true"] { border: 1px solid var(--glass-border); background: var(--glass-bg); box-shadow: var(--glass-shadow);') && css.includes('backdrop-filter: var(--glass-blur)'), '« + » : pointillé au repos, enfoncé = exactement le verre de la barre (.cmpGlass : fond, liseré 1 px + filet intérieur 1 px, flou)');
assert(!/.tabbar .tabBtnAdd, .barAddBtn(, .arAddSlot)? {s*display: none/.test(css), "« + » : plus de display:none qui l'écrasait (cause de sa disparition)");
assert(css.includes('.tabBtn.barSwap') && css.includes('barHasAction') && js.includes("setCls(b, 'barSwap', swap && b.classList.contains('active'))"), 'le volet affiché (Tâches/Objectifs) quitte la barre pour laisser sa place au « + »');
// 5. Comportement : 6 volets, tous atteignables, Communauté présente
function el(tab) { const cl = new Set(tab === 'chrono' ? ['active'] : []); return { dataset: { tab }, classList: { contains: (c) => cl.has(c), toggle: (c, on) => { on ? cl.add(c) : cl.delete(c); }, add: (c) => cl.add(c) }, tabIndex: 0, _cl: cl }; }
const ALL = ['chrono', 'tasks', 'objectives', 'community', 'bilan', 'horaire', 'trade'], btns = ALL.map(el);
const mk = () => { const s = new Set(); return { classList: { toggle: (c, on) => { on ? s.add(c) : s.delete(c); }, contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) }, addEventListener() {}, removeAttribute() {}, setAttribute() {}, _s: s }; };
const root = mk(), pill = Object.assign(mk(), { children: btns, appendChild() {}, querySelector: (q) => { const m = /data-tab="(\w+)"/.exec(q); return m ? btns.find((b) => b.dataset.tab === m[1]) : btns.find((b) => b._cl.has('active')); }, querySelectorAll: () => btns }), addBtn = mk();
let onTasksView = false; const store = {}; const sandbox = { window: {}, localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = String(v); } }, document: { documentElement: root, querySelector: () => ({}), getElementById: (id) => id === 'tabbarPill' ? pill : id === 'tabbarAdd' ? addBtn : (id === 'goalsTodayView' && onTasksView) ? { getClientRects: () => [1] } : null, addEventListener() {} }, Array, JSON };
sandbox.window = sandbox; sandbox.window.TMT = { getProfile: () => ({ id: 'p' }), modules: { tabOn: () => true, tradeOn: () => false } };
try {
  vm.runInNewContext(js, sandbox);
  const nb = sandbox.TMT.navBar, order = nb.order();
  assert(order.length >= 5 && order.includes('community'), 'défaut : Communauté présente dans l\'ordre (' + order.join(',') + ')');
  store['noesis-bar:p'] = JSON.stringify(['chrono', 'tasks', 'objectives', 'community', 'bilan', 'horaire']); nb.refresh();
  assert(nb.order().length === 6 && nb.order().includes('community'), '6 volets : tous dans l\'ordre, Communauté présente');
  assert(pill._s.has('barScroll'), '6 volets : la barre défile (barScroll)');
  assert(!btns.some((b) => ['chrono', 'tasks', 'objectives', 'community', 'bilan', 'horaire'].includes(b.dataset.tab) && b._cl.has('barOut')), '6 volets : aucun masqué (barOut)');
  store['noesis-bar:p'] = JSON.stringify(['chrono', 'tasks', 'objectives', 'community', 'bilan']); nb.refresh();
  assert(!pill._s.has('barScroll'), '5 volets : pas de défilement');
  // Sur Chrono : 5 volets, pas de « + », aucun volet retiré
  assert(!addBtn._s.has('barNoAdd') === false && !btns.some((b) => b._cl.has('barSwap')) && !pill._s.has('barHasAction'), 'Chrono : pas de « + », 5 volets visibles, aucun remplacé');
  // Sur Tâches : l'onglet Tâches quitte la barre, le « + » est présent, Objectifs reste atteignable
  sandbox.TMT.todayView = { toggleComposer() {}, composerOpen: () => false };
  btns.forEach((b) => { b._cl.delete('active'); }); btns.find((b) => b.dataset.tab === 'tasks')._cl.add('active'); onTasksView = true; nb.refresh();
  assert(btns.find((b) => b.dataset.tab === 'tasks')._cl.has('barSwap') && !btns.find((b) => b.dataset.tab === 'objectives')._cl.has('barSwap'), 'Tâches : onglet Tâches retiré de la barre, Objectifs reste');
  assert(!addBtn._s.has('barNoAdd') && pill._s.has('barHasAction'), 'Tâches : le « + » est présent');
  store['noesis-bar:p'] = JSON.stringify(['chrono', 'tasks', 'objectives', 'community', 'bilan', 'horaire']); nb.refresh();
  assert(pill._s.has('barScroll'), '6 volets sur Tâches : 5 restants + le « + » dépassent 5 emplacements, la barre défile');
} catch (e) { failed++; console.log('  FAIL comportement : ' + e.message); }
console.log(failed ? '\n' + failed + ' échec(s)' : 'barre-finitions-test OK'); process.exit(failed ? 1 : 0);
