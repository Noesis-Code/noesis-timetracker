// Loi 25 : masquage automatique et invisible des coordonnées/numéros sensibles écrits dans un texte libre,
// appliqué à TOUT corps de requête avant envoi au modèle (aibudget.fetchAnthropic, aibatch.submit).
// Courriel, téléphone (formats nord-américains/québécois, +international), numéro de carte (Luhn) et NAS probable (Luhn) -> « [masqué] ».
// Seul le texte ENVOYÉ change ; la réponse du modèle et ce que voit l'utilisateur sont intacts.
const MASK = '[masqué]';
const luhn = (digits) => {
  let s = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) { let n = digits.charCodeAt(i) - 48; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; }
  return s % 10 === 0;
};
const NB = '(?<![\\d.,/-])', NA = '(?![\\d]|[.,]\\d)'; // pas collé à d'autres chiffres, décimales ni dates
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const CARD = new RegExp(NB + '(?:\\d{4}([ -]?)\\d{4}\\1\\d{4}\\1\\d{4}|\\d{4}([ -]?)\\d{6}\\2\\d{5})' + NA, 'g');
const PHONE = new RegExp(NB + '(?:\\+?1[\\s.-]?)?(?:\\(\\d{3}\\)\\s?|\\d{3}[\\s.-]?)\\d{3}[\\s.-]?\\d{4}' + NA, 'g');
const PHONE_INTL = new RegExp(NB + '\\+\\d{1,3}[\\s.-]?(?:\\(?\\d{1,4}\\)?[\\s.-]?){2,4}\\d{2,4}' + NA, 'g');
const NAS = new RegExp(NB + '(?:\\d{3}([ -])\\d{3}\\1\\d{3}|\\d{9})' + NA, 'g');

function scrubText(text) {
  if (typeof text !== 'string' || text.length < 7) return text;
  return text
    .replace(EMAIL, MASK)
    .replace(CARD, (m) => (luhn(m.replace(/\D/g, '')) ? MASK : m))
    .replace(PHONE_INTL, (m) => (m.replace(/\D/g, '').length >= 9 ? MASK : m))
    .replace(PHONE, MASK)
    .replace(NAS, (m) => (luhn(m.replace(/\D/g, '')) ? MASK : m));
}

const SKIP = new Set(['data', 'model', 'type', 'role', 'media_type', 'custom_id', 'id']);
function walk(v) {
  if (typeof v === 'string') return scrubText(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = SKIP.has(k) ? v[k] : walk(v[k]); return o; }
  return v;
}
// Corps JSON (chaîne) d'une requête /v1/messages -> même corps, textes masqués. Illisible : renvoyé tel quel.
function scrubBody(body) {
  if (typeof body !== 'string') return body;
  try { return JSON.stringify(walk(JSON.parse(body))); } catch (e) { return body; }
}
// Objet params (lot) -> copie masquée.
function scrubParams(params) { return params && typeof params === 'object' ? walk(params) : params; }

module.exports = { scrubText, scrubBody, scrubParams, MASK };
