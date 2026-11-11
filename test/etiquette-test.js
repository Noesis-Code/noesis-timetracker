// Étiquette (11 nov. 2026) : le nom de l'élément du niveau le plus bas, même format à tous les niveaux ; couleur du pôle (secteur : nuance de son pôle, plusieurs pôles sans secteur : une couleur par pôle), de l'activité sans catégorie. Usage : node test/etiquette-test.js
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'public/js/composants.js'), 'utf8').replace(/\r\n/g, '\n');
const i = src.indexOf('    etiquette: function (o) {'), j = src.indexOf('    loader: loader,', i);
const body = src.slice(i, j).replace(/^\s*etiquette: /, '').replace(/,\s*$/, '');
const mk = (poleColor) => new Function('window', 'return (' + body + ');')({ TMT: { poleColor } });
const pc = (base, idx) => base + '#' + idx, et = mk(pc);
let e = et({ activityName: 'Noèsis', activityColor: '#aaa' });
assert(e.name === 'Noèsis' && e.color === '#aaa' && e.level === 'activite', 'activité sans catégorie : son nom, la couleur de l’activité');
const p1 = et({ activityName: 'Noèsis', activityColor: '#aaa', poleLabel: 'TiMeTracker', poleIndex: 0 }), p2 = et({ activityName: 'Noèsis', activityColor: '#aaa', poleLabel: 'Trade', poleIndex: 1 });
assert(p1.name === 'TiMeTracker' && p1.level === 'pole' && p1.color !== p2.color && p2.color === '#aaa#1', 'pôles sans secteur : le nom du pôle, une couleur différente par pôle');
e = et({ activityName: 'Noèsis', activityColor: '#aaa', poleLabel: 'TiMeTracker', secteurLabel: 'Interface', poleIndex: 0 });
assert(e.name === 'Interface' && e.level === 'secteur' && e.color === p1.color, 'secteur : le nom du secteur seul, la couleur de son pôle');
assert(mk(undefined)({ activityName: 'X', activityColor: '#bbb', poleLabel: 'P', poleIndex: 0 }).color === '#bbb', 'sans palette de pôles : repli sur la couleur de l’activité');
const au = fs.readFileSync(path.join(__dirname, '..', 'public/js/aujourdhui.js'), 'utf8').replace(/\r\n/g, '\n');
assert(au.includes('TMT.ui.etiquette({ activityName: t.activityName, activityColor: t.activityColor, poleLabel: t.poleName, secteurLabel: t.sector, poleIndex: t.poleIndex })') && au.includes('if (et.color) dot.style.background = et.color;'), 'liste des tâches : l’étiquette d’une tâche passe par le composant partagé (nom le plus bas, couleur du pôle)');
const ar = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-arbre.js'), 'utf8').replace(/\r\n/g, '\n');
assert((ar.match(/TMT\.ui\.etiquette\(/g) || []).length >= 3 && !ar.includes('TMT.poleColor(col2, p.shadeRank)') && !ar.includes('TMT.poleColor(col, p.shadeRank)'), 'arbre : les couleurs des colonnes (pôles, secteurs) passent par le composant partagé');
const p3 = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-page3.js'), 'utf8').replace(/\r\n/g, '\n');
assert(!p3.includes('TMT.poleColor(') && (p3.match(/TMT\.ui\.etiquette\(/g) || []).length >= 2, 'calendrier : les couleurs de pôle passent par le composant partagé');
assert(et({ activityColor: '#aaa', poleIndex: 2 }).color === '#aaa#2', 'couleur du pôle d’après son seul rang (calendrier)');
assert(ar.includes('function objColor(o)') && ar.includes('c = objColor(o),') && !ar.includes('c = colColor || color(o)'), 'arbre : la case remplie prend la couleur de la CATÉGORIE de l’objectif (activité / pôle / nuance du pôle), jamais celle de la colonne');
{
  const i = ar.indexOf('  function objColor(o) {'), j = ar.indexOf('  function card(o, today');
  const mkc = new Function('actOf', 'color', 'TMT', ar.slice(i, j) + '\nreturn objColor;');
  const A = { id: 1, name: 'Noèsis', color: '#aaa', poles: [{ key: 'p0', label: 'TiMeTracker', shadeRank: 0 }, { key: 'p1', label: 'Trade', shadeRank: 1 }] };
  const oc = mkc((id) => (id === 1 ? A : null), (o) => o.activity.color, { ui: { etiquette: et } });
  const act = { id: 1, color: '#aaa' };
  assert(oc({ activity: act, level: 'activite' }) === '#aaa', 'objectif pluriannuel / annuel de l’activité vu dans l’arbre : couleur de l’ACTIVITÉ');
  assert(oc({ activity: act, level: 'pole', poleKey: 'p1' }) === '#aaa#1' && oc({ activity: act, level: 'pole', poleKey: 'p0' }) !== oc({ activity: act, level: 'pole', poleKey: 'p1' }), 'périodique d’un pôle sans secteur : la couleur de CE pôle (une par pôle)');
  assert(oc({ activity: act, level: 'secteur', poleKey: 'p1', categoryKey: 's' }) === '#aaa#1', 'secteur : la nuance de son pôle');
}
if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe');
