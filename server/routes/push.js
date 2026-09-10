// Routes d'abonnement aux notifications push (1er septembre 2026).
// La logique d'envoi est dans server/lib/push.js ; ici on ne fait que gérer
// l'abonnement/désabonnement d'un APPAREIL. Depuis la refonte du 10 septembre
// 2026 (section Notifications de Réglages, demande d'Emilien), l'abonnement
// est déclenché automatiquement à la création du profil ou à la connexion à
// un profil existant sur cet appareil (voir proceedAfterProfile() dans
// public/app.js) — ces deux routes /subscribe et /unsubscribe restent
// inchangées, seul l'appelant a changé. Le bouton "Envoyer un test" a été
// retiré (demande d'Emilien) : la route POST /push/test et notifyTest() ont
// été supprimées avec lui.

const express = require('express');
const db = require('../db');
const { pushEnabled, publicKey } = require('../lib/push');

const router = express.Router();

// Ce que le client a besoin de savoir avant d'afficher quoi que ce soit :
// est-ce que les notifications sont configurées sur ce serveur, et avec quelle
// clé publique s'abonner. Pas d'userId requis : rien de personnel ici.
router.get('/push/public-key', (req, res) => {
  res.json({ enabled: pushEnabled(), publicKey: publicKey() });
});

// Cet appareil est-il déjà abonné pour ce profil ? On compare sur
// l'endpoint, qui identifie l'appareil : le même profil ouvert sur le
// téléphone et sur l'ordinateur a deux réponses différentes, ce qui est
// exactement le comportement voulu. (Non appelée par public/app.js
// actuellement, qui interroge directement le navigateur via
// currentPushSubscription() — conservée telle quelle, une future page de
// gestion des appareils abonnés pourrait s'en servir.)
router.get('/push/status', (req, res) => {
  const userId = req.userId;
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
  const userId = req.userId;
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
  const userId = req.userId;
  const endpoint = req.query.endpoint;
  if (!userId || !endpoint) return res.status(400).json({ error: 'userId et endpoint requis.' });

  const row = db.prepare('SELECT id, userId FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
  if (!row) return res.json({ ok: true }); // déjà absent : rien à faire, pas une erreur
  if (row.userId !== userId) return res.status(403).json({ error: "Cet appareil n'est pas abonné avec ton profil." });

  db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
