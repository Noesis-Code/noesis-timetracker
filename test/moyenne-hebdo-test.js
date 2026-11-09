// Moyenne hebdomadaire du temps chronométré : une seule fonction (server/lib/weeklyavg.js), 4 semaines, poids 2, 2, 1, 1 (du plus récent au plus ancien) divisé par 6.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const w = require('../server/lib/weeklyavg');
assert(w.weightedAverage([240, 240, 240, 240]) === 240, 'semaines égales : la moyenne simple');
assert(w.weightedAverage([600, 60, 60, 60]) === (1200 + 120 + 60 + 60) / 6, 'semaine récente atypique (10 h) : pèse double, divisé par 6 (= 240 min)');
assert(w.weightedAverage([60, 60, 60, 600]) === (120 + 120 + 60 + 600) / 6, 'semaine ancienne atypique : pèse simple');
assert(w.weightedAverage([120, 0, 0, 0]) === 120 && w.weightedAverage([120, 60, 0, 0]) === (240 + 120) / 4, 'moins de 4 semaines : le poids ne porte que sur les semaines existantes');
assert(w.weightedAverage([0, 0, 0, 60]) === 10, 'une semaine vide AU MILIEU de l’historique compte pour 0');
assert(w.weightedAverage([0, 0, 0, 0]) === null && w.weightedAverage([]) === null, 'aucun historique : null (comme avant)');
// fenêtres : 4 semaines de 7 jours terminées la veille, de la plus récente à la plus ancienne
const seen = []; w.weeklyAverage('2026-11-09', (s, e) => { seen.push(s + '>' + e); return 0; });
assert(seen.join() === '2026-11-02>2026-11-08,2026-10-26>2026-11-01,2026-10-19>2026-10-25,2026-10-12>2026-10-18', 'fenêtres : 28 jours terminés la veille');
// une seule copie du calcul : plus de constante AVG_DAYS dans le planificateur ni de moyenne locale ailleurs
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', f), 'utf8');
assert(!read('weekplanner.js').includes('AVG_DAYS') && read('weekplanner.js').includes('weeklyavg.weeklyAverage'), 'weekplanner : historyAverageMinutes passe par la fonction partagée');
assert(read('timecaps.js').includes("require('./weeklyavg').weeklyAverage") && read('objectifs.js').includes("require('./weeklyavg').weeklyAverage") && read('tempsbudget.js').includes('weeklyavg.weeklyAverage'), 'timecaps, objectifs et l’étape Temps utilisent la même fonction');
console.log(failed ? '\nmoyenne-hebdo-test : ' + failed + ' ÉCHEC(S)' : '\nmoyenne-hebdo-test : OK');
process.exit(failed ? 1 : 0);
