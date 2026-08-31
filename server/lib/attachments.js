// Validation partagée pour les pièces jointes (photo, document) — utilisée
// par server/routes/history.js (ajout sur un enregistrement déjà validé,
// depuis le panneau "Historique" du Chrono) et, depuis le 31 août 2026, par
// server/routes/profile.js (pièces jointes des messages "Communauté" de la
// zone Discussion du Profil). N'est plus utilisée par server/routes/timer.js
// depuis le retrait de l'ancienne zone "Note" du Chrono (POST
// /timer/attachments, qui gérait les pièces jointes "en attente" pendant
// qu'un chrono tournait, a été retiré le même jour). Ce petit fichier
// partagé évite de dupliquer les mêmes règles à plusieurs endroits.

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 Mo décodés par fichier
const MAX_ATTACHMENTS_PER_NOTE = 4; // par session (en cours ou déjà validée)

// Estime la taille décodée d'une data URL base64 sans la décoder entièrement
// (évite d'allouer un Buffer juste pour mesurer).
function decodedSizeOf(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

// Valide le corps d'une requête d'ajout de pièce jointe. Renvoie soit
// { error } soit { fileName, mimeType, dataUrl, sizeBytes } prêt à insérer.
function validateAttachmentPayload(body) {
  const dataUrl = body.dataUrl;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return { error: 'Fichier invalide.' };
  }
  const sizeBytes = decodedSizeOf(dataUrl);
  if (sizeBytes <= 0) return { error: 'Fichier vide.' };
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    return { error: `Fichier trop lourd (${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} Mo max).` };
  }
  const fileName = (body.fileName || 'fichier').toString().slice(0, 200);
  const mimeType = (body.mimeType || 'application/octet-stream').toString().slice(0, 100);
  return { fileName, mimeType, dataUrl, sizeBytes };
}

module.exports = { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_NOTE, decodedSizeOf, validateAttachmentPayload };
