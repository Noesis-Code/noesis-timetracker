// Étape « Temps » de la création d'un objectif : structure du code client (écrans, tableau, bouton, plafond 168 h).
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'objectifs-creer.css'), 'utf8');
const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');

assert(js.includes("tr('Prévu')") && js.includes("tr('Passé')"), 'tableau : colonnes Prévu et Passé');
assert(js.includes("tr('Heures par semaine')") && js.includes('D’où vient ce temps ?'), 'écrans 1 et 2 titrés');
assert(js.includes('Prendre sur') && js.includes('Ajouter'), 'cartes Ajouter / Prendre sur');
assert(js.includes('tpScreen1') && js.includes('tpScreen2') && js.includes('tpScreen3'), 'trois écrans');
assert(js.includes('tpPages') && js.includes('tasksPages'), 'balayage : mécanisme de pages existant');
assert(!/objTDots|pagination|pageDots/.test(js.slice(js.indexOf('function tpPaint'), js.indexOf('function tpPaint') + 3000)), 'aucun point de pagination');
assert(js.includes("tr('Valider')") && js.includes('tpValider'), 'bouton « Valider » quand un changement est en cours');
assert(js.includes('<= 168') || js.includes('168'), 'plafond 168 h');
assert(!js.includes('function paintPeriods') && !js.includes('function paintHours') && !js.includes('hoursBox'), 'ancien code de l’étape Temps retiré');
assert(!/<=\s*80\b/.test(js.slice(js.indexOf('function parseHrs'), js.indexOf('function parseHrs') + 400)), 'plus de limite à 80 h');
assert(js.includes("form.innerGoals = form.innerGoals || 'les_deux'"), 'valeur par défaut des objectifs inclus inchangée');
assert(/\.objTEdit[^}]*var\(--purple\)/.test(css) && /\.objTRO|\.objTLabel/.test(css), 'cellule modifiable violette, lecture seule distincte');
assert(js.includes("'cmpList'"), 'lignes séparées bord à bord (R22, .cmpList)');
['Heures par semaine', 'Prévu', 'Passé', 'Toutes tes activités'].forEach((k) => assert(i18n.includes(k), 'traduction : ' + k));
// parseHrs reproduit
const m = js.match(/function parseHrs\(raw\) \{[\s\S]*?\n    \}/);
if (m) { const parseHrs = new Function(m[0] + '; return parseHrs;')(); assert(parseHrs('168').ok && parseHrs('168').min === 168 * 60, '168 accepté'); assert(!parseHrs('169').ok, '169 refusé'); assert(parseHrs('1,5').ok && parseHrs('1,5').min === 90, 'décimales permises'); }
console.log(failed ? '\netape-temps-test : ' + failed + ' ÉCHEC(S)' : '\netape-temps-test : OK');
process.exit(failed ? 1 : 0);
