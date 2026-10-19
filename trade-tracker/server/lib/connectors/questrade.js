// Connecteur Questrade (LECTURE SEULE). Aucun appel réseau sans client HTTP : le client est INJECTÉ
// (tests : faux client ; production : createFetchHttp(), activé par TRADE_CONNECTOR=questrade).
//
// Flux OAuth (https://www.questrade.com/api/documentation/authorization) :
//  1. L'utilisateur colle un refresh_token (stocké CHIFFRÉ par utilisateur : brokertoken.js, jamais renvoyé par l'API).
//  2. Renouvellement : GET https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=<jeton>
//     -> { access_token, api_server, refresh_token, expires_in (1800 s), token_type }.
//     Le refresh_token est À USAGE UNIQUE : le NOUVEAU jeton remplace l'ancien (brokertoken.rotateBrokerToken, atomique)
//     AVANT tout autre appel. L'access_token vit en mémoire seulement (par utilisateur).
//  3. Appels : <api_server>v1/accounts, /accounts/<n>/positions, /balances, /activities?startTime&endTime
//     (fenêtre max 31 jours : découpée en fenêtres de 30 jours), en-tête Authorization: Bearer <access_token>.
// Erreurs : 400/401 au renouvellement => « Jeton Questrade à renouveler » (visible via /api/broker/status) ;
// 401 sur un appel => une seule reprise avec nouvelle session ; 429 (Retry-After) et 5xx / réseau => recul exponentiel.
// Règles : jamais de jeton ni d'URL contenant un jeton dans une erreur ou un journal (messages construits ici, expurgés).
// Les numéros de compte servent d'externalId ; ils ne sont jamais renvoyés par l'API publique.
const crypto = require('node:crypto');
const brokertoken = require('../brokertoken');
const { assertReadOnlyRequest } = require('../readonlyguard');

const LOGIN_URL = 'https://login.questrade.com/oauth2/token';
const ACCOUNT_TYPES = { TFSA: 'CELI', RRSP: 'REER', FHSA: 'CELIAPP' };
const RENEW_MARKER = 'Jeton Questrade à renouveler';
const WINDOW_MS = 30 * 86400e3; // < 31 jours (limite Questrade)
const DAY = 86400e3;

const redact = (msg, secrets) => secrets.filter(Boolean).reduce((m, s) => String(m).split(s).join('***'), String(msg));

class QuestradeError extends Error {
  constructor(message, { code = 'ERROR', status = null } = {}) { super(message); this.name = 'QuestradeError'; this.code = code; this.status = status; }
}

function buildRefreshRequest(refreshToken) {
  return { url: `${LOGIN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`, method: 'GET' };
}
function parseTokenResponse(j, now = Date.now()) {
  if (!j || !j.access_token || !j.refresh_token || !j.api_server) throw new QuestradeError('réponse OAuth Questrade invalide', { code: 'BAD_RESPONSE' });
  let u;
  try { u = new URL(String(j.api_server)); } catch { throw new QuestradeError('serveur d\'API Questrade invalide', { code: 'BAD_RESPONSE' }); }
  if (u.protocol !== 'https:' || !/(^|\.)questrade\.com$/i.test(u.hostname)) throw new QuestradeError('serveur d\'API Questrade non autorisé', { code: 'BAD_RESPONSE' });
  return { accessToken: j.access_token, refreshToken: j.refresh_token, apiServer: u.origin + '/', expiresAt: now + (Number(j.expires_in) || 1800) * 1000 };
}

// Client HTTP de production (fetch). Contrat : http({ url, method, headers }) -> { status, headers: {retry-after}, body (JSON ou null) }.
// Ne lève que pour une panne réseau, avec un message SANS URL (le jeton est dans l'URL du renouvellement).
function createFetchHttp({ fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  return async function http({ url, method = 'GET', headers = {} }) {
    assertReadOnlyRequest({ url, method }); // dernier garde-fou avant le réseau : GET sur liste blanche seulement
    let res;
    try { res = await fetchImpl(url, { method, headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { throw new QuestradeError('Questrade injoignable (' + (e && e.name === 'TimeoutError' ? 'délai dépassé' : 'erreur réseau') + ')', { code: 'NETWORK' }); }
    let body = null;
    try { body = await res.json(); } catch { /* corps vide ou non JSON */ }
    return { status: res.status, headers: { 'retry-after': res.headers && res.headers.get ? res.headers.get('retry-after') : null }, body };
  };
}

// --- correspondances pures Questrade -> forme interne (voir connectors/demo.js) ---
function mapAccount(a) {
  const type = ACCOUNT_TYPES[a && a.type];
  if (!type || (a.status && String(a.status).toLowerCase() !== 'active')) return null; // autres types / comptes fermés ignorés
  return { externalId: String(a.number), type, label: `${type} (Questrade)` };
}
const CAD_SUFFIX = /\.(TO|V|CN|NE)$/i;
function mapPosition(p, sectorOf = () => null) {
  return { symbol: p.symbol, name: p.symbol, sector: sectorOf(p.symbol) || null, currency: CAD_SUFFIX.test(p.symbol) ? 'CAD' : 'USD',
    quantity: p.openQuantity, avgCost: p.averageEntryPrice ?? 0, lastPrice: p.currentPrice ?? null };
}
function mapBalances(b) {
  return ((b && b.perCurrencyBalances) || []).filter((x) => x.currency === 'CAD' || x.currency === 'USD').map((x) => ({ currency: x.currency, cash: x.cash }));
}
// Activité -> transaction interne (sans externalId : voir withExternalIds). null = ignorée.
function mapActivity(t) {
  const act = String(t.action || '').toLowerCase(), type = String(t.type || '').toLowerCase();
  const net = Number(t.netAmount);
  let kind = null;
  if (type === 'trades') kind = act === 'buy' ? 'ACHAT' : act === 'sell' ? 'VENTE' : null;
  else if (type === 'dividends') kind = net > 0 ? 'DIVIDENDE' : null;
  else if (type === 'deposits') kind = net > 0 ? 'APPORT' : null;
  else if (type === 'withdrawals') kind = net < 0 ? 'RETRAIT' : null;
  else if (type === 'transfers' && !t.symbol) kind = net > 0 ? 'APPORT' : net < 0 ? 'RETRAIT' : null; // virements d'espèces seulement
  if (!kind || !t.transactionDate || !Number.isFinite(net) || net === 0) return null;
  return { date: String(t.transactionDate).slice(0, 10), type: kind, symbol: t.symbol || undefined,
    quantity: t.quantity ? Math.abs(t.quantity) : undefined, price: t.price || undefined, amount: Math.abs(net), currency: t.currency === 'USD' ? 'USD' : 'CAD',
    _key: [t.transactionDate, t.settlementDate, t.type, t.action, t.symbol, t.quantity, t.price, t.netAmount, t.currency].join('|') };
}
// Questrade n'a pas d'identifiant d'activité : empreinte stable des champs + rang parmi les lignes identiques.
function withExternalIds(list) {
  const seen = new Map();
  return list.map((t) => {
    const n = (seen.get(t._key) || 0) + 1; seen.set(t._key, n);
    const { _key, ...rest } = t;
    return { externalId: crypto.createHash('sha1').update(_key).digest('hex').slice(0, 20) + '#' + n, ...rest };
  });
}

// Fenêtres consécutives [start, end] de <= 30 jours, sans chevauchement (1 ms d'écart).
function dateWindows(startMs, endMs, spanMs = WINDOW_MS) {
  const out = [];
  for (let s = startMs; s <= endMs; s += spanMs + 1) out.push({ start: new Date(s).toISOString(), end: new Date(Math.min(s + spanMs, endMs)).toISOString() });
  return out;
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createQuestradeConnector({ db, env = process.env, http, now = () => Date.now(), sleep = realSleep, sectorOf,
  lookbackDays = Number(env.TRADE_QUESTRADE_LOOKBACK_DAYS) || 365, retries = 3, baseDelayMs = 1000 } = {}) {
  const sessions = new Map(); // userId -> { accessToken, apiServer, expiresAt } (mémoire seulement)
  const refreshing = new Map(); // userId -> Promise (un seul renouvellement à la fois par utilisateur)
  const getHttp = () => { if (!http) throw new QuestradeError('connecteur Questrade non activé (aucun client HTTP fourni)', { code: 'DISABLED' }); return http; };
  const sectorLookup = sectorOf || ((symbol) => {
    const r = db.prepare('SELECT s.name n FROM positions p JOIN sectors s ON s.id = p.sectorId WHERE p.symbol = ? LIMIT 1').get(symbol);
    return r ? r.n : null;
  });

  // Requête avec recul : 429 (Retry-After), 5xx et pannes réseau sont rejoués ; le reste est rendu tel quel.
  async function request(req, secrets) {
    assertReadOnlyRequest(req); // lecture seule : jamais d'écriture chez le courtier (voir readonlyguard.js)
    for (let attempt = 0; ; attempt++) {
      let res = null, netErr = null;
      try { res = await getHttp()(req); } catch (e) { netErr = e; }
      if (netErr instanceof QuestradeError && netErr.code === 'DISABLED') throw netErr;
      if (res && res.status < 400) return res;
      if (res && res.status !== 429 && res.status < 500) return res; // 4xx : pas de reprise
      if (attempt >= retries) {
        const why = netErr ? redact(netErr.message, secrets) : 'HTTP ' + res.status;
        throw new QuestradeError(`Questrade indisponible après ${attempt + 1} essai(s) (${why})`, { code: res && res.status === 429 ? 'RATE_LIMIT' : 'UNAVAILABLE', status: res ? res.status : null });
      }
      const ra = res && res.status === 429 ? Number(res.headers && res.headers['retry-after']) : NaN;
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60000) : Math.min(baseDelayMs * 2 ** attempt, 30000));
    }
  }

  async function doRefresh(user) {
    const refresh = brokertoken.getBrokerToken(db, user.id, { env });
    if (!refresh) throw new QuestradeError('aucun jeton Questrade pour cet utilisateur', { code: 'NO_TOKEN' });
    const res = await request(buildRefreshRequest(refresh), [refresh]);
    if (res.status === 400 || res.status === 401) throw new QuestradeError(`${RENEW_MARKER} : Questrade a refusé le jeton enregistré (HTTP ${res.status}). Générez-en un nouveau dans le portail API Questrade et collez-le.`, { code: 'TOKEN_RENEW', status: res.status });
    if (res.status >= 400) throw new QuestradeError(`renouvellement Questrade refusé (HTTP ${res.status})`, { code: 'HTTP', status: res.status });
    const t = parseTokenResponse(res.body, now());
    // Rotation : le nouveau jeton remplace l'ancien, atomiquement, AVANT d'utiliser l'access_token.
    try { brokertoken.rotateBrokerToken(db, user.id, refresh, t.refreshToken, { env, now: now() }); }
    catch (e) { throw new QuestradeError('sauvegarde du nouveau jeton Questrade impossible : ' + redact(e.message, [refresh, t.refreshToken]), { code: 'SAVE' }); }
    const s = { accessToken: t.accessToken, apiServer: t.apiServer, expiresAt: t.expiresAt };
    sessions.set(user.id, s);
    return s;
  }
  async function ensureSession(user, force = false) {
    const cur = sessions.get(user.id);
    if (!force && cur && cur.expiresAt - 60000 > now()) return cur;
    sessions.delete(user.id);
    if (!refreshing.has(user.id)) refreshing.set(user.id, doRefresh(user).finally(() => refreshing.delete(user.id)));
    return refreshing.get(user.id);
  }

  // GET d'un chemin d'API ; sur 401, une seule reprise avec une session neuve.
  async function call(user, path) {
    for (let again = 0; ; again++) {
      const s = await ensureSession(user, again > 0);
      const res = await request({ url: s.apiServer + path, method: 'GET', headers: { Authorization: 'Bearer ' + s.accessToken } }, [s.accessToken]);
      if (res.status === 401 && again === 0) { sessions.delete(user.id); continue; }
      if (res.status >= 400) throw new QuestradeError(`Questrade a refusé la requête ${path.split('?')[0].replace(/\/\d+\//, '/<compte>/')} (HTTP ${res.status})`, { code: res.status === 401 ? 'UNAUTHORIZED' : 'HTTP', status: res.status });
      return res.body || {};
    }
  }

  // Début de la récupération des activités : compte inconnu -> historique complet (lookbackDays) ; sinon 8 jours avant
  // la dernière transaction connue (à défaut, avant la création du compte). Doublons écartés par externalId.
  function activitiesStart(user, externalId) {
    const floor = now() - lookbackDays * DAY;
    const r = db.prepare(`SELECT a.createdAt c, (SELECT MAX(t.date) FROM transactions t WHERE t.accountId = a.id) d FROM accounts a WHERE a.userId = ? AND a.externalId = ?`).get(user.id, externalId);
    if (!r) return floor;
    const ref = r.d ? Date.parse(r.d + 'T00:00:00Z') : Date.parse(r.c);
    return Number.isFinite(ref) ? Math.max(floor, ref - 8 * DAY) : floor;
  }
  async function fetchActivities(user, number, externalId) {
    const all = [];
    for (const w of dateWindows(activitiesStart(user, externalId), now())) {
      const body = await call(user, `v1/accounts/${encodeURIComponent(number)}/activities?startTime=${encodeURIComponent(w.start)}&endTime=${encodeURIComponent(w.end)}`);
      all.push(...(body.activities || []));
    }
    return withExternalIds(all.map(mapActivity).filter(Boolean));
  }

  return {
    name: 'questrade',
    requiresToken: true,
    // Tout ou rien : une erreur sur un compte fait échouer la synchro (sinon applyData effacerait des positions valides).
    async fetchPortfolio(user) {
      const accounts = [];
      for (const a of (await call(user, 'v1/accounts')).accounts || []) {
        const m = mapAccount(a); if (!m) continue;
        const n = encodeURIComponent(a.number);
        const pos = await call(user, `v1/accounts/${n}/positions`);
        const bal = await call(user, `v1/accounts/${n}/balances`);
        const transactions = await fetchActivities(user, a.number, m.externalId);
        accounts.push({ ...m, balances: mapBalances(bal), positions: (pos.positions || []).filter((p) => p.openQuantity > 0).map((p) => mapPosition(p, sectorLookup)), transactions });
      }
      return { broker: 'questrade', accounts }; // usdCad : fourni par la source de taux (A6), Questrade n'en expose pas
    },
  };
}

module.exports = { createQuestradeConnector, createFetchHttp, QuestradeError, RENEW_MARKER, buildRefreshRequest, parseTokenResponse, mapAccount, mapPosition, mapBalances, mapActivity, withExternalIds, dateWindows, redact };
