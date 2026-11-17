// Case vide de l'arbre : « + » en haut à droite, création pré-remplie (cadre, type, échéance) ; plus de barre « Nouvel objectif… »
const fs = require('fs'), assert = require('assert');
const arbre = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8'), creer = fs.readFileSync('public/js/objectifs-creer.js', 'utf8'), css = fs.readFileSync('public/css/objectifs-arbre.css', 'utf8');
assert(/el\('span', 'arPlus', '\+'\)/.test(arbre) && /\.arPlus \{[^}]*top: 0; right: 0; width: 44px; height: 44px/.test(css), '« + » en haut à droite, zone 44 px');
assert(arbre.includes("closest('.arPlus')) plus(); });") && !arbre.includes('else onTouch(endIso)'), 'case vide : seul le « + » crée, toucher ailleurs ne fait rien');
assert(arbre.includes('if (!endIso && !below) { b.disabled = true;'), 'case à pastille : descend toujours, même sur une ligne passée (jamais désactivée avec des objectifs dessous)');
assert(arbre.includes("plus(); else below.go(); }); if (plus) b.appendChild(el('span', 'arPlus', '+')); return b; }"), 'case à pastille (objectifs inférieurs) : « + » aussi, seul déclencheur de la création ; ailleurs dans la case on descend');
assert(arbre.includes("type: rw.block ? 'pluriannuel' : rw.w ? 'hebdomadaire' : rw.p ? 'periodique' : 'annuel'") && /endDate: endIso/.test(arbre), 'type = la ligne (bloc, année, période, semaine), échéance = fin de la case');
assert(/pendingType = o\.type/.test(creer) && /if \(pendingType\) \{ form\.type = pendingType; form\.typeTouched = true; \}/.test(creer), 'le type de la case pré-sélectionné');
assert(!/tasksComposer|function start\(\)|sendBtn|basePlaceholder/.test(creer), 'barre « Nouvel objectif… » retirée (interface et code mort)');
assert(!/syncCtx/.test(arbre), 'contexte de la barre retiré');
assert(creer.includes('var fromCell = form.fixedCtx && form.endFixed;') && creer.includes("(fromCell ? ['desc'] : ['desc', 'activite'])") && creer.includes("fromCell ? [] : ['echeance']"), 'depuis un « + » : ni Emplacement ni Échéance, aucun type excepté');
assert(creer.includes('form.cellEnd, form.endDate || form.cellEnd') && creer.includes('function datePick(') && creer.includes("'objTEdit', txt") && creer.includes('loadRatt().then(function () { return infFetch(); }).then(infPaint)') && creer.includes("form.endDate || '', tp.valueMin"), 'périodique : date tactile du récapitulatif, bornée à la période, régénère les sous-objectifs');
console.log('case-plus-test OK');
