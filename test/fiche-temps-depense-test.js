// Fiche d'un pôle/secteur : « Temps dépensé » affichait toujours « Impossible pour le moment. » car `var shares = {}` (part des tâches)
// masquait la fonction `shares(r)` du calcul du temps : TypeError dans le then, attrapé par le catch.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync('public/js/objectifs-creer.js', 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('  function openFiche(spec, onEnd) {');
const end = src.indexOf('\n  }\n', start);
assert(start > 0 && end > start, 'openFiche introuvable');
const body = src.slice(start, end);
// Aucun nom ne doit être à la fois fonction et variable dans la fiche (la variable écrase la fonction avant son appel asynchrone).
const fns = new Set([...body.matchAll(/^\s*function (\w+)\(/gm)].map((m) => m[1]));
const vars = [...body.matchAll(/\bvar (\w+)\b/g)].map((m) => m[1]);
const clash = vars.filter((v) => fns.has(v));
assert.deepStrictEqual(clash, [], 'variable qui masque une fonction de la fiche : ' + clash.join(', '));
assert(/function timeShares\(r\)/.test(body) && /timeShares\(r\)\.me/.test(body), 'le calcul du temps garde son nom propre');
console.log('fiche-temps-depense-test : OK');
// Temps dépensé : seulement pour une activité partagée (2 membres ou plus), sans chemin gris au-dessus.
assert(!/spec\.path/.test(body), 'plus de ligne de chemin dans la fiche');
assert(/length >= 2\) \{ panelBody\.insertBefore\(timeBox[^;]*; paintTime\(\)/.test(body), 'bloc Temps dépensé rendu seulement si au moins 2 membres');
assert(!/panelBody\.appendChild\(timeBox\)/.test(body), 'le bloc n\'est jamais ajouté sans condition');
console.log('fiche-temps-depense (partagée seulement) : OK');
