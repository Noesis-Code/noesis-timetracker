// Envoi de courriel via Resend (API HTTP, https://resend.com) — utilisé par
// server/routes/feedback.js pour la section "Aide et suggestions" du panneau
// Réglages (8 septembre 2026, nouvelle discussion dédiée). Aucune dépendance
// npm ajoutée : un simple appel fetch() (natif depuis Node 18, voir
// package.json "engines" >= 22.13.0) suffit à parler à l'API HTTP de Resend —
// même philosophie que server/lib/r2client.js (https natif plutôt qu'un SDK).
//
// ⚠️ Contrairement à server/lib/push.js (notifications), une panne ici n'est
// PAS avalée silencieusement : l'envoi du courriel EST l'action demandée par
// la personne (un formulaire de contact), donc son échec doit remonter
// jusqu'à l'appelant plutôt que de disparaître — c'est server/routes/feedback.js
// qui décide quoi répondre à l'utilisateur.
//
// Configuration : RESEND_API_KEY (obligatoire, posée sur Railway le
// 8 septembre 2026). RESEND_FROM (optionnel) permet de personnaliser
// l'expéditeur une fois un domaine vérifié sur resend.com/domains ; par
// défaut, le domaine de test onboarding@resend.dev est utilisé — celui-ci ne
// peut envoyer QUE vers l'adresse courriel du compte Resend lui-même tant
// qu'aucun domaine n'est vérifié. Si l'envoi échoue vers
// confidentialite.noesis@gmail.com, c'est la cause la plus probable à
// vérifier en premier (voir le message d'erreur renvoyé par Resend, journalisé
// tel quel par l'appelant).
const RESEND_API_URL = 'https://api.resend.com/emails';

function configured() {
  return !!process.env.RESEND_API_KEY;
}

function fromAddress() {
  return process.env.RESEND_FROM || 'Noèsis <onboarding@resend.dev>';
}

// attachments : [{ fileName, mimeType, dataUrl }] — dataUrl est une data URL
// base64 complète (voir server/lib/attachments.js) ; Resend attend le contenu
// base64 SANS le préfixe "data:...;base64,".
async function sendMail({ to, subject, text, attachments }) {
  if (!configured()) {
    throw new Error("Envoi de courriel indisponible : RESEND_API_KEY n'est pas configurée côté serveur.");
  }

  const payload = { from: fromAddress(), to: [to], subject, text };
  if (attachments && attachments.length) {
    payload.attachments = attachments.map((a) => ({
      filename: a.fileName,
      content: a.dataUrl.slice(a.dataUrl.indexOf(',') + 1),
    }));
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body && body.message ? body.message : '';
    } catch (err) {
      // Réponse non-JSON — pas d'information supplémentaire, on continue
      // avec seulement le code HTTP.
    }
    throw new Error(`Resend a refusé l'envoi (HTTP ${res.status})${detail ? ' : ' + detail : ''}.`);
  }

  return res.json();
}

module.exports = { configured, sendMail };
