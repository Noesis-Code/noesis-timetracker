// Volet Bilan : un volet de la barre (mécanique existante), une seule page de statistiques qui défile (toutes les pages empilées, ni points ni glissement). Usage : node test/bilan-volet-test.js
const fs = require('fs');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const html = rd('public/index.html'), bar = rd('public/js/barre-volets.js'), mod = rd('public/js/modules.js'), app = rd('public/app.js'), sa = rd('public/js/stats-avance.js'), css = rd('public/css/stats-avance.css');
assert(/<button class="tabBtn" data-tab="bilan" aria-label="Bilan">[\s\S]*?<span class="tabLabel">Bilan<\/span>/.test(html) && html.indexOf('data-tab="bilan"') > html.indexOf('data-tab="goals"') && html.indexOf('data-tab="bilan"') < html.indexOf('data-tab="community"'), 'bouton du volet Bilan : même structure que les autres, placé après la Feuille de route');
assert(bar.includes("var ALL = ['chrono', 'goals', 'bilan', 'horaire', 'community', 'trade'];") && bar.includes("var d = ['chrono', 'goals', 'bilan', 'horaire', 'community'];") && bar.includes("key() + ':bilan'"), 'barre des volets : ordre, ajout et retrait comme les autres ; par défaut après la Feuille de route ; une seule fois pour les comptes existants');
assert(mod.includes("if (tab === 'bilan') return on('stats') || on('stats-tasks');"), 'modules : le volet existe tant que les statistiques sont actives');
assert(app.includes("var bilan = tab === 'bilan'; if (bilan) tab = 'stats';") && app.includes('TMT.bilanShow()') && app.includes('TMT.bilanHide()') && app.includes("var barTab = bilan ? 'bilan'"), 'app : le volet Bilan affiche la page de statistiques et allume sa propre icône');
assert(sa.includes('TMT.bilanShow = function') && sa.includes("pages.classList.add('bilanStack')") && sa.includes('if (bilanOn) return null; /* Bilan : une seule page, aucun point */') && /neighbor: function \(dir\) \{\n      if \(bilanOn\) return null;/.test(sa), 'Bilan : toutes les pages empilées, aucun point, aucun glissement entre elles');
assert(css.includes('#statsPages.bilanStack { display: block; }'), 'une seule colonne qui défile');
// garde : aucune ligne dont un commentaire // avale du code ajouté
assert(!/\/\/[^\n]*(bilanShow|bilanHide|bilanOn)/.test(app + sa), 'GARDE : aucun commentaire // ne coupe une ligne du mode Bilan');
console.log(failed ? '\n' + failed + ' échec(s)' : 'bilan-volet-test OK'); process.exit(failed ? 1 : 0);
