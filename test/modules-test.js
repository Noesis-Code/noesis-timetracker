// Usage : node test/modules-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-mod-'));
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const M = require('../server/lib/modules');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'Test', '2026-01-01')").run();

let m = M.getModules('u1');
assert(Object.keys(m).every((k) => k === 'offer1' ? !m[k] : m[k]), 'compte existant (NULL) : tout actif sauf offer1');
assert(M.isEnabled('u1', 'core') && M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'offer1') && !M.isEnabled('u1', 'inconnu'), 'isEnabled');
assert(M.getModules('absent') === null, 'profil absent : null');

let r = M.setModules('u1', { roadmap: false });
assert(!r.ok && r.status === 409 && /Calendrier|Assistant IA|Statistiques des tâches/.test(r.error), 'désactiver roadmap refusé (dépendants actifs), message');
r = M.setModules('u1', { calendar: false, ai: false, 'stats-tasks': false, roadmap: false });
assert(r.ok && !M.isEnabled('u1', 'roadmap') && !M.isEnabled('u1', 'calendar'), 'cascade explicite acceptée');
r = M.setModules('u1', { calendar: true });
assert(!r.ok && r.status === 409, 'activer calendar sans roadmap refusé');
r = M.setModules('u1', { roadmap: true, calendar: true });
assert(r.ok && M.isEnabled('u1', 'calendar'), 'réactivation ensemble acceptée');
assert(!M.isEnabled('u1', 'ai') && M.isEnabled('u1', 'stats'), 'persistance : ai reste off, stats on');
assert(db.prepare("SELECT modules FROM users WHERE id='u1'").get().modules.includes('"ai":false'), 'JSON persisté en base');

assert(M.setModules('u1', { core: false }).status === 400, 'core non désactivable');
assert(M.setModules('u1', { offer1: true }).status === 400, 'offer1 non activable');
assert(M.setModules('u1', { zzz: true }).status === 400, 'module inconnu refusé');
assert(M.getModules('u1').profile && M.getModules('u1').community, 'comptes existants : Communauté et Profil actifs');
assert(M.setModules('u1', { community: false, profile: false }).ok && M.isEnabled('u1', 'stats'), 'optionnels indépendants');
assert(M.setModules('u1', { stats: 'oui' }).status === 400, 'valeur non booléenne refusée');
assert(M.setModules('u1', null).status === 400 && M.setModules('u1', []).status === 400, 'corps invalide refusé');
r = M.setModules('u1', { stats: false });
assert(r.ok && !M.isEnabled('u1', 'stats') && M.isEnabled('u1', 'roadmap'), 'ensemble B seul accepté');
r = M.setModules('u1', { calendar: false, ai: false, 'stats-tasks': false, roadmap: false });
assert(!r.ok && r.status === 409 && /ensemble/.test(r.error), 'tout désactiver (A et B) refusé');
assert(M.setModules('u1', { stats: true }).ok && M.setModules('u1', { calendar: false, ai: false, 'stats-tasks': false, roadmap: false }).ok, 'ensemble A seul accepté');
const nd = M.defaults();
assert(nd.stats && nd.roadmap && nd['stats-tasks'] && !nd.community && !nd.profile, 'défaut nouveau compte : A+B actifs, Communauté+Profil inactifs');
assert(M.setModules('absent', { stats: true }).status === 404, 'profil absent : 404');
assert(Array.isArray(M.NEW_ACCOUNT_DEFAULT_MODULES) && M.defaults().core === true && M.defaults().offer1 === false, 'défauts nouveau compte');
process.exit(failed ? 1 : 0);
