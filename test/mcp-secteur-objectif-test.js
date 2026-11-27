// Tests : outils « creer_secteur » et « creer_objectif » du connecteur IA (27 nov. 2026) — gratuits, cloisonnés par compte, journalisés, réversibles, sans appel IA de Noèsis.
const http = require('http');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-mcp-so-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.PORT = require('child_process').execFileSync(process.execPath, ['-e', "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})"]).toString().trim();
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const aitokens = require('../server/lib/aitokens');
const goals = require('../server/lib/goals');

let aiCalls = 0;
const realFetch = global.fetch; global.fetch = (...a) => { aiCalls++; return realFetch ? realFetch(...a) : Promise.reject(new Error('fetch')); };

['A', 'B'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?,?,datetime('now'))").run(u, u));
const actA = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('ProjetA','A','')").run().lastInsertRowid);
const actB = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Autre','B','')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actA, 'A');
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(actB, 'B');
goals.addCategory(actA, 'Pilotage'); goals.addCategory(actB, 'Production');
const poleA = goals.categoriesForActivity(actA)[0].key, poleB = goals.categoriesForActivity(actB)[0].key;
const tokA = aitokens.createToken('A', 'w', true), tokB = aitokens.createToken('B', 'w', true), tokRO = aitokens.createToken('A', 'ro', false);

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
const data = (r) => JSON.parse(r.content[0].text);

(async () => {
  await waitReady();
  try {
    assert((await tool(tokRO, 'creer_secteur', { activityId: actA, pole: poleA, nom: 'Données' })).status === 403, 'jeton lecture seule : création de secteur refusée');
    assert((await tool(tokB, 'creer_secteur', { activityId: actA, pole: poleA, nom: 'Intrus' })).isError, "créer un secteur dans l'activité d'un autre : refusé");
    assert((await tool(tokA, 'creer_secteur', { activityId: actA, pole: poleA, nom: 'x'.repeat(41) })).isError, 'nom de 41 caractères refusé');

    const s1 = await tool(tokA, 'creer_secteur', { activityId: actA, pole: 'Pilotage', nom: 'Données' });
    assert(!s1.isError && data(s1).secteur, 'creer_secteur : secteur créé');
    assert(goals.secteursForPole(actA, poleA).some((s) => s.label === 'Données'), 'le secteur existe dans le pôle');
    assert((await tool(tokA, 'creer_secteur', { activityId: actA, pole: poleA, nom: 'données' })).isError, 'doublon refusé');
    const sKey = data(s1).secteur;
    assert((await tool(tokA, 'creer_secteur', { activityId: actA, pole: sKey, nom: 'Sous' })).isError, 'un secteur ne peut pas recevoir de secteur');

    const aiAvant = aiCalls;
    const o1 = await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'pole', pole: poleA, titre: 'Une offre payante où l’on choisit son but', fin: '2029-12-31', heures_par_semaine: 12.5, description: 'Temps estimé : 12 h/sem' });
    assert(!o1.isError && data(o1).objectifId, 'creer_objectif niveau pôle : objectif annuel créé');
    const r1 = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(data(o1).objectifId);
    const m1 = JSON.parse(r1.metaJson || '{}');
    assert(r1.level === 'pole' && r1.poleKey === poleA && r1.endDate === '2029-12-31', "l'objectif est au niveau pôle, échéance fin décembre");
    assert(m1.hoursPerWeek === 12.5 && m1.dateFixe === true, 'heures par semaine et date fixe enregistrées');
    assert(m1.description === 'Temps estimé : 12 h/sem', 'la description écrite par l IA est enregistrée sur l objectif');

    const o2 = await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'secteur', pole: poleA, secteur: 'Données', titre: 'Le chrono et le suivi', fin: '2027-12-31' });
    assert(!o2.isError && data(o2).objectifId, 'creer_objectif niveau secteur : objectif créé');
    const r2 = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(data(o2).objectifId);
    assert(r2.level === 'secteur' && r2.categoryKey === sKey && r2.endDate === '2027-12-31', "l'objectif est au niveau secteur, échéance fin décembre");
    assert(aiCalls === aiAvant, 'aucun appel IA de Noèsis');
    const o3 = await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'secteur', pole: poleA, secteur: 'Données', titre: 'Lointain', fin: '2034-12-31' });
    assert(!o3.isError && db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(data(o3).objectifId), 'objectif de secteur en 2034 : créé dans l arbre (même sans période de calendrier)');
    assert((await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'secteur', pole: poleA, secteur: 'Données', titre: 'Doublon', fin: '2034-12-31' })).isError, 'une case déjà occupée est refusée (rien n est remplacé)');

    assert((await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'secteur', pole: poleA, titre: 'sans secteur', fin: '2028-12-31' })).isError, 'niveau secteur sans secteur : refusé');
    assert((await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'secteur', pole: poleA, secteur: 'Inconnu', titre: 'x', fin: '2028-12-31' })).isError, 'secteur inconnu : refusé');
    assert((await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'pole', pole: poleA, titre: 'x', fin: '2080-12-31' })).isError, 'échéance à plus de 15 ans : refusée');
    assert((await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'pole', pole: poleA, titre: 'x', fin: 'demain' })).isError, 'date mal formée : refusée');
    assert((await tool(tokA, 'creer_objectif', { activityId: actA, niveau: 'pole', pole: poleA, titre: 'x', fin: '2030-12-31', heures_par_semaine: -2 })).isError, 'heures négatives : refusées');
    assert((await tool(tokB, 'creer_objectif', { activityId: actA, niveau: 'pole', pole: poleA, titre: 'intrus', fin: '2030-12-31' })).isError, "créer un objectif dans l'activité d'un autre : refusé");

    const u2 = await tool(tokA, 'annuler_modification', { journal: data(o2).journal });
    assert(!u2.isError && !db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(data(o2).objectifId), "annuler : l'objectif est supprimé");
    const u1 = await tool(tokA, 'annuler_modification', { journal: data(o1).journal });
    assert(!u1.isError && !db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(data(o1).objectifId), "annuler : l'objectif du pôle est supprimé");
    const us = await tool(tokA, 'annuler_modification', { journal: data(s1).journal });
    assert(!us.isError && !goals.secteursForPole(actA, poleA).some((s) => s.key === sKey), 'annuler : le secteur vide est retiré');

    // ---- Envois groupés : un lot = une écriture, tout ou rien, un seul numéro de journal ----
    const logCount = () => db.prepare("SELECT COUNT(*) n FROM ai_write_log WHERE userId = 'A'").get().n;
    const objCount = () => db.prepare("SELECT COUNT(*) n FROM user_objectives WHERE userId = 'A'").get().n;
    const lc0 = logCount();
    const lotS = await tool(tokA, 'creer_secteurs', { activityId: actA, pole: poleA, noms: ['Alpha', 'Bêta', 'Gamma'] });
    assert(!lotS.isError && data(lotS).secteurs.length === 3 && logCount() === lc0 + 1, 'creer_secteurs : 3 secteurs en UNE écriture');
    assert((await tool(tokA, 'creer_secteurs', { activityId: actA, pole: poleA, noms: ['Delta', 'alpha'] })).isError && !goals.secteursForPole(actA, poleA).some((s) => s.label === 'Delta'), 'creer_secteurs : un nom existant refuse tout le lot (rien n est écrit)');
    const cell = (sec, an) => ({ niveau: 'secteur', pole: poleA, secteur: sec, titre: 'T ' + sec + ' ' + an, fin: an + '-12-31', description: 'Faire : x · Résultat : y' });
    const lot = [{ niveau: 'pole', pole: poleA, titre: 'Annuel 2031', fin: '2031-12-31', heures_par_semaine: 8 }, cell('Alpha', 2027), cell('Alpha', 2028), cell('Bêta', 2027), cell('Gamma', 2036)];
    const oc0 = objCount(), lc1 = logCount();
    const lotO = await tool(tokA, 'creer_objectifs', { activityId: actA, objectifs: lot });
    assert(!lotO.isError && data(lotO).crees === 5 && objCount() === oc0 + 5, 'creer_objectifs : 5 objectifs créés en UN envoi');
    assert(logCount() === lc1 + 1, 'creer_objectifs : compté comme UNE écriture dans le journal');
    assert(db.prepare("SELECT COUNT(*) n FROM user_objectives WHERE title = 'T Gamma 2036' AND endDate = '2036-12-31' AND level = 'secteur'").get().n === 1, 'creer_objectifs : échéance 2036, au niveau secteur');
    const oc1 = objCount();
    const bad = await tool(tokA, 'creer_objectifs', { activityId: actA, objectifs: [cell('Bêta', 2030), cell('Inconnu', 2030), cell('Gamma', 2030)] });
    assert(bad.isError && /objectif 2/.test(bad.content[0].text) && objCount() === oc1, 'creer_objectifs : une erreur au 2e objectif n écrit rien et le dit');
    assert((await tool(tokA, 'creer_objectifs', { activityId: actA, objectifs: [cell('Bêta', 2030), cell('Bêta', 2030)] })).isError && objCount() === oc1, 'creer_objectifs : deux objectifs du lot dans la même case : refusé');
    assert((await tool(tokA, 'creer_objectifs', { activityId: actA, objectifs: [cell('Alpha', 2027)] })).isError && objCount() === oc1, 'creer_objectifs : case déjà occupée : refusé (rien n est remplacé)');
    assert((await tool(tokA, 'creer_objectifs', { activityId: actA, objectifs: Array.from({ length: 101 }, (_, i) => cell('Gamma', 2100 + i)) })).isError, 'creer_objectifs : plus de 100 objectifs refusé');
    assert((await tool(tokB, 'creer_objectifs', { activityId: actA, objectifs: [cell('Alpha', 2040)] })).isError && objCount() === oc1, "creer_objectifs : dans l'activité d'un autre : refusé");
    assert((await tool(tokRO, 'creer_objectifs', { activityId: actA, objectifs: [cell('Alpha', 2040)] })).status === 403, 'creer_objectifs : jeton lecture seule refusé');
    // volume : un objectif de pôle par année (une seule case par année)
    const volume = []; for (let y = 2037; y <= 2041; y++) volume.push({ niveau: 'pole', pole: poleA, titre: 'Volume ' + y, fin: y + '-12-31' });
    const t0 = Date.now(); const vol = await tool(tokA, 'creer_objectifs', { activityId: actA, objectifs: volume });
    assert(!vol.isError && data(vol).crees === 5 && Date.now() - t0 < 5000, 'creer_objectifs : lot de volume rapide (' + (Date.now() - t0) + ' ms)');
    const uLot = await tool(tokA, 'annuler_modification', { journal: data(lotO).journal });
    assert(!uLot.isError, 'annuler le lot : accepté');
    assert(db.prepare("SELECT COUNT(*) n FROM user_objectives WHERE title IN ('T Alpha 2027','T Alpha 2028','T Bêta 2027','T Gamma 2036','Annuel 2031')").get().n === 0, 'annuler : un seul numéro de journal défait tout le lot');
    const uSec = await tool(tokA, 'annuler_modification', { journal: data(lotS).journal });
    assert(!uSec.isError && !goals.secteursForPole(actA, poleA).some((s) => ['Alpha', 'Bêta', 'Gamma'].includes(s.label)), 'annuler : un seul numéro défait les 3 secteurs');

    const list = await call(tokA.token, { jsonrpc: '2.0', id: ++rid, method: 'tools/list' });
    const names = list.body.result.tools.map((t) => t.name);
    assert(names.includes('creer_secteur') && names.includes('creer_objectif') && names.includes('creer_secteurs') && names.includes('creer_objectifs'), 'les deux outils sont dans tools/list');
  } catch (e) { failed++; console.log('  FAIL exception : ' + (e && e.stack || e)); }
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTous les tests passent.');
  process.exit(failed ? 1 : 0);
})();
