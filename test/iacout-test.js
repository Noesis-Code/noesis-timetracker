// Tests des économies de coût IA (surveillance Drive, 17 oct. 2026) : Google et Anthropic simulés. Usage : node test/iacout-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-iacout-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const { grantAccess } = require('../server/lib/offer1access');
const drive = require('../server/lib/drive');
const ds = require('../server/lib/drivesync');
const dt = require('../server/lib/documenttasks');
const cp = require('../server/lib/changeproposals');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const classify = require('../server/lib/goalstaskclassify');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own','own',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
grantAccess('own', 'code');
goals.addCategory(act, 'Production');
const KEY = classify.buildClassificationCandidates(act)[0].key;
const today = new Date().toISOString().slice(0, 10);
const openTask = goalstasks.addCategoryTask(act, 'own', KEY, 'Rédiger le plan', { dueDate: goals.addDays(today, 3) });

const docs = { 'f1-aaaaa': { text: 'Appeler Paul\nEnvoyer devis', mt: '2026-10-01T00:00:00Z', parents: ['fold-1111'] } };
const mockFetch = async (url, opt) => {
  const u = new URL(url);
  const json = (o, ok = true, st = 200) => ({ ok, status: st, json: async () => o, arrayBuffer: async () => Buffer.from('') });
  if (u.pathname === '/token') { const b = new URLSearchParams(opt.body);
    return b.get('grant_type') === 'authorization_code' ? json({ refresh_token: 'R', access_token: 'at' }) : json({ access_token: 'at' }); }
  const m = u.pathname.match(/\/drive\/v3\/files(?:\/([^/]+)(\/export)?)?$/);
  if (m && !m[1]) {
    if (u.searchParams.get('q').startsWith('mimeType =')) return json({ files: [] });
    const qf = (u.searchParams.get('q').match(/'([^']+)' in parents/) || [])[1];
    return json({ files: Object.keys(docs).filter((id) => docs[id].parents.includes(qf)).map((id) => ({ id, name: id, mimeType: 'application/vnd.google-apps.document', modifiedTime: docs[id].mt })) });
  }
  if (m && m[2]) return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(docs[m[1]].text) };
  if (m && m[1] === 'fold-1111') return json({ id: 'fold-1111', name: 'Projet', mimeType: 'application/vnd.google-apps.folder' });
  if (m && docs[m[1]]) return json({ id: m[1], name: m[1], mimeType: 'application/vnd.google-apps.document', parents: docs[m[1]].parents });
  return json({}, false, 404);
};
drive.setFetch(mockFetch);
const touch = (id, text) => { docs[id].text = text; docs[id].mt = new Date(Date.parse(docs[id].mt) + 86400000).toISOString(); };

(async () => {
  const st = drive.makeState('own', act);
  await drive.handleCallback('own', { state: st, code: 'c' });
  await drive.chooseFolder('own', act, 'fold-1111');

  // ---- Option 7 : pas d'appel « modifications proposées » à la première lecture ----
  let tasksCalls = 0, changeCalls = 0;
  dt.setCaller(async () => { tasksCalls++; return JSON.stringify({ tasks: [{ title: 'Appeler Paul', key: KEY, week: null, minutes: 30 }] }); });
  cp.setCaller(async () => { changeCalls++; return JSON.stringify({ changes: [] }); });
  await ds.syncConnection('own', act);
  assert(tasksCalls === 1 && changeCalls === 0, 'option 7 : première lecture = 1 appel tâches, aucun appel modifications proposées');
  touch('f1-aaaaa', 'Appeler Paul\nEnvoyer devis\nRelancer');
  await ds.syncConnection('own', act);
  assert(tasksCalls === 2 && changeCalls === 1, 'option 7 : fichier modifié = appel tâches + appel modifications proposées');

  // ---- Option 2 : cache de prompt + coût ----
  const ab = require('../server/lib/aibudget');
  const sonnet = 'claude-sonnet-4-5';
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 1e6 }) - 3) < 1e-9, 'coût : entrée normale ×1');
  assert(Math.abs(ab.computeCost(sonnet, { cache_read_input_tokens: 1e6 }) - 0.3) < 1e-9, 'coût : lecture de cache ×0,1');
  assert(Math.abs(ab.computeCost(sonnet, { cache_creation_input_tokens: 1e6 }) - 3.75) < 1e-9, 'coût : création de cache ×1,25');
  assert(Math.abs(ab.computeCost(sonnet, { input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 2000, output_tokens: 500 }) - (0.003 + 0.0027 + 0.0075 + 0.0075)) < 1e-9, 'coût : mélange entrée/cache/sortie');
  ab.record('own', sonnet, { input_tokens: 1000, cache_read_input_tokens: 9000 }, 'test-cache');
  const lg = db.prepare("SELECT inputTokens, costUsd FROM ai_usage_log WHERE feature = 'test-cache'").get();
  assert(lg.inputTokens === 10000 && Math.abs(lg.costUsd - (0.003 + 0.0027)) < 1e-9, 'record : jetons totaux et coût avec cache');
  dt.setCaller(null); cp.setCaller(null);
  process.env.ANTHROPIC_API_KEY = 'k';
  const bodies = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return realFetch(url, init);
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: sonnet, content: [{ type: 'text', text: '{"tasks":[]}' }], usage: { input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 5 } }) };
  };
  await ab.runAs('own', () => dt.propose('own', act, { instruction: 'Extrais', files: [{ fileName: 'a.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Appeler Paul demain matin').toString('base64') }] }, { skipRate: true, skipChanges: true }));
  const b0 = bodies[0];
  assert(Array.isArray(b0.system) && b0.system[0].cache_control && b0.system[0].cache_control.type === 'ephemeral', 'cache : system en blocs avec cache_control');
  const uc = b0.messages[0].content;
  assert(uc.length === 2 && uc[0].cache_control && !uc[1].cache_control, 'cache : message user = bloc stable (cache_control) + bloc variable');
  assert(/<application>/.test(uc[0].text) && !/<document>/.test(uc[0].text) && /<consigne>/.test(uc[1].text) && /Appeler Paul/.test(uc[1].text), 'cache : stable = catégories/application ; variable = consigne + document');
  await ab.runAs('own', () => dt.propose('own', act, { instruction: 'Autre consigne', files: [{ fileName: 'a.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Autre texte tout à fait différent').toString('base64') }] }, { skipRate: true, skipChanges: true }));
  assert(bodies[1].messages[0].content[0].text === uc[0].text && JSON.stringify(bodies[1].system) === JSON.stringify(b0.system), 'cache : préfixe identique d\'un document à l\'autre');
  const ac = require('../server/lib/aicache');
  assert(ac.cacheable('x'.repeat(4200), 'y'.repeat(100)) && !ac.cacheable('x', 'y'), 'cache : estimation du minimum de 1024 jetons');
  global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY;

  // ---- Option 4 : sortie compacte ----
  const ctxT = { candidates: classify.buildClassificationCandidates(act), weeks: [goals.mostRecentMonday(today), goals.addDays(goals.mostRecentMonday(today), 7)] };
  const wk1 = ctxT.weeks[1];
  const pc = dt.parseDetailed('{"t":[["Appeler Paul","' + KEY + '","' + wk1 + '",30],["Envoyer devis","' + KEY + '",null,null],["Appeler Paul","' + KEY + '",null,10],["Cle inconnue","zzz","2026-02-31",2]]}', ctxT);
  assert(pc.tasks.length === 3 && pc.dropped.doublon === 1 && pc.tasks[0].week === wk1 && pc.tasks[0].minutes === 30 && pc.tasks[1].week === null && pc.tasks[1].minutes === null, 'compact : titre/clé/semaine/durée lus, doublon écarté');
  assert(pc.tasks[2].toChoose === true && pc.tasks[2].week === null && pc.tasks[2].minutes === null, 'compact : clé inconnue à choisir, date et durée invalides revalidées');
  const po = dt.parseDetailed(JSON.stringify({ tasks: [{ title: 'Ancien', key: KEY, week: wk1, minutes: 20 }] }), ctxT);
  assert(po.tasks.length === 1 && po.tasks[0].title === 'Ancien' && po.tasks[0].minutes === 20, 'ancien format {"tasks":[{…}]} toujours accepté');
  const pt = dt.parseDetailed('{"t":[["A","' + KEY + '",null,10],["B","' + KEY + '",null,15],["C coup', ctxT);
  assert(pt.tasks.length === 2 && pt.repaired, 'compact : réponse tronquée réparée (éléments complets gardés)');
  const vTask = openTask.id;
  const cctx = cp.buildContext('own', act);
  const nd = goals.addDays(today, 6);
  const vc = cp.validate('{"c":[["t",' + vTask + ',"date","' + nd + '","Trop chargé"],["x",1,"date","' + nd + '","?"],["t",' + vTask + ',"text","Rédiger le plan détaillé","Précision"]]}', cctx);
  assert(vc.length === 2 && vc[0].field === 'date' && vc[0].before && vc[1].after === 'Rédiger le plan détaillé', 'changements compacts : lus et revalidés (avant relu en base)');
  const vo = cp.validate(JSON.stringify({ changes: [{ target: 'task', id: vTask, field: 'date', after: nd, reason: 'x' }] }), cctx);
  assert(vo.length === 1, 'ancien format {"changes":[…]} toujours accepté');

  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
