// Face ID / Touch ID (clés d'accès WebAuthn) : activer sur cet appareil, lister, retirer, se connecter (demande d'Émilien, 26 oct. 2026).
// Activer exige le mot de passe actuel (une session volée ne peut pas poser une clé d'accès durable). Se connecter ne demande rien d'autre que la clé :
// elle remplace le mot de passe, jamais la création du compte. Les comptes qui ont encore l'ancien code à 4 chiffres ne peuvent rien activer
// (lib/session.js bloque tout sauf le changement de mot de passe).
const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, setSessionCookie } = require('../lib/session');
const { checkPin, LOCK_MESSAGE } = require('../lib/auth');
const P = require('../lib/passkeys');

const UNAVAILABLE = 'Face ID n’est pas disponible sur cette adresse.';

// Limite par IP sur les routes publiques de connexion (fenêtre glissante, en mémoire).
const hits = new Map();
function limited(ip, max = 30, windowMs = 60 * 1000, now = Date.now()) {
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= windowMs) hits.delete(k);
  return arr.length > max;
}
const userOf = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

router.get('/passkey/list', requireAuth, (req, res) => {
  res.json({ passkeys: P.list(req.userId) });
});

router.post('/passkey/register/options', requireAuth, async (req, res) => {
  const user = userOf(req.userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  const pw = String((req.body && req.body.password) || '').trim();
  if (pw.length > 128) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  const state = checkPin(user, pw);
  if (state === 'locked') return res.status(429).json({ error: LOCK_MESSAGE });
  if (state === 'bad') return res.status(401).json({ error: 'Mot de passe incorrect.' });
  const cfg = P.getConfig(req);
  if (!cfg) return res.status(503).json({ error: UNAVAILABLE });
  try {
    res.json({ options: await P.registrationOptions(user, cfg) });
  } catch (e) {
    if (e && e.code === 'limit') return res.status(409).json({ error: 'Tu as déjà ' + P.MAX_PER_USER + ' appareils avec Face ID. Retires-en un d’abord.' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/passkey/register/verify', requireAuth, async (req, res) => {
  const user = userOf(req.userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });
  const cfg = P.getConfig(req);
  if (!cfg) return res.status(503).json({ error: UNAVAILABLE });
  const r = await P.finishRegistration(user, cfg, req.body && req.body.response, { label: req.body && req.body.label });
  if (!r.ok) {
    const msg = r.reason === 'duplicate' ? 'Cet appareil est déjà enregistré.'
      : r.reason === 'challenge' ? 'Demande expirée. Recommence.'
      : r.reason === 'limit' ? 'Trop d’appareils enregistrés.' : 'Face ID n’a pas pu être activé.';
    return res.status(400).json({ error: msg });
  }
  res.status(201).json({ ok: true, id: r.id, passkeys: P.list(user.id) });
});

router.delete('/passkey/:id', requireAuth, (req, res) => {
  if (!P.remove(req.userId, req.params.id)) return res.status(404).json({ error: 'Introuvable.' });
  res.json({ ok: true, passkeys: P.list(req.userId) });
});

// Connexion : publique (personne n'est encore identifié) ; la clé choisie par le téléphone désigne le compte.
router.post('/passkey/login/options', async (req, res) => {
  if (limited(req.ip || 'inconnu')) return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans une minute.' });
  const cfg = P.getConfig(req);
  if (!cfg) return res.status(503).json({ error: UNAVAILABLE });
  res.json({ options: await P.loginOptions(cfg) });
});

router.post('/passkey/login/verify', async (req, res) => {
  if (limited(req.ip || 'inconnu')) return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans une minute.' });
  const cfg = P.getConfig(req);
  if (!cfg) return res.status(503).json({ error: UNAVAILABLE });
  const r = await P.finishLogin(cfg, req.body && req.body.response);
  if (!r.ok) return res.status(401).json({ error: r.reason === 'challenge' ? 'Demande expirée. Recommence.' : 'Face ID n’a pas pu te connecter.' });
  const user = userOf(r.userId);
  if (!user) return res.status(401).json({ error: 'Face ID n’a pas pu te connecter.' });
  setSessionCookie(req, res, user.id); // même effet qu'une connexion par mot de passe : le témoin de session est posé sur CET appareil
  res.json({ ok: true, id: user.id });
});

module.exports = router;
