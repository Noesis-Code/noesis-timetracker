// Réseau personnel privé (2 nov. 2026) : visible du seul propriétaire, jamais partagé. Module « community » (porte : lib/modulegate.js).
const express = require('express');
const net = require('../lib/networkcrm');
const textlimits = require('../lib/textlimits');
const { containsBlockedWord, BLOCKED_MESSAGE } = require('../lib/blockedwords');

const router = express.Router();

router.use('/network', (req, res, next) => (req.userId ? next() : res.status(401).json({ error: 'Session requise.' })));

const idOf = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };
const blocked = (f) => containsBlockedWord(Object.values(f).filter((v) => typeof v === 'string').join(' '));

router.get('/network/overview', (req, res) => res.json(net.overview(req.userId)));
router.get('/network/graph', (req, res) => res.json(net.graph(req.userId)));
router.get('/network/tags', (req, res) => res.json(net.tags(req.userId)));
router.get('/network/insights', (req, res) => res.json(net.insights(req.userId)));
router.get('/network/contacts', (req, res) => res.json({ contacts: net.list(req.userId, req.query) }));

router.post('/network/contacts', (req, res) => {
  const v = net.validate(req.body, false);
  if (v.error) return res.status(400).json({ error: v.error });
  if (blocked(v.fields)) return res.status(422).json({ error: BLOCKED_MESSAGE, blocked: true });
  const r = net.create(req.userId, v.fields);
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(net.getContact(req.userId, r.id));
});

router.get('/network/contacts/:id', (req, res) => {
  const id = idOf(req.params.id);
  const c = id && net.getContact(req.userId, id);
  if (!c) return res.status(404).json({ error: 'Contact introuvable.' });
  res.json(Object.assign({}, c, { notes: net.notesOf(req.userId, id), connections: net.connections(req.userId, id) }));
});

router.put('/network/contacts/:id', (req, res) => {
  const id = idOf(req.params.id);
  if (!id || !net.owns(req.userId, id)) return res.status(404).json({ error: 'Contact introuvable.' });
  const v = net.validate(req.body, true);
  if (v.error) return res.status(400).json({ error: v.error });
  if (blocked(v.fields)) return res.status(422).json({ error: BLOCKED_MESSAGE, blocked: true });
  net.update(req.userId, id, v.fields, (req.body || {}).touch === true);
  res.json(net.getContact(req.userId, id));
});

router.delete('/network/contacts/:id', (req, res) => {
  const id = idOf(req.params.id);
  if (!id || !net.remove(req.userId, id)) return res.status(404).json({ error: 'Contact introuvable.' });
  res.json({ ok: true });
});

router.post('/network/contacts/:id/notes', (req, res) => {
  const id = idOf(req.params.id);
  if (!id || !net.owns(req.userId, id)) return res.status(404).json({ error: 'Contact introuvable.' });
  const chk = textlimits.clean((req.body || {}).body, { max: 2000, word: 'Note', kind: 'text' });
  if (chk.error) return res.status(400).json({ error: chk.error });
  if (!chk.text) return res.status(400).json({ error: 'Écris une note.' });
  if (containsBlockedWord(chk.text)) return res.status(422).json({ error: BLOCKED_MESSAGE, blocked: true });
  res.status(201).json(net.addNote(req.userId, id, chk.text));
});

router.delete('/network/notes/:id', (req, res) => {
  const id = idOf(req.params.id);
  if (!id || !net.removeNote(req.userId, id)) return res.status(404).json({ error: 'Note introuvable.' });
  res.json({ ok: true });
});

router.put('/network/edges', (req, res) => {
  const { a, b, linked } = req.body || {};
  const x = idOf(a), y = idOf(b);
  if (!x || !y || x === y || typeof linked !== 'boolean') return res.status(400).json({ error: 'Deux contacts différents et linked (booléen) sont requis.' });
  if (!net.owns(req.userId, x) || !net.owns(req.userId, y)) return res.status(404).json({ error: 'Contact introuvable.' });
  net.setEdge(req.userId, x, y, linked);
  res.json({ ok: true });
});

module.exports = router;
