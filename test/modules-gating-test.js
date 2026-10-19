// Usage : node test/modules-gating-test.js — masquage côté serveur des modules désactivés (403, push filtré, crons sautés, tout actif inchangé).
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-gate-'));
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
process.env.NOESIS_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.NOESIS_VAPID_PRIVATE_KEY = keys.privateKey;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const M = require('../server/lib/modules');
const G = require('../server/lib/modulegate');
const sent = [];
webpush.sendNotification = (sub) => { sent.push(sub.endpoint); return Promise.resolve(); };
const push = require('../server/lib/push');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'Test', '2026-01-01')").run();
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u2', 'Autre', '2026-01-01')").run();
for (const u of ['u1', 'u2']) db.prepare("INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, createdAt) VALUES (?, ?, 'p', 'a', '2026')").run(u, 'ep-' + u);

function call(userId, urlPath) {
  const req = { userId, path: urlPath };
  let status = 200, body = null, passed = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  G.moduleGate(req, res, () => { passed = true; });
  return { status, body, passed };
}
const ROUTES = {
  roadmap: ['/api/activities/1/goals/all', '/api/goals/capture', '/api/activities/1/goals/categories/p1/tasks', '/api/activities/1/goals/categories/auto-task'],
  'stats-tasks': ['/api/stats/activity-progress'],
  stats: ['/api/stats/timesheet', '/api/category-stats', '/api/category-chart'],
  calendar: ['/api/calendar/feed', '/api/activities/1/goals-days'],
  ai: ['/api/drive/status', '/api/ai-tokens'],
  sharing: ['/api/invites', '/api/community/activity-messages'],
  community: ['/api/community', '/api/follows/following', '/api/polls', '/api/users/search'],
  profile: ['/api/profile/posts', '/api/profile/projects'],
};
const ALWAYS_OPEN = ['/api/stats', '/api/stats/today', '/api/timer/start', '/api/activities', '/api/profile/u1', '/api/activities/1/goals/categories', '/api/activities/1/goals/categories/p1/secteurs', '/api/activities/1/goals/categories-reorder', '/api/calendar/abc.ics', '/api/push/status'];

console.log('Tout actif : aucune route bloquée');
let all = true;
for (const mod of Object.keys(ROUTES)) for (const p of ROUTES[mod]) if (!call('u1', p).passed) all = false;
assert(all, 'comptes existants : toutes les routes passent');
assert(call(null, '/api/goals/capture').passed, 'non connecté : laissé aux routes (401 habituel)');

console.log('Module désactivé : 403 clair');
M.setModules('u1', { community: false, profile: false, sharing: false, calendar: false, ai: false, 'stats-tasks': false, roadmap: false });
for (const mod of ['roadmap', 'stats-tasks', 'calendar', 'ai', 'sharing', 'community', 'profile']) for (const p of ROUTES[mod]) {
  const r = call('u1', p);
  assert(!r.passed && r.status === 403 && r.body.code === 'module_off' && r.body.module === mod && /désactivé/.test(r.body.error), p + ' -> 403 ' + mod);
}
for (const p of ALWAYS_OPEN.concat(ROUTES.stats)) assert(call('u1', p).passed, p + ' reste ouvert (noyau ou stats actif)');
assert(call('u2', '/api/goals/capture').passed, 'autre utilisateur non touché');
M.setModules('u1', { stats: false, roadmap: true });
for (const p of ROUTES.stats) assert(call('u1', p).status === 403, p + ' -> 403 stats');
assert(call('u1', '/api/stats/today').passed && call('u1', '/api/stats').passed, 'Chrono (stats/today, stats) jamais masqué');
assert(call('u1', '/api/activities/1/goals/categories').passed && call('u1', '/api/activities/1/goals/all').passed, 'catégories (noyau) + goals ouverts avec roadmap actif');
M.setModules('u1', { ai: false });
assert(call('u1', '/api/activities/1/goals/rewrite').body.module === 'ai', 'IA désactivée : réécriture IA bloquée alors que roadmap actif');
assert(call('u1', '/api/activities/1/goals/all').passed, 'IA désactivée : roadmap non bloqué');

console.log('Push filtré');
M.setModules('u1', { stats: true, roadmap: true, ai: true, sharing: true, community: true, notifications: true });
const flush = () => new Promise((r) => setTimeout(r, 20));
(async () => {
  sent.length = 0; push.sendToUsers(['u1', 'u2'], { title: 't', module: 'roadmap' }); await flush();
  assert(sent.length === 2, 'tout actif : 2 envois');
  M.setModules('u1', { calendar: false, ai: false, 'stats-tasks': false, roadmap: false });
  sent.length = 0; push.sendToUsers(['u1', 'u2'], { title: 't', module: 'roadmap' }); await flush();
  assert(sent.length === 1 && sent[0] === 'ep-u2', 'module roadmap off : seul u2 reçoit');
  sent.length = 0; push.sendToUsers(['u1'], { title: 't' }); await flush();
  assert(sent.length === 1, 'notification sans module : reçue');
  M.setModules('u1', { notifications: false });
  sent.length = 0; push.sendToUsers(['u1', 'u2'], { title: 't' }); await flush();
  assert(sent.length === 1 && sent[0] === 'ep-u2', 'notifications off : rien pour u1');

  console.log('Crons sautés');
  const dsc = require('../server/lib/dailysuggestioncron');
  const gdp = require('../server/lib/goalsdailypriority');
  const aid = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'u1', '2026')").run().lastInsertRowid;
  for (const u of ['u1', 'u2']) db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#fff', '2026')").run(aid, u);
  let calls = [];
  gdp.mostUrgentTaskForUser = (u) => { calls.push(u); return { activityId: aid, taskId: 1 }; };
  M.setModules('u1', { notifications: true });
  assert(dsc.runDailySuggestionSweep() === 1 && calls.join() === 'u2', 'suggestion quotidienne : u1 (roadmap off) sauté sans aucun calcul');
  M.setModules('u1', { roadmap: true, calendar: true, ai: true, 'stats-tasks': true });
  calls = [];
  assert(dsc.runDailySuggestionSweep() === 2, 'tout actif : les deux traités');
  M.setModules('u1', { calendar: false, ai: false, 'stats-tasks': false, roadmap: false });
  const goals = require('../server/lib/goals');
  const res = goals.runGoalsSweepAll();
  assert(res && res.posted === 0, 'balayage objectifs exécutable (propriétaire roadmap off : sauté)');
  const dsDrive = require('../server/lib/drivesync');
  assert(typeof dsDrive.runSweep === 'function', 'drivesync chargé');

  console.log('MCP');
  const mcpSrc = fs.readFileSync(path.join(__dirname, '../server/routes/mcp.js'), 'utf8');
  assert(/isEnabled\(auth\.userId, 'ai'\)/.test(mcpSrc) && /toolOn\(userId, n\)/.test(mcpSrc), 'MCP : garde ai + outils filtrés par module');

  console.log(failed ? `\n${failed} échec(s)` : '\nTout passe');
  process.exit(failed ? 1 : 0);
})();
