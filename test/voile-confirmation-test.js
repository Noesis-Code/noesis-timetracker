// Voile de chargement (R49) : TMT.ui.attente n'enveloppe QUE l'attente réseau. Une fenêtre qui attend l'utilisateur (confirmation « Remplacer ») ne doit jamais être sous le voile ; le voile se retire toujours, même si la promesse échoue. Usage : node test/voile-confirmation-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
// 1. comportement : exécute composants.js avec un faux DOM
const mk = () => { const o = { parentNode: null, className: '', children: [], setAttribute() {}, appendChild(c) { this.children.push(c); return c; } }; return o; };
const body = mk(), doc = { body, createElement: () => mk(), createElementNS: () => mk(), documentElement: mk(), addEventListener() {} };
body.appendChild = (c) => { c.parentNode = body; body.children.push(c); return c; };
body.removeChild = (c) => { body.children = body.children.filter((x) => x !== c); c.parentNode = null; };
const win = { TMT: {}, addEventListener() {}, matchMedia: () => ({ matches: false }) }; win.window = win;
try { vm.runInNewContext(read('public/js/composants.js'), { window: win, document: doc, globalThis: win, setTimeout, clearTimeout, console, Promise, MutationObserver: function () { this.observe = () => {}; }, navigator: {}, requestAnimationFrame: (f) => f() }); } catch (e) { console.log('chargement composants.js : ' + e.message); }
(async () => {
  const voiles = () => body.children.length;
  const ok = win.TMT.ui.attente(new Promise((r) => setTimeout(() => r(5), 10)));
  assert(voiles() === 1, 'le voile apparaît pendant l’attente');
  assert((await ok) === 5 && voiles() === 0, 'le voile se retire à la réussite, valeur rendue');
  let err = null; try { await win.TMT.ui.attente(Promise.reject(new Error('x'))); } catch (e) { err = e; }
  assert(err && err.message === 'x' && voiles() === 0, 'le voile se retire aussi si la promesse échoue (erreur propagée)');
  // 2. garde : dans la création d’objectif, la confirmation « Remplacer » n’est PAS enveloppée par attente
  const js = read('public/js/objectifs-creer.js');
  const a = js.indexOf("fin(api('POST', '/api/objectifs/case'"), c = js.indexOf('TMT.ui.confirm(', a);
  const seg = js.slice(a, c), depth = (seg.match(/\(/g) || []).length - (seg.match(/\)/g) || []).length;
  assert(a > 0 && c > a && /\)\)\n\s*\.then\(function \(occ\)/.test(seg), 'fin( ne couvre que la requête /api/objectifs/case, la suite .then(occ) est hors du voile');
  assert(/return fin\(go\(occ\.id\)\)/.test(js) && /: fin\(go\(null\)\)/.test(js), 'la création elle-même (réseau) reste sous le voile, après la réponse de l’utilisateur');
  // 3. garde générale : aucun TMT.ui.attente( ne contient un confirm / une fenêtre qui attend l’utilisateur sur la même ligne
  const bad = [];
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'public/js')).map((x) => 'public/js/' + x).concat(['public/app.js'])) {
    if (!f.endsWith('.js')) continue;
    read(f).split('\n').forEach((l, i) => { if (/TMT\.ui\.attente\(/.test(l) && /TMT\.ui\.confirm\(|openModal\(/.test(l.slice(l.indexOf('TMT.ui.attente(')).split(').then(')[0])) bad.push(f + ':' + (i + 1)); });
  }
  assert(bad.length === 0, 'aucun TMT.ui.attente( n’enveloppe un confirm ou un pop-up' + (bad.length ? ' : ' + bad.join(', ') : ''));
  if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); }
  console.log('\ntout passe');
})();
