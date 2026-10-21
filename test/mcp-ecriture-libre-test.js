// Tests : outils d'écriture libre du connecteur IA (21 oct. 2026) — gratuits, cloisonnés par compte, journalisés, réversibles, sans appel IA de Noèsis.
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-mcp-w-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.PORT = require('child_process').execFileSync(process.execPath, ['-e', "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})"]).toString().trim();
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const aitokens = require('../server/lib/aitokens');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const spell = require('../server/lib/silentspellfix');

// Détecteurs d'appel IA : correcteur silencieux et réseau.
let aiCalls = 0;
spell.setCaller(async (t) => { aiCalls++; return t; });
const realFetch = global.fetch; global.fetch = (...a) => { aiCalls++; return realFetch ? realFetch(...a) : Promise.reject(new Error('fetch')); };

['A', 'B'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?,?,datetime('now'))").run(u, u));
const actA = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('ProjetA','A','')").run().lastInsertRowid);
const actB = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('ProjetB','B','')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actA, 'A');
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actB, 'B');
goals.addCategory(actA, 'Production'); goals.addCategory(actB, 'Production');
const poleA = goals.categoriesForActivity(actA)[0].key, poleB = goals.categoriesForActivity(actB)[0].key;
const t1 = goalstasks.addCategoryTask(actA, 'A', poleA, 'Premier', { noSpellfix: true }).id;
const t2 = goalstasks.addCategoryTask(actA, 'A', poleA, 'Deuxieme', { noSpellfix: true }).id;
const t3 = goalstasks.addCategoryTask(actA, 'A', poleA, 'Troisieme', { noSpellfix: true }).id;
const tB = goalstasks.addCategoryTask(actB, 'B', poleB, 'Secret de B', { noSpellfix: true }).id;
const tokA = aitokens.createToken('A', 'w', true);
const tokB = aitokens.createToken('B', 'w', true);
const tokV = aitokens.createToken('A', 'v', true), tokV2 = aitokens.createToken('A', 'v2', true);
const tokC = aitokens.createToken('B', 'c', true);
const tokRO = aitokens.createToken('A', 'ro', false);

require('../server/index.js');
const waitReady = async () => { for (let i = 0; i < 200; i++) { const ok = await new Promise((r) => { const q = http.get({ port: process.env.PORT, host: 'localhost', path: '/healthz' }, (res) => { res.resume(); r(res.statusCode === 200); }); q.on('error', () => r(false)); }); if (ok) return; await new Promise((r) => setTimeout(r, 100)); } };
const call = (token, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const r = http.request({ port: process.env.PORT, host: 'localhost', path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Forwarded-Proto': 'https', Authorization: 'Bearer ' + token } }, (res) => {
    let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
  }); r.on('error', reject); r.end(data);
});
let rid = 0;
const tool = async (tok, name, args) => { const r = await call(tok.token, { jsonrpc: '2.0', id: ++rid, method: 'tools/call', params: { name, arguments: args } }); return r.status !== 200 ? { status: r.status } : r.body.result; };
const ok = (r) => r && !r.isError && r.content;
const data = (r) => JSON.parse(r.content[0].text);
const row = (id) => db.prepare('SELECT * FROM sub_project_items WHERE id = ?').get(id);

(async () => {
  await waitReady();
  try {
    // Jeton lecture seule : aucune écriture.
    assert((await tool(tokRO, 'creer_tache', { activityId: actA, titre: 'x', pole: poleA })).status === 403, 'jeton lecture seule : écriture refusée');

    // Cloisonnement entre comptes.
    assert((await tool(tokV, 'creer_tache', { activityId: actB, titre: 'intrus', pole: poleB })).isError, "créer dans l'activité d'un autre : refusé");
    assert((await tool(tokV, 'modifier_tache', { taskId: tB, titre: 'piraté' })).isError && row(tB).label === 'Secret de B', "modifier la tâche d'un autre : refusé");
    assert((await tool(tokV, 'retirer_tache', { taskId: tB })).isError && row(tB), "retirer la tâche d'un autre : refusé");
    assert((await tool(tokV, 'ordonner_taches', { taskIds: [t1, tB] })).isError, "ordonner avec la tâche d'un autre : refusé");
    assert((await tool(tokV, 'planifier_jour', { jour: '2026-11-01', taskIds: [tB] })).isError, "planifier la tâche d'un autre : refusé");
    assert((await tool(tokV, 'definir_objectif_periodique', { activityId: actB, pole: poleB, periode: 2, texte: 'x' })).isError, "objectif dans l'activité d'un autre : refusé");
    assert((await tool(tokV, 'definir_objectif_hebdomadaire', { activityId: actB, pole: poleB, periode: 2, semaine: 1, texte: 'x' })).isError, "hebdo dans l'activité d'un autre : refusé");

    // Validation d'entrée.
    assert((await tool(tokV2, 'creer_tache', { activityId: actA, titre: 'a'.repeat(301), pole: poleA })).isError, 'titre de 301 caractères refusé');
    assert((await tool(tokV2, 'creer_tache', { activityId: actA, titre: '   ', pole: poleA })).isError, 'titre vide refusé');
    assert((await tool(tokV2, 'creer_tache', { activityId: actA, titre: 'ok', pole: poleA, echeance: '2026-02-31' })).isError, 'date inexistante refusée');
    assert((await tool(tokV2, 'creer_tache', { activityId: actA, titre: 'ok', pole: poleA, echeance: '2099-01-01' })).isError, 'date trop lointaine refusée');
    assert((await tool(tokV2, 'creer_tache', { activityId: actA, titre: 'ok', pole: poleA, echeance: 'demain' })).isError, 'date mal formée refusée');
    assert((await tool(tokV2, 'definir_objectif_hebdomadaire', { activityId: actA, pole: poleA, periode: 2, semaine: 5, texte: 'x' })).isError, 'semaine 5 refusée');
    assert((await tool(tokV2, 'definir_objectif_periodique', { activityId: actA, pole: poleA, periode: 0, texte: 'x' })).isError, 'période 0 refusée');
    assert((await tool(tokV2, 'definir_objectif_periodique', { activityId: actA, pole: poleA, periode: 2, texte: '' })).isError, 'objectif vide refusé (pas de suppression)');
    assert((await tool(tokV2, 'planifier_jour', { jour: '2026-11-01', taskIds: Array.from({ length: 31 }, (_, i) => i + 1) })).isError, 'lot de 31 refusé');

    // Création + annulation.
    const c = await tool(tokA, 'creer_tache', { activityId: actA, titre: 'Nouvelle tâche', pole: poleA, echeance: '2026-11-05' });
    assert(ok(c) && row(data(c).taskId).dueDate === '2026-11-05', 'creer_tache avec échéance');
    const cid = data(c).taskId, cj = data(c).journal;
    assert(ok(await tool(tokA, 'annuler_modification', { journal: cj })) && !row(cid), 'annuler la création');
    assert((await tool(tokA, 'annuler_modification', { journal: cj })).isError, 'une annulation ne se rejoue pas');

    // Modification titre + échéance, puis annulation.
    const m = await tool(tokA, 'modifier_tache', { taskId: t1, titre: 'Premier renommé', echeance: '2026-11-10' });
    assert(ok(m) && row(t1).label === 'Premier renommé' && row(t1).dueDate === '2026-11-10', 'modifier_tache titre + échéance');
    const beforeDue = data(m).journal;
    assert(ok(await tool(tokA, 'annuler_modification', { journal: beforeDue })) && row(t1).label === 'Premier', 'annuler la modification');
    assert((await tool(tokB, 'annuler_modification', { journal: beforeDue })).isError, "annuler l'entrée d'un autre compte : refusé");

    // Ordre.
    const posBefore = [t1, t2, t3].map((i) => row(i).position);
    const o = await tool(tokA, 'ordonner_taches', { taskIds: [t3, t1, t2] });
    assert(ok(o) && row(t3).position < row(t1).position && row(t1).position < row(t2).position, 'ordonner_taches');
    assert(ok(await tool(tokA, 'annuler_modification', { journal: data(o).journal })) && [t1, t2, t3].map((i) => row(i).position).join() === posBefore.join(), "annuler l'ordre");

    // Plan du jour.
    const pj = await tool(tokA, 'planifier_jour', { jour: '2026-11-12', taskIds: [t1, t2] });
    assert(ok(pj) && row(t1).dueDate === '2026-11-12' && row(t2).dueDate === '2026-11-12', 'planifier_jour');

    // Retrait réversible, jamais définitif.
    const snap = row(t2);
    const rt = await tool(tokA, 'retirer_tache', { taskId: t2 });
    assert(ok(rt) && !row(t2), 'retirer_tache la retire des listes');
    assert(db.prepare('SELECT beforeJson FROM ai_write_log WHERE id = ?').get(data(rt).journal).beforeJson.includes('Deuxieme'), 'copie complète gardée au journal');
    assert(ok(await tool(tokA, 'annuler_modification', { journal: data(rt).journal })) && row(t2) && row(t2).label === snap.label && row(t2).sectionId === snap.sectionId, 'la tâche retirée revient à l\'identique (même id)');

    // Objectifs.
    const op = await tool(tokA, 'definir_objectif_periodique', { activityId: actA, pole: poleA, periode: 2, texte: 'Lancer le site', description: 'Version 1' });
    assert(ok(op) && db.prepare('SELECT mainGoalText FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = 2').get(actA, poleA).mainGoalText === 'Lancer le site', 'objectif périodique écrit');
    const op2 = await tool(tokA, 'definir_objectif_periodique', { activityId: actA, pole: poleA, periode: 2, texte: 'Autre' });
    assert(ok(await tool(tokA, 'annuler_modification', { journal: data(op2).journal })) && db.prepare('SELECT mainGoalText FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = 2').get(actA, poleA).mainGoalText === 'Lancer le site', "annuler l'écrasement d'un objectif");
    const oh = await tool(tokA, 'definir_objectif_hebdomadaire', { activityId: actA, pole: poleA, periode: 2, semaine: 1, texte: 'Maquettes' });
    assert(ok(oh), 'objectif hebdomadaire écrit');
    assert(ok(await tool(tokA, 'annuler_modification', { journal: data(oh).journal })), 'annuler un objectif hebdomadaire créé');

    // Aucun outil de suppression définitive.
    const list = (await call(tokA.token, { jsonrpc: '2.0', id: 9, method: 'tools/list' })).body.result.tools.map((t) => t.name);
    assert(!list.some((n) => /suppr|delete|effacer/.test(n)), 'aucun outil de suppression');

    // Journal : jamais le jeton.
    const all = JSON.stringify(db.prepare('SELECT * FROM ai_write_log').all());
    assert(all.length > 10 && !all.includes(tokA.token) && !all.includes(tokB.token), 'journal rempli, sans jeton');
    assert(db.prepare("SELECT COUNT(*) n FROM ai_write_log WHERE userId = 'B'").get().n === 0, 'rien écrit au nom de B');

    // Aucun appel IA de Noèsis.
    await new Promise((r) => setTimeout(r, 300));
    assert(aiCalls === 0, 'aucun appel IA de Noèsis (correcteur et réseau : ' + aiCalls + ')');

    // Limite de débit des écritures : 20 par minute et par jeton.
    let refused = 0, passed = 0;
    for (let i = 0; i < 25; i++) { const r = await tool(tokC, 'creer_tache', { activityId: actB, titre: 'rafale ' + i, pole: poleB }); if (r.isError && /Limite/.test(r.content[0].text)) refused++; else if (ok(r)) passed++; }
    assert(passed === 20 && refused === 5, 'limite de 20 écritures par minute (' + passed + '/' + refused + ')');
  } catch (e) { failed++; console.log('  FAIL exception', e); }
  console.log(failed ? 'ÉCHEC' : 'OK');
  process.exit(failed ? 1 : 0);
})();
