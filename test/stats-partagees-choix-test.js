// Statistiques partagées OPTIONNELLES par activité (choix d'affichage, stocké sur l'appareil, clé propre à l'utilisateur) :
// aucune activée = état vide ; une seule activée = une seule carte ; deux interrupteurs indépendants (Chrono, Tâches).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'stats-avance.js'), 'utf8');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const a = src.indexOf('function chKey()'), b = src.indexOf('var choiceModal');
assert(a > 0 && b > a, 'bloc de choix présent dans stats-avance.js');
const store = {};
const ctx = {
  TMT: { getProfile: () => ({ id: 'u1' }), getActivitiesCache: () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }] },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  JSON,
};
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.shared = sharedActivities;', ctx);
const T = ctx.TMT.sharedStatsChoice;
assert(ctx.shared().length === 0, 'aucune activité activée (par défaut) : liste vide = état vide « Rien n\'est partagé »');
T.set(2, 'chrono', true);
assert(ctx.shared().length === 1 && ctx.shared()[0].id === 2, 'une seule activité activée : une seule carte');
T.set(3, 'tasks', true);
assert(ctx.shared().length === 1 && T.on(3, 'tasks') && !T.on(3, 'chrono'), 'interrupteurs indépendants : « Tâches » sans « Chrono »');
T.set(1, 'chrono', true); T.set(3, 'chrono', true);
assert(ctx.shared().length === 3, 'toutes activées : une carte par activité');
assert(Object.keys(store).length === 1 && Object.keys(store)[0] === 'noesis_shared_stats_v1_u1', 'stocké sur l\'appareil, clé propre à l\'utilisateur');
ctx.localStorage.setItem = () => { throw new Error('quota'); };
let threw = false; try { T.set(1, 'tasks', true); } catch (e) { threw = true; }
assert(!threw, 'stockage indisponible : entouré de try/catch');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert(/id="ssEmpty"[\s\S]*Rien n'est partagé[\s\S]*class="cmpAdd" id="ssChoiceAdd"[\s\S]*Choisir les activités/.test(html), 'état vide : message + bouton pointillé « + Choisir les activités » (composant .cmpAdd)');
if (failed) { console.log('\nstats-partagees-choix-test : ' + failed + ' échec(s)'); process.exit(1); }
console.log('\nstats-partagees-choix-test : OK');
