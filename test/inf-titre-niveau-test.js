// Page « Objectifs inférieurs » : le titre du panneau ET l'en-tête de colonne disent ce que sont les LIGNES proposées (une seule source : infLevelName(p)). Usage : node test/inf-titre-niveau-test.js
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
const i = js.indexOf('    function infLevelName('), fn = js.slice(i, js.indexOf('\n', i));
const mk = (level, one) => new Function(fn + '\nreturn infLevelName({ level: ' + JSON.stringify(level) + ' }, ' + !!one + ');')();
assert(mk('pole') === 'Objectifs annuels' && mk('pole', true) === 'Objectif annuel', 'lignes par année (niveau pôle) : titre « Objectifs annuels », en-tête « Objectif annuel »');
assert(mk('secteur') === 'Objectifs périodiques' && mk('secteur', true) === 'Objectif périodique', 'lignes par période (niveau secteur) : « Objectifs périodiques » / « Objectif périodique »');
assert(mk('semaine') === 'Objectifs hebdomadaires' && mk('semaine', true) === 'Objectif hebdomadaire', 'lignes par semaine : « Objectifs hebdomadaires » / « Objectif hebdomadaire »');
assert(js.includes('tr(infLevelName(p, true))') && js.includes("panelKicker.textContent = tr(k === 'inf' && inf.plan && !inf.plan.skip ? infLevelName(inf.plan) : stepNames[k]);"), 'titre du panneau et en-tête de colonne : la même fonction');
const en = fs.readFileSync(path.join(__dirname, '..', 'public/i18n.js'), 'utf8');
assert(en.includes("'Objectifs périodiques': 'Period goals'") && en.includes("'Objectifs hebdomadaires': 'Weekly goals'") && en.includes("'Objectif hebdomadaire'"), 'traductions EN');
const rc = js.slice(js.indexOf('    function infRecap('), js.indexOf('    function infCreatedName('));
assert(rc.includes("tr('Échéance')") && !/tr('(Chiffre|Départ|Faire|Résultat)')/.test(rc), 'haut de la page : seulement l’échéance (plus Chiffre, Départ, Faire, Résultat)');
assert(js.includes("tr(infCreatedName()) + ' : ' + form.title") && js.includes("activite: 'Objectif pluriannuel', pole: 'Objectif annuel', secteur: 'Objectif périodique'"), 'titre du haut : « Objectif annuel : … » selon le niveau réel de l’objectif créé');
if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe');
