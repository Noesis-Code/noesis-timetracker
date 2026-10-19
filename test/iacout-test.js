// Tests des économies de coût IA (surveillance Drive, 17 oct. 2026) : Google et Anthropic simulés. Usage : node test/iacout-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-iacout-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);
process.env.DRIVE_PREFILTER = 'off'; // les sections précédentes utilisent des textes très courts ; réactivé pour l'option 6
process.env.DRIVE_PREFILTER_ACTION = 'off'; // le filtre « sans action » (19 oct. 2026) est testé à part ; ces fixtures sont des textes génériques
process.env.DRIVE_SYNC_MODEL = 'claude-sonnet-4-5-20250929'; // les estimations de ces tests supposent Sonnet
process.env.DRIVE_SYNC_MAX_AI_PER_PASS = '50'; process.env.DRIVE_SYNC_MAX_TASKS_PER_FILE = '1000'; process.env.DRIVE_SYNC_FIRST_DAYS = '36500'; process.env.AI_BUDGET_DAY_USD = '1000'; process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY = '100000'; // anciennes limites, pour ces scénarios
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
    return json({ files: Object.keys(docs).filter((id) => docs[id].parents.includes(qf)).map((id) => ({ id, name: id, mimeType: docs[id].mime || 'application/vnd.google-apps.document', modifiedTime: docs[id].mt })) });
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
  let getFail = false;
  const batchFetch = async (url, init) => {
    const json = (o, ok = true, st = 200) => ({ ok, status: st, json: async () => o, text: async () => (typeof o === 'string' ? o : JSON.stringify(o)) });
    if (init.method === 'POST') {
      if (submitFail) return { ...json({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, false, typeof submitFail === 'number' ? submitFail : 500) };
      const body = JSON.parse(init.body); nSubmit++; lastSubmit = body;
      const id = 'msgbatch_' + nSubmit; bstore.set(id, { status: 'in_progress', requests: body.requests, lines: [] });
      return json({ id, processing_status: 'in_progress' });
    }
    const m = String(url).match(/batches\/([^/]+)(\/results)?$/);
    const b = m && bstore.get(m[1]);
    if (!b) return json({}, false, 404);
    if (m[2]) return json(b.lines.map((l) => JSON.stringify(l)).join('\n'));
    nGet++;
    if (getFail) return json({}, false, 500);
    return json({ id: m[1], processing_status: b.status, results_url: b.status === 'ended' ? 'https://api.anthropic.com/v1/messages/batches/' + m[1] + '/results' : null });
  };
  aibatch.setFetch(batchFetch);
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
  nGet = 0; db.prepare("UPDATE drive_attempts SET nextAt = ''").run(); // attente de réessai écoulée
  await ds2.syncConnection('own', act);
  assert(nSubmit === 2, 'lot : le fichier en erreur repart dans un nouveau lot');
  endBatch('msgbatch_2', [{ custom_id: 'f0s0', result: { type: 'expired' } }]);
  await ds2.syncConnection('own', act); db.prepare("UPDATE drive_attempts SET nextAt = ''").run();
  await ds2.syncConnection('own', act);
  assert(!seenF('b2-aaaaa') && nSubmit === 3, 'lot expiré : fichier non marqué, resoumis');
  endBatch('msgbatch_3', [{ custom_id: 'f0s0', result: { type: 'canceled' } }]);
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

  // ---- Option 5 : lire seulement ce qui a changé (empreintes) ----
  db.prepare("DELETE FROM ai_usage_log WHERE feature = 'test-budget'").run();
  const dch = require('../server/lib/drivechunks');
  const para = (n) => 'Paragraphe numéro ' + n + ' : contenu utile assez long pour ressembler à une vraie phrase de document de travail.';
  const mkDoc = (over) => ['# Projet', para(1), para(2), '## Livrables', para(3), para(4), para(5), '## Suivi', para(6), para(7), para(8), para(9)].map((x, i) => (over && over[i] != null ? over[i] : x)).join('\n\n');
  const sp1 = dch.split(mkDoc());
  assert(sp1.length === 12 && sp1[4].trail === 'Projet > Livrables' && sp1[8].trail === 'Projet > Suivi', 'empreintes : découpage par titres et paragraphes, fil des titres');
  const BIG = { 1: 'Réécrit 1', 2: 'Réécrit 2', 4: 'Réécrit 4', 5: 'Réécrit 5', 6: 'Réécrit 6', 7: 'Réécrit 7', 8: 'Réécrit 8', 9: 'Réécrit 9', 10: 'Réécrit 10' };
  const seenVars = [];
  dt.setCaller(async (a) => { seenVars.push(a.variable); return JSON.stringify({ t: [] }); });
  docs['c1-aaaaa'] = { text: mkDoc(), mt: '2026-10-08T00:00:00Z', parents: ['fold-1111'] };
  await ds.syncConnection('own', act);
  const v0 = seenVars[seenVars.length - 1];
  assert(v0.includes(para(1)) && v0.includes(para(9)), 'première lecture : texte complet');
  const rows = db.prepare("SELECT chunkHash FROM drive_seen_chunks WHERE fileId = 'c1-aaaaa'").all();
  assert(rows.length === 12 && rows.every((r) => /^[0-9a-f]{64}$/.test(r.chunkHash)), 'empreintes stockées (sha256 seulement, 12 blocs) ; aucun contenu');
  const cols = db.prepare('PRAGMA table_info(drive_seen_chunks)').all().map((c) => c.name).join();
  assert(cols === 'userId,activityId,fileId,chunkHash', 'table drive_seen_chunks : aucune colonne de contenu');
  touch('c1-aaaaa', mkDoc({ 5: para(4) + ' MODIFIÉ avec une nouvelle date le 2026-11-02.' }));
  await ds.syncConnection('own', act);
  const v1 = seenVars[seenVars.length - 1];
  assert(v1.includes('MODIFIÉ') && !v1.includes(para(1)) && !v1.includes(para(9)) && !v1.includes(para(3)), 'un seul paragraphe modifié : seul ce bloc part dans le prompt');
  assert(/c1-aaaaa|Extraits modifiés/.test(v1) && v1.includes('[Section : Projet > Livrables]'), 'en-tête court : nom du fichier + fil de titres du bloc');
  touch('c1-aaaaa', mkDoc(BIG));
  await ds.syncConnection('own', act);
  const v2 = seenVars[seenVars.length - 1];
  assert(v2.includes('## Livrables') && v2.includes('Réécrit 9') && !v2.includes('Extraits modifiés'), 'gros remaniement (> 60 % des blocs) : texte complet');
  const nv = seenVars.length;
  touch('c1-aaaaa', mkDoc(BIG) + '\n\n\n');
  await ds.syncConnection('own', act);
  assert(seenVars.length === nv, 'blanc ajouté seulement : aucun bloc nouveau, pas d\'appel IA');
  // échec IA : empreintes non mises à jour
  dt.setCaller(async () => { throw new Error('panne'); });
  touch('c1-aaaaa', mkDoc({ ...BIG, 11: 'Ajout fragile' }));
  const before = db.prepare("SELECT COUNT(*) n FROM drive_seen_chunks WHERE fileId = 'c1-aaaaa' AND chunkHash = ?").get(dch.hashOf('Ajout fragile')).n;
  await ds.syncConnection('own', act);
  const after = db.prepare("SELECT COUNT(*) n FROM drive_seen_chunks WHERE fileId = 'c1-aaaaa' AND chunkHash = ?").get(dch.hashOf('Ajout fragile')).n;
  assert(before === 0 && after === 0, 'échec du traitement : empreintes non mises à jour');
  dt.setCaller(null);

  // ---- Option 6 : pré-filtre local avant l'IA ----
  delete process.env.DRIVE_PREFILTER;
  const pfm = require('../server/lib/driveprefilter');
  const sent = []; let aiN = 0;
  dt.setCaller(async (a) => { aiN++; sent.push(a.variable); return JSON.stringify({ t: [] }); });
  const sentence = 'Il faut impérativement envoyer le rapport financier annuel au comptable avant le quinze novembre prochain sans faute';
  const noise = ['Confidentiel - ne pas diffuser', 'Page suivante'];
  const noisy = [sentence, ...Array.from({ length: 12 }, (_, i) => noise[i % 2] + '   \n\n\n\n' + 'Société Exemple   inc.'), 'Fin   du   document avec   espaces   multiples'].join('\n');
  const cl = pfm.clean(noisy);
  assert(cl.includes(sentence) && (cl.match(/Confidentiel - ne pas diffuser/g) || []).length === 1 && (cl.match(/Page suivante/g) || []).length === 1 && !/ {2,}/.test(cl) && !/\n{3,}/.test(cl), 'nettoyage : phrase utile gardée, lignes répétées ≥ 3 fois réduites à la première, espaces et vides en trop retirés');
  const table = ['Nom | Tâche | Échéance', 'Paul | Appeler le client | lundi', 'Paul | Appeler le client | lundi', 'Paul | Appeler le client | lundi', 'Marie | Envoyer le devis | mardi', 'Jean | Relire le contrat de travail | mercredi'].join('\n');
  assert(pfm.clean(table) === table, 'tableau avec mots : conservé intégralement (même lignes répétées)');
  assert(pfm.evaluate('', {}).skip === 'vide' && pfm.evaluate('trois mots seulement', {}).skip === 'vide' && pfm.evaluate('12 34 56,78\n99;100', { name: 'x.csv' }).skip === 'sans mots', 'règles : vide / moins de 20 mots / feuille sans mots');
  assert(pfm.evaluate('12 34 56,78\n99;100', { name: 'x.txt' }).skip === 'vide' && !pfm.evaluate(noisy, {}).skip, 'règles : seul un tableur est ignoré « sans mots » ; fichier avec phrase utile envoyé');
  docs['p1-aaaaa'] = { text: ' \n ', mt: '2026-10-09T00:00:00Z', parents: ['fold-1111'] };
  docs['p2-aaaaa'] = { text: 'Rappeler Paul demain', mt: '2026-10-09T00:00:00Z', parents: ['fold-1111'] };
  docs['p3-aaaaa'] = { text: noisy, mt: '2026-10-09T00:00:00Z', parents: ['fold-1111'] };
  docs['p4-aaaaa'] = { text: noisy, mt: '2026-10-09T00:00:00Z', parents: ['fold-1111'] };
  docs['p5-aaaaa'] = { text: table, mt: '2026-10-09T00:00:00Z', parents: ['fold-1111'] };
  docs['p6-aaaaa'] = { text: '120\n340;12,5\n7 8 9', mt: '2026-10-09T00:00:00Z', parents: ['fold-1111'], mime: 'application/vnd.google-apps.spreadsheet' };
  let rr = await ds.syncConnection('own', act);
  const reasons = Object.fromEntries((rr.skipped || []).map((x) => [x.name, x.reason]));
  assert(reasons['p1-aaaaa'] === 'vide ou illisible' && reasons['p2-aaaaa'] === 'vide' && reasons['p6-aaaaa'] === 'sans mots' && reasons['p4-aaaaa'] === 'doublon' && !reasons['p3-aaaaa'] && !reasons['p5-aaaaa'], 'pré-filtre : vide, trop court, sans mots, doublon ignorés ; fichier utile et tableau gardés');
  assert(aiN === 2, 'pré-filtre : seuls 2 fichiers (phrase utile, tableau) partent à l\'IA');
  const sv = sent.find((v) => v.includes(sentence));
  assert(sv && (sv.match(/Confidentiel - ne pas diffuser/g) || []).length === 1, 'pré-filtre : la phrase utile est envoyée, le bruit répété réduit');
  assert(sent.some((v) => v.includes('Jean | Relire le contrat de travail | mercredi') && v.includes('Marie | Envoyer le devis | mardi')), 'pré-filtre : tableau envoyé en entier');
  const stt = ds.settings('own', act);
  assert(stt.skippedCount === 5 && stt.skipped.some((x) => x.name === 'p1-aaaaa' && x.reason === 'vide ou illisible'), 'état de la surveillance : compteur et liste « nom + raison » des fichiers ignorés');
  assert(!/^[0-9a-f]{64}$/.test(db.prepare("SELECT contentHash FROM drive_seen_files WHERE fileId = 'p2-aaaaa'").get().contentHash || ''), 'fichier ignoré : pas de hash de contenu enregistré');
  console.log('  info  octets économisés sur ce jeu d\'essai : ' + rr.bytesSaved + ' octets (~' + Math.round(rr.bytesSaved / 4) + ' jetons)');
  // un fichier ignoré qui change est réévalué
  touch('p2-aaaaa', sentence + ' et ensuite préparer la réunion de coordination avec toute l\'équipe de production');
  const a0 = aiN; await ds.syncConnection('own', act);
  assert(aiN === a0 + 1 && ds.settings('own', act).skippedCount === 4, 'fichier ignoré puis complété : réévalué et envoyé à l\'IA');
  // le manuel contourne le pré-filtre
  touch('p1-aaaaa', 'Appeler Paul'); const a1 = aiN;
  rr = await ds.syncNow('own', act);
  assert(aiN >= a1 + 1 && !db.prepare("SELECT 1 FROM drive_skipped WHERE fileId = 'p1-aaaaa'").get(), 'synchroniser maintenant : contourne le pré-filtre (lit tout)');
  // DRIVE_PREFILTER=off
  docs['p7-aaaaa'] = { text: 'Deux mots', mt: '2026-10-10T00:00:00Z', parents: ['fold-1111'] };
  process.env.DRIVE_PREFILTER = 'off'; const a2 = aiN;
  await ds.syncConnection('own', act);
  assert(aiN === a2 + 1, 'DRIVE_PREFILTER=off : pré-filtre coupé');
  delete process.env.DRIVE_PREFILTER; dt.setCaller(null);

  // ======== Corrections de relecture (B1, B2, I4-I8, M13) ========
  const NW = (n, w) => Array.from({ length: n }, (_, i) => w + i).join(' '); // n mots distincts
  const addDoc = (id, text, extra) => { docs[id] = { text, mt: '2026-10-12T00:00:00Z', parents: ['fold-1111'], ...(extra || {}) }; };
  const resetNext = () => db.prepare("UPDATE drive_attempts SET nextAt = ''").run();
  const hashRows = (fid) => db.prepare('SELECT COUNT(*) n FROM drive_seen_chunks WHERE fileId = ?').get(fid).n;
  const skippedReason = (fid) => (db.prepare('SELECT reason FROM drive_skipped WHERE fileId = ?').get(fid) || {}).reason;
  db.prepare("DELETE FROM ai_usage_log").run();
  const vars = [];
  const okCaller = async (a) => { vars.push(a.variable); return JSON.stringify({ t: [] }); };

  // ---- B1 : une entrée skip:* est réévaluée à chaque passage ----
  dt.setCaller(okCaller);
  addDoc('q1-aaaaa', 'Rappeler Paul');
  addDoc('q5-aaaaa', '- Appeler Paul\n- Envoyer devis\n[ ] Relancer');
  let m0 = vars.length;
  await ds.syncConnection('own', act);
  assert(skippedReason('q1-aaaaa') === 'vide' && vars.length === m0 + 1 && vars[vars.length - 1].includes('Envoyer devis'), 'B1 : fichier court ignoré ; fichier court avec puces / cases PAS ignoré');
  m0 = vars.length; await ds.syncNow('own', act);
  assert(vars.length === m0 + 1 && !skippedReason('q1-aaaaa'), 'B1 : un fichier skip:* est relu par « Synchroniser maintenant »');
  addDoc('q2-aaaaa', 'Appeler Marie');
  await ds.syncConnection('own', act);
  assert(skippedReason('q2-aaaaa') === 'vide', 'B1 : q2 ignoré');
  process.env.DRIVE_PREFILTER = 'off'; m0 = vars.length;
  await ds.syncConnection('own', act); delete process.env.DRIVE_PREFILTER;
  assert(vars.length === m0 + 1 && !skippedReason('q2-aaaaa'), 'B1 : DRIVE_PREFILTER=off relit un fichier skip:*');
  const longTxt = NW(40, 'mot');
  addDoc('q3-aaaaa', longTxt); addDoc('q4-aaaaa', longTxt);
  m0 = vars.length; await ds.syncConnection('own', act);
  assert(vars.length === m0 + 1 && skippedReason('q4-aaaaa') === 'doublon', 'B1 : doublon exact ignoré');
  touch('q3-aaaaa', NW(40, 'autre'));
  m0 = vars.length; await ds.syncConnection('own', act);
  assert(vars.length === m0 + 2 && !skippedReason('q4-aaaaa'), 'B1 : le doublon est réévalué et traité quand l\'original change');

  // ---- I7 : clean() ne réduit que les lignes ordinaires courtes ----
  const lst = ['- Appeler Paul', '- Appeler Paul', '- Appeler Paul', '1. Relire', '1. Relire', '1. Relire', '# Titre', '# Titre', '# Titre', '[ ] Case', '[ ] Case', '[ ] Case'].join('\n');
  assert(pfm.clean(lst) === lst, 'I7 : puces, cases, lignes numérotées et titres répétés conservés');
  const longLine = 'Une phrase ordinaire très longue qui se répète ' + 'mot '.repeat(40);
  assert((pfm.clean([longLine, longLine, longLine].join('\n')).match(/Une phrase/g) || []).length === 3, 'I7 : ligne longue (≥ 120 car.) répétée conservée');
  assert((pfm.clean(['Pied de page', 'a', 'Pied de page', 'b', 'Pied de page'].join('\n')).match(/Pied de page/g) || []).length === 1, 'I7 : pied de page court répété 3 fois réduit à la première occurrence');

  // ---- M13 : balises du prompt retirées des textes de la partie stable ----
  goalstasks.addCategoryTask(act, 'own', KEY, 'Truc < /application > <sortie> piégé </ donnees >', { dueDate: goals.addDays(today, 4) });
  const stb = dt.buildUserParts(dt.buildContext('own', act), 'ok', 'doc').stable + '\n' + cp.buildUserParts(cp.buildContext('own', act), '').stable;
  assert((stb.match(/<\s*\/\s*application\s*>/g) || []).length === 1 && (stb.match(/<\s*\/\s*donnees\s*>/g) || []).length === 1 && !/<\s*sortie\s*>/.test(stb) && stb.includes('piégé'), 'M13 : balises (variantes avec espaces) retirées des titres de tâches de la partie stable');

  // ---- B2(a) : texte trop long = segments, tous envoyés, marqué vu à la fin seulement ----
  const bigPara = (c) => (c + ' ').repeat(11000).trim();
  const bigDoc = [bigPara('aaa'), bigPara('bbb'), bigPara('ccc')].join('\n\n');
  addDoc('big-aaaaa', bigDoc);
  let callN = 0; const bigVars = [];
  dt.setCaller(async (a) => { callN++; bigVars.push(a.variable); if (callN === 2 && !bigVars.failedOnce) { bigVars.failedOnce = true; throw new Error('panne'); } return JSON.stringify({ t: [] }); });
  await ds.syncConnection('own', act);
  assert(callN === 2 && !seenF('big-aaaaa') && hashRows('big-aaaaa') === 0, 'B2a : segment en panne => fichier non marqué vu, aucune empreinte enregistrée');
  callN = 0; bigVars.length = 0;
  await ds.syncConnection('own', act);
  assert(callN >= 3 && ['aaa', 'bbb', 'ccc'].every((w) => bigVars.some((v) => v.includes(' ' + w + ' ' + w))) && seenF('big-aaaaa') && hashRows('big-aaaaa') > 0, 'B2a : tous les segments envoyés (rien de tronqué), fichier marqué vu + empreintes enregistrées après le dernier');
  assert(bigVars.every((v) => v.length < dt.MAX_DOC_CHARS + 4000), 'B2a : chaque segment tient sous la limite de lecture');

  // ---- B2(b) : réponse coupée (max_tokens) ----
  const lines = Array.from({ length: 60 }, (_, i) => 'Ligne numéro ' + i + ' ' + NW(8, 'x' + i + '_')).join('\n');
  addDoc('trunc-aaaaa', lines);
  const tv = [];
  dt.setCaller(async (a) => { tv.push(a.variable.length); return { text: JSON.stringify({ t: [['Tâche partielle ' + tv.length, KEY, null, 10]] }), stopReason: 'max_tokens' }; });
  await ds.syncConnection('own', act);
  assert(!seenF('trunc-aaaaa') && taskRow('Tâche partielle 1'), 'B2b : réponse coupée => tâches complètes gardées, fichier PAS marqué vu');
  const calls1 = tv.length;
  await ds.syncConnection('own', act);
  assert(tv.length === calls1, 'I5 : attente (backoff) avant le réessai');
  resetNext(); await ds.syncConnection('own', act);
  assert(tv.length === calls1 + 2, 'B2b : au réessai, le segment est coupé en deux moitiés');
  resetNext(); await ds.syncConnection('own', act);
  assert(seenF('trunc-aaaaa') && skippedReason('trunc-aaaaa') === 'réponse IA incomplète' && hashRows('trunc-aaaaa') === 0, 'B2b : après 3 essais, marqué vu + drive_skipped « réponse IA incomplète » (sans empreintes)');
  assert(ds.settings('own', act).skipped.some((x) => x.name === 'trunc-aaaaa' && x.reason === 'réponse IA incomplète'), 'B2b : visible dans GET /drive/sync');

  // ---- I5 : réponse inexploitable, 3 essais ----
  addDoc('bad-aaaaa', NW(30, 'bad'));
  let badN = 0;
  dt.setCaller(async () => { badN++; return 'pas du json du tout'; });
  await ds.syncConnection('own', act); await ds.syncConnection('own', act);
  assert(badN === 1 && !seenF('bad-aaaaa'), 'I5 : 1er échec compté, pas de réessai immédiat (backoff)');
  resetNext(); await ds.syncConnection('own', act); resetNext(); await ds.syncConnection('own', act);
  assert(badN === 3 && seenF('bad-aaaaa') && skippedReason('bad-aaaaa') === 'réponse IA inexploitable', 'I5 : après 3 essais, marqué vu + « réponse IA inexploitable »');
  dt.setCaller(null);

  // ---- Lots : segments, I4, I6, I8 ----
  process.env.ANTHROPIC_API_KEY = 'k';
  aibatch.setFetch(batchFetch);
  addDoc('bseg-aaaaa', [bigPara('ddd'), bigPara('eee'), bigPara('fff')].join('\n\n'));
  const sub0 = nSubmit;
  await ds.syncConnection('own', act);
  const cids = lastSubmit.requests.map((r) => r.custom_id);
  assert(nSubmit === sub0 + 1 && cids.length >= 3 && cids.every((c, i) => c === 'f0s' + i), 'B2 lot : un custom_id par segment');
  const bid = 'msgbatch_' + nSubmit;
  endBatch(bid, [okLine('f0s0', 'Seg zéro'), { custom_id: 'f0s1', result: { type: 'errored' } }, okLine('f0s2', 'Seg deux')]);
  await ds.syncConnection('own', act);
  assert(!seenF('bseg-aaaaa') && hashRows('bseg-aaaaa') === 0 && taskRow('Seg zéro') && taskRow('Seg deux'), 'B2 lot : un segment en erreur => fichier non marqué, pas d\'empreintes, tâches des autres segments gardées');
  resetNext();
  // I4 : lot trop vieux, l'API répond en erreur => abandonné et fichiers libérés
  await ds.syncConnection('own', act); // resoumet bseg
  const oldId = 'msgbatch_' + nSubmit;
  db.prepare("UPDATE drive_batches SET createdAt = ? WHERE batchId = ?").run(new Date(Date.now() - 72 * 3600e3).toISOString(), oldId);
  getFail = true; const sub1 = nSubmit;
  await ds.syncConnection('own', act); getFail = false;
  assert(db.prepare('SELECT status FROM drive_batches WHERE batchId = ?').get(oldId).status === 'expired', 'I4 : lot de plus de 48 h passé en expired même si l\'API répond 500');
  assert(nSubmit === sub1 + 1, 'I4 : fichiers libérés, nouveau lot soumis');
  // I8 : purge
  db.prepare("INSERT INTO drive_batches (userId, activityId, batchId, createdAt, status, fileMap) VALUES ('own', ?, 'old-done', ?, 'done', '{}')").run(act, new Date(Date.now() - 9 * 86400e3).toISOString());
  db.prepare("INSERT INTO drive_batches (userId, activityId, batchId, createdAt, status, fileMap) VALUES ('own', ?, 'new-done', ?, 'done', '{}')").run(act, new Date(Date.now() - 2 * 86400e3).toISOString());
  await ds.syncConnection('own', act);
  assert(!db.prepare("SELECT 1 FROM drive_batches WHERE batchId = 'old-done'").get() && db.prepare("SELECT 1 FROM drive_batches WHERE batchId = 'new-done'").get(), 'I8 : lignes terminées de plus de 7 jours purgées, les récentes gardées');
  // I6 : budget limité => seuls les fichiers qui tiennent dans le reste de la tranche partent
  endBatch('msgbatch_' + nSubmit, []);
  await ds.syncConnection('own', act);
  for (let k = 1; k <= 3; k++) addDoc('bud' + k + '-aaaaa', NW(30, 'budget' + k + '_'));
  const sp0 = ab.status('own'); const tr = ab.trancheOf(new Date());
  const reqCost = (() => { const prep = { parts: { stable: 'x'.repeat(4000), variable: 'y'.repeat(2000) }, want: { t: true, c: false } }; const pr = require('../server/lib/docanalysis').requestParams(prep); return (Math.ceil((JSON.stringify(pr.system).length + JSON.stringify(pr.messages).length) / 4) * 3 + pr.max_tokens * 15) * 0.5 / 1e6; })();
  process.env.AI_BUDGET_MONTH_USD = String((sp0.spentMonth + reqCost * 1.6) * 4 / tr);
  const sub2 = nSubmit;
  rr = await ds.syncConnection('own', act);
  delete process.env.AI_BUDGET_MONTH_USD;
  assert(nSubmit === sub2 + 1 && lastSubmit.requests.length === 1 && rr.budgetDeferred === 2, 'I6 : lot limité au coût maximal estimé restant (1 fichier sur 3), les autres attendent');
  assert([1, 2, 3].filter((k) => seenF('bud' + k + '-aaaaa')).length === 0, 'I6 : fichiers non soumis non marqués vus');
  aibatch.setFetch(null); delete process.env.ANTHROPIC_API_KEY;

  // ======== Corrections de relecture (N1 à N5) ========
  const runAll = async (n) => { for (let k = 0; k < n; k++) { resetNext(); await ds.syncConnection('own', act); } };
  db.prepare("UPDATE drive_batches SET status = 'done'").run();
  process.env.DRIVE_SYNC_BATCH = 'off';
  dt.setCaller(okCaller);
  await runAll(3); // vide la file : plus aucun fichier à traiter avant les nouveaux cas
  const listedReason = (fid) => (db.prepare('SELECT reason FROM drive_skipped WHERE fileId = ?').get(fid) || {}).reason;

  // ---- N1 : plus de 80 tâches dans une réponse = réponse coupée (division + réessai), rien de perdu ----
  const rows150 = Array.from({ length: 150 }, (_, i) => 'Ligne ' + i + ' ' + NW(8, 'y' + i + '_')).join('\n');
  addDoc('n1-aaaaa', rows150);
  const n1sizes = [];
  dt.setCaller(async (a) => {
    const ls = [...a.variable.matchAll(/Ligne (\d+) /g)].map((mm) => mm[1]); n1sizes.push(ls.length);
    return JSON.stringify({ t: ls.map((l) => ['Tâche N1 L' + l, KEY, null, 10]) });
  });
  await ds.syncConnection('own', act);
  assert(n1sizes[0] === 150 && !seenF('n1-aaaaa') && taskRow('Tâche N1 L0') && !taskRow('Tâche N1 L149'), 'N1 : 150 tâches en un segment => 80 gardées, fichier PAS marqué vu (réponse coupée)');
  resetNext(); await ds.syncConnection('own', act);
  assert(seenF('n1-aaaaa') && n1sizes.slice(1).every((n) => n < 150) && taskRow('Tâche N1 L149') && taskRow('Tâche N1 L100'), 'N1 : au réessai le segment est divisé, les 150 tâches sont toutes rangées, fichier marqué vu');
  addDoc('n1b-aaaaa', rows150.replace(/Ligne /g, 'Rang '));
  dt.setCaller(async (a) => JSON.stringify({ t: Array.from({ length: 150 }, (_, i) => ['Jamais ' + a.variable.length + ' ' + i, KEY, null, 10]) }));
  await runAll(3);
  assert(listedReason('n1b-aaaaa') === 'réponse IA incomplète' && seenF('n1b-aaaaa'), 'N1 : toujours coupée après 3 essais => listée dans drive_skipped (rien de silencieux)');

  // ---- N2 : panne persistante propre à un fichier (HTTP 400) plafonnée puis listée ; panne globale jamais listée ----
  process.env.DRIVE_SYNC_MAX_FILE_INFRA_FAILS = '3';
  ['n2a', 'n2b', 'n2c'].forEach((id) => addDoc(id + '-aaaaa', NW(30, id + 'bad_')));
  let goodN = 0;
  dt.setCaller(async (a) => { if (/n2[abc]bad_/.test(a.variable)) throw new Error('HTTP 400'); return JSON.stringify({ t: [] }); });
  const newGood = () => { goodN++; addDoc('n2g' + goodN + '-aaaaa', NW(30, 'good' + goodN + '_')); };
  for (let k = 0; k < 4; k++) { newGood(); await ds.syncConnection('own', act); }
  assert([1, 2, 3, 4].every((k) => seenF('n2g' + k + '-aaaaa')), 'N2 : 3 fichiers en panne 400 n\'affament pas les autres (fichiers sains traités à chaque passage)');
  assert(['n2a', 'n2b', 'n2c'].every((id) => listedReason(id + '-aaaaa') === 'erreur IA persistante sur ce fichier' && seenF(id + '-aaaaa')), 'N2 : après le plafond (3 ici), les fichiers en panne propre sont listés avec une raison claire');
  const nl = db.prepare('SELECT COUNT(*) n FROM drive_skipped').get().n;
  addDoc('n2d-aaaaa', NW(30, 'n2dglob_'));
  dt.setCaller(async () => { throw new Error('HTTP 402'); });
  await runAll(5);
  assert(!seenF('n2d-aaaaa') && !listedReason('n2d-aaaaa') && db.prepare('SELECT COUNT(*) n FROM drive_skipped').get().n === nl, 'N2 : panne globale (402) sur 5 passages => rien n\'est listé ni marqué vu');
  dt.setCaller(async () => { throw new Error('HTTP 400'); });
  addDoc('n2e-aaaaa', NW(30, 'n2eall_'));
  await runAll(5);
  assert(!listedReason('n2d-aaaaa') && !listedReason('n2e-aaaaa'), 'N2 : 400 sans aucun succès dans le passage (crédit épuisé possible) => rien n\'est compté ni listé');
  dt.setCaller(okCaller); await runAll(2);
  assert(seenF('n2d-aaaaa') && seenF('n2e-aaaaa') && !listedReason('n2d-aaaaa'), 'N2 : l\'IA revenue, les fichiers sont traités normalement');
  delete process.env.DRIVE_SYNC_MAX_FILE_INFRA_FAILS;

  // ---- N3 : un lot en vol réduit le reste du budget ; coût estimé x 1,25 sur le cache ----
  process.env.ANTHROPIC_API_KEY = 'k'; aibatch.setFetch(batchFetch); delete process.env.DRIVE_SYNC_BATCH;
  db.prepare("UPDATE drive_batches SET status = 'done'").run();
  const prm = require('../server/lib/docanalysis').requestParams({ parts: { stable: 'x'.repeat(4000), variable: 'y'.repeat(2000) }, want: { t: true, c: false } });
  const cacheTok = Math.ceil(JSON.stringify(prm.system[0]).length / 4) + Math.ceil(JSON.stringify(prm.messages[0].content[0]).length / 4);
  const plainTok = Math.ceil(JSON.stringify(prm.messages[0].content[1]).length / 4);
  const pr = ab.priceFor(prm.model);
  assert(Math.abs(ds.maxCostOf(prm) - ((cacheTok * 1.25 + plainTok) * pr.in + prm.max_tokens * pr.out) * 0.5 / 1e6) < 1e-12, 'N3 : estimation = entrée mise en cache x 1,25 + entrée normale x 1 + sortie maximale, à 50 %');
  const sp3 = ab.status('own'); const tr3 = ab.trancheOf(new Date()); const c3 = ds.maxCostOf(prm);
  process.env.AI_BUDGET_MONTH_USD = String((sp3.spentMonth + c3 * 1.6) * 4 / tr3);
  addDoc('n3a-aaaaa', NW(30, 'n3a_'));
  const sub3 = nSubmit; rr = await ds.syncConnection('own', act);
  const est1 = db.prepare("SELECT estCost FROM drive_batches WHERE status = 'submitted' ORDER BY id DESC").get();
  assert(nSubmit === sub3 + 1 && est1 && est1.estCost > 0 && est1.estCost <= c3 * 1.6, 'N3 : coût estimé stocké dans drive_batches (colonne estCost)');
  addDoc('n3b-aaaaa', NW(30, 'n3b_'));
  rr = await ds.syncConnection('own', act);
  assert(nSubmit === sub3 + 1 && rr.budgetDeferred === 1 && !seenF('n3b-aaaaa'), 'N3 : le lot en vol réduit le reste : le 2e fichier attend (sinon le même reste serait consommé deux fois)');
  db.prepare("UPDATE drive_batches SET status = 'done'").run();
  delete process.env.AI_BUDGET_MONTH_USD;
  rr = await ds.syncConnection('own', act);
  assert(nSubmit === sub3 + 2, 'N3 : lot relevé (terminé) => le reste est de nouveau disponible');
  db.prepare("UPDATE drive_batches SET status = 'done'").run();
  // ---- N3b : crédit épuisé EN MODE LOT (soumission 400 « credit balance », repli direct 400) : jamais de fichier listé, boucle de repli coupée ----
  process.env.DRIVE_SYNC_MAX_FILE_INFRA_FAILS = '10';
  ['n3c', 'n3d', 'n3e', 'n3f', 'n3g'].forEach((id) => addDoc(id + '-aaaaa', NW(30, id + 'cr_')));
  submitFail = 400; let creditCalls = 0;
  dt.setCaller(async () => { creditCalls++; throw new Error('HTTP 400'); }); // l'API directe répond aussi 400 (message de crédit non relayé par ce faux appelant)
  for (let k = 0; k < 15; k++) { resetNext(); const c0 = creditCalls; await ds.syncConnection('own', act); assert(creditCalls - c0 <= 3, 'N3b : boucle de repli coupée après 3 échecs de suite (passage ' + k + ' : ' + (creditCalls - c0) + ' appels)'); }
  assert(['n3c', 'n3d', 'n3e', 'n3f', 'n3g'].every((id) => !listedReason(id + '-aaaaa') && !seenF(id + '-aaaaa')), 'N3b : 15 passages en lot avec crédit épuisé => aucun fichier listé ni marqué vu');
  assert(!db.prepare('SELECT 1 FROM drive_infra_fails WHERE n > 0').get(), 'N3b : aucune panne propre à un fichier comptée');
  creditCalls = 0; dt.setCaller(async () => { creditCalls++; throw Object.assign(new Error('HTTP 400'), { creditLow: true }); });
  for (let k = 0; k < 15; k++) { resetNext(); await ds.syncConnection('own', act); }
  assert(!db.prepare("SELECT 1 FROM drive_skipped WHERE fileId LIKE 'n3%'").get() && !db.prepare('SELECT 1 FROM drive_infra_fails WHERE n > 0').get(), 'N3b : message « credit balance » reconnu comme panne globale');
  submitFail = false; dt.setCaller(okCaller); delete process.env.DRIVE_SYNC_MAX_FILE_INFRA_FAILS;
  db.prepare("UPDATE drive_batches SET status = 'done'").run();
  aibatch.setFetch(null); delete process.env.ANTHROPIC_API_KEY; process.env.DRIVE_SYNC_BATCH = 'off';

  // ---- N3c : le jour proposé est conservé dans drive_seen_tasks (et non réduit au lundi) ----
  { const goalsLib = require('../server/lib/goals'); const mon = goalsLib.addDays(goalsLib.mostRecentMonday(new Date().toISOString().slice(0, 10)), 7), wed = goalsLib.addDays(mon, 2);
    dt.setCaller(async () => JSON.stringify({ t: [['Tâche au mercredi', KEY, wed, 20]] })); addDoc('n3day-aaaaa', NW(30, 'n3day_'));
    await ds.syncConnection('own', act);
    const dr = db.prepare("SELECT day, week FROM drive_seen_tasks WHERE title = 'Tâche au mercredi'").get();
    assert(dr && dr.day === wed && dr.week === mon, 'N3c : jour proposé (mercredi) conservé, pas seulement le lundi de la semaine'); dt.setCaller(okCaller); }

  // ---- N4 : fichier de 400 segments traité par morceaux, sans rien perdre ni répéter ----
  dt.setCaller(okCaller); await runAll(3);
  const segPara = (i) => ('w' + i + '_ ').repeat(Math.floor(19500 / ('w' + i + '_ ').length)).trim();
  addDoc('n4-aaaaa', Array.from({ length: 400 }, (_, i) => segPara(i)).join('\n\n'));
  const segSeen = [];
  dt.setCaller(async (a) => { const mm = /\bw(\d+)_ /.exec(a.variable.split('<document>')[1] || ''); segSeen.push(mm ? Number(mm[1]) : -1); return JSON.stringify({ t: [] }); });
  await ds.syncConnection('own', act);
  assert(segSeen.length === 40 && !seenF('n4-aaaaa') && hashRows('n4-aaaaa') === 0, 'N4 : au plus 40 segments par fichier et par passage, fichier non marqué vu');
  for (let k = 1; k < 10; k++) await ds.syncConnection('own', act);
  assert(seenF('n4-aaaaa') && segSeen.length === 400 && new Set(segSeen).size === 400 && !segSeen.includes(-1), 'N4 : 400 segments traités en 10 passages, chacun une seule fois (reprise par empreintes), fichier marqué vu à la fin');
  assert(!listedReason('n4-aaaaa') && !db.prepare('SELECT 1 FROM drive_seg_done WHERE fileId = ?').get('n4-aaaaa') && !db.prepare('SELECT 1 FROM drive_progress WHERE fileId = ?').get('n4-aaaaa'), 'N4 : état de reprise effacé à la fin');
  process.env.DRIVE_SYNC_MAX_DEFER_PASSES = '1';
  addDoc('n4b-aaaaa', Array.from({ length: 100 }, (_, i) => segPara(1000 + i)).join('\n\n'));
  segSeen.length = 0;
  await ds.syncConnection('own', act); await ds.syncConnection('own', act);
  assert(listedReason('n4b-aaaaa') === 'trop volumineux (traité en partie)' && seenF('n4b-aaaaa') && segSeen.length === 40, 'N4 : report prolongé (au-delà du plafond de passages) => fichier listé « trop volumineux »');
  delete process.env.DRIVE_SYNC_MAX_DEFER_PASSES;
  process.env.DRIVE_SYNC_MAX_SEGS_PER_PASS = '25';
  addDoc('n4c-aaaaa', Array.from({ length: 30 }, (_, i) => segPara(2000 + i)).join('\n\n'));
  segSeen.length = 0; await ds.syncConnection('own', act);
  assert(segSeen.length === 25 && !seenF('n4c-aaaaa'), 'N4 : plafond de segments par passage');
  delete process.env.DRIVE_SYNC_MAX_SEGS_PER_PASS; await ds.syncConnection('own', act);
  assert(seenF('n4c-aaaaa') && segSeen.length === 30, 'N4 : le reste est traité au passage suivant, sans répétition');

  // ---- N5 : une entrée skip:* inchangée n'est pas retéléchargée ; modifiée, elle est réévaluée ----
  dt.setCaller(okCaller); await runAll(2);
  const dl = []; const baseFetch = mockFetch;
  drive.setFetch(async (url, opt) => { const mm = String(url).match(/files\/([^/?]+)\/export/); if (mm) dl.push(mm[1]); return baseFetch(url, opt); });
  const longSent = 'Il faut impérativement préparer le dossier complet pour la réunion du comité de direction avant la fin du mois prochain sans faute';
  addDoc('n5a-aaaaa', 'Rappeler Paul demain'); addDoc('n5b-aaaaa', longSent); addDoc('n5c-aaaaa', longSent);
  await ds.syncConnection('own', act);
  assert(skippedReason('n5a-aaaaa') === 'vide' && skippedReason('n5c-aaaaa') === 'doublon' && db.prepare("SELECT dupHash FROM drive_skipped WHERE fileId = 'n5c-aaaaa'").get().dupHash, 'N5 : fichier court ignoré, doublon ignoré (empreinte de l\'original mémorisée)');
  dl.length = 0; await ds.syncConnection('own', act); await ds.syncConnection('own', act);
  assert(!dl.includes('n5a-aaaaa') && !dl.includes('n5c-aaaaa'), 'N5 : skip inchangé (court / doublon dont l\'original est inchangé) => aucun téléchargement répété');
  dl.length = 0; await ds.syncNow('own', act);
  assert(dl.includes('n5a-aaaaa') && dl.includes('n5c-aaaaa'), 'N5 : « Synchroniser maintenant » relit quand même les entrées skip');
  addDoc('n5d-aaaaa', 'Appeler Marie'); await ds.syncConnection('own', act); dl.length = 0;
  process.env.DRIVE_PREFILTER = 'off'; await ds.syncConnection('own', act); delete process.env.DRIVE_PREFILTER;
  assert(dl.includes('n5d-aaaaa'), 'N5 : DRIVE_PREFILTER=off relit les entrées skip');
  addDoc('n5e-aaaaa', longSent + ' et ensuite revoir les budgets'); addDoc('n5f-aaaaa', longSent + ' et ensuite revoir les budgets');
  await ds.syncConnection('own', act);
  assert(skippedReason('n5f-aaaaa') === 'doublon', 'N5 : nouveau doublon ignoré');
  touch('n5e-aaaaa', 'Texte entièrement différent qui contient assez de mots pour être traité par le pré-filtre local sans aucune difficulté particulière');
  dl.length = 0; await ds.syncConnection('own', act);
  assert(dl.includes('n5f-aaaaa') && !skippedReason('n5f-aaaaa'), 'N5 : l\'original change => le doublon est relu et réévalué (invariant B1)');
  touch('n5a-aaaaa', 'Appeler Paul demain'); dl.length = 0; await ds.syncConnection('own', act);
  assert(dl.includes('n5a-aaaaa'), 'N5 : skip dont le fichier a changé (modifiedTime) => relu et réévalué');
  drive.setFetch(mockFetch); delete process.env.DRIVE_SYNC_BATCH; dt.setCaller(null);

  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
