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

  // ---- Options 7 et 1 : première lecture sans « modifications », fichier modifié = UN SEUL appel fusionné ----
  const calls = [];
  const chgDate = goals.addDays(today, 6);
  dt.setCaller(async (a) => {
    calls.push(a);
    const out = { t: [['Appeler Paul', KEY, null, 30]] };
    if (a.want.c) out.c = [['t', openTask.id, 'date', chgDate, 'Trop chargé'], ['t', openTask.id, 'text', 'Rédige le plan', 'orthographe']];
    return JSON.stringify(out);
  });
  await ds.syncConnection('own', act);
  assert(calls.length === 1 && calls[0].want.t && !calls[0].want.c && !/Sections? .*"c"/.test(calls[0].variable), 'option 7 : première lecture = 1 appel, section "c" non demandée');
  assert(db.prepare('SELECT COUNT(*) n FROM change_proposals').get().n === 0, 'option 7 : aucune modification proposée stockée');
  touch('f1-aaaaa', 'Appeler Paul\nEnvoyer devis\nRelancer');
  await ds.syncConnection('own', act);
  assert(calls.length === 2 && calls[1].want.t && calls[1].want.c, 'option 1 : fichier modifié = UN SEUL appel pour tâches + modifications');
  assert(/sortie>[\s\S]*"t" et "c"/.test(calls[1].variable) && calls[1].stable.includes('<donnees>') && calls[1].stable.includes('<application>'), 'option 1 : <sortie> demandée et contexte des deux fonctions dans la partie stable');
  const pend = db.prepare("SELECT field, afterValue FROM change_proposals WHERE status = 'pending'").all();
  assert(pend.length === 1 && pend[0].field === 'date' && pend[0].afterValue === chgDate, 'option 1 : section "c" validée et stockée (correction d\'orthographe jamais listée)');
  assert(calls[0].stable === calls[1].stable && calls[0].system === calls[1].system, 'option 1 : partie stable et système identiques (même cache) entre première lecture et fichier modifié');
  // route manuelle « modifications proposées » seule : même cache, section "c" seule
  const r1 = await cp.generate('own', act, {});
  assert(r1.added === 0 && calls.length === 3 && !calls[2].want.t && calls[2].want.c && calls[2].stable === calls[1].stable, 'generate manuel : un appel, section "c" seule, même partie stable');
  // propose manuel avec document : un seul appel (plus de second appel generate)
  const n0 = calls.length;
  const rp = await dt.propose('own', act, { instruction: 'Extrais', files: [{ fileName: 'a.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Un texte avec des tâches').toString('base64') }] });
  assert(calls.length === n0 + 1 && calls[n0].want.c && rp.tasks.length === 1, 'propose manuel avec document : un seul appel IA (tâches + modifications)');
  const n1 = calls.length;
  await dt.propose('own', act, { instruction: 'Sans document' });
  assert(calls.length === n1 + 1 && !calls[n1].want.c, 'propose sans document : section "c" non demandée');
  dt.setCaller(null);

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

  // ---- Option 3 : API Batch pour la surveillance programmée ----
  const aibatch = require('../server/lib/aibatch');
  process.env.ANTHROPIC_API_KEY = 'k';
  const sonnet2 = 'claude-sonnet-4-5';
  const bstore = new Map(); let submitFail = false, nSubmit = 0, nGet = 0, lastSubmit = null;
  aibatch.setFetch(async (url, init) => {
    const json = (o, ok = true, st = 200) => ({ ok, status: st, json: async () => o, text: async () => (typeof o === 'string' ? o : JSON.stringify(o)) });
    if (init.method === 'POST') {
      if (submitFail) return json({}, false, 500);
      const body = JSON.parse(init.body); nSubmit++; lastSubmit = body;
      const id = 'msgbatch_' + nSubmit; bstore.set(id, { status: 'in_progress', requests: body.requests, lines: [] });
      return json({ id, processing_status: 'in_progress' });
    }
    const m = String(url).match(/batches\/([^/]+)(\/results)?$/);
    const b = m && bstore.get(m[1]);
    if (!b) return json({}, false, 404);
    if (m[2]) return json(b.lines.map((l) => JSON.stringify(l)).join('\n'));
    nGet++;
    return json({ id: m[1], processing_status: b.status, results_url: b.status === 'ended' ? 'https://api.anthropic.com/v1/messages/batches/' + m[1] + '/results' : null });
  });
  const okLine = (cid, title) => ({ custom_id: cid, result: { type: 'succeeded', message: { model: sonnet2, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ t: [[title, KEY, null, 30]] }) }], usage: { input_tokens: 1000000, output_tokens: 0 } } } });
  const endBatch = (id, lines) => { const b = bstore.get(id); b.status = 'ended'; b.lines = lines; };
  const seenF = (id) => db.prepare('SELECT 1 FROM drive_seen_files WHERE fileId = ?').get(id);
  const taskRow = (title) => db.prepare('SELECT status FROM drive_seen_tasks WHERE title = ?').get(title);
  docs['b1-aaaaa'] = { text: 'Premier texte batch', mt: '2026-10-05T00:00:00Z', parents: ['fold-1111'] };
  docs['b2-aaaaa'] = { text: 'Second texte batch', mt: '2026-10-05T00:00:00Z', parents: ['fold-1111'] };
  const direct = [];
  dt.setCaller(async () => { direct.push(1); return JSON.stringify({ t: [['Tâche directe', KEY, null, 10]] }); });
  const uniq = (t) => 'Tâche ' + t;
  let r = await ds.syncConnection('own', act);
  assert(nSubmit === 1 && lastSubmit.requests.length === 2 && direct.length === 0 && r.batched === 2, 'lot : fichiers de la surveillance soumis en UN lot, aucun appel direct');
  const sp = lastSubmit.requests[0].params;
  assert(sp.model && sp.max_tokens > 0 && Array.isArray(sp.system) && sp.messages[0].content[0].cache_control, 'lot : params = modèle, max_tokens, system en blocs, message avec cache');
  assert(!seenF('b1-aaaaa') && !seenF('b2-aaaaa'), 'lot : fichiers non marqués vus avant le résultat');
  const brow = db.prepare('SELECT * FROM drive_batches').get();
  assert(brow && brow.status === 'submitted' && !/texte batch/i.test(brow.fileMap) && Object.keys(JSON.parse(brow.fileMap)).length === 2, 'lot : ligne drive_batches persistée sans contenu de document');
  // redémarrage du serveur : nouvelle instance du module, état relu depuis la base
  delete require.cache[require.resolve('../server/lib/drivesync')];
  const ds2 = require('../server/lib/drivesync');
  r = await ds2.syncConnection('own', act);
  assert(nSubmit === 1 && nGet >= 1 && !seenF('b1-aaaaa'), 'lot en cours : pas de second lot pour les mêmes fichiers, rien d\'appliqué avant la fin');
  const ids = Object.keys(JSON.parse(brow.fileMap));
  const cidOf = (fid) => ids.find((c) => JSON.parse(brow.fileMap)[c].fileId === fid);
  endBatch('msgbatch_1', [okLine(cidOf('b1-aaaaa'), uniq('B1')), { custom_id: cidOf('b2-aaaaa'), result: { type: 'errored', error: { type: 'api_error' } } }]);
  const costBefore = db.prepare("SELECT COALESCE(SUM(costUsd),0) c FROM ai_usage_log WHERE feature = 'surveillance-drive-batch'").get().c;
  r = await ds2.syncConnection('own', act);
  assert(seenF('b1-aaaaa') && taskRow(uniq('B1')) && taskRow(uniq('B1')).status === 'pending' && r.proposed >= 1, 'lot terminé : fichier réussi marqué vu + tâche en attente (même logique que les appels directs)');
  assert(!seenF('b2-aaaaa'), 'lot : fichier en erreur non marqué (nouvel essai)');
  const costRow = db.prepare("SELECT COALESCE(SUM(costUsd),0) c, SUM(calls) n FROM ai_usage_log WHERE feature = 'surveillance-drive-batch'").get();
  assert(Math.abs(costRow.c - costBefore - 1.5) < 1e-9, 'lot : coût enregistré à 50 % (1 M jetons Sonnet = 1,50 $, feature surveillance-drive-batch)');
  assert(db.prepare("SELECT status FROM drive_batches WHERE batchId = 'msgbatch_1'").get().status === 'done', 'lot : marqué terminé');
  // le fichier en erreur est resoumis au passage suivant (nouveau lot) ; résultats expirés / annulés : rien n'est marqué
  nGet = 0; await ds2.syncConnection('own', act);
  assert(nSubmit === 2, 'lot : le fichier en erreur repart dans un nouveau lot');
  endBatch('msgbatch_2', [{ custom_id: 'f0', result: { type: 'expired' } }]);
  await ds2.syncConnection('own', act);
  assert(!seenF('b2-aaaaa') && nSubmit === 3, 'lot expiré : fichier non marqué, resoumis');
  endBatch('msgbatch_3', [{ custom_id: 'f0', result: { type: 'canceled' } }]);
  // synchroniser maintenant : appels directs immédiats même en mode lot
  const nS = nSubmit; const rn = await ds2.syncNow('own', act);
  assert(nSubmit === nS && direct.length >= 1 && seenF('b2-aaaaa'), 'synchroniser maintenant : appels directs, jamais de lot');
  // DRIVE_SYNC_BATCH=off
  docs['b3-aaaaa'] = { text: 'Troisième texte', mt: '2026-10-06T00:00:00Z', parents: ['fold-1111'] };
  process.env.DRIVE_SYNC_BATCH = 'off'; const d0 = direct.length;
  await ds2.syncConnection('own', act);
  assert(nSubmit === nS && direct.length === d0 + 1, 'DRIVE_SYNC_BATCH=off : retour aux appels directs');
  delete process.env.DRIVE_SYNC_BATCH;
  // repli : soumission impossible => appels directs
  docs['b4-aaaaa'] = { text: 'Quatrième texte', mt: '2026-10-06T00:00:00Z', parents: ['fold-1111'] };
  submitFail = true; const d1 = direct.length;
  await ds2.syncConnection('own', act);
  assert(direct.length === d1 + 1 && seenF('b4-aaaaa'), 'soumission en échec : repli sur les appels directs');
  submitFail = false;
  // budget bloqué : rien n'est soumis, rien n'est marqué
  docs['b5-aaaaa'] = { text: 'Cinquième texte', mt: '2026-10-07T00:00:00Z', parents: ['fold-1111'] };
  ab.record('own', sonnet2, { input_tokens: 1e7 }, 'test-budget');
  const nS2 = nSubmit;
  r = await ds2.syncConnection('own', act);
  assert(r.aiBlocked && nSubmit === nS2 && !seenF('b5-aaaaa'), 'budget bloqué : aucun lot soumis, fichier non marqué');
  aibatch.setFetch(null); delete process.env.ANTHROPIC_API_KEY; dt.setCaller(null);

  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
