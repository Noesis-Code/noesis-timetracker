// Tri du Bilan (14 nov. 2026) : ne reste que ce qui est demandé ; le reste est retiré de l'INTERFACE (données et routes gardées). Usage : node test/bilan-tri-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sa = rd('public/js/stats-avance.js'), grp = rd('public/js/activite-stats-taches.js'), css = rd('public/css/stats-avance.css');
const keys = (sa.match(/\n      \{ key: '([a-zA-Z]+)'/g) || []).map((x) => x.replace(/[^a-zA-Z]|key/g, '').replace(/^\{/, ''));
assert(JSON.stringify(keys) === JSON.stringify(['weekdays', 'capacity', 'advance']), 'cartes restantes : Jours où tu travailles vraiment, Capacité par jour, Avancement (' + keys.join(', ') + ')');
['Répartition', 'Durée estimée contre durée réelle', 'Charge restante par pôle', 'Tâches reportées plusieurs fois', 'Urgence et échéances', 'Temps cible contre temps fait', 'Où ça glisse'].forEach((t) => assert(!sa.includes("title: '" + t + "'"), 'retirée de l’écran : « ' + t + ' »'));
assert(!/title: 'Capacité',/.test(sa) && !sa.includes('capacityAlert') && !sa.includes('openObjSheet') && !sa.includes('openSheet') && !sa.includes('splitBody') && !sa.includes('openGlisse') && !sa.includes('Charge restante par secteur') && !sa.includes('Temps cible contre temps fait par secteur'), 'jauge « Capacité », alerte, anneau Répartition, feuilles « Charge restante » / « Temps cible » et « Où ça glisse » : code retiré (données serveur gardées)');
assert(!grp.includes("'Qui fait quoi'") || !grp.includes("cardHead(chartCard, 'Qui fait quoi'"), '« Qui fait quoi » retiré du groupe') ;
assert(!grp.includes("el('p', 'shrDoneTitle', tr('Tâches faites'))"), 'ancien nombre « Tâches faites » du groupe retiré');
assert(!grp.includes("el('button', 'shrOpen', tr('Partager les tâches'))"), '« Partager les tâches » retiré du Bilan');
assert(grp.includes("cardHead(card, 'Tâches récurrentes'"), '« Tâches récurrentes » du groupe reste (proposé dans « Ajouter une information »)');
assert(!/sharedEl|openShared|statsAvancePage/.test(sa), 'Bilan : plus de page empilée (partagées, Tâches | Objectifs, Groupe) : seuls les 3 tableaux Chrono d’office');
assert(!/statsVis/.test(css + rd('public/index.html') + rd('public/app.js')), 'plus de filtre Tous / Public / Confidentiel (interface et code ; les données restent)');
assert(sa.includes("var fixed = []; /* profil visité") && !sa.includes("put(byKey('onTime')"), 'profil visité : plus de cartes fixes retirées');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-tri-test OK'); process.exit(failed ? 1 : 0);
