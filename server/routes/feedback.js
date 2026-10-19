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

// Destination unique des messages d'aide (trame 12) : variable
// d'environnement CONTACT_EMAIL, par défaut confidentialite.noesis@gmail.com
// (adresse du compte Resend ; Gaspard la transfère ensuite vers la boîte de la compagnie).
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'confidentialite.noesis@gmail.com';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_ATTACHMENTS = 2; // une photo + un document, cadré avec Emilien
const CATEGORY_LABELS = { suggestion: 'Suggestion', bug: 'Signalement de bug' };

// 20 oct. 2026 : commentaire d'amélioration court depuis un écran (ex. Chrono). Même route, champ `screen` en plus ;
// le texte est conservé côté serveur (lié au profil), borné et échappé, puis relayé par courriel comme toute suggestion.
const SCREENS = ['chrono'];
const MAX_SCREEN_NOTE = 500;
db.exec(`CREATE TABLE IF NOT EXISTS improvement_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  screen TEXT NOT NULL,
  text TEXT NOT NULL,
  createdAt TEXT NOT NULL
)`);
function escapeNote(s) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

router.post('/feedback', requireAuth, async (req, res) => {
  const category = CATEGORY_LABELS[req.body.category] ? req.body.category : 'suggestion';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: "Écris un message avant d'envoyer." });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message trop long (${MAX_MESSAGE_LENGTH} caractères max).` });
  }

  const screen = typeof req.body.screen === 'string' ? req.body.screen : '';
  if (screen && !SCREENS.includes(screen)) return res.status(400).json({ error: 'Écran inconnu.' });
  if (screen && message.length > MAX_SCREEN_NOTE) {
    return res.status(400).json({ error: `Commentaire trop long (${MAX_SCREEN_NOTE} caractères max).` });
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

  const subject = `[Noèsis — ${CATEGORY_LABELS[category]}${screen ? ' — écran ' + screen : ''}] de ${authorLabel}`;
  if (screen) {
    db.prepare('INSERT INTO improvement_notes (userId, screen, text, createdAt) VALUES (?, ?, ?, ?)')
      .run(req.userId, screen, escapeNote(message), new Date().toISOString());
  }
  const text = `${CATEGORY_LABELS[category]} envoyé depuis l'application par ${authorLabel} (id ${req.userId}).\n\n${message}`;

  // Journal : code et texte de l'erreur Resend seulement, JAMAIS le message, le nom ni la pièce jointe.
  try {
    await sendMail({ to: CONTACT_EMAIL, subject, text, attachments });
  } catch (err) {
    console.error('[feedback] échec d\'envoi Resend : ' + err.message);
    if (screen) return res.json({ message: 'Message envoyé. Merci !', stored: true }); // déjà conservé côté serveur
    return res.status(502).json({ error: "L'envoi a échoué, réessaie plus tard" });
  }

  res.json({ message: 'Message envoyé. Merci !' });
});

module.exports = router;
