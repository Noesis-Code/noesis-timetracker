// Routes d'abonnement aux notifications push (1er septembre 2026).
// La logique d'envoi est dans server/lib/push.js ; ici on ne fait que gérer
// l'abonnement/désabonnement d'un APPAREIL, et un envoi de test.

const express = require('express');
const db = require('../db');
const { pushEnabled, publicKey, notifyTest } = require('../lib/push');

const router = express.Router();

// Ce que le client a besoin de savoir avant d'afficher quoi que ce soit :
// est-ce que les notifications sont configurées sur ce serveur, et avec quelle
// clé publique s'abonner. Pas d'userId requis : rien de personnel ici.
router.get('/push/public-key', (req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: publicKey() });
});

// Cet appareil est-il déjà abonné pour ce profil ? Sert à afficher le bon
// bouton (Activer / Désactiver) à l'ouverture de Réglages. On compare sur
// l'endpoint, qui identifie l'appareil : le même profil ouvert sur le
// téléphone et sur l'ordinateur a deux réponses différentes, ce qui est
// exactement le comportement voulu.
router.get('/push/status', (req, res) => {
  const userId = req.query.userId;
  const endpoint = req.query.endpoint;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  if (!endpoint) return res.json({ enabled: pushEnabled(), subscribed: false });

  const row = db.prepare('SELECT 1 FROM push_subscriptions WHERE userId = ? AND endpoint = ?').get(userId, endpoint);
  res.json({ enabled: pushEnabled(), subscribed: !!row });
});

// Abonne cet appareil pour ce profil. Idempotent : le même endpoint réenvoyé
// écrase sa propre ligne (clés de chiffrement rafraîchies, profil réattribué
// si quelqu'un d'autre s'est connecté sur cet appareil entre-temps) au lieu
// d'accumuler des doublons — c'est le rôle de la contrainte UNIQUE sur
// endpoint dans server/db.js.
router.post('/push/subscribe', (req, res) => {
  const userId = req.body.userId;
  const sub = req.body.subscription;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: "Abonnement aux notifications invalide." });
  }

  db.prepare(`
    INSERT INTO push_subscriptions (userId, endpoint, p256dh, auth, createdAt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET userId = excluded.userId, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, new Date().toISOString());

  res.status(201).json({ ok: true });
});

// Désabonne cet appareil. On exige que l'endpoint appartienne bien au profil
// qui demande : sans ce contrôle, connaître l'endpoint de quelqu'un suffirait
// à lui couper ses notifications.
router.delete('/push/subscribe', (req, res) => {
  const userId = req.query.userId;
  const endpoint = req.query.endpoint;
  if (!userId || !endpoint) return res.status(400).json({ error: 'userId et endpoint requis.' });

  const row = db.prepare('SELECT id, userId FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
  if (!row) return res.json({ ok: true }); // déjà absent : rien à faire, pas une erreur
  if (row.userId !== userId) return res.status(403).json({ error: "Cet appareil n'est pas abonné avec ton profil." });

  db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Envoi de test vers ses PROPRES appareils uniquement — jamais vers ceux de
// quelqu'un d'autre, quel que soit le corps de la requête.
router.post('/push/test', (req, res) => {
  const userId = req.body.userId;
  if (!userId) return res.status(400).json({ error: 'userId requis.' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Profil introuvable.' });

  if (!pushEnabled()) return res.status(503).json({ error: "Les notifications ne sont pas configurées sur ce serveur." });

  const count = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE userId = ?').get(userId).n;
  if (count === 0) return res.status(400).json({ error: "Aucun appareil abonné — active d'abord les notifications." });

  notifyTest(userId);
  res.json({ ok: true, devices: count });
});

module.exports = router;
