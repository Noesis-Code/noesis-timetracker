// Tests : serveur MCP lecture seule + jetons. Usage : node test/mcp-test.js
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-mcp-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
// Port libre demandé au système (un port tiré au hasard pouvait tomber sur le serveur d'un autre test parallèle : 401 au lieu de 200).
process.env.PORT = require('child_process').execFileSync(process.execPath, ['-e', "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})"]).toString().trim();
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const aitokens = require('../server/lib/aitokens');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');

['A', 'B'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?,?,datetime('now'))").run(u, u));
const actA = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('ProjetA','A','')").run().lastInsertRowid;
const actB = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('ProjetB-secret','B','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actA, 'A');
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actB, 'B');
goals.addCategory(actA, 'Production'); goals.addCategory(actB, 'Production');
const poleA = goals.categoriesForActivity(actA)[0].key;
goalstasks.addCategoryTask(actA, 'A', poleA, 'Tâche visible de A');
goalstasks.addCategoryTask(actB, 'B', goals.categoriesForActivity(actB)[0].key, 'Tâche secrète de B');

const tA = aitokens.createToken('A', 'test');
const tB = aitokens.createToken('B', 'test');
assert(db.prepare('SELECT COUNT(*) n FROM ai_tokens WHERE tokenHash = ? OR tokenHash = ?').get(tA.token, tB.token).n === 0, 'jeton jamais en clair (hash seulement)');
assert(db.prepare('SELECT COUNT(*) n FROM ai_tokens WHERE tokenHash = ?').get(aitokens.hash(tA.token)).n === 1, 'empreinte SHA-256 stockée');

const app = require('../server/index.js');
// Attente du serveur lui-même (pas d'un délai fixe) : prêt quand /healthz répond.
const waitReady = async () => {
  for (let i = 0; i < 200; i++) {
    const ok = await new Promise((r) => { const q = http.get({ port: process.env.PORT, host: 'localhost', path: '/healthz' }, (res) => { res.resume(); r(res.statusCode === 200); }); q.on('error', () => r(false)); });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
};
(async () => {
  await waitReady();
  const logs = [];
  ['log', 'error', 'warn'].forEach((k) => { const o = console[k]; console[k] = (...a) => { logs.push(a.join(' ')); o.apply(console, a); }; });
  const callUrl = (token, body) => callPath('/mcp/t/' + token, null, body);
  const call = (token, body) => callPath('/mcp', token, body);
  const callPath = (urlPath, token, body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const r = http.request({ port: process.env.PORT, host: 'localhost', path: urlPath, method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Forwarded-Proto': 'https' }, token ? { Authorization: 'Bearer ' + token } : {}) }, (res) => {
      let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b ? JSON.parse(b) : null }));
    });
    r.on('error', reject); r.end(data);
  });
  const rpc = (method, params, id) => ({ jsonrpc: '2.0', id: id === undefined ? 1 : id, method, params });
  try {
    assert((await call(null, rpc('ping'))).status === 401, 'sans jeton = 401');
    assert((await call('tmt_faux', rpc('ping'))).status === 401, 'jeton invalide = 401');
    { const pr = await call(tA.token, rpc('ping')); assert(pr.status === 200, 'jeton valide = 200 (reçu ' + pr.status + ' ' + JSON.stringify(pr.body) + ')'); }
    const init = await call(tA.token, rpc('initialize', {}));
    assert(init.body.result && init.body.result.capabilities.tools, 'initialize annonce les outils');
    assert((await call(tA.token, { jsonrpc: '2.0', method: 'notifications/initialized' })).status === 202, 'notification = 202');
    const list = await call(tA.token, rpc('tools/list'));
    const names = list.body.result.tools.map((t) => t.name);
    assert(['lister_activites', 'lister_taches', 'objectifs', 'plan_du_jour_donnees'].every((n) => names.includes(n)), '4 outils exposés');
    assert(list.body.result.tools.every((t) => t.annotations.readOnlyHint), 'tous en lecture seule');
    const acts = JSON.parse((await call(tA.token, rpc('tools/call', { name: 'lister_activites', arguments: {} }))).body.result.content[0].text);
    assert(acts.length === 1 && acts[0].nom === 'ProjetA', 'activités : seulement celles de A');
    const own = JSON.parse((await call(tA.token, rpc('tools/call', { name: 'lister_taches', arguments: { activityId: Number(actA) } }))).body.result.content[0].text);
    assert(own.taches.length === 1 && own.taches[0].tache === 'Tâche visible de A', 'tâches de A renvoyées');
    const other = (await call(tA.token, rpc('tools/call', { name: 'lister_taches', arguments: { activityId: Number(actB) } }))).body.result;
    assert(other.isError && !JSON.stringify(other).includes('secrète'), "activité d'un autre : refusée, rien de divulgué");
    const plan = (await call(tA.token, rpc('tools/call', { name: 'plan_du_jour_donnees', arguments: { activityId: Number(actA) } }))).body.result;
    assert(!plan.isError && JSON.parse(plan.content[0].text).du_jour.length === 1, 'plan du jour : données');
    const obj = (await call(tA.token, rpc('tools/call', { name: 'objectifs', arguments: { activityId: Number(actA), horizon: 'hebdomadaire' } }))).body.result;
    assert(!obj.isError, 'objectifs hebdomadaires lisibles');
    const before = db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n;
    const w = await call(tA.token, rpc('tools/call', { name: 'ajouter_tache', arguments: { activityId: Number(actA), label: 'x' } }));
    assert(w.body.error && db.prepare('SELECT COUNT(*) n FROM sub_project_items').get().n === before, 'aucun outil d\'écriture');
    // portée d'écriture opt-in
    const tW = aitokens.createToken('A', 'ecriture', true);
    const task = goalstasks.allTasksWithGroup(actA)[0];
    const names0 = (await call(tA.token, rpc('tools/list'))).body.result.tools.map((t) => t.name);
    assert(!names0.includes('notifier'), 'sans portée : outils d\'écriture non listés');
    for (const n of ['marquer_tache_faite', 'ajouter_tache_note', 'notifier']) {
      assert((await call(tA.token, rpc('tools/call', { name: n, arguments: { taskId: task.id, activityId: Number(actA), type: 'recap', texte: 'x', message: 'x' } }))).status === 403, 'sans portée : ' + n + ' = 403');
    }
    const namesW = (await call(tW.token, rpc('tools/list'))).body.result.tools.map((t) => t.name);
    assert(namesW.includes('notifier') && namesW.length === 15, 'avec portée : 15 outils');
    const wcall = async (name, args) => (await call(tW.token, rpc('tools/call', { name, arguments: args }))).body.result;
    assert(!(await wcall('marquer_tache_faite', { taskId: task.id })).isError && db.prepare('SELECT done FROM sub_project_items WHERE id = ?').get(task.id).done === 1, 'marquer_tache_faite coche');
    assert((await wcall('marquer_tache_faite', { taskId: 999999 })).isError, 'tâche inconnue refusée');
    const secret = db.prepare("SELECT id FROM sub_project_items WHERE label LIKE '%secrète%'").get();
    assert((await wcall('marquer_tache_faite', { taskId: secret.id })).isError && db.prepare('SELECT done FROM sub_project_items WHERE id = ?').get(secret.id).done === 0, "tâche d'un autre utilisateur : refusée");
    const note = await wcall('ajouter_tache_note', { activityId: Number(actA), type: 'question', texte: 'Quelle priorité ?' });
    assert(!note.isError && /^🤖 Question de l'IA : /.test(JSON.parse(note.content[0].text).tache), 'note 🤖 ajoutée');
    assert((await wcall('ajouter_tache_note', { activityId: Number(actA), type: 'recap', texte: 'a'.repeat(400) })).isError, 'note trop longue refusée');
    assert((await wcall('ajouter_tache_note', { activityId: Number(actB), type: 'recap', texte: 'x' })).isError, "note dans l'activité d'un autre refusée");
    let sent = 0; for (let i = 0; i < 12; i++) { if (!(await wcall('notifier', { message: 'm' + i })).isError) sent++; }
    assert(sent === 10, 'notifier limité à 10 par jour');
    assert((await call(tW.token, rpc('tools/call', { name: 'supprimer_tache', arguments: { taskId: 1 } }))).body.error, 'aucun outil de suppression');
    aitokens.revokeToken('A', tW.id);
    // jeton dans l'URL
    const ul = await callUrl(tA.token, rpc('tools/list'));
    assert(ul.status === 200 && ul.body.result.tools.length >= 4, 'URL : jeton valide -> tools/list');
    assert(ul.headers['cache-control'] === 'no-store' && ul.headers['referrer-policy'] === 'no-referrer', 'URL : no-store + no-referrer');
    assert((await callUrl('tmt_faux', rpc('ping'))).status === 401, 'URL : jeton invalide = 401');
    // révocation immédiate
    assert(aitokens.revokeToken('A', tA.id), 'révocation');
    assert((await call(tA.token, rpc('ping'))).status === 401, 'jeton révoqué = 401');
    assert((await callUrl(tA.token, rpc('ping'))).status === 401, 'URL : jeton révoqué = 401');
    assert(!logs.join('\n').includes(tA.token) && !logs.join('\n').includes(tW.token), 'aucune trace du jeton dans la console serveur');
    // max 5 actifs
    for (let i = 0; i < 4; i++) aitokens.createToken('B', 'n' + i);
    let blocked = false; try { aitokens.createToken('B', 'de trop'); } catch (e) { blocked = true; }
    assert(blocked, 'maximum de jetons actifs');
    // limite de débit
    let limited = false; for (let i = 0; i < 70; i++) { if ((await call(tB.token, rpc('ping'))).status === 429) { limited = true; break; } }
    assert(limited, 'limite de débit 429');
  } catch (e) { failed++; console.log('  FAIL exception', e); }
  console.log(failed ? 'ÉCHEC' : 'OK');
  process.exit(failed ? 1 : 0);
})();
