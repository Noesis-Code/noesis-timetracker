// Réception des courriels via Resend (8 octobre 2026, demande de Gaspard) :
// tout courriel envoyé à n'importe-quoi@zenabbieu.resend.app (adresse de
// réception fournie par Resend, onglet Emails → Receiving) est renvoyé vers
// compagnie.noesis@gmail.com, pour ne pas avoir à surveiller le tableau de
// bord Resend.
//
// Fonctionnement : Resend appelle ce webhook (événement `email.received`)
// avec SEULEMENT les métadonnées du courriel (pas le corps). On récupère le
// contenu via GET https://api.resend.com/emails/receiving/{id}, puis on le
// renvoie avec server/lib/mail.js, en mettant l'expéditeur d'origine en
// « Répondre à » pour pouvoir lui répondre directement depuis Gmail.
//
// Pièces jointes : PAS renvoyées (minimisation, et elles passent par une API
// séparée de Resend) — le courriel renvoyé indique leur nombre ; elles
// restent consultables dans le tableau de bord Resend.
//
// Sécurité : la route est publique (Resend n'a pas de session), donc chaque
// appel est authentifié par la signature Svix que Resend ajoute à ses
// webhooks (en-têtes svix-id, svix-timestamp, svix-signature), vérifiée avec
// le secret du webhook (RESEND_WEBHOOK_SECRET, « whsec_... », à copier
// depuis la page du webhook dans Resend et à poser sur Railway). Sans ce
// secret, la route refuse tout (503) plutôt que d'accepter n'importe qui.
//
// ⚠️ Montée dans server/index.js AVANT express.json() : la signature porte
// sur le corps BRUT de la requête, qu'express.json() aurait déjà consommé.
const crypto = require('crypto');
const express = require('express');
const { sendMail } = require('../lib/mail');

const router = express.Router();

const FORWARD_TO = 'compagnie.noesis@gmail.com';
// Tolérance sur l'horodatage signé, contre le rejeu d'un ancien appel.
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

function verifySignature(rawBody, headers, secret) {
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_CLOCK_SKEW_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  // L'en-tête peut contenir plusieurs signatures (« v1,xxx v1,yyy ») lors
  // d'une rotation du secret : une seule valide suffit.
  return signatureHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const received = Buffer.from(sig, 'base64');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

async function fetchReceivedEmail(emailId) {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Resend a refusé la lecture du courriel reçu (HTTP ${res.status}).`);
  return res.json();
}

function addressList(value) {
  if (!value) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

router.post('/webhooks/resend-inbound', express.raw({ type: '*/*' }), async (req, res) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-inbound] RESEND_WEBHOOK_SECRET absente : appel refusé.');
    return res.status(503).json({ error: 'Webhook non configuré.' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifySignature(rawBody, req.headers, secret)) {
    return res.status(401).json({ error: 'Signature invalide.' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: 'Corps JSON invalide.' });
  }

  // Les autres événements éventuellement cochés sur ce webhook sont ignorés
  // sans erreur, pour que Resend ne les renvoie pas en boucle.
  if (!event || event.type !== 'email.received') return res.json({ ignored: true });

  const emailId = event.data && event.data.email_id;
  if (!emailId) return res.status(400).json({ error: 'email_id manquant.' });

  try {
    const email = await fetchReceivedEmail(emailId);
    const from = addressList(email.from);
    const to = addressList(email.to);
    const attachmentCount = Array.isArray(email.attachments) ? email.attachments.length : 0;

    const intro =
      `Courriel reçu sur Resend de ${from} pour ${to}.` +
      (attachmentCount
        ? ` ${attachmentCount} pièce(s) jointe(s), non renvoyée(s) : à consulter dans Resend (Emails → Receiving).`
        : '');

    await sendMail({
      to: FORWARD_TO,
      subject: `[Reçu] ${email.subject || '(sans objet)'}`,
      text: `${intro}\n\n${email.text || ''}`,
      html: email.html ? `<p>${escapeHtml(intro)}</p><hr>${email.html}` : undefined,
      replyTo: from || undefined,
    });
  } catch (err) {
    // 500 : Resend réessaiera plus tard, le courriel n'est donc pas perdu.
    console.error('[resend-inbound] échec du renvoi :', err.message);
    return res.status(500).json({ error: 'Échec du renvoi.' });
  }

  res.json({ forwarded: true });
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = router;
