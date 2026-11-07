// Tiroir des tâches (6 nov. 2026, piste T) : existe seulement avec l'onglet « Feuille de route », s'ouvre/se ferme au geste, même liste que l'ancienne page Tâches.
// Test structurel (source) + simulation du geste et de l'existence sur un DOM minimal.
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = read('public', 'js', 'tiroir.js'), css = read('public', 'css', 'tiroir.css'), today = read('public', 'js', 'aujourdhui.js'), page1 = read('public', 'js', 'objectifs-page1.js');
const compo = read('public', 'css', 'composants.css'), html = read('public', 'index.html'), sw = read('public', 'sw.js'), app = read('public', 'app.js');
assert(/\.cmpHandle \{/.test(compo) && read('trade-tracker', 'public', 'composants.css') === compo, 'poignée .cmpHandle : composant unique de composants.css, copie Trade identique (R29)');
assert(!/\.cmpHandle \{/.test(css) && /cmpHandle taskDrawerHandle'/.test(js) && /cmpHandle taskDrawerHandleTop/.test(js), 'les deux poignées réutilisent .cmpHandle (aucun style de poignée recopié)');
assert(/isOn\('roadmap'\)/.test(js) && /if \(!ok && open\) close\(\)/.test(js) && /topHandle\.classList\.toggle\('hidden', !ok/.test(js), "le tiroir et sa poignée n'existent qu'avec l'onglet Feuille de route (R26)");
assert(/BAND = 56, THRESH = 56/.test(js) && /bottom \+ BAND/.test(js), 'bande de départ de 56 px SOUS la barre du haut, seuil de 56 px');
assert(/Math\.abs\(dy\) > Math\.abs\(dx\) \* 1\.2/.test(js) && /touchmove', onMove, \{ passive: false \}/.test(js) && /scrolledAncestor/.test(js), "verrou d'axe vertical ; défilement natif de la liste jamais capté");
assert(/translateY\(/.test(js) && /dock\.style\.transform = tf/.test(js), "le rideau et la barre d'ajout suivent le doigt d'un bloc");
assert(/taskDrawerBody/.test(js) && /todayView\.mount\(body\)/.test(js) && /TMT\.ui\.dockKeyboard\(dock, ui\.text\)/.test(today), "liste du jour = composants de aujourdhui.js (monté dans le tiroir), barre d'ajout posée par dockKeyboard");
assert(/closeBtn\(function \(\) \{ close\(\)/.test(js) && /goalsCalDay/.test(js) && /cmpNav cmpNav--sm/.test(js) && /cmpChev/.test(js), '✕ (R13), semaine et mois = classes .goalsCal* / .cmpNav / .cmpChev existantes');
assert(/css\/tiroir\.css/.test(html) && /js\/tiroir\.js/.test(html) && /'\/js\/tiroir\.js'/.test(sw) && /'\/css\/tiroir\.css'/.test(sw), 'fichiers du tiroir chargés et préchargés par le service worker');
assert(!/goalsPage1Switch|goalsTodayView|\bsetGoalsPage1View/.test(page1) && /id="goalsActivitiesView">/.test(page1), "page Tâches retirée de la page 1 : la page 1 est directement l'arbre des Objectifs");
assert(/TMT\.taskDrawer\.open\(\)/.test(app) && /#taskDrawer \[data-task-id=/.test(app), 'notification vers une tâche : ouvre le tiroir');
assert(/shown = false; viewDay = null/.test(today) && /setDay: function/.test(today), "le tiroir se referme sur « aujourd'hui » ; un jour choisi sert à la liste et aux ajouts");

// Simulation : existence selon le module + ouverture/fermeture au geste (DOM minimal).
function el() {
  const e = { children: [], style: {}, _cls: new Set(), attrs: {}, listeners: {}, offsetHeight: 600, parentElement: null, scrollTop: 0, nodeType: 1 };
  e.classList = { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), contains: (c) => e._cls.has(c), toggle: (c, f) => { if (f === undefined ? !e._cls.has(c) : f) e._cls.add(c); else e._cls.delete(c); } };
  Object.defineProperty(e, 'className', { get: () => [...e._cls].join(' '), set: (v) => { e._cls = new Set(String(v).split(/\s+/).filter(Boolean)); } });
  e.appendChild = (c) => { e.children.push(c); c.parentElement = e; return c; };
  e.setAttribute = (k, v) => { e.attrs[k] = v; };
  e.addEventListener = (t, f) => { (e.listeners[t] = e.listeners[t] || []).push(f); };
  e.getClientRects = () => [{}];
  e.getBoundingClientRect = () => ({ bottom: 64 });
  e.closest = () => null;
  e.blur = () => {};
  Object.defineProperty(e, 'textContent', { get: () => e._t || '', set: (v) => { e._t = v; e.children = []; } });
  return e;
}
const byId = {};
const docListeners = {};
const rootEl = el();
const doc = {
  createElement: () => el(), createTextNode: (t) => ({ t }), body: el(), documentElement: rootEl, activeElement: null,
  getElementById: (id) => byId[id] || null,
  addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
  removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter((x) => x !== f); },
};
byId.app = el(); byId.topbar = el();
let roadmapOn = true, shownCalls = 0, hiddenCalls = 0;
const timers = [];
const win = {
  TMT: { modules: { isOn: (id) => id !== 'roadmap' || roadmapOn }, ui: { closeBtn: () => el() }, dateLocale: 'fr-CA', todayView: { mount() {}, show() { shownCalls++; }, hide() { hiddenCalls++; }, setDay() {}, dock: () => el() } },
  addEventListener() {}, scrollY: 0, document: doc, visualViewport: null,
};
const run = new Function('window', 'document', 'setInterval', 'setTimeout', 'clearTimeout', js);
run(win, doc, (f) => { timers.push(f); }, (f) => { f(); return 0; }, () => {});
const T = win.TMT.taskDrawer;
const sync = timers[0];
sync();
const handle = doc.body.children.find((c) => c.classList.contains('taskDrawerHandleTop'));
assert(handle && !handle.classList.contains('hidden') && T.available(), 'module Feuille de route présent : poignée visible');
roadmapOn = false; sync();
assert(handle.classList.contains('hidden') && !T.available(), 'module retiré : la poignée disparaît (et le geste ne démarre pas)');
const touch = (y, x = 190) => ({ touches: [{ clientX: x, clientY: y }], target: { closest: () => null, scrollTop: 0, nodeType: 1, parentElement: null } });
const startOf = docListeners.touchstart[0];
const armed = () => (docListeners.touchmove || []).length;
startOf(touch(80));
assert(!armed(), "sans l'onglet : aucun geste armé");
roadmapOn = true; sync();
startOf(touch(80)); // bande sous la barre (64..120)
assert(armed() === 1, 'départ dans la bande sous la barre : geste armé');
const mv = (y, x = 190) => docListeners.touchmove[0]({ touches: [{ clientX: x, clientY: y }], cancelable: true, preventDefault() {} });
mv(100); mv(200);
assert(shownCalls === 1, 'le rideau se prépare au premier mouvement vertical (liste montrée)');
docListeners.touchend[0]();
assert(T.isOpen() && rootEl.classList.contains('tiroirOpen'), 'tiré de plus de 56 px : le rideau se verrouille ouvert');
startOf(touch(300)); // hors poignée et titre : fermeture non armée
assert(!armed(), 'ouvert : un geste dans la liste ne ferme pas le rideau (défilement natif)');
T.close();
assert(!T.isOpen() && hiddenCalls === 1, "fermé : liste masquée, tiroir démonté après l'animation");
sync(); startOf(touch(80)); mv(90, 300);
assert(!armed() && !T.isOpen(), "geste horizontal : verrou d'axe, le rideau ne s'ouvre pas (balayage de page libre)");
startOf(touch(40)); // au-dessus de la bande (dans la barre du haut)
assert(!armed(), 'départ dans la barre du haut elle-même : jamais armé');
if (failed) { console.log('\ntiroir-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\ntiroir-test : OK');
