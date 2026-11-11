// Page « Objectifs inférieurs » : le TITRE de la page est le niveau EN DESSOUS de l'objectif créé (niveau réel form.level), l'en-tête de colonne ne change pas. Usage : node test/inf-titre-niveau-test.js
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
const i = js.indexOf('    function infLevelName('), fn = js.slice(i, js.indexOf('\n', i));
const mk = (level) => new Function('form', fn + '\nreturn infLevelName({});')({ level });
assert(mk('activite') === 'Objectifs périodiques' && mk(undefined) === 'Objectifs périodiques', 'objectif créé au niveau activité (annuel) : titre « Objectifs périodiques »');
assert(mk('pole') === 'Objectifs hebdomadaires', 'objectif créé au niveau pôle (périodique) : titre « Objectifs hebdomadaires »');
assert(js.includes("tr(p.level === 'pole' ? 'Objectif annuel' : 'Objectif périodique')") && js.includes("panelKicker.textContent = tr(k === 'inf' && inf.plan && !inf.plan.skip ? infLevelName(inf.plan) : stepNames[k]);"), 'en-tête de colonne inchangé ; le titre du panneau vient de infLevelName');
const en = fs.readFileSync(path.join(__dirname, '..', 'public/i18n.js'), 'utf8');
assert(en.includes("'Objectifs périodiques': 'Period goals'") && en.includes("'Objectifs hebdomadaires': 'Weekly goals'"), 'traductions EN des deux titres');
if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe');
