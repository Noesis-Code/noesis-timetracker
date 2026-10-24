// Tests connecteur Drive (Google simulé). Usage : node test/drive-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-drive-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.EXPANSION_SANS_PAIEMENT = '0'; // ce test vérifie le paiement : interrupteur staging rétabli
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const { grantAccess } = require('../server/lib/offer1access');
const drive = require('../server/lib/drive');
const dt = require('../server/lib/documenttasks');
const router = require('../server/routes/drive');

['own', 'free'].forEach((u) => db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u));
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
const act2 = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('B','free','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act2, 'free');
grantAccess('own', 'code'); grantAccess('free', 'code');
// 'free' a un grant mais son activité... on la rend non-Essor : grant d'un autre propriétaire
db.prepare("UPDATE activities SET ownerId = 'own' WHERE id = ?").run(act2);

require('../server/lib/goals').addCategory(act, 'Production');
function call(method, p, userId, { query = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const layer = router.stack.find((l) => l.route && l.route.path === p && l.route.methods[method]);
    const stack = layer.route.stack.map((s) => s.handle);
    let st = 200;
    const res = { status(s) { st = s; return this; }, json(b) { resolve({ st, b }); }, redirect(u) { resolve({ st: 302, b: u }); } };
    const req = { userId, query, body };
    let i = 0;
    const next = () => { const h = stack[i++]; const r = h(req, res, next); if (r && r.catch) r.catch(() => {}); };
    next();
  });
}

const calls = [];
const files = {
  'doc-1111': { id: 'doc-1111', name: 'Plan', mimeType: 'application/vnd.google-apps.document', parents: ['fold-1111'] },
  'out-1111': { id: 'out-1111', name: 'Hors', mimeType: 'application/vnd.google-apps.document', parents: ['oth-er-1'] },
  'fold-1111': { id: 'fold-1111', name: 'Projet', mimeType: 'application/vnd.google-apps.folder' },
  'txt-1111': { id: 'txt-1111', name: 'n.txt', mimeType: 'text/plain', parents: ['fold-1111'], size: '5' },
};
const mkPdf = (stream) => {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 6\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
  return out;
};
files['pdf-1111'] = { id: 'pdf-1111', name: 'plan.pdf', mimeType: 'application/pdf', parents: ['fold-1111'], size: '900' };
let revoked = null;
const urls = [];
const baseFetch = async (url, opt) => {
  const u = new URL(url); calls.push(u.pathname); urls.push(u);
  const json = (o, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => o, arrayBuffer: async () => Buffer.from('') });
  if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') {
    const b = new URLSearchParams(opt.body);
    if (b.get('grant_type') === 'authorization_code') return json({ refresh_token: 'REFRESH-SECRET-1', access_token: 'at' });
    return json({ access_token: 'at' });
  }
  if (u.pathname === '/revoke') { revoked = new URLSearchParams(opt.body).get('token'); return json({}); }
  const m = u.pathname.match(/\/drive\/v3\/files(?:\/([^/]+)(\/export)?)?$/);
  if (m && !m[1] && /name contains/.test(u.searchParams.get('q') || '')) return u.searchParams.get('pageToken') ? json({ files: [{ id: 'f3', name: 'Dos3' }] }) : json({ files: [{ id: 'f1', name: 'Dos1', driveId: 'd' }, { id: 'f2', name: 'Dos2' }], nextPageToken: 'tok' });
  if (m && !m[1]) return json({ files: [files['doc-1111'], files['txt-1111']] });
  if (m && m[2]) return { ok: true, arrayBuffer: async () => Buffer.from('Texte du document: écrire le plan') };
  if (m && m[1] === 'pdf-1111' && u.searchParams.get('alt') === 'media') return { ok: true, arrayBuffer: async () => Buffer.from(mkPdf('BT /F1 18 Tf 20 100 Td (Appeler le client Drive) Tj ET'), 'latin1') };
  if (m && u.searchParams.get('alt') === 'media') return { ok: true, arrayBuffer: async () => Buffer.from('bonjour') };
  if (m) return files[m[1]] ? json(files[m[1]]) : json({}, false);
  return json({}, false);
};
drive.setFetch(baseFetch);

async function assertThrows(fn, code, label) { try { await fn(); assert(false, label); } catch (e) { assert(e.statusCode === code, label); } }
(async () => {
  // Non configuré
  let r = await call('get', '/drive/status', 'own', { query: { activityId: act } });
  assert(r.st === 200 && r.b.configured === false && /non configuré/i.test(r.b.message), 'non configuré : statut clair');
  r = await call('get', '/drive/connect', 'own', { query: { activityId: act } });
  assert(r.st === 503 && /non configuré/i.test(r.b.error), 'non configuré : connect = 503 message clair');

  process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
  process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);

  // Accès
  db.prepare("UPDATE offer1_grants SET revokedAt = 'x' WHERE userId = 'free'").run();
  r = await call('get', '/drive/status', 'free', { query: { activityId: act2 } });
  assert(r.st === 403, 'sans Offre 1 : refusé');
  grantAccess('free', 'code'); // code gratuit : Essor sur toutes les activités dont il est membre (règle du 16 oct. 2026)
  r = await call('get', '/drive/status', 'free', { query: { activityId: act2 } });
  assert(r.st === 200, 'code gratuit : Essor sur son activité');
  r = await call('get', '/drive/status', 'free', { query: { activityId: act } });
  assert(r.st === 403, 'non-membre : refusé');

  // Connect
  r = await call('get', '/drive/connect', 'own', { query: { activityId: act } });
  const url = new URL(r.b.url);
  assert(url.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.readonly' && url.searchParams.get('access_type') === 'offline' && url.searchParams.get('prompt') === 'consent', 'URL : scope readonly, offline, consent');
  const state = url.searchParams.get('state');

  // State invalide / autre utilisateur
  r = await call('get', '/drive/callback', 'own', { query: { code: 'c', state: 'bidon.xx' } });
  assert(r.st === 400, 'state invalide refusé');
  r = await call('get', '/drive/callback', 'own', { query: { code: 'c', state: state.slice(0, -2) + 'zz' } });
  assert(r.st === 400, 'state falsifié refusé');
  r = await call('get', '/drive/callback', 'free', { query: { code: 'c', state } });
  assert(r.st === 400, 'state lié à une autre session refusé');
  assert(!db.prepare('SELECT 1 FROM drive_connections').get(), 'rien stocké après refus');

  // Callback OK
  r = await call('get', '/drive/callback', 'own', { query: { code: 'c', state } });
  assert(r.st === 302, 'callback valide : redirection');
  const row = db.prepare('SELECT * FROM drive_connections WHERE userId = ?').get('own');
  assert(row && !row.encryptedToken.includes('REFRESH-SECRET-1') && drive.decrypt(row.encryptedToken) === 'REFRESH-SECRET-1', 'token chiffré en base, déchiffrable');

  r = await call('get', '/drive/status', 'own', { query: { activityId: act } });
  assert(r.b.connected && !r.b.folderChosen, 'statut : connecté, pas de dossier');
  r = await call('get', '/drive/files', 'own', { query: { activityId: act } });
  assert(r.st === 409, 'fichiers sans dossier : refusé');

  r = await call('post', '/drive/folder', 'own', { body: { activityId: act, folderId: 'fold-1111' } });
  assert(r.st === 200 && r.b.folderName === 'Projet', 'dossier choisi');
  r = await call('post', '/drive/folder', 'own', { body: { activityId: act, folderId: 'doc-1111' } });
  assert(r.st === 400, 'un fichier n’est pas un dossier');
  r = await call('get', '/drive/files', 'own', { query: { activityId: act } });
  assert(r.st === 200 && r.b.files.length === 2, 'liste des fichiers du dossier');

  // Plusieurs dossiers
  files['fold-2222'] = { id: 'fold-2222', name: 'Second', mimeType: 'application/vnd.google-apps.folder' };
  r = await call('get', '/drive/status', 'own', { query: { activityId: act } });
  assert(r.b.folders.length === 1 && r.b.folders[0].id === 'fold-1111' && r.b.folderChosen && r.b.folderName === 'Projet', 'statut : liste de dossiers + compat folderName');
  r = await call('post', '/drive/folder', 'own', { body: { activityId: act, folderId: 'fold-2222' } });
  assert(r.st === 200 && r.b.folders.length === 2, 'ajout d’un 2e dossier (ne remplace pas)');
  r = await call('post', '/drive/folder', 'own', { body: { activityId: act, folderId: 'fold-2222' } });
  assert(r.st === 200 && r.b.folders.length === 2, 'doublon ignoré');
  r = await call('get', '/drive/files', 'own', { query: { activityId: act } });
  assert(r.b.files.length === 2 && r.b.files.every((f) => f.folderName), 'fichiers de tous les dossiers, avec nom du dossier (dédoublonnés)');
  files['doc-2222'] = { id: 'doc-2222', name: 'Autre', mimeType: 'application/vnd.google-apps.document', parents: ['fold-2222'] };
  assert(/écrire le plan/.test((await drive.readFileText('own', act, 'doc-2222')).text), 'lecture autorisée dans le 2e dossier');
  for (let i = 3; i <= 10; i++) { const id = 'fold-' + i + i + i + i; files[id] = { id, name: 'D' + i, mimeType: 'application/vnd.google-apps.folder' }; r = await call('post', '/drive/folder', 'own', { body: { activityId: act, folderId: id } }); assert(r.st === 200, 'ajout dossier ' + i); }
  files['fold-1100'] = { id: 'fold-1100', name: 'Onze', mimeType: 'application/vnd.google-apps.folder' };
  r = await call('post', '/drive/folder', 'own', { body: { activityId: act, folderId: 'fold-1100' } });
  assert(r.st === 409 && /10/.test(r.b.error), 'plafond de 10 dossiers : erreur claire');
  assert(db.prepare('SELECT COUNT(*) c FROM drive_folders').get().c === 10, '10 dossiers en base');
  db.prepare("INSERT INTO drive_seen_files (userId, activityId, fileId) VALUES ('own', ?, 'x1')").run(act);
  db.prepare("INSERT INTO drive_seen_tasks (userId, activityId, fileId, taskKey, status, createdAt) VALUES ('own', ?, 'x1', 'k', 'dismissed', '')").run(act);
  for (let i = 3; i <= 10; i++) r = await call('post', '/drive/folder/remove', 'own', { body: { activityId: act, folderId: 'fold-' + i + i + i + i } });
  assert(r.st === 200 && r.b.folders.length === 2, 'retrait de dossiers');
  assert(!db.prepare('SELECT 1 FROM drive_seen_files').get() && db.prepare('SELECT 1 FROM drive_seen_tasks').get(), 'retrait : fichiers vus effacés, tâches vues gardées');
  r = await call('post', '/drive/folder/remove', 'own', { body: { activityId: act, folderId: 'fold-2222' } });
  assert(r.st === 200 && r.b.folders.length === 1 && !urls.some((u) => /fold-2222/.test(u.href) && u.searchParams.get('alt')), 'retrait du 2e dossier');
  r = await call('post', '/drive/folder/remove', 'own', { body: { activityId: act, folderId: 'fold-2222' } });
  assert(r.st === 404, 'retrait d’un dossier non surveillé : 404');
  await assertThrows(() => drive.readFileText('own', act, 'doc-2222'), 403, 'lecture refusée après retrait du dossier');
  assert(db.prepare('SELECT folderId f FROM drive_connections').get().f === 'fold-1111', 'compat : drive_connections.folderId = premier dossier');
  // Migration idempotente depuis l'ancien schéma (un dossier par connexion)
  const cp = require('child_process');
  const dir2 = require('./lib/tmpdir').mkTmp('tmt-drive-mig-');
  const out = cp.spawnSync(process.execPath, ['-e', `
    const db = require('./server/db');
    db.exec("CREATE TABLE IF NOT EXISTS drive_connections (userId TEXT NOT NULL, activityId INTEGER NOT NULL, encryptedToken TEXT NOT NULL, folderId TEXT, folderName TEXT, connectedAt TEXT NOT NULL, PRIMARY KEY (userId, activityId))");
    db.prepare("INSERT INTO drive_connections VALUES ('u', 1, 't', 'old-folder-1', 'Ancien', '2026-01-01')").run();
    require('./server/lib/drive');
    const n = () => db.prepare('SELECT * FROM drive_folders').all();
    console.log(JSON.stringify(n()));
  `], { cwd: path.join(__dirname, '..'), env: { ...process.env, NOESIS_DATA_DIR: dir2 }, encoding: 'utf8' });
  const mig = out.stdout.trim().split('\n').pop();
  assert(/"folderId":"old-folder-1"/.test(mig) && /"folderName":"Ancien"/.test(mig), 'migration : l’ancien dossier devient une ligne drive_folders');

  urls.length = 0;
  r = await call('get', '/drive/folders', 'own', { query: { activityId: act, q: "l'a\\b" } });
  const fu = urls.filter((x) => x.pathname === '/drive/v3/files');
  assert(r.st === 200 && r.b.folders.length === 3 && fu.length === 2, 'recherche dossiers : pagination suivie');
  assert(fu[0].searchParams.get('q').endsWith("name contains 'l\\'a\\\\b'"), 'q échappé (apostrophe, antislash)');
  assert(fu[0].searchParams.get('supportsAllDrives') === 'true' && fu[0].searchParams.get('includeItemsFromAllDrives') === 'true' && fu[0].searchParams.get('corpora') === 'allDrives', 'Drive partagés inclus');
  r = await call('get', '/drive/folders', 'own', { query: { activityId: act, q: 'x'.repeat(101) } });
  assert(r.st === 400, 'q trop long refusé');

  const t = await drive.readFileText('own', act, 'doc-1111');
  assert(/écrire le plan/.test(t.text), 'Google Doc exporté en texte');
  const t2 = await drive.readFileText('own', act, 'txt-1111');
  assert(t2.text === 'bonjour', '.txt lu');
  r = await call('post', '/drive/propose', 'own', { body: { activityId: act, fileId: 'out-1111', instruction: 'x' } });
  assert(r.st === 403, 'fichier hors dossier refusé');

  const tp = await drive.readFileText('own', act, 'pdf-1111');
  assert(/Appeler le client Drive/.test(tp.text), 'PDF du Drive : texte extrait');

  let seen = null;
  dt.setCaller(async ({ user }) => { seen = user; return '{"tasks":[]}'; });
  db.prepare("INSERT OR IGNORE INTO users (id,name,createdAt) VALUES ('z','z','')").run();
  await call('post', '/drive/propose', 'own', { body: { activityId: act, fileId: 'doc-1111', instruction: 'tâches' } });
  assert(seen && /écrire le plan/.test(seen), 'le texte Drive alimente l’IA de documenttasks');
  assert(db.prepare('SELECT COUNT(*) c FROM drive_connections').get().c === 1, 'aucune persistance du contenu (une seule ligne)');

  // Erreurs non-HTTP : messages explicites, jamais « Erreur serveur »
  const errLog = console.error; console.error = () => {};
  drive.setFetch(async () => { throw new Error('ECONNRESET'); });
  r = await call('get', '/drive/folders', 'own', { query: { activityId: act } });
  assert(r.st === 502 && /Drive n’a pas répondu/.test(r.b.error), 'fetch qui jette : 502 explicite');
  drive.setFetch(baseFetch);
  const goodEnc = db.prepare('SELECT encryptedToken e FROM drive_connections WHERE userId = ?').get('own').e;
  db.prepare("UPDATE drive_connections SET encryptedToken = 'v1.abc.def.ghi' WHERE userId = 'own'").run();
  r = await call('get', '/drive/folders', 'own', { query: { activityId: act } });
  assert(r.st === 401 && /reconnecte Drive/.test(r.b.error), 'token illisible : 401 reconnecte Drive');
  r = await call('get', '/drive/status', 'own', { query: { activityId: act } });
  assert(r.b.needsReconnect === true, 'token illisible : needsReconnect posé');
  db.prepare('UPDATE drive_connections SET encryptedToken = ? WHERE userId = ?').run(goodEnc, 'own');
  db.prepare('UPDATE drive_sync SET needsReconnect = 0').run();
  console.error = errLog;

  // Déconnexion
  r = await call('post', '/drive/disconnect', 'own', { body: { activityId: act } });
  assert(r.b.disconnected && revoked === 'REFRESH-SECRET-1', 'révoqué chez Google');
  assert(!db.prepare('SELECT 1 FROM drive_connections').get(), 'déconnexion supprime le token');

  console.log(failed ? failed + ' échec(s)' : 'Tous les tests passent');
  process.exit(failed ? 1 : 0);
})();
