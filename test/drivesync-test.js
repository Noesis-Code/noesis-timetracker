// Tests surveillance Drive (Google et IA simulés). Usage : node test/drivesync-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-dsync-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);
process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY = '4';
process.env.DRIVE_PREFILTER = 'off'; // textes de test très courts : le pré-filtre a ses propres tests (iacout-test.js)
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const { grantAccess } = require('../server/lib/offer1access');
const drive = require('../server/lib/drive');
const ds = require('../server/lib/drivesync');
const dt = require('../server/lib/documenttasks');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own','own',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
grantAccess('own', 'code');
require('../server/lib/goals').addCategory(act, 'Production');
const catKey = dt.parseDetailed ? null : null;
const classify = require('../server/lib/goalstaskclassify');
const KEY = classify.buildClassificationCandidates(act)[0].key;

let docs = { 'f1-aaaaa': { text: 'Appeler Paul\nEnvoyer devis', mt: '2026-10-01T00:00:00Z', parents: ['fold-1111'] },
  'f2-aaaaa': { text: 'Autre', mt: '2026-10-01T00:00:00Z', parents: ['fold-1111'] } };
const outside = { id: 'out-1111', name: 'Hors', mimeType: 'application/vnd.google-apps.document', parents: ['other-1'] };
const tree = {}; // dossiers imbriqués : id -> { parents, also }
let revoke = false; const reads = [];
const mockFetch = async (url, opt) => {
  const u = new URL(url);
  const json = (o, ok = true, st = 200) => ({ ok, status: st, json: async () => o, arrayBuffer: async () => Buffer.from('') });
  if (u.pathname === '/token') { const b = new URLSearchParams(opt.body);
    if (b.get('grant_type') === 'authorization_code') return json({ refresh_token: 'R', access_token: 'at' });
    return revoke ? json({ error: 'invalid_grant' }, false, 400) : json({ access_token: 'at' }); }
  if (u.pathname === '/revoke') return json({});
  const m = u.pathname.match(/\/drive\/v3\/files(?:\/([^/]+)(\/export)?)?$/);
  if (m && !m[1]) { if (u.searchParams.get('q').startsWith('mimeType =')) return json({ files: [] });
    const qf = (u.searchParams.get('q').match(/'([^']+)' in parents/) || [])[1];
    const subs = Object.keys(tree).filter((id) => tree[id].parents.includes(qf) || (tree[id].also || []).includes(qf)).map((id) => ({ id, name: id, mimeType: 'application/vnd.google-apps.folder' }));
    return json({ files: subs.concat(Object.keys(docs).filter((id) => docs[id].parents.includes(qf)).map((id) => ({ id, name: id, mimeType: 'application/vnd.google-apps.document', modifiedTime: docs[id].mt }))) }); }
  if (m && m[2]) { reads.push(m[1]); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(docs[m[1]].text) }; }
  if (m && tree[m[1]]) return json({ id: m[1], name: m[1], mimeType: 'application/vnd.google-apps.folder', parents: tree[m[1]].parents });
  if (m && m[1] === 'fold-1111') return json({ id: 'fold-1111', name: 'Projet', mimeType: 'application/vnd.google-apps.folder' });
  if (m && m[1] === 'fold-2222') return json({ id: 'fold-2222', name: 'Second', mimeType: 'application/vnd.google-apps.folder' });
  if (m && docs[m[1]]) return json({ id: m[1], name: m[1], mimeType: 'application/vnd.google-apps.document', parents: docs[m[1]].parents });
  if (m && m[1] === 'out-1111') return json(outside);
  return json({}, false, 404);
};
drive.setFetch(mockFetch);
let aiCalls = 0, aiTitles = [];
dt.setCaller(async () => { aiCalls++; return JSON.stringify({ tasks: aiTitles.map((t) => ({ title: t, key: KEY, week: null, minutes: 30 })) }); });
const count = (st) => db.prepare('SELECT COUNT(*) n FROM drive_seen_tasks WHERE status = ?').get(st).n;
const items = () => db.prepare('SELECT label FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE sp.activityId = ?').all(act).map((r) => r.label);

(async () => {
  const st = drive.makeState('own', act);
  await drive.handleCallback('own', { state: st, code: 'c' });
  await drive.chooseFolder('own', act, 'fold-1111');
  let s = ds.settings('own', act);
  assert(s.mode === 'propose' && s.instruction === ds.DEFAULT_INSTRUCTION, 'défauts : propose + consigne par défaut');
  // Mode propose : n'écrit rien avant validation
  aiTitles = ['Appeler Paul', 'Envoyer devis'];
  let r = await ds.syncConnection('own', act);
  assert(r.proposed === 2 && items().length === 0, 'propose : 2 en attente, aucune tâche écrite');
  assert(!reads.includes('out-1111'), 'fichier hors dossier jamais lu');
  // Fichier inchangé ignoré
  const c0 = aiCalls, r0 = reads.length;
  await ds.syncConnection('own', act);
  assert(aiCalls === c0 && reads.length === r0, 'fichier inchangé ignoré (ni lecture ni IA)');
  // Validation : 1 cochée, 1 refusée
  const pend = ds.listPending('own', act).tasks;
  const res = ds.resolvePending('own', act, [{ id: pend[0].id, checked: true }, { id: pend[1].id, checked: false }]);
  assert(res.addedCount === 1 && res.dismissedCount === 1 && items().length === 1, 'validation : 1 ajoutée, 1 refusée');
  // Fichier modifié : seulement les nouvelles tâches, refusée jamais rajoutée
  docs['f1-aaaaa'].text = 'Appeler Paul\nEnvoyer devis\nNouveau'; docs['f1-aaaaa'].mt = '2026-10-02T00:00:00Z';
  aiTitles = ['Appeler Paul', 'Envoyer devis', 'Nouvelle tâche'];
  await ds.syncConnection('own', act);
  const pend2 = ds.listPending('own', act).tasks;
  assert(pend2.length === 1 && pend2[0].title === 'Nouvelle tâche', 'modifié : seule la nouvelle tâche proposée (refusée/ajoutée non rajoutées)');
  docs['f2-aaaaa'].mt = '2026-10-03T00:00:00Z';
  // Mode auto
  ds.saveSettings('own', act, { mode: 'auto', instruction: 'Seulement les urgentes' });
  docs['f1-aaaaa'].text += ' !'; docs['f1-aaaaa'].mt = '2026-10-04T00:00:00Z';
  aiTitles = ['Appeler Paul', 'Tâche auto'];
  r = await ds.syncConnection('own', act);
  assert(r.added === 1 && items().includes('Tâche auto'), 'auto : ajoutée via apply');
  // Pop-up : suppression -> dismissed, jamais rajoutée
  const added = ds.listAdded('own', act).tasks;
  assert(added.length === 1 && added[0].title === 'Tâche auto', 'pop-up : liste des tâches ajoutées');
  ds.removeAdded('own', act, added[0].id);
  assert(!items().includes('Tâche auto') && count('dismissed') >= 2, 'pop-up : suppression -> tâche retirée, clé dismissed');
  docs['f1-aaaaa'].text += ' ?'; docs['f1-aaaaa'].mt = '2026-10-05T00:00:00Z';
  await ds.syncConnection('own', act);
  assert(!items().includes('Tâche auto'), 'supprimée via pop-up : jamais rajoutée au cycle suivant');
  // Plafond (4 appels/jour)
  docs['f1-aaaaa'].text += ' +'; docs['f1-aaaaa'].mt = '2026-10-06T00:00:00Z';
  r = await ds.syncConnection('own', act);
  assert(r.capReached === true && ds.settings('own', act).capReached, 'plafond atteint : job saute et l\'état le dit');
  // Token révoqué
  db.prepare('DELETE FROM drive_ai_usage').run();
  revoke = true;
  docs['f1-aaaaa'].mt = '2026-10-07T00:00:00Z';
  r = await ds.syncConnection('own', act);
  assert(r.needsReconnect && ds.settings('own', act).needsReconnect && drive.status('own', act).needsReconnect, 'token révoqué : à reconnecter');
  const tokCalls = [];
  const f = drive.setFetch; drive.setFetch(async () => { tokCalls.push(1); return { ok: false, status: 500, json: async () => ({}) }; });
  await ds.runSweep();
  assert(tokCalls.length === 0, 'connexion à reconnecter : plus aucun appel (pas de boucle)');
  // Surveillance multi-dossiers
  revoke = false; db.prepare('UPDATE drive_sync SET needsReconnect = 0').run(); db.prepare('DELETE FROM drive_ai_usage').run(); drive.setFetch(mockFetch);
  docs['f3-aaaaa'] = { text: 'Tâche du second dossier', mt: '2026-10-08T00:00:00Z', parents: ['fold-2222'] };
  docs['f4-aaaaa'] = { text: 'Hors dossiers', mt: '2026-10-08T00:00:00Z', parents: ['fold-9999'] };
  await drive.chooseFolder('own', act, 'fold-2222');
  aiTitles = ['Tâche du second dossier'];
  const rd0 = reads.length;
  r = await ds.syncConnection('own', act);
  assert(reads.slice(rd0).includes('f3-aaaaa') && !reads.includes('f4-aaaaa'), 'multi-dossiers : le 2e dossier est surveillé, un fichier hors dossiers jamais lu');
  let denied = false; try { await drive.readFileText('own', act, 'f4-aaaaa'); } catch (e) { denied = e.statusCode === 403; }
  assert(denied, 'lecture refusée hors des dossiers choisis');
  drive.removeFolder('own', act, 'fold-2222');
  docs['f3-aaaaa'].mt = '2026-10-09T00:00:00Z';
  const rd1 = reads.length; await ds.syncConnection('own', act);
  assert(!reads.slice(rd1).includes('f3-aaaaa'), 'dossier retiré : n’est plus surveillé');
  // Sous-dossiers imbriqués, boucle, profondeur max
  Object.assign(tree, { 'sub-1111': { parents: ['fold-1111'] }, 'sub-2222': { parents: ['sub-1111'], also: [] } });
  tree['sub-1111'].also = ['sub-2222']; // boucle : sub-2222 contient sub-1111
  docs['deep-aaaaa'] = { text: 'Tâche profonde', mt: '2026-10-10T00:00:00Z', parents: ['sub-2222'] };
  let prev = 'fold-1111';
  for (let i = 1; i <= 7; i++) { tree['lvl-' + i + '0000'] = { parents: [prev] }; prev = 'lvl-' + i + '0000'; }
  docs['toodeep-aa'] = { text: 'Trop profond', mt: '2026-10-10T00:00:00Z', parents: [prev] };
  docs['lvl5file-a'] = { text: 'Niveau 6', mt: '2026-10-10T00:00:00Z', parents: ['lvl-50000'] };
  const lf = await drive.listFiles('own', act);
  const deepF = lf.find((x) => x.id === 'deep-aaaaa');
  assert(deepF && deepF.path === 'sub-1111 / sub-2222 / deep-aaaaa', 'sous-dossiers : fichier trouvé avec son chemin lisible');
  assert(lf.filter((x) => x.id === 'deep-aaaaa').length === 1, 'boucle de dossiers : pas de doublon ni de blocage');
  assert(!lf.some((x) => x.id === 'toodeep-aa') && lf.some((x) => x.id === 'lvl5file-a'), 'profondeur : au-delà de 5 niveaux ignoré, niveau 5 lu');
  assert((await drive.readFileText('own', act, 'deep-aaaaa')).text.length > 0, 'readFileText accepte un fichier de l’arborescence');
  let d2 = false; try { await drive.readFileText('own', act, 'toodeep-aa'); } catch (e) { d2 = e.statusCode === 403; }
  assert(d2, 'readFileText refuse au-delà de la profondeur');
  aiTitles = ['Tâche profonde'];
  const rd2 = reads.length; db.prepare('DELETE FROM drive_ai_usage').run();
  await ds.syncConnection('own', act);
  assert(reads.slice(rd2).includes('deep-aaaaa') && !reads.slice(rd2).includes('toodeep-aa'), 'surveillance récursive : fichier de sous-dossier lu');
  const rd3 = reads.length; await ds.syncConnection('own', act);
  assert(reads.length === rd3, 'sous-dossiers : fichiers inchangés non relus');
  // Réglages par dossier : pause, mode, consigne
  const fs1 = ds.saveFolderSettings('own', act, 'fold-1111', { mode: 'auto', instruction: ' Urgentes  seulement ', paused: true });
  const fo1 = fs1.folders.find((x) => x.id === 'fold-1111');
  assert(fo1.mode === 'auto' && fo1.instruction === 'Urgentes seulement' && fo1.paused === true, 'réglages par dossier enregistrés');
  docs['deep-aaaaa'].mt = '2026-10-11T00:00:00Z'; docs['deep-aaaaa'].text += ' +';
  const rd4 = reads.length; await ds.syncConnection('own', act);
  assert(reads.length === rd4, 'dossier en pause : non surveillé');
  const rn = await ds.syncNow('own', act, 'fold-1111');
  assert(reads.length > rd4, 'synchroniser maintenant : ce dossier est lu même en pause');
  let nf = false; try { ds.saveFolderSettings('own', act, 'inconnu-1', {}); } catch (e) { nf = e.statusCode === 404; }
  assert(nf, 'réglages d’un dossier inconnu : 404');
  // Déconnexion : surveillance supprimée, tâches proposées conservées
  const tasksBefore = db.prepare("SELECT COUNT(*) n FROM drive_seen_tasks WHERE userId = 'own' AND activityId = ?").get(act).n;
  drive.setFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  await drive.disconnect('own', act);
  const left = ['drive_connections', 'drive_sync', 'drive_seen_files', 'drive_folders'].map((t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
  assert(left.every((n) => n === 0), 'déconnexion : connexion + surveillance supprimées');
  const tasksAfter = db.prepare("SELECT COUNT(*) n FROM drive_seen_tasks WHERE userId = 'own' AND activityId = ?").get(act).n;
  assert(tasksBefore > 0 && tasksAfter === tasksBefore, 'déconnexion : les tâches proposées (en attente) restent');
  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
