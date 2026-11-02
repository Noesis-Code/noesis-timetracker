// Communautés de démonstration sur staging : créées, idempotentes, jamais en production. Usage : node test/communautes-demo-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-cdemo-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
require('../server/lib/seed-staging').seedStagingData(db);
const demo = require('../server/lib/communities-demo-staging');
const communities = require('../server/lib/communities');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed += 1; console.log('  FAIL ' + l); } }

const n1 = demo.seedCommunitiesDemoOnStaging();
const count = () => db.prepare('SELECT COUNT(*) AS n FROM communities').get().n;
assert(n1 === demo.DEMO.length && count() === demo.DEMO.length, 'staging : ' + demo.DEMO.length + ' communautés créées');
const members1 = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
demo.seedCommunitiesDemoOnStaging();
assert(count() === demo.DEMO.length, 'relancé : pas de doublon de communauté');
assert(db.prepare('SELECT COUNT(*) AS n FROM users').get().n === members1, 'relancé : pas de doublon de membre');
const emilien = db.prepare("SELECT id FROM users WHERE name = 'Emilien'").get().id;
const net = communities.network(emilien);
assert(net.groups.length === demo.DEMO.length && net.links.length > 10, 'réseau : communautés reliées par des membres en commun');
assert(net.groups.some((g) => g.sector === '') && new Set(net.groups.map((g) => g.owner.id)).size >= 5, 'réseau : une communauté sans secteur, au moins 5 propriétaires');
assert(net.groups.filter((g) => g.joined).length === 6, 'Emilien : sa communauté + 5 rejointes');
const joined = net.groups.find((g) => g.name === 'Productivité');
const graph = communities.membersGraph(emilien, joined.id);
assert(graph && graph.members.length > 5 && graph.members.some((m) => m.others === null), 'schéma des membres : certains membres cachent leurs communautés');
process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
assert(demo.seedCommunitiesDemoOnStaging() === null, 'production : rien n\'est créé');
console.log(failed ? failed + ' ECHEC(S)' : 'OK');
process.exit(failed ? 1 : 0);
