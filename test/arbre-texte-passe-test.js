// Arbre : texte et passé (18 nov. 2026) : titres de colonne de la couleur de la catégorie, texte des cartes centré / léger / 5 lignes / en creux, texte de jauge (0 / 50 / 100 %), passés ternes, plafonds de lignes 5 / 5 / 13.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8'), css = fs.readFileSync('public/css/objectifs-arbre.css', 'utf8');
function extract(name) { const i = src.indexOf('function ' + name + '('); assert(i >= 0, name + ' existe'); let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } }
const rule = (sel) => { const i = css.lastIndexOf(String.fromCharCode(10) + sel + ' {') + 1; assert(i >= 1, 'règle ' + sel); return css.slice(i, css.indexOf('}', i) + 1); };
// 1. titre de colonne = couleur de la colonne (celle déjà calculée), jamais le blanc ; sélectionné en fusion : texte lisible sur fond rempli
assert(/b\.style\.borderColor = c\.color; b\.style\.color = c\.color;/.test(src), 'titre de colonne : style.color = c.color (couleur de la colonne)');
assert(src.indexOf('b.style.color = c.color;') < src.indexOf("b.style.color = TMT.readableTextOn ? TMT.readableTextOn(c.color)"), 'la fusion (fond rempli) garde un texte lisible, posé APRÈS');
// 2. cartes pleines : texte en creux (couleur du fond), centré, léger, 5 lignes, 13 px (> 12 px)
assert(src.includes("b.style.color = 'var(--bg)'") && !/paint[\s\S]{0,400}readableTextOn\(c\)/.test(extract('paint')), 'paint : texte de la couleur du fond');
const nom = rule('.arGrid .arCard:not(.arMacro) :is(.arCardName, .arSummaryText)');
assert(/-webkit-line-clamp: 5/.test(nom) && /font-weight: 300/.test(nom) && /text-align: center/.test(nom) && /top: 50%/.test(nom) && /translateY[(]-50%[)]/.test(nom) && !/box-pack/.test(nom), 'titre : 5 lignes, léger, centré ; boîte à la hauteur du texte, centrée à 50 % / -50 % (vertical exact, 1 à 5 lignes)');
assert(Number((nom.match(/font-size: (\d+)px/) || [])[1]) >= 12, 'taille jamais sous 12 px');
assert(/left: 4px; right: 4px/.test(nom) && /padding: 0/.test(nom) && /left: 24px; right: 24px/.test(css), 'marges latérales symétriques (4 px ; 24 px en édition pour le crayon) : le titre reste centré');
assert(rule('.arGrid .arCard > .goalsGridCellText').includes('container-type: size'), 'le titre lit la hauteur de la carte');
assert(Number((css.match(/--ar-row-min: (\d+)px/) || [])[1]) >= 80, 'rangée assez haute pour 5 lignes');
// 3. jauge : dégradé net à p % découpé dans le texte : bas (rempli) = fond, haut (vide) = couleur du secteur ; plus de couleur posée par le script
const gg = rule('.arGauge .arCardName');
assert(gg.includes('linear-gradient(0deg, var(--bg) var(--ar-p, 0%), var(--ar-c) var(--ar-p, 0%))') && /background-clip: text/.test(gg) && /-webkit-background-clip: text/.test(gg) && /-webkit-text-fill-color: transparent/.test(gg), 'texte de jauge : fond sous p %, couleur du secteur au-dessus');
assert(!/readableTextOn/.test(extract('gauge')), 'gauge : aucune couleur de texte posée en JS');
function stops(p) { // évalue le dégradé pour une carte de hauteur 100 : bas = 0 %, haut = 100 %
  const g = gg.match(/linear-gradient\(0deg, (var\(--bg\)) var\(--ar-p, 0%\), (var\(--ar-c\)) var\(--ar-p, 0%\)\)/);
  return (y) => y < p ? g[1] : g[2];
}
[0, 50, 100].forEach((p) => { const at = stops(p); assert.strictEqual(at(10), p > 10 ? 'var(--bg)' : 'var(--ar-c)', p + ' % : bas de la carte'); assert.strictEqual(at(90), p > 90 ? 'var(--bg)' : 'var(--ar-c)', p + ' % : haut de la carte'); });
// 4. passés ternes : jeton d'opacité et de saturation, tous niveaux (cartes pleines des rangées passées, macros compris)
assert(/--ar-past-op: \.45/.test(css) && /--ar-past-sat: \.5/.test(css), 'jetons de passé');
assert(rule('.arGrid .arPastRow .goalsGridCell--filled') === '.arGrid .arPastRow .goalsGridCell--filled { opacity: var(--ar-past-op); filter: saturate(var(--ar-past-sat)); }', 'cartes passées : opacité et saturation réduites');
assert(src.includes("'goalsGridRow arMacroRow' + (rw.rank < here.rank ? ' arPastRow' : '')") && src.includes("'goalsGridRow' + (rw.rank < here.rank ? ' arPastRow' : '')"), 'rangées passées (cases et macros) marquées arPastRow ; présent et futur intacts');
// 5. plafonds de lignes : 5 blocs pluriannuels, 5 années, 13 périodes
function rowsOf(z, lo, far) {
  const f = new Function('zoom', 'PER_YEAR', 'PER_DAYS', extract('nextRank') + '\n' + extract('rowOfRank') + '\nvar MAX_ROWS = ' + src.match(/var MAX_ROWS = (\{[^}]*\})/)[1] + ';\n' + extract('buildRows') + '\nreturn buildRows;')(z, 13, 28);
  return f(lo, far, {});
}
assert.strictEqual(rowsOf('block', 202600, 202600 + 500 * 30).length, 5, 'pluriannuel : 5 cases au plus (objectifs jusqu\'en 2175)');
assert.strictEqual(rowsOf('block', 202600, 203600).length, 3, 'pluriannuel : sous le plafond, rien n\'est ajouté ici (le complément à 5 est fait au rendu)');
assert.strictEqual(rowsOf('year', 202600, 202600 + 100 * 40).length, 5, 'annuel : 5 cases au plus');
assert.strictEqual(rowsOf('period', 202601, 202601 + 100 * 3).length, 13, 'périodes : 13 cases au plus (13 par an)');
assert(/list\.length < Math\.min\(isLand\(\) \? 7 : MIN_ROWS, MAX_ROWS\[zoom\] \|\| 1e9\)/.test(src), 'complément de cases vides plafonné aussi en paysage (7 devient 5)');
console.log('arbre-texte-passe-test OK');
