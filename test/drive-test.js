// Tests connecteur Drive (Google simulé). Usage : node test/drive-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-drive-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
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
let revoked = null;
drive.setFetch(async (url, opt) => {
  const u = new URL(url); calls.push(u.pathname);
  const json = (o, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => o, arrayBuffer: async () => Buffer.from('') });
  if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') {
    const b = new URLSearchParams(opt.body);
    if (b.get('grant_type') === 'authorization_code') return json({ refresh_token: 'REFRESH-SECRET-1', access_token: 'at' });
    return json({ access_token: 'at' });
  }
  if (u.pathname === '/revoke') { revoked = new URLSearchParams(opt.body).get('token'); return json({}); }
  const m = u.pathname.match(/\/drive\/v3\/files(?:\/([^/]+)(\/export)?)?$/);
  if (m && !m[1]) return json({ files: [files['doc-1111'], files['txt-1111']] });
  if (m && m[2]) return { ok: true, arrayBuffer: async () => Buffer.from('Texte du document: écrire le plan') };
  if (m && u.searchParams.get('alt') === 'media') return { ok: true, arrayBuffer: async () => Buffer.from('bonjour') };
  if (m) return files[m[1]] ? json(files[m[1]]) : json({}, false);
  return json({}, false);
});

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
  grantAccess('free', 'code'); // grant actif mais activité appartenant à 'own' : Essor via ownerId only
  r = await call('get', '/drive/status', 'free', { query: { activityId: act2 } });
  assert(r.st === 403, 'non-Essor sur l’activité : refusé');
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

  const t = await drive.readFileText('own', act, 'doc-1111');
  assert(/écrire le plan/.test(t.text), 'Google Doc exporté en texte');
  const t2 = await drive.readFileText('own', act, 'txt-1111');
  assert(t2.text === 'bonjour', '.txt lu');
  r = await call('post', '/drive/propose', 'own', { body: { activityId: act, fileId: 'out-1111', instruction: 'x' } });
  assert(r.st === 403, 'fichier hors dossier refusé');

  let seen = null;
  dt.setCaller(async ({ user }) => { seen = user; return '{"tasks":[]}'; });
  db.prepare("INSERT OR IGNORE INTO users (id,name,createdAt) VALUES ('z','z','')").run();
  await call('post', '/drive/propose', 'own', { body: { activityId: act, fileId: 'doc-1111', instruction: 'tâches' } });
  assert(seen && /écrire le plan/.test(seen), 'le texte Drive alimente l’IA de documenttasks');
  assert(db.prepare('SELECT COUNT(*) c FROM drive_connections').get().c === 1, 'aucune persistance du contenu (une seule ligne)');

  // Déconnexion
  r = await call('post', '/drive/disconnect', 'own', { body: { activityId: act } });
  assert(r.b.disconnected && revoked === 'REFRESH-SECRET-1', 'révoqué chez Google');
  assert(!db.prepare('SELECT 1 FROM drive_connections').get(), 'déconnexion supprime le token');

  console.log(failed ? failed + ' échec(s)' : 'Tous les tests passent');
  process.exit(failed ? 1 : 0);
})();
