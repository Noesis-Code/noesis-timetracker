// Étape « Échéance » (11 nov. 2026) : la date n'est plus demandée à la Description ; ordre Description → Activité → Niveau → Échéance → Temps → objectifs inférieurs. Usage : node test/echeance-etape-test.js
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(__dirname, '..', 'public/css/objectifs-creer.css'), 'utf8');
assert(js.includes(".concat(niv.skip ? [] : ['niveau']).concat(form.endFixed ? [] : ['echeance']).concat(['temps'])"), 'ordre : Description, Activité, Niveau, Échéance, Temps (Échéance omise si l’échéance vient de la case de l’arbre)');
assert(js.includes("var dueBox = el('div'); boxes.echeance.appendChild(dueBox);") && !js.includes('boxes.desc.appendChild(dueBox)'), 'le champ « Date d’échéance » est sur l’étape Échéance, plus sur la Description');
const i = js.indexOf('    function stepOff()'), fn = js.slice(i, js.indexOf('\n', i));
const off = (cur, form) => new Function('cur', 'form', fn + '\nreturn stepOff();')(cur, form);
assert(off('desc', { title: 'x', dateOk: false, endDate: null }) === false && off('desc', { title: '' }) === true, 'Description : Suivant gris sans titre, actif avec titre, sans exiger la date');
assert(off('echeance', { dateOk: true, endDate: null }) === true && off('echeance', { dateOk: true, endDate: '2027-03-01' }) === false, 'Échéance : Suivant gris tant que la date est vide (R35)');
assert(js.includes("if (cur === 'echeance') {") && js.includes('refreshHints(); TMT.ui.attente(loadRatt())'), 'à « Suivant » de l’Échéance : parent (rattachement) et propositions recalculés');
assert(js.includes('function rattKey2()') && js.includes("form.ratt.key !== rattKey2()"), 'le rattachement dépend aussi de l’échéance (clé)');
assert(js.includes("if (form.endFixed) loadRatt().then(nivFetch); else nivFetch();") && js.includes('(form.endFixed ? loadRatt().then(nivFetch) : nivFetch())'), 'Activité → suite : seules les questions du Niveau avant l’échéance (rattachement après)');
assert(!/if \(!form\.dateOk \|\| !form\.endDate\) \{ msg\.textContent = tr\('Indique la date de l’échéance\.'\); return false; \}/.test(js), 'validDesc n’exige plus la date');
assert(js.includes("form.endFixed || form.echeanceDone") && js.includes("echeance: 'Échéance'"), '« sous X / sans parent » seulement une fois l’échéance confirmée ; libellé de l’étape');
assert(css.includes('.objAdvBody .objGuideRow.open > .objGuideHead { border-bottom-color: transparent; }') && js.includes("el('div', 'objAdvBody')") && js.includes("classList.add('objAdvBody')"), 'sous « Avancé » (Description, Niveau) : pas de trait sous une question dépliée (une seule règle CSS)');
if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe');
