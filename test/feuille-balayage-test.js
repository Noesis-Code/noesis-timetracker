// Feuille de route : le balayage vers les statistiques existe sur la vue « Tâches » de la page 1 (jamais sur la vue « Objectifs », la liste des activités),
// et le pager de l'activité compte 3 points (page 1, Objectifs, Calendrier), sans page « Tâches de l'activité ».
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const stats = read('stats-avance.js');
assert(/if \(goalsZone\) slidePager\(\{\s*zone: goalsZone/.test(stats), 'gestionnaire de balayage de la page 1 (Feuille de route) présent');
const neighbor = (stats.match(/if \(goalsZone\) slidePager\(\{[\s\S]*?\n  \}\);/) || [''])[0];
assert(/showing\('goalsActivitiesView'\)/.test(neighbor) && !/showing\('goalsTodayView'\)/.test(neighbor), 'balayage refusé seulement sur la vue Objectifs (liste des activités)');
assert(/showing\('goalsCapturePage'\) && !showing\('goalsActivitiesView'\)\) return \{ ctx: 'goals', idx: 0 \}/.test(stats), 'points de pagination masqués seulement sur la vue Objectifs');
assert(/input:not\(\[type=checkbox\]\)/.test(stats), 'un balayage qui commence sur une case à cocher reste possible');
const p2 = read('objectifs-page2-taches.js');
assert(/GOALS_PAGE2_ORDER = \['goals', 'month'\]/.test(p2), 'dans l\'activité : Objectifs puis Calendrier (plus de page Tâches)');
assert(/data-dot="home"[\s\S]*data-dot="goals"[\s\S]*data-dot="next"/.test(p2), 'trois points : page 1, Objectifs, Calendrier');
assert(/openGoalsForActivity|setGoalsPage2Mode\('goals', \{ noAnim: true \}\)/.test(p2), 'une activité s\'ouvre sur Objectifs');
if (failed) { console.log('\nfeuille-balayage-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nfeuille-balayage-test : OK');
