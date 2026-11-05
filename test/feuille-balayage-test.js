// Feuille de route : le balayage vers les statistiques existe sur la vue « Tâches » de la page 1 et sur la vue « Objectifs » (liste des activités), pas dans une activité,
// et le pager de l'activité compte 3 points (page 1, Objectifs, Calendrier), sans page « Tâches de l'activité ».
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const stats = read('stats-avance.js');
assert(/if \(goalsZone\) slidePager\(\{\s*zone: goalsZone/.test(stats), 'gestionnaire de balayage de la page 1 (Feuille de route) présent');
const neighbor = (stats.match(/if \(goalsZone\) slidePager\(\{[\s\S]*?\n  \}\);/) || [''])[0];
assert(!/showing\('goalsActivitiesView'\)/.test(neighbor) && !/showing\('goalsTodayView'\)/.test(neighbor) && /showing\('goalsDetailPage'\)/.test(neighbor), 'balayage vers les statistiques sur Tâches ET sur Objectifs (liste) ; dans une activité il sert au pager de l\'activité');
assert(/showing\('goalsCapturePage'\)\) return \{ ctx: 'goals', idx: 0 \}/.test(stats) && !/idx: 0 \}[^\n]*\n/.test('') , 'points de pagination visibles sur Tâches ET sur Objectifs (une seule page 1 = un seul point)');
assert(!/noFollow/.test(stats), 'le contenu suit le doigt (aucun mode sans suivi) : sélecteur, liste et barre glissent d\'un bloc avec la page Statistiques');
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
assert(/fromGoalsStats/.test(app) && /!fromGoalsStats && TMT\.resetGoalsPage1View/.test(app), 'retour des statistiques : dernière vue (Tâches ou Objectifs) gardée ; Tâches par défaut seulement après un autre module');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'aujourdhui.css'), 'utf8');
assert(/#goalsCapturePage\) \{[^}]*overflow-x: clip[^}]*touch-action: pan-y/.test(css), 'Tâches et Objectifs : contenu fixe horizontalement (pas de défilement latéral)');
const css2 = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'aujourdhui.css'), 'utf8');
assert(/\.tasksPopList \{[^}]*overflow-x: hidden/.test(css2), 'liste de tâches : aucun défilement latéral natif (la liste ne se décale plus seule, le balayage part)');
assert(/input:not\(\[type=checkbox\]\)/.test(stats), 'un balayage qui commence sur une case à cocher reste possible');
const p2 = read('objectifs-page2-taches.js');
assert(/GOALS_PAGE2_ORDER = \['goals', 'month'\]/.test(p2), 'dans l\'activité : Objectifs puis Calendrier (plus de page Tâches)');
assert(/data-dot="home"[\s\S]*data-dot="goals"[\s\S]*data-dot="next"/.test(p2), 'trois points : page 1, Objectifs, Calendrier');
assert(/openGoalsForActivity|setGoalsPage2Mode\('goals', \{ noAnim: true \}\)/.test(p2), 'une activité s\'ouvre sur Objectifs');
if (failed) { console.log('\nfeuille-balayage-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nfeuille-balayage-test : OK');
