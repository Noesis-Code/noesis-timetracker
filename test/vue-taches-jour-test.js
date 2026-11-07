// Vue Tâches par journée (6 nov. 2026, modèle B) : bande de la semaine, jour sélectionné, passé en lecture seule, futur modifiable, tri Objectif ;
// le tiroir (rideau) est retiré de l'interface et gardé au repos hors du bundle.
const fs = require('fs');
const path = require('path');
const R = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = R('public', 'js', 'aujourdhui.js'), css = R('public', 'css', 'aujourdhui.css'), page1 = R('public', 'js', 'objectifs-page1.js');
const html = R('public', 'index.html'), sw = R('public', 'sw.js'), app = R('public', 'app.js'), compo = R('public', 'css', 'composants.css');

// Tiroir retiré
assert(!/tiroir/.test(html) && !/tiroir/.test(sw) && !fs.existsSync(path.join(__dirname, '..', 'public', 'js', 'tiroir.js')) && !fs.existsSync(path.join(__dirname, '..', 'public', 'css', 'tiroir.css')), 'tiroir : plus chargé (index.html, service worker) ni servi (public/)');
assert(fs.existsSync(path.join(__dirname, '..', 'docs', 'fonctionnalites', 'repos-tiroir', 'tiroir.js')) && /mis de côté|MIS DE CÔTÉ/.test(R('docs', 'fonctionnalites', 'tiroir-taches.md')), 'code du tiroir gardé au repos (docs/fonctionnalites/repos-tiroir) avec sa note');
assert(!/cmpHandle|taskDrawer/.test(compo) && !/taskDrawer/.test(app), 'poignée .cmpHandle (non partagée) et notification vers le tiroir retirées');
assert(/id="goalsPage1Switch"|goalsPage1Switch/.test(page1) && /data-view="today">Tâches/.test(page1) && /data-view="activities">Objectifs/.test(page1), 'sélecteur « Tâches | Objectifs » de la page 1 remis');
assert(/setGoalsPage1View\('today'\)/.test(app) && /#goalsTodayView \[data-task-id=/.test(app), 'la notification de 6 h ouvre de nouveau la vue Tâches de la Feuille de route');

// Bande de la semaine et jour sélectionné
assert(/function buildCal/.test(js) && /goalsCalDay/.test(js) && /cmpNav cmpNav--sm goalsCalNav/.test(js) && /cmpChev/.test(js), 'bande de la semaine : classes .goalsCal* / .cmpNav / .cmpChev de la page 3 (aucun style de jour nouveau)');
assert(/mondayOf\(anchor\)/.test(js) && /addDays\(mondayOf\(anchor\), 3\)/.test(js), 'semaine du lundi au dimanche ; mois affiché = celui du jeudi (semaine à cheval sur deux mois)');
assert(/'&day=' \+ viewDay/.test(js) && /today=' \+ localIso\(\)/.test(js), 'la liste demande la JOURNÉE choisie (today = jour réel, day = jour choisi)');
assert(/dayKind\(\)/.test(js) && /kind === 'past'[\s\S]{0,200}filter\(function \(t\) \{ return t\.done; \}\)/.test(js), 'jour passé : seulement ce qui a été fait');
assert(/\.tasksToday\.dayPast \.tasksPopCheck[^}]*pointer-events: none/.test(css) && /\.tasksToday\.dayPast \.goalsTaskEditBtn \{ display: none/.test(css), 'jour passé : lecture seule (case inactive, modification masquée)');
assert(/dayIso\(\) < localIso\(\)[\s\S]{0,160}Pas d’ajout dans un jour passé/.test(js), 'ajout refusé dans le passé avec un message court');
assert(/state\.date \|\| dayIso\(\)/.test(js), 'jour futur choisi : les ajouts sont datés de ce jour');
assert(/hide: function \(\) \{ shown = false; if \(TMT\.goalsCalCloseEditor\) TMT\.goalsCalCloseEditor\(\); resetDay\(\)/.test(js) && /resetSort: function \(\) \{\s*resetDay\(\)/.test(js), 'en quittant la vue ou en arrivant d\'un autre module : retour à aujourd\'hui');
assert(js.includes("kind === 'today' ? 'Rien pour aujourd’hui.' : 'Aucune tâche ce jour-là.'"), 'journée sans tâche : message vide propre au jour');

// Tri Objectif : tâches sans objectif visibles, objectifs les plus proches du jour choisi
assert(/without\.forEach\(function \(t\) \{ treeRow\(t, listBox\); \}\)/.test(js) && !/objectiveCurrentWeek/.test(js), 'tri Objectif : les tâches sans objectif restent visibles');
assert(/var ahead = function \(g\)/.test(js) && /objectiveEnd >= day/.test(js), 'tri Objectif : objectifs les plus proches de la journée choisie d\'abord');

// Simulation de la logique de proximité (copie de la règle de tri)
const day = '2026-11-10';
const gs = [{ e: '2026-12-01' }, { e: '2026-11-12' }, { e: '2026-11-01' }, { e: '2026-10-20' }];
const ahead = (g) => (g.e >= day ? 0 : 1);
gs.sort((a, b) => (ahead(a) - ahead(b)) || (ahead(a) ? (b.e < a.e ? -1 : b.e > a.e ? 1 : 0) : (a.e < b.e ? -1 : a.e > b.e ? 1 : 0)));
assert(gs.map((g) => g.e).join() === '2026-11-12,2026-12-01,2026-11-01,2026-10-20', 'règle de proximité : à venir (le plus proche) puis échus (le plus récent)');

// Serveur : jour futur et passé (goalstoday.tasksToday avec day)
const srv = R('server', 'lib', 'goalstoday.js');
assert(/dayParam/.test(srv) && /today > realToday && t\.dueDate === today/.test(srv), 'serveur : jour futur = tâches prévues ce jour-là, jour passé = ce qui y a été fait');
const tl = R('public', 'js', 'taches-ligne.js');
assert(/dateIn.value !== task.dueDate && dateIn.value < todayD/.test(tl) && /Pas de date dans le passé/.test(tl), 'édition : déplacement vers un jour passé refusé (une tâche déjà passée garde sa date)');
assert(js.indexOf('function rollDay') >= 0 && js.indexOf("visibilitychange', function () { if (!document.hidden) rollDay") >= 0 && js.indexOf('setInterval(rollDay') >= 0, 'minuit / retour au premier plan : bande et jour repeints');
assert(/function expansionAsked\(\) \{\s*if \(state\.busy\) return;\s*if \(dayIso\(\) < localIso\(\)\)/.test(js), 'appui long (Expansion) refusé vers un jour passé');
assert(js.includes('function rollDay') && js.includes("visibilitychange', function () { if (!document.hidden) rollDay") && js.includes('setInterval(rollDay'), 'minuit / retour au premier plan : bande et jour repeints');
const p1 = R('public', 'js', 'objectifs-page1.js'), p3 = R('public', 'js', 'objectifs-page3.js');
assert(p1.includes('TMT.ouvrirCalendrierTaches = function') && p1.includes('TMT.todayView.openCalendar') && js.includes('TMT.showGoalsCalendar') && p3.includes('TMT.showGoalsCalendar = function') && p3.includes('TMT.goalsCalMount'), 'ouverture directe du calendrier des tâches : la vue Tâches (filtre pôle / secteur) monte le calendrier de la page 3 (même nœud, aucune copie)');
assert(p3.includes('TMT.goalsCalGoTo = function') && p3.includes('renderGoalsMonthCal();'), 'le calendrier se positionne sur le mois de la date demandée (TMT.goalsCalGoTo)');
assert(js.includes("nDone + ' / ' + (nDone + nTodo)") && !js.includes("viewDay === 'all' ? String(nTodo)"), 'compteur : toujours « réalisées / total » (jamais le nombre de tâches à faire seul)');
if (failed) { console.log('\nvue-taches-jour-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nvue-taches-jour-test : OK');
