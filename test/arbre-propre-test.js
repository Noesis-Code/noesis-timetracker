// Arbre « propre » (18 nov. 2026) : mode édition (API + événement), cases vides en pointillé sans fond, nombre / grand plus, crayon en creux, jauge du niveau secteur (0 / 40 / 100 %), tiret des heures.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8'), css = fs.readFileSync('public/css/objectifs-arbre.css', 'utf8');
function extract(name) { const i = src.indexOf('function ' + name + '('); assert(i >= 0, name + ' existe'); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }
// 1. mode édition : setEdit / isEdit / événement tmt:arbre-edit
const events = [], toggles = [];
global.document = { dispatchEvent(e) { events.push(e.detail.on); } };
global.CustomEvent = function (n, o) { this.type = n; this.detail = o.detail; };
const tree = { classList: { toggle(c, on) { toggles.push([c, on]); } } };
const ed = new Function('tree', 'document', 'CustomEvent', 'var editOn = false;\n' + extract('setEdit') + '\nreturn { setEdit: setEdit, isEdit: function () { return editOn; } };')(tree, global.document, global.CustomEvent);
assert.strictEqual(ed.isEdit(), false, 'édition éteinte au départ');
ed.setEdit(true); assert.strictEqual(ed.isEdit(), true); ed.setEdit(true); ed.setEdit(false); ed.setEdit(false);
assert.deepStrictEqual(events, [true, false], 'un événement par CHANGEMENT seulement');
assert.deepStrictEqual(toggles, [['arEdit', true], ['arEdit', false]], 'la classe arEdit suit');
assert(src.includes('setEdit: setEdit, isEdit: function () { return editOn; }'), 'API publique TMT.objectifsArbre.setEdit / isEdit');
// 2. désactivé en changeant de niveau, en quittant l'onglet et à hide()
assert(/function go\(l, f\) \{\s*setEdit\(false\);/.test(src) && src.includes("if (!on) setEdit(false);") && src.includes('hide: function () { setEdit(false);') && src.includes("setEdit(false); picked = null; lvl = 'activite'"), 'édition coupée : niveau, onglet, retour');
// 3. jauge : 0 / 40 / 100 %
function gaugeFor(progress, level) {
  const st = {}, b = { classList: { add(c) { (st.cls = st.cls || []).push(c); }, toggle(c, on) { if (on) (st.cls = st.cls || []).push(c); } }, style: { setProperty(k, v) { st[k] = v; } } };
  new Function('lvl', 'b', 'o', 'c', 'TMT', extract('gauge').replace('function gauge(b, o, c)', 'return (function (b, o, c)') + ')(b, o, c);')(level, b, { progress }, '#A04B52', { readableTextOn: () => '#15111C' });
  return { st, b };
}
let g = gaugeFor(0, 'secteur'); assert.strictEqual(g.st['--ar-p'], '0%'); assert(g.b.style.background.includes('#A04B52 0%, transparent 0%'), '0 % : rien de plein'); assert(g.st.cls.includes('arGaugeLow'));
g = gaugeFor(0.4, 'secteur'); assert.strictEqual(g.st['--ar-p'], '40%'); assert(g.b.style.background.includes('linear-gradient(0deg, #A04B52 40%, transparent 40%)'), '40 % : le bas est plein'); assert(g.st.cls.includes('arGaugeLow'));
g = gaugeFor(1, 'secteur'); assert.strictEqual(g.st['--ar-p'], '100%'); assert(g.b.style.background.includes('#A04B52 100%'), '100 % : plein'); assert(!g.st.cls.includes('arGaugeLow') && g.st.cls.includes('arGauge'));
g = gaugeFor(0.4, 'pole'); assert(!g.st.cls && !g.b.style.background, 'hors niveau secteur : aucune jauge');
assert(src.includes('o.progress') && !/progress\s*=\s*.*done/i.test(extract('gauge')), 'pourcentage = progress du serveur (shape de objectifs.js), jamais recalculé ici');
// 4. CSS : pointillé des cases vides à tous les niveaux, jauge, tiret des heures, plus de verre
assert(css.includes('.arGrid .goalsGridCell--empty { background: none; outline: 1px dashed') && !css.includes('arLvlSecteur .goalsGridCell') && !/backdrop-filter|--glass-bg/.test(css), 'cases vides : pointillé sans fond ni verre, tous niveaux');
assert(css.includes('.arGrid .goalsGridCell--filled.arGauge { overflow: visible; background-origin: border-box; border-color: transparent !important; }') && css.includes('clip-path: inset(0 0 var(--ar-p) 0)') && css.includes('border: 2px dashed var(--ar-c)'), 'jauge : plein en bas, pointillés seulement autour du vide');
assert(css.includes(".arRailR .arHrs:empty::before { content: '–'; }"), 'heures non affichées : un tiret gris');
assert(src.includes('M10.8 0h2.4v10.8H24v2.4H13.2V24h-2.4V13.2H0v-2.4h10.8z'), 'plus à bords carrés');
console.log('arbre-propre-test OK');
// 5. Nombre et plus : MÊME teinte très pâle (22 %) ; en édition, toucher n'importe où sur une carte ouvre la modification, hors édition on descend
assert(css.includes('--ar-hole-mark: color-mix(in srgb, var(--text-light) 22%, transparent)') && css.includes('.arHoleCount { color: var(--ar-hole-mark)') && css.includes('.arHolePlus { display: none; color: var(--ar-hole-mark)'), 'nombre et plus : même jeton à 22 %');
{
  const opened = [], descended = []; let editOn = false, handler = null;
  const mk = () => ({ classList: { add() {}, toggle() {} }, style: { setProperty() {} }, setAttribute() {}, appendChild(c) { return c; }, addEventListener(t, f) { if (t === 'click') handler = f; }, dataset: {} });
  const f = new Function('el', 'stateOf', 'objColor', 'cellSize', 'paint', 'gauge', 'editMark', 'openEditOf', 'descend', 'ext', 'picked', 'TMT', 'getEdit', 'blockStart', 'var tree = [], lvl = "pole", wk = null;\n var editOn; Object.defineProperty(this, "editOn", { get: getEdit });\n' + extract('card').replace('function card(', 'return function card(').replace(/if \(editOn\)/g, 'if (getEdit())') + ';');
  const card = f(mk, () => 'now', () => '#fff', () => {}, () => {}, () => {}, () => mk(), (id) => opened.push(id), (...a) => descended.push(a), null, null, { ui: {} }, () => editOn, (d) => d);
  card({ id: 7, title: 'T', endDate: '2027-01-01' }, '2026-11-18', [], 'detail', 100, null, 2);
  const target = { closest: () => null };
  editOn = true; handler({ target }); assert.deepStrictEqual(opened, [7], 'édition : toucher la carte ouvre la modification');
  assert.strictEqual(descended.length, 0, 'édition : on ne descend pas');
  editOn = false; handler({ target }); assert.deepStrictEqual(opened, [7], 'hors édition : pas de modification'); assert.strictEqual(descended.length, 1, 'hors édition : on descend');
}
console.log('arbre-propre-test (retouches) OK');
