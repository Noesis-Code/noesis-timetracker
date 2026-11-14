// Bilan : nouveaux blocs (sélecteur, tâches urgentes, moyenne des tâches réalisées, proportion) : tableaux de traits, un seul bouton Jour ↔ Semaine, vert = le plus, rouge = le moins. Usage : node test/bilan-blocs-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const js = rd('public/js/bilan-blocs.js'), css = rd('public/css/stats-avance.css'), html = rd('public/index.html'), sa = rd('public/js/stats-avance.js');
assert(js.includes("'Toutes mes activités'") && js.includes("scope === 'all'") && js.includes('urgentes()') && js.includes('moyenne(scope); proportion(scope);'), 'sélecteur « Toutes mes activités » (défaut) ou une activité : urgentes en Toutes ; moyenne et proportion pour une activité');
assert(js.includes("tr('Moyenne des tâches réalisées')") && !/Tâches faites/.test(js) && js.includes("tr(jourMode ? 'Jour' : 'Semaine')") && js.includes("el('button', 'iconBtn'"), 'bloc « Moyenne des tâches réalisées » (pas « Tâches faites »), UN seul bouton qui change de mot Jour ↔ Semaine');
assert(js.includes("var DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];") && js.includes("['1', '2', '3', '4']"), 'colonnes Jour = L à D ; colonnes Semaine = 1 à 4');
assert(js.includes("tr('Période'), tr('Année'), tr('Nombre')") && js.includes('w.label') && !/class.*bar|bbBar|progress/i.test(js), 'tâches urgentes : TABLEAU sans barres (S réel, période, année, nombre), navigation par période');
assert(js.includes("td.classList.add('bbMax')") && js.includes("td.classList.add('bbMin')") && /\.bbTable td\.bbMax \{ color: var\(--good\)/.test(css) && /\.bbTable td\.bbMin \{ color: var\(--danger\)/.test(css), 'vert = le plus, rouge = le moins, par ligne (jetons existants)');
assert(/\.bbTable th, \.bbTable td \{ border: 1px solid var\(--sep\)/.test(css) && !/#[0-9a-fA-F]{6}/.test(css.slice(css.indexOf('Bilan : nouveaux blocs'))), 'que des traits (var(--sep)), aucune nouvelle couleur');
assert(html.includes('<script src="/js/bilan-blocs.js"></script>') && sa.includes('if (TMT.bilanBlocs) TMT.bilanBlocs.open();') && sa.includes('if (TMT.bilanBlocs) TMT.bilanBlocs.close();'), 'branché sur le mode Bilan (ouvre et ferme avec le volet)');
// logique pure : extrêmes par ligne (même fonction que table(), extraite)
const fn = js.slice(js.indexOf('  function table(head, rows, extremes) {'), js.indexOf('  function card(title)'));
const dom = () => { const mk = () => { const e = { children: [], classList: { set: new Set(), add(c) { this.set.add(c); } }, textContent: '', appendChild(c) { this.children.push(c); return c; } }; return e; }; return mk; };
const mk = dom(); const el = (tag, cls, text) => { const e = mk(); e.tag = tag; e.cls = cls; e.textContent = text == null ? '' : text; return e; };
const num = (v) => (v == null ? '—' : String(v).replace('.', ','));
const table = new Function('el', 'num', fn + '\nreturn table;')(el, num);
const t = table(['', 'a', 'b', 'c'], [{ label: 'Tous', cells: [3, 6, 1] }, { label: 'Égal', cells: [2, 2, 2] }], true);
const rows = t.children[1].children;
const cls = (row) => row.children.slice(1).map((td) => (td.classList.set.has('bbMax') ? 'max' : td.classList.set.has('bbMin') ? 'min' : '-')).join();
assert(cls(rows[0]) === '-,max,min' && cls(rows[1]) === '-,-,-', 'vert sur le plus, rouge sur le moins ; ligne égale : aucune couleur');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-blocs-test OK'); process.exit(failed ? 1 : 0);
