// Case vide de l'arbre : « + » en haut à droite, création pré-remplie (cadre, type, échéance) ; plus de barre « Nouvel objectif… »
const fs = require('fs'), assert = require('assert');
const arbre = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8'), creer = fs.readFileSync('public/js/objectifs-creer.js', 'utf8'), css = fs.readFileSync('public/css/objectifs-arbre.css', 'utf8');
assert(/el\('span', 'arPlus', '\+'\)/.test(arbre) && /\.arPlus \{[^}]*top: 0; right: 0; width: 44px; height: 44px/.test(css), '« + » en haut à droite, zone 44 px');
assert(/if \(plus\) b\.appendChild/.test(arbre) && /if \(below\) \{[^]*?return b;\s*\}/.test(arbre), 'pas de « + » sur une case à pastille');
assert(/rw\.block \? 'pluriannuel' : rw\.p \? 'periodique' : 'annuel'/.test(arbre) && /endDate: endIso/.test(arbre), 'type = la ligne, échéance = fin de la case');
assert(/pendingType = o\.type/.test(creer) && /if \(pendingType\) \{ form\.type = pendingType; form\.typeTouched = true; \}/.test(creer), 'le type de la case pré-sélectionné');
assert(!/tasksComposer|function start\(\)|sendBtn|basePlaceholder/.test(creer), 'barre « Nouvel objectif… » retirée (interface et code mort)');
assert(!/syncCtx/.test(arbre), 'contexte de la barre retiré');
assert(creer.includes('var fromCell = form.fixedCtx && form.endFixed;') && creer.includes("(fromCell ? ['desc'] : ['desc', 'activite'])") && creer.includes("fromCell ? [] : ['echeance']"), 'depuis un « + » : ni Emplacement ni Échéance, aucun type excepté');
assert(creer.includes('pick.max = form.cellEnd') && creer.includes('pick.min = form.cellStart') && creer.includes("'objTEdit', txt") && creer.includes('loadRatt().then(function () { return infFetch(); }).then(infPaint)') && creer.includes("form.endDate || '', tp.valueMin"), 'périodique : date tactile du récapitulatif, bornée à la période, régénère les sous-objectifs');
console.log('case-plus-test OK');
