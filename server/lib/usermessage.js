// Message montré à l'utilisateur à partir d'une erreur : jamais de texte technique brut
// (« HTTP 529 », « fetch failed », « SQLITE_… », nom de service) ; repli sur « Erreur serveur ».
const TECHNIQUE = /HTTP \d{3}|\bfetch failed|\bECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|SQLITE|constraint failed|Unexpected token|is not (?:a function|defined)|Cannot read|\bundefined\b|\[object|Anthropic|Stripe|Resend/i;

function userMessage(err, fallback) {
  const msg = err && err.message ? String(err.message) : '';
  if (err && (err.statusCode || err.aiBlocked)) return msg || fallback || 'Erreur serveur';
  if (!msg || TECHNIQUE.test(msg)) return fallback || 'Erreur serveur';
  return msg;
}

module.exports = { userMessage };
