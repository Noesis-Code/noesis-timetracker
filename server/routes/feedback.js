// Section "Aide et suggestions" du panneau Réglages (8 septembre 2026,
// nouvelle discussion dédiée — voir
// noesis-timetracker-conformite-discussions-legal-securite.md). Cadrage avec
// Emilien : PAS de FAQ (rien dans la Loi 25 ni ailleurs ne l'exige — ça porte
// sur les données, pas sur l'ergonomie), un simple formulaire texte + pièce
// jointe optionnelle (une photo ET un document au maximum), envoyé par
// courriel à confidentialite.noesis@gmail.com via server/lib/mail.js (Resend).
//
// Minimisation Loi 25 : le formulaire ne redemande NI nom NI courriel — le
// message est authentifié par la session déjà active (req.userId, voir
// server/lib/session.js), exactement comme partout ailleurs dans l'app. Le
// nom affiché dans le courriel vient du profil déjà existant, jamais d'un
// nouveau champ collecté ici.
//
// Rétention des pièces jointes : AUCUNE. Elles transitent directement dans le
// courriel envoyé (server/lib/mail.js) puis sont oubliées — pas de table, pas
// de fichier écrit sur le volume persistant. Décision explicite d'Emilien
// (minimisation maximale) ; à documenter dans le registre des traitements
// (noesis-timetracker-conformite-loi25.md) comme nouvelle finalité "traiter
// une suggestion ou un signalement de bug", destinataire
// confidentialite.noesis@gmail.com.
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/session');
const { sendMail } = require('../lib/mail');
const { validateAttachmentPayload } = require('../lib/attachments');

const router = express.Router();

// ⚠️ 8 septembre 2026, en soirée (discussion « Connexion / Création de
// compte », sur demande directe d'Emilien) : basculé TEMPORAIREMENT vers
// compagnie.noesis@gmail.com. La destination d'origine (confidentialite.
// noesis@gmail.com, choisie le même jour, voir ci-dessous) échouait
// systématiquement (Resend, HTTP 403) : le domaine d'envoi par défaut
// resend.dev n'accepte, en l'absence de domaine vérifié sur
// resend.com/domains, que l'adresse propre au compte Resend lui-même —
// qui est compagnie.noesis@gmail.com. Emilien n'a pas de domaine pour
// Noèsis et a choisi cette solution de repli plutôt que d'en acheter un
// avant le 11 septembre (voir noesis-timetracker-chantiers-en-cours.md et
// noesis-timetracker-registre-traitements.md, ligne 10, pour le détail).
// **À REBASCULER vers confidentialite.noesis@gmail.com dès qu'un domaine
// sera vérifié sur Resend** — ce n'est plus l'adresse légalement
// documentée comme destinataire tant que ce commentaire n'a pas été
// retiré.
//
// Adresse de destination initialement confirmée par Emilien le 8 septembre
// 2026 — distincte de compagnie.noesis@gmail.com (dossier légal de
// Gaspard), qui reste l'adresse de contact générale de l'entreprise.
const CONTACT_EMAIL = 'compagnie.noesis@gmail.com';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_ATTACHMENTS = 2; // une photo + un document, cadré avec Emilien
const CATEGORY_LABELS = { suggestion: 'Suggestion', bug: 'Signalement de bug' };

router.post('/feedback', requireAuth, async (req, res) => {
  const category = CATEGORY_LABELS[req.body.category] ? req.body.category : 'suggestion';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: "Écris un message avant d'envoyer." });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message trop long (${MAX_MESSAGE_LENGTH} caractères max).` });
  }

  const rawAttachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
  if (rawAttachments.length > MAX_ATTACHMENTS) {
    return res.status(400).json({ error: 'Deux pièces jointes maximum (une photo et un document).' });
  }
  const attachments = [];
  for (const raw of rawAttachments) {
    const validated = validateAttachmentPayload(raw || {});
    if (validated.error) return res.status(400).json({ error: validated.error });
    attachments.push(validated);
  }

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.userId);
  const authorLabel = (user && user.name) || req.userId;

  const subject = `[Noèsis — ${CATEGORY_LABELS[category]}] de ${authorLabel}`;
  const text = `${CATEGORY_LABELS[category]} envoyé depuis l'application par ${authorLabel} (id ${req.userId}).\n\n${message}`;

  try {
    await sendMail({ to: CONTACT_EMAIL, subject, text, attachments });
  } catch (err) {
    console.error('[feedback] échec d\'envoi :', err.message);
    return res.status(502).json({
      error: "Échec de l'envoi. Réessaie dans un instant, ou écris directement à confidentialite.noesis@gmail.com.",
    });
  }

  res.json({ message: 'Message envoyé. Merci !' });
});

module.exports = router;
