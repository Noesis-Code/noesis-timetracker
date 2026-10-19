// Garde-fou LECTURE SEULE du courtier. Le jeton Questrade ne doit jamais servir à écrire (ordres, transferts, etc.) :
// toute requête sortante vers Questrade doit passer par assertReadOnlyRequest, qui n'autorise que des GET sur une liste blanche de chemins.
// Une requête hors liste lève une erreur AVANT tout appel réseau (le test readonly-guard-test.js vérifie aussi le code source).
const OAUTH_HOST = 'login.questrade.com';
const OAUTH_PATH = '/oauth2/token';
const API_ALLOW = [
  /^v1\/time$/,
  /^v1\/accounts$/,
  /^v1\/accounts\/[A-Za-z0-9_-]{1,40}\/(positions|balances|activities)$/,
];

class WriteBlockedError extends Error {
  constructor(message) { super(message); this.name = 'WriteBlockedError'; this.code = 'WRITE_BLOCKED'; }
}

// Lève WriteBlockedError si la requête n'est pas un GET autorisé. Le message ne contient jamais l'URL complète (le jeton y figure).
function assertReadOnlyRequest({ url, method = 'GET' } = {}) {
  if (String(method).toUpperCase() !== 'GET') throw new WriteBlockedError('Requête courtier refusée : lecture seule (GET uniquement).');
  let u;
  try { u = new URL(String(url)); } catch { throw new WriteBlockedError('Requête courtier refusée : URL invalide.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new WriteBlockedError('Requête courtier refusée : https requis.');
  const host = u.hostname.toLowerCase();
  if (host === OAUTH_HOST) {
    if (u.pathname !== OAUTH_PATH || u.searchParams.get('grant_type') !== 'refresh_token') throw new WriteBlockedError('Requête courtier refusée : chemin OAuth non autorisé.');
    return true;
  }
  if (!/^([a-z0-9-]+\.)+questrade\.com$/.test(host)) throw new WriteBlockedError('Requête courtier refusée : hôte non autorisé.');
  const path = u.pathname.replace(/^\//, '');
  if (path.includes('..') || !API_ALLOW.some((re) => re.test(path))) throw new WriteBlockedError('Requête courtier refusée : chemin hors liste blanche.');
  return true;
}

module.exports = { assertReadOnlyRequest, WriteBlockedError, API_ALLOW };
