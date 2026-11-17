// Arbre des objectifs : toucher n'importe où dans une case (vide, occupée, à pastille) SAUF sur le « + » (création) et le crayon (modification) ENTRE dans la case.
// Test sur le code : il exécute les vraies fonctions emptyCell / enterCell extraites de objectifs-arbre.js, avec un DOM minimal.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8');
function extract(name) { const i = src.indexOf('function ' + name + '('); assert(i >= 0, name + ' existe'); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }
function el(cls) { const n = { cls: [], children: [], handlers: {}, attrs: {}, classList: { add(c) { n.cls.push(c); } }, appendChild(c) { n.children.push(c); return c; }, setAttribute(k, v) { n.attrs[k] = v; }, addEventListener(t, f) { n.handlers[t] = f; } }; return n; }
const log = [];
const env = {
  el(tag, cls, txt) { const n = el(); n.cls = String(cls || '').split(' '); n.txt = txt; return n; },
  cellSize() {}, tr(s) { return s; }, lvl: 'pole', wk: null, log,
  descend(ci, block, year) { log.push(['descend', ci, block, year]); },
  openWeeks(rw, c) { log.push(['weeks', rw.p]); },
};
const code = extract('emptyCell') + '\n' + extract('enterCell') + '\nreturn { emptyCell: emptyCell, enterCell: enterCell, setLvl: function (l) { lvl = l; }, setWk: function (w) { wk = w; } };';
const lib = new Function('el', 'cellSize', 'tr', 'descend', 'openWeeks', 'var lvl = "pole", wk = null;\n' + code)(env.el, env.cellSize, env.tr, env.descend, env.openWeeks);
const click = (b, onPlus) => { log.length = 0; b.handlers.click({ target: { closest: s => onPlus && s === '.arPlus' ? {} : null } }); return log.slice(); };
let created = 0;
function cell(endIso, below, level, rw, wk) {
  lib.setLvl(level); lib.setWk(wk || null);
  const c = { col: { key: 'k', label: 'L' } };
  return lib.emptyCell(100, endIso, () => {}, below, () => { created++; }, () => lib.enterCell(rw, c, 3));
}
// 1. case VIDE, niveau activité : entre dans le bloc (ligne = bloc de 5 ans)
let r = click(cell('2030-12-31', null, 'activite', { block: true, y: 2026, y2: 2030 }));
assert.deepStrictEqual(r, [['descend', 3, 2026, 2026]], 'activité, case vide : on descend au niveau pôles du bloc');
// 2. case vide, niveau pôle : entre dans l'année de la ligne
r = click(cell('2027-12-31', null, 'pole', { y: 2027 })); assert.deepStrictEqual(r, [['descend', 3, null, 2027]], 'pôle, case vide : on descend aux secteurs de l\'année');
// 3. case vide PASSÉE (aucune échéance possible) : n'est plus inerte
const past = cell(null, null, 'pole', { y: 2020 }); assert(!past.disabled, 'case passée vide : pas désactivée');
r = click(past); assert.deepStrictEqual(r, [['descend', 3, null, 2020]], 'case passée vide : on descend aussi');
// 4. dernier niveau : case périodique vide = page des 4 semaines ; ligne annuelle (sans p) : rien
r = click(cell('2027-02-01', null, 'secteur', { y: 2027, p: 3 })); assert.deepStrictEqual(r, [['weeks', 3]], 'secteur, période vide : page des 4 semaines');
// 5. page des semaines ouverte : toucher une case vide ne descend plus (« + » seul)
r = click(cell('2027-02-01', null, 'secteur', { y: 2027, p: 3, w: 2 }, { p: 3 })); assert.deepStrictEqual(r, [], 'page des semaines : pas de niveau plus bas');
// 6. case à pastille : descend toujours via below.go
let went = 0; const badge = lib.emptyCell(100, null, () => {}, { n: 2, go() { went++; } }, () => { created++; }, () => lib.enterCell({ y: 2027 }, { col: {} }, 3));
click(badge); assert.strictEqual(went, 1, 'pastille : below.go');
// 7. le « + » crée et ne descend PAS, dans une case vide comme dans une case à pastille
created = 0; r = click(cell('2027-12-31', null, 'pole', { y: 2027 }), true); assert.deepStrictEqual(r, [], '« + » : aucune descente'); assert.strictEqual(created, 1, '« + » : crée');
click(badge, true); assert.strictEqual(went, 1, '« + » d\'une pastille : ne descend pas'); assert.strictEqual(created, 2, '« + » d\'une pastille : crée');
// 8. le crayon d'une carte occupée n'entre pas (déjà ainsi dans card/macroCard/summaryCard) ; le site d'appel de emptyCell passe bien enterCell
assert(src.includes("function () { enterCell(rw, c, ci); }"), 'appel : emptyCell reçoit enterCell');
assert((src.match(/closest\('\.cmpEdit'\)\) return;/g) || []).length >= 3, 'crayon : exclu du toucher des 3 types de cartes');
console.log('arbre-entrer-case-test OK');
