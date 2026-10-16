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
const chain = [requireAuth, requireOffer1Access, guard];

function fail(res, e, req) {
  // Journal serveur : route + message seulement (jamais de token ni de secret).
  console.error('[drive]', req ? req.method + ' ' + req.path : '', e && e.statusCode ? e.statusCode : '', e && e.message);
  res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Erreur serveur.' });
}
const wrap = (fn) => async (req, res) => { try { res.json(await fn(req)); } catch (e) { fail(res, e, req); } };

router.get('/drive/status', ...chain, wrap((req) => drive.status(req.userId, req.activityId)));
router.get('/drive/connect', ...chain, wrap((req) => ({ url: drive.authUrl(req.userId, req.activityId) })));
router.get('/drive/folders', ...chain, async (req, res) => {
  try { res.json({ folders: await drive.listFolders(req.userId, req.activityId, typeof req.query.q === 'string' ? req.query.q : '') }); } catch (e) { fail(res, e, req); }
});
router.post('/drive/folder', ...chain, wrap((req) => drive.chooseFolder(req.userId, req.activityId, req.body.folderId)));
router.get('/drive/files', ...chain, async (req, res) => {
  try { res.json({ files: await drive.listFiles(req.userId, req.activityId) }); } catch (e) { fail(res, e, req); }
});
router.post('/drive/propose', ...chain, wrap((req) => drive.proposeFromFile(req.userId, req.activityId, req.body.fileId, String(req.body.instruction || '').trim().slice(0, 1500))));
router.post('/drive/disconnect', ...chain, wrap((req) => drive.disconnect(req.userId, req.activityId)));

// Surveillance permanente du dossier (server/lib/drivesync.js).
router.get('/drive/sync', ...chain, wrap((req) => drivesync.settings(req.userId, req.activityId)));
router.post('/drive/sync/settings', ...chain, wrap((req) => drivesync.saveSettings(req.userId, req.activityId, req.body)));
router.post('/drive/sync/run', ...chain, wrap((req) => drivesync.syncNow(req.userId, req.activityId)));
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
    });
    res.redirect('/?drive=connected&activityId=' + activityId);
  } catch (e) { fail(res, e, req); }
});

module.exports = router;
