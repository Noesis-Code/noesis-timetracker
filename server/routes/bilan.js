// Bilan : données des nouveaux blocs (lecture seule). Voir server/lib/bilan.js.
const express = require('express');
const router = express.Router();
const bilan = () => require('../lib/bilan');
const fail = (res, tag, err) => {
  if (err && err.statusCode) return res.status(err.statusCode).json({ error: err.message });
  console.error('[bilan] ' + tag, err);
  return res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
};
router.get('/bilan/moyenne-taches', (req, res) => { if (!req.userId) return res.status(400).json({ error: 'userId requis.' }); try { res.json(bilan().moyenneTaches(req.userId, req.query.activityId)); } catch (e) { fail(res, 'moyenne-taches', e); } });
router.get('/bilan/urgentes', (req, res) => { if (!req.userId) return res.status(400).json({ error: 'userId requis.' }); try { res.json(bilan().urgentes(req.userId, req.query.offset)); } catch (e) { fail(res, 'urgentes', e); } });
router.get('/bilan/proportion', (req, res) => { if (!req.userId) return res.status(400).json({ error: 'userId requis.' }); try { res.json(bilan().proportion(req.userId, req.query.activityId)); } catch (e) { fail(res, 'proportion', e); } });
router.put('/bilan/proportion', (req, res) => { if (!req.userId) return res.status(400).json({ error: 'userId requis.' }); try { res.json(bilan().setProportion(req.userId, (req.body || {}).activityId, (req.body || {}).parts)); } catch (e) { fail(res, 'proportion PUT', e); } });
module.exports = router;
