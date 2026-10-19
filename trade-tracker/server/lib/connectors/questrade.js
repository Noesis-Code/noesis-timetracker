// Connecteur Questrade (lecture seule) — SQUELETTE, AUCUN appel réseau par défaut.
// En attente des jetons d'Émilien ; non enregistré dans connectors/index.js tant qu'il n'est pas validé.
//
// Flux OAuth (https://www.questrade.com/api/documentation/authorization) :
//  1. L'utilisateur crée une appli personnelle Questrade et obtient un refresh_token (à saisir dans
//     l'interface, stocké CHIFFRÉ par utilisateur : brokertoken.saveBrokerToken, jamais renvoyé par l'API).
//  2. Renouvellement : GET https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=<jeton>
//     -> { access_token, api_server, refresh_token, expires_in (1800 s), token_type }.
//     Le refresh_token est À USAGE UNIQUE : le NOUVEAU jeton retourné doit être sauvegardé AVANT d'utiliser
//     l'access_token, sinon la connexion est perdue (=> ECHEC dans sync_log, l'utilisateur doit en ressaisir un).
//     L'access_token vit en mémoire seulement (jamais en base ni dans les journaux).
//  3. Appels : <api_server>v1/accounts, v1/accounts/<id>/positions, /balances, /activities?startTime&endTime
//     (fenêtre max 31 jours -> découper l'historique), en-tête Authorization: Bearer <access_token>.
// Règles : ne jamais journaliser un jeton ni une URL contenant un jeton (les messages d'erreur sont expurgés).
// Les numéros de compte courtier servent d'externalId ; ils ne sont jamais renvoyés par l'API publique.
const brokertoken = require('../brokertoken');

const LOGIN_URL = 'https://login.questrade.com/oauth2/token';
const ACCOUNT_TYPES = { TFSA: 'CELI', RRSP: 'REER', FHSA: 'CELIAPP' };

const redact = (msg, secrets) => secrets.filter(Boolean).reduce((m, s) => String(m).split(s).join('***'), String(msg));

function buildRefreshRequest(refreshToken) {
  return { url: `${LOGIN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`, method: 'GET' };
}
function parseTokenResponse(j, now = Date.now()) {
  if (!j || !j.access_token || !j.refresh_token || !j.api_server) throw new Error('réponse OAuth Questrade invalide');
  return { accessToken: j.access_token, refreshToken: j.refresh_token, apiServer: String(j.api_server).replace(/\/?$/, '/'), expiresAt: now + (Number(j.expires_in) || 1800) * 1000 };
}

// --- correspondances pures Questrade -> forme interne (voir connectors/demo.js) ---
function mapAccount(a) {
  const type = ACCOUNT_TYPES[a.type];
  return type ? { externalId: String(a.number), type, label: `${type} (Questrade)` } : null; // autres types ignorés
}
function mapPosition(p, sectorOf = () => null) {
  return { symbol: p.symbol, name: p.symbol, sector: sectorOf(p.symbol), currency: /\.TO$|\.V$/i.test(p.symbol) ? 'CAD' : 'USD',
    quantity: p.openQuantity, avgCost: p.averageEntryPrice, lastPrice: p.currentPrice };
}
function mapBalances(b) {
  return (b.perCurrencyBalances || []).filter((x) => x.currency === 'CAD' || x.currency === 'USD').map((x) => ({ currency: x.currency, cash: x.cash }));
}
function mapActivity(t) {
  const act = String(t.action || '').toLowerCase(), type = String(t.type || '').toLowerCase();
  let kind = null;
  if (type === 'trades') kind = act === 'buy' ? 'ACHAT' : act === 'sell' ? 'VENTE' : null;
  else if (type === 'dividends') kind = 'DIVIDENDE';
  else if (type === 'deposits') kind = 'APPORT';
  else if (type === 'withdrawals') kind = 'RETRAIT';
  if (!kind || !t.transactionDate) return null;
  return { externalId: [t.transactionDate, t.symbol, t.action, t.quantity, t.netAmount].join('|'), date: String(t.transactionDate).slice(0, 10), type: kind,
    symbol: t.symbol || undefined, quantity: t.quantity ? Math.abs(t.quantity) : undefined, price: t.price || undefined, amount: Math.abs(t.netAmount), currency: t.currency === 'USD' ? 'USD' : 'CAD' };
}

// http(url, { headers }) -> Promise<objet JSON> ; INJECTÉ (aucun fetch global ici). Sans lui : refus explicite.
function createQuestradeConnector({ db, env = process.env, http, now = () => Date.now(), sectorOf } = {}) {
  let session = null; // { accessToken, apiServer, expiresAt } en mémoire seulement
  const getHttp = () => { if (!http) throw new Error('connecteur Questrade non activé (aucun client HTTP fourni)'); return http; };
  async function ensureSession(user) {
    if (session && session.expiresAt - 60000 > now()) return session;
    const refresh = brokertoken.getBrokerToken(db, user.id, { env });
    if (!refresh) throw new Error('aucun jeton Questrade pour cet utilisateur');
    try {
      const t = parseTokenResponse(await getHttp()(buildRefreshRequest(refresh).url, {}), now());
      brokertoken.saveBrokerToken(db, user.id, t.refreshToken, { env, now: now() }); // rotation : sauvegarder AVANT tout autre appel
      session = t;
      return session;
    } catch (e) { throw new Error(redact(e.message, [refresh])); }
  }
  return {
    name: 'questrade',
    // TODO (jetons d'Émilien) : activer, comparer avec un compte réel, planifier le découpage de /activities par 31 jours.
    async fetchPortfolio(user) {
      const s = await ensureSession(user);
      const call = (p) => getHttp()(s.apiServer + p, { headers: { Authorization: 'Bearer ' + s.accessToken } });
      const accounts = [];
      for (const a of (await call('v1/accounts')).accounts || []) {
        const m = mapAccount(a); if (!m) continue;
        const [pos, bal, act] = await Promise.all([call(`v1/accounts/${a.number}/positions`), call(`v1/accounts/${a.number}/balances`),
          call(`v1/accounts/${a.number}/activities?startTime=${encodeURIComponent(new Date(now() - 30 * 86400e3).toISOString())}&endTime=${encodeURIComponent(new Date(now()).toISOString())}`)]);
        accounts.push({ ...m, balances: mapBalances(bal), positions: (pos.positions || []).filter((p) => p.openQuantity > 0).map((p) => mapPosition(p, sectorOf)),
          transactions: (act.activities || []).map(mapActivity).filter(Boolean) });
      }
      return { broker: 'questrade', accounts }; // usdCad : à fournir par la source de taux (A6)
    },
  };
}

module.exports = { createQuestradeConnector, buildRefreshRequest, parseTokenResponse, mapAccount, mapPosition, mapBalances, mapActivity, redact };
