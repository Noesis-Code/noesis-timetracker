// Tests surveillance Drive (Google et IA simulés). Usage : node test/drivesync-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-dsync-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);
process.env.DRIVE_SYNC_MAX_AI_CALLS_PER_DAY = '4';
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
    return json({ files: Object.keys(docs).filter((id) => docs[id].parents.includes(qf)).map((id) => ({ id, name: id, mimeType: 'application/vnd.google-apps.document', modifiedTime: docs[id].mt })) }); }
  if (m && m[2]) { reads.push(m[1]); return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(docs[m[1]].text) }; }
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
  // Déconnexion : tout supprimé
  drive.setFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  await drive.disconnect('own', act);
  const left = ['drive_connections', 'drive_sync', 'drive_seen_files', 'drive_seen_tasks', 'drive_folders'].map((t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n);
  assert(left.every((n) => n === 0), 'déconnexion : connexion + surveillance supprimées');
  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
