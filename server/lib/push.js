// Notifications push sur le téléphone (Web Push standard) — 1er septembre 2026,
// demande d'Emilien : « je souhaite que l'app envoie une notification sur le
// téléphone à chaque fois qu'un message a été écrit dans la communauté ou dans
// les activités ».
//
// Comment ça marche, en une fois : le navigateur du téléphone s'abonne auprès
// du service de push de son constructeur (Google pour Android/Chrome, Apple
// pour iOS/Safari, Mozilla pour Firefox) et nous renvoie une "subscription"
// (une URL + deux clés de chiffrement) qu'on stocke dans push_subscriptions.
// Pour notifier quelqu'un, le serveur envoie le message chiffré à cette URL ;
// c'est le service de push qui le réveille sur l'appareil, même app fermée.
// Noèsis ne parle jamais directement au téléphone.
//
// Conditions pour que ça marche réellement (à savoir avant de chercher un bug
// dans ce fichier) :
//   - le site doit être en HTTPS (localhost fait exception pour les tests) ;
//   - les clés VAPID ci-dessous doivent être renseignées côté serveur ;
//   - sur iPhone, l'app DOIT avoir été ajoutée à l'écran d'accueil : Safari
//     refuse les notifications d'un simple onglet (règle d'Apple, rien à voir
//     avec Noèsis) ;
//   - la personne doit avoir accepté la demande d'autorisation du navigateur.
//
// VAPID : une paire de clés qui identifie CE serveur auprès des services de
// push. À générer une fois (`npm run vapid`) et à mettre dans les variables
// d'environnement de l'hébergeur. Si elles sont absentes, tout ce fichier se
// met en sommeil proprement : aucune erreur, aucune notification, et le reste
// de l'app fonctionne exactement comme avant (c'est le cas en local par
// défaut).
//
// Principe non négociable respecté partout ici : **une notification ne doit
// JAMAIS faire échouer l'action qui l'a déclenchée.** Envoyer un message doit
// réussir même si le service de push est en panne, si une clé est mal
// configurée ou si un abonnement est mort. Toutes les fonctions publiques
// avalent donc leurs erreurs et se contentent de les journaliser.

const db = require('../db');

const PUBLIC_KEY = process.env.NOESIS_VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.NOESIS_VAPID_PRIVATE_KEY || '';
// Adresse de contact exigée par la spec VAPID (les services de push s'en
// servent pour signaler un problème). N'importe quel mailto: valide convient.
const SUBJECT = process.env.NOESIS_VAPID_SUBJECT || 'mailto:morelobaton.emilien@gmail.com';

let webpush = null;
let configured = false;

if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err) {
    // Module absent (npm install pas encore fait) ou clés invalides : on
    // reste en sommeil plutôt que d'empêcher le serveur de démarrer.
    console.warn('[push] désactivé :', err.message);
    webpush = null;
    configured = false;
  }
}

function pushEnabled() {
  return configured;
}

function publicKey() {
  return configured ? PUBLIC_KEY : '';
}

// ---------------------------------------------------------------------------
// Textes des notifications
//
// Ils sont construits ICI, côté serveur, et non dans le service worker : le
// service worker n'a pas accès à public/i18n.js ni à la langue du profil
// (pas de localStorage dans un service worker). On lit donc users.lang du
// DESTINATAIRE et on lui envoie le texte déjà dans sa langue — chaque personne
// reçoit la notification dans la sienne, même pour un même événement.
//
// Contenu voulu par Emilien (cadrage du 1er septembre 2026) : « info
// communauté ou activité + texte du message » — d'où un titre qui dit toujours
// d'où ça vient, et un corps qui contient le message lui-même.

const MESSAGE_MAX = 140; // au-delà, le système tronque de toute façon

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

const TEXTS = {
  fr: {
    inviteTitle: 'Invitation',
    inviteBody: (from, activity) => `${from} t'invite sur « ${activity} ».`,
    followTitle: 'Demande de suivi',
    followBody: (from) => `${from} souhaite te suivre.`,
    postTitle: '📣 Communauté',
    testTitle: 'Noèsis',
    testBody: 'Les notifications fonctionnent sur cet appareil.',
  },
  en: {
    inviteTitle: 'Invitation',
    inviteBody: (from, activity) => `${from} invites you to "${activity}".`,
    followTitle: 'Follow request',
    followBody: (from) => `${from} wants to follow you.`,
    postTitle: '📣 Community',
    testTitle: 'Noèsis',
    testBody: 'Notifications are working on this device.',
  },
};

function textsFor(userId) {
  const row = db.prepare('SELECT lang FROM users WHERE id = ?').get(userId);
  const lang = row && row.lang === 'fr' ? 'fr' : 'en';
  return TEXTS[lang];
}

// ---------------------------------------------------------------------------
// Envoi

// Envoie une notification à TOUS les appareils abonnés de ces personnes.
// - `userIds` : tableau d'identifiants de profil (les doublons sont ignorés).
// - `payload` : { title, body, tag, url }.
// Ne renvoie rien et ne lève jamais : l'appelant n'a pas à s'en soucier.
function sendToUsers(userIds, payload) {
  if (!configured) return;

  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (ids.length === 0) return;

  const placeholders = ids.map(() => '?').join(',');
  let subs = [];
  try {
    subs = db.prepare(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE userId IN (${placeholders})`).all(...ids);
  } catch (err) {
    console.warn('[push] lecture des abonnements impossible :', err.message);
    return;
  }
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title || 'Noèsis',
    body: payload.body || '',
    tag: payload.tag || 'noesis',
    url: payload.url || '/',
  });

  const deleteSub = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');

  subs.forEach((sub) => {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    // Volontairement sans await : l'envoi part en arrière-plan et la requête
    // HTTP qui l'a déclenché (l'envoi d'un message, par exemple) répond tout
    // de suite, sans attendre les services de push.
    webpush.sendNotification(subscription, body, { TTL: 3600 }).catch((err) => {
      const status = err && err.statusCode;
      // 404/410 = l'abonnement n'existe plus côté service de push (app
      // désinstallée, navigateur réinitialisé, autorisation retirée). C'est le
      // signal officiel pour l'oublier : c'est notre seul ménage, et il suffit.
      if (status === 404 || status === 410) {
        try { deleteSub.run(sub.id); } catch (e) { /* sans conséquence */ }
        return;
      }
      console.warn('[push] envoi échoué (' + status + ') :', err && err.body ? String(err.body).slice(0, 200) : err.message);
    });
  });
}

// ---------------------------------------------------------------------------
// Événements de l'app
//
// Une fonction par événement plutôt que des appels sendToUsers dispersés dans
// les routes : le texte et l'audience de chaque notification se lisent au même
// endroit, et une route qui déclenche une notification n'a qu'une seule ligne
// à écrire.

// ---- Adresses de renvoi (2 septembre 2026, demande d'Emilien : « que cela
// renvoie exactement à l'endroit précis de la notification ») ----
//
// Chaque notification porte une adresse qui décrit sa CIBLE, pas seulement un
// onglet : le type d'événement plus les identifiants nécessaires pour
// retrouver l'élément exact. C'est public/app.js (openTabFromNotification) qui
// sait traduire ça en « ouvre tel onglet, sélectionne telle activité, défile
// jusqu'à tel message et le met en évidence ».
//
//   /?notif=activity&activityId=12&messageId=345  → le message 345 dans le fil
//                                                   de l'activité 12
//   /?notif=post&postId=77                        → la publication 77 dans le
//                                                   flux Suivi de Communauté
//   /?notif=invite                                → le panneau Invitations
//   /?notif=follow                                → le panneau Demandes de suivi
//
// Les anciennes adresses (`notif=community`/`notif=profile`) restent comprises
// par le client : un téléphone qui n'a pas encore rechargé la nouvelle version
// de l'app continue de recevoir des notifications parfaitement utilisables, il
// atterrit simplement sur l'onglet plutôt que sur l'élément précis.

// Message écrit dans le fil de discussion d'une activité partagée : tous les
// AUTRES membres actuels de l'activité (jamais l'auteur lui-même).
// Titre = le nom de l'activité, corps = « Auteur : message » — l'info
// "activité" et le texte du message, comme demandé.
function notifyActivityMessage(activityId, authorId, messageBody, messageId) {
  if (!configured) return;
  try {
    const activity = db.prepare('SELECT name FROM activities WHERE id = ?').get(activityId);
    const author = db.prepare('SELECT name FROM users WHERE id = ?').get(authorId);
    if (!activity || !author) return;

    const recipients = db.prepare('SELECT userId FROM activity_members WHERE activityId = ? AND userId != ?')
      .all(activityId, authorId)
      .map((r) => r.userId);
    if (recipients.length === 0) return;

    // Le texte est le même pour tout le monde ici (c'est le message d'un
    // membre, pas une phrase de l'app) : un seul envoi groupé suffit.
    sendToUsers(recipients, {
      title: '💬 ' + activity.name,
      body: author.name + ' : ' + truncate(messageBody, MESSAGE_MAX),
      tag: 'activity-message-' + activityId,
      url: '/?notif=activity&activityId=' + activityId + (messageId ? '&messageId=' + messageId : ''),
    });
  } catch (err) {
    console.warn('[push] notifyActivityMessage :', err.message);
  }
}

// Publication dans la zone « écrire à sa communauté » (profile_posts) : toutes
// les personnes qui SUIVENT l'auteur, et qui verront donc ce message dans leur
// flux Suivi. Audience calquée exactement sur followingFeedForUser
// (server/lib/community.js) : abonnement accepté + profil partagé côté auteur —
// notifier quelqu'un pour un message qu'il ne pourrait pas voir n'aurait aucun
// sens. L'auteur n'est jamais dans cette liste (on ne se suit pas soi-même).
//
// Envoi individuel plutôt que groupé, contrairement au message d'activité : le
// titre est une phrase de l'app (« Communauté »), donc traduite selon la langue
// de CHAQUE destinataire.
function notifyCommunityPost(authorId, postBody, postId) {
  if (!configured) return;
  try {
    const author = db.prepare('SELECT name, shareProfile FROM users WHERE id = ?').get(authorId);
    if (!author || !author.shareProfile) return;

    const recipients = db.prepare(`
      SELECT followerId FROM follows WHERE followeeId = ? AND status = 'accepted'
    `).all(authorId).map((r) => r.followerId);
    if (recipients.length === 0) return;

    const body = author.name + ' : ' + truncate(postBody, MESSAGE_MAX);
    recipients.forEach((userId) => {
      const t = textsFor(userId);
      sendToUsers([userId], {
        title: t.postTitle,
        body: body,
        // Un tag par auteur : deux publications d'affilée de la même personne
        // se remplacent au lieu d'empiler deux lignes, comme pour un fil.
        tag: 'community-post-' + authorId,
        url: '/?notif=post&postId=' + postId,
      });
    });
  } catch (err) {
    console.warn('[push] notifyCommunityPost :', err.message);
  }
}

// Invitation à rejoindre une activité : la personne invitée uniquement.
function notifyActivityInvite(toUserId, fromUserId, activityName) {
  if (!configured) return;
  try {
    const from = db.prepare('SELECT name FROM users WHERE id = ?').get(fromUserId);
    if (!from) return;
    const t = textsFor(toUserId);
    sendToUsers([toUserId], {
      title: t.inviteTitle,
      body: t.inviteBody(from.name, activityName),
      tag: 'invite',
      url: '/?notif=invite',
    });
  } catch (err) {
    console.warn('[push] notifyActivityInvite :', err.message);
  }
}

// Demande de suivi reçue : la personne visée uniquement.
function notifyFollowRequest(toUserId, fromUserId) {
  if (!configured) return;
  try {
    const from = db.prepare('SELECT name FROM users WHERE id = ?').get(fromUserId);
    if (!from) return;
    const t = textsFor(toUserId);
    sendToUsers([toUserId], {
      title: t.followTitle,
      body: t.followBody(from.name),
      tag: 'follow-request',
      url: '/?notif=follow',
    });
  } catch (err) {
    console.warn('[push] notifyFollowRequest :', err.message);
  }
}

// Notification de test, envoyée à ses propres appareils depuis Réglages —
// pour vérifier toute la chaîne sans avoir à faire écrire quelqu'un d'autre.
function notifyTest(userId) {
  if (!configured) return;
  const t = textsFor(userId);
  sendToUsers([userId], { title: t.testTitle, body: t.testBody, tag: 'test', url: '/' });
}

module.exports = {
  pushEnabled, publicKey, sendToUsers,
  notifyActivityMessage, notifyCommunityPost, notifyActivityInvite, notifyFollowRequest, notifyTest,
};
