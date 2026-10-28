// Usage : node test/modules-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-mod-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const M = require('../server/lib/modules');
db.prepare("INSERT INTO users (id, name, createdAt, accountType) VALUES ('u1', 'Test', '2026-01-01', 'entreprise')").run(); // Horaire : comptes entreprise seulement

let m = M.getModules('u1');
assert(Object.keys(m).every((k) => (k === 'offer1' || k === 'trade' || k === 'horaire') ? !m[k] : m[k]), 'compte existant (NULL) : tout actif sauf offer1, trade et horaire');
assert(M.isEnabled('u1', 'core') && M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'offer1') && !M.isEnabled('u1', 'inconnu'), 'isEnabled');
assert(M.getModules('absent') === null, 'profil absent : null');

let r = M.setModules('u1', { roadmap: false });
assert(r.ok && !M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'calendar') && !M.isEnabled('u1', 'ai') && !M.isEnabled('u1', 'stats-tasks'), 'désactiver roadmap coupe ses dépendants (aucune erreur)');
r = M.setModules('u1', { roadmap: true });
assert(r.ok && M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'calendar'), 'réactiver roadmap seul');
r = M.setModules('u1', { calendar: true, ai: true, 'stats-tasks': true });
assert(r.ok && M.isEnabled('u1', 'calendar') && M.isEnabled('u1', 'ai'), 'rétablit les dépendants');
r = M.setModules('u1', { calendar: false, ai: false, 'stats-tasks': false, roadmap: false });
assert(r.ok && !M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'calendar'), 'cascade explicite acceptée');
r = M.setModules('u1', { calendar: true });
assert(r.ok && M.isEnabled('u1', 'roadmap') && M.isEnabled('u1', 'calendar'), 'activer calendar sans roadmap active roadmap automatiquement');
db.prepare("UPDATE users SET modules = ? WHERE id = 'u1'").run(JSON.stringify({ roadmap: false, calendar: true, ai: true, stats: true }));
r = M.setModules('u1', { community: true });
assert(r.ok && !M.isEnabled('u1', 'calendar') && !M.isEnabled('u1', 'ai'), 'état hérité incohérent : réparé sans erreur');
r = M.setModules('u1', { ai: true });
assert(r.ok && M.isEnabled('u1', 'ai') && M.isEnabled('u1', 'roadmap'), 'activer ai depuis un état partiel : roadmap suit');
db.prepare("UPDATE users SET modules = NULL WHERE id = 'u1'").run();
assert(M.setModules('u1', { stats: false }).ok && M.setModules('u1', { stats: true }).ok && M.setModules('u1', { roadmap: false, 'stats-tasks': false, calendar: false, ai: false }).ok && M.isEnabled('u1', 'stats'), 'état NULL : bascules des deux ensembles sans erreur');
r = M.setModules('u1', { roadmap: true, calendar: true });
assert(r.ok && M.isEnabled('u1', 'calendar'), 'réactivation ensemble acceptée');
assert(!M.isEnabled('u1', 'ai') && M.isEnabled('u1', 'stats'), 'persistance : ai reste off, stats on');
assert(db.prepare("SELECT modules FROM users WHERE id='u1'").get().modules.includes('"ai":false'), 'JSON persisté en base');

assert(M.setModules('u1', { core: false }).status === 400, 'core non désactivable');
assert(M.setModules('u1', { offer1: true }).status === 400, 'offer1 non activable');
assert(M.setModules('u1', { zzz: true }).status === 400, 'module inconnu refusé');
assert(M.getModules('u1').profile && M.getModules('u1').community, 'comptes existants : Communauté et Profil actifs');
assert(M.setModules('u1', { community: false }).ok && !M.isEnabled('u1', 'profile') && !M.isEnabled('u1', 'community') && M.isEnabled('u1', 'stats'), 'Communauté et Profil liés (off)');
assert(M.setModules('u1', { profile: true }).ok && M.isEnabled('u1', 'community'), 'Communauté et Profil liés (on)');
db.prepare("UPDATE users SET modules = ? WHERE id = 'u1'").run(JSON.stringify({ community: true, profile: false }));
assert(M.getModules('u1').community === false && M.getModules('u1').profile === false, 'normalisation à la lecture d\'un état dépareillé');
M.setModules('u1', { community: false });
assert(M.setModules('u1', { stats: 'oui' }).status === 400, 'valeur non booléenne refusée');
assert(M.setModules('u1', null).status === 400 && M.setModules('u1', []).status === 400, 'corps invalide refusé');
r = M.setModules('u1', { stats: false });
assert(r.ok && !M.isEnabled('u1', 'stats') && M.isEnabled('u1', 'roadmap'), 'ensemble B seul accepté');
// Au moins un des trois (Chrono, Feuille de route, Horaire) reste actif (26 oct. 2026) : couper le dernier est refusé, rien n'est rallumé en douce.
assert(!M.isEnabled('u1', 'horaire'), 'horaire : inactif pour un compte existant');
r = M.setModules('u1', { roadmap: false, 'stats-tasks': false, calendar: false, ai: false });
assert(!r.ok && r.status === 409 && /Horaire/.test(r.error) && M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'stats'), 'au moins un des trois : couper le dernier (Feuille de route) refusé, état inchangé');
assert(M.setModules('u1', { horaire: true }).ok && M.setModules('u1', { roadmap: false, 'stats-tasks': false, calendar: false, ai: false }).ok && M.isEnabled('u1', 'horaire') && !M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'stats'), 'Horaire seul accepté');
r = M.setModules('u1', { horaire: false });
assert(!r.ok && r.status === 409 && M.isEnabled('u1', 'horaire'), 'au moins un des trois : couper Horaire seul restant refusé');
r = M.setModules('u1', { stats: false, roadmap: false, horaire: false });
assert(!r.ok && r.status === 409 && /ensemble/.test(r.error), 'tout désactiver (Chrono, Feuille de route, Horaire) dans un même envoi refusé');
assert(M.setModules('u1', { stats: true, horaire: false }).ok && M.isEnabled('u1', 'stats') && !M.isEnabled('u1', 'horaire'), 'ensemble A seul accepté');
assert(M.validate({ stats: false, roadmap: false, horaire: true }).ok && !M.validate({ stats: false, roadmap: false, horaire: false }).ok, 'validate : au moins un des trois');
const nd = M.defaults();
assert(nd.stats && nd.roadmap && nd['stats-tasks'] && !nd.horaire && !nd.community && !nd.profile, 'défaut nouveau compte : A+B actifs, Horaire, Communauté+Profil inactifs');
assert(M.setModules('absent', { stats: true }).status === 404, 'profil absent : 404');
assert(Array.isArray(M.NEW_ACCOUNT_DEFAULT_MODULES) && M.defaults().core === true && M.defaults().offer1 === false, 'défauts nouveau compte');
// Bug « Feuille de route vide / Stats : Aucune activité » : une valeur stockée sans aucun ensemble actif (ancienne version) = tout rallumé, jamais 403.
for (const raw of ['{}', '[]', 'null', 'garbage', JSON.stringify({ roadmap: false, stats: false }), JSON.stringify({ roadmap: false, stats: false, calendar: false, ai: false, 'stats-tasks': false })]) {
  db.prepare("UPDATE users SET modules = ? WHERE id = 'u1'").run(raw);
  const g = M.getModules('u1');
  assert(g.stats && g.roadmap && g['stats-tasks'] && g.calendar && g.ai && M.isEnabled('u1', 'roadmap') && M.isEnabled('u1', 'stats'), 'repli « tout actif » pour la valeur stockée ' + raw);
}
db.prepare("UPDATE users SET modules = ? WHERE id = 'u1'").run(JSON.stringify({ roadmap: false }));
assert(M.getModules('u1').stats && !M.getModules('u1').roadmap, 'un seul ensemble coupé volontairement reste coupé');
// Trade Tracker : off par défaut, réservé à TRADE_ALLOWED_USER_IDS (vide = personne).
delete process.env.TRADE_ALLOWED_USER_IDS;
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('t1', 'Trader', '2026-01-01')").run();
assert(M.getModules('u1').trade === false && M.defaults().trade === false && !M.isEnabled('t1', 'trade'), 'trade : désactivé par défaut (comptes existants et nouveaux)');
assert(M.setModules('t1', { trade: true }).status === 403 && !M.isEnabled('t1', 'trade'), 'trade : variable vide = personne, activation refusée (403)');
assert(!M.list('t1').some((x) => x.id === 'trade'), 'trade : non listé pour un id non autorisé');
process.env.TRADE_ALLOWED_USER_IDS = ' t1 , autre ';
assert(M.list('t1').some((x) => x.id === 'trade' && x.toggleable) && !M.list('u1').some((x) => x.id === 'trade'), 'trade : listé seulement pour les ids autorisés');
assert(M.setModules('u1', { trade: true }).status === 403, 'trade : id non listé refusé');
assert(M.setModules('t1', { trade: true }).ok && M.isEnabled('t1', 'trade'), 'trade : id autorisé peut l\'activer');
assert(M.getModules('t1').stats === true && M.getModules('t1').roadmap === true, 'trade : les autres modules sont inchangés');
delete process.env.TRADE_ALLOWED_USER_IDS;
assert(!M.isEnabled('t1', 'trade'), 'trade : retiré de la variable = inactif même si la colonne dit vrai');
assert(M.setModules('t1', { trade: false }).ok, 'trade : désactivation toujours permise');
process.exit(failed ? 1 : 0);
