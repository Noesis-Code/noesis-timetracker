// Connecteur Google Drive (Essor, lecture seule). Logique : server/lib/drive.js.
const express = require('express');
const db = require('../db');
const drive = require('../lib/drive');
const drivesync = require('../lib/drivesync');
const { requireOffer1Access, activityHasEssor } = require('../lib/offer1access');
const { requireAuth } = require('../lib/session');

const router = express.Router();

// Activité (query ou body) : membre ET Essor sur cette activité.
function guard(req, res, next) {
  const id = Number((req.query && req.query.activityId) ?? (req.body && req.body.activityId));
  const member = Number.isInteger(id) && db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(id, req.userId);
  if (!member) return res.status(403).json({ error: "Tu n'es pas membre de cette activité." });
  if (!activityHasEssor(id, req.userId)) return res.status(403).json({ error: 'essor_required' });
  req.activityId = id;
  next();
}
// Seul le PROPRIÉTAIRE de l'activité connecte et gère Drive (limite les appels IA / la lecture de documents). Les autres membres
// voient et trient les mêmes « Nouvelles tâches » (pending, resolve, added...), sans connecter ni changer de dossier.
function ownerOnly(req, res, next) {
  const a = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(req.activityId);
  if (!a || a.ownerId !== req.userId) return res.status(403).json({ error: "Seul le propriétaire de l'activité peut gérer la connexion à Drive." });
  next();
}
const chain = [requireAuth, requireOffer1Access, guard];
const ownerChain = [...chain, ownerOnly];

function fail(res, e, req) {
  // Journal serveur : route + message seulement (jamais de token ni de secret).
  console.error('[drive]', req ? req.method + ' ' + req.path : '', e && e.statusCode ? e.statusCode : '', e && e.message);
  res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Erreur serveur.' });
}
const wrap = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { fail(res, e, req); } };

function ownerIdOf(req) {
  const a = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(req.activityId);
  return a ? a.ownerId : req.userId;
}
// Les membres Essor VOIENT la connexion, les dossiers et les documents du propriétaire (lecture) ; seul le propriétaire connecte/déconnecte/ajoute/retire un dossier.
router.get('/drive/status', ...chain, wrap((req) => {
  const oid = ownerIdOf(req);
  const s = drive.status(oid, req.activityId); s.isOwner = oid === req.userId; return s;
}));
router.get('/drive/connect', ...ownerChain, wrap((req) => ({ url: drive.authUrl(req.userId, req.activityId) })));
router.get('/drive/folders', ...ownerChain, async (req, res) => {
  try { res.json({ folders: await drive.listFolders(req.userId, req.activityId, typeof req.query.q === 'string' ? req.query.q : '') }); } catch (e) { fail(res, e, req); }
});
router.post('/drive/folder', ...ownerChain, wrap((req) => drive.chooseFolder(req.userId, req.activityId, req.body.folderId)));
router.post('/drive/folder/remove', ...ownerChain, wrap((req) => drive.removeFolder(req.userId, req.activityId, req.body.folderId)));
router.get('/drive/files', ...chain, async (req, res) => {
  try { res.json({ files: await drive.listFiles(ownerIdOf(req), req.activityId) }); } catch (e) { fail(res, e, req); }
});
router.post('/drive/propose', ...ownerChain, wrap((req) => drive.proposeFromFile(req.userId, req.activityId, req.body.fileId, String(req.body.instruction || '').trim().slice(0, 1500))));
router.post('/drive/disconnect', ...ownerChain, wrap((req) => drive.disconnect(req.userId, req.activityId)));

// Surveillance permanente du dossier (server/lib/drivesync.js).
router.get('/drive/sync', ...ownerChain, wrap((req) => drivesync.settings(req.userId, req.activityId)));
router.post('/drive/sync/settings', ...ownerChain, wrap((req) => drivesync.saveSettings(req.userId, req.activityId, req.body)));
router.post('/drive/sync/run', ...ownerChain, wrap((req) => drivesync.syncNow(req.userId, req.activityId, typeof req.body.folderId === 'string' ? req.body.folderId : undefined)));
router.post('/drive/folder/settings', ...ownerChain, wrap((req) => drivesync.saveFolderSettings(req.userId, req.activityId, String(req.body.folderId || ''), req.body)));
router.get('/drive/sync/pending', ...chain, wrap((req) => drivesync.listPending(req.userId, req.activityId)));
router.post('/drive/sync/resolve', ...chain, wrap((req) => drivesync.resolvePending(req.userId, req.activityId, req.body.items)));
router.get('/drive/sync/added', ...chain, wrap((req) => drivesync.listAdded(req.userId, req.activityId)));
router.post('/drive/sync/added/ack', ...chain, wrap((req) => drivesync.ackAdded(req.userId, req.activityId)));
router.post('/drive/sync/added/remove', ...chain, wrap((req) => drivesync.removeAdded(req.userId, req.activityId, req.body.id)));
router.post('/drive/sync/added/restore', ...chain, wrap((req) => drivesync.restoreAdded(req.userId, req.activityId, req.body.id)));

// Retour de Google (navigation du navigateur) : pas de guard par activité, le state signé la porte.
router.get('/drive/callback', requireAuth, requireOffer1Access, async (req, res) => {
  try {
    const activityId = await drive.handleCallback(req.userId, req.query || {}, (a) => {
      if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(a, req.userId)) throw Object.assign(new Error("Tu n'es pas membre de cette activité."), { statusCode: 403 });
      if (!activityHasEssor(a, req.userId)) throw Object.assign(new Error('essor_required'), { statusCode: 403 });
      const ow = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(a);
      if (!ow || ow.ownerId !== req.userId) throw Object.assign(new Error("Seul le propriétaire de l'activité peut connecter Drive."), { statusCode: 403 });
    });
    res.redirect('/?drive=connected&activityId=' + activityId);
  } catch (e) { fail(res, e, req); }
});

module.exports = router;
