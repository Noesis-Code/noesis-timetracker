// Budget de coût IA par utilisateur (16 oct. 2026, demande d'Emilien).
// Cible : ~10 $/mois en moyenne, JAMAIS plus de 15 $/mois pour un utilisateur.
// Pour éviter de tout dépenser avant la fin du mois, le blocage est HEBDOMADAIRE :
// le mois est découpé en 4 tranches (jours 1-7, 8-14, 15-21, 22-fin) ; le plafond
// CUMULÉ à la fin de la tranche k vaut cap × k/4. Le non-dépensé se reporte ; la
// dépense du mois courant est toujours comparée au plafond cumulé de la tranche.
// Le coût réel vient du champ `usage` de chaque réponse de l'API Anthropic (cache de prompt : lecture ×0,1,
// création ×1,25 du prix d'entrée ; lots Anthropic : facteur 0,5 passé à record).
//
// Lots Anthropic (drivesync.js) : le coût réel est enregistré à la RELÈVE du lot (facteur 0,5) ; avant la soumission, le coût MAXIMAL estimé
// (entrée + max_tokens de sortie, x 0,5) est comparé à ce qui reste de la tranche (status) pour ne pas la dépasser.
//
// Tarifs en $/million de jetons ; surchargeables sans code : AI_PRICE_IN_PER_M,
// AI_PRICE_OUT_PER_M (valent pour tous les modèles), AI_BUDGET_MONTH_USD (défaut 15).
// Les appels sans utilisateur identifiable sont enregistrés sous 'system', jamais bloqués.
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../db');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const SYSTEM_USER = 'system';

// Hypothèses de tarifs ($ / million de jetons) — à ajuster via l'environnement si Anthropic change.
const PRICES = {
  sonnet: { in: 3, out: 15 },
  haiku: { in: 1, out: 5 },
  opus: { in: 15, out: 75 },
};
const DEFAULT_PRICE = PRICES.sonnet;

db.exec(`
CREATE TABLE IF NOT EXISTS ai_usage_log (
  userId TEXT NOT NULL,
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  feature TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  inputTokens INTEGER NOT NULL DEFAULT 0,
  outputTokens INTEGER NOT NULL DEFAULT 0,
  costUsd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (userId, day, model, feature)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_day ON ai_usage_log(day, userId);
`);

function todayLocal(now) {
  const d = now instanceof Date ? now : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function capMonth() {
  const n = Number(process.env.AI_BUDGET_MONTH_USD);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function priceFor(model) {
  const m = String(model || '').toLowerCase();
  const base = m.includes('haiku') ? PRICES.haiku : m.includes('opus') ? PRICES.opus : m.includes('sonnet') ? PRICES.sonnet : DEFAULT_PRICE;
  const pin = Number(process.env.AI_PRICE_IN_PER_M), pout = Number(process.env.AI_PRICE_OUT_PER_M);
  return {
    in: Number.isFinite(pin) && pin > 0 ? pin : base.in,
    out: Number.isFinite(pout) && pout > 0 ? pout : base.out,
  };
}

// Coût en dollars d'un `usage` Anthropic. Cache : écriture ×1,25 et lecture ×0,1 du tarif d'entrée.
function computeCost(model, usage) {
  const u = usage || {};
  const p = priceFor(model);
  const inTok = Number(u.input_tokens) || 0;
  const outTok = Number(u.output_tokens) || 0;
  const cw = Number(u.cache_creation_input_tokens) || 0;
  const cr = Number(u.cache_read_input_tokens) || 0;
  return (inTok * p.in + cw * p.in * 1.25 + cr * p.in * 0.1 + outTok * p.out) / 1e6;
}

// Tranche (1..4) d'une date locale 'AAAA-MM-JJ' ou d'un Date.
function trancheOf(now) {
  const day = Number(todayLocal(now).slice(8, 10));
  return day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
}

// Premier jour de la tranche suivante ('AAAA-MM-JJ').
function nextTrancheStart(now) {
  const d = todayLocal(now);
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)), k = trancheOf(now);
  const p = (n) => String(n).padStart(2, '0');
  if (k === 4) return m === 12 ? (y + 1) + '-01-01' : y + '-' + p(m + 1) + '-01';
  return y + '-' + p(m) + '-' + p(k * 7 + 1);
}

function spentMonth(userId, now) {
  const month = todayLocal(now).slice(0, 7);
  const r = db.prepare('SELECT COALESCE(SUM(costUsd), 0) AS s FROM ai_usage_log WHERE userId = ? AND day >= ? AND day <= ?')
    .get(String(userId), month + '-01', month + '-31');
  return r.s || 0;
}

// État du budget d'un utilisateur : { spentMonth, capMonth, allowedNow, blocked, resumesOn }.
function status(userId, now) {
  const cap = capMonth();
  if (!userId || userId === SYSTEM_USER) return { spentMonth: 0, capMonth: cap, allowedNow: cap, blocked: false, resumesOn: null };
  const spent = spentMonth(userId, now);
  const allowed = cap * trancheOf(now) / 4;
  const blocked = spent >= allowed - 1e-9;
  return { spentMonth: spent, capMonth: cap, allowedNow: allowed, blocked, resumesOn: blocked ? nextTrancheStart(now) : null };
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateLabelFr(iso) {
  const d = Number(iso.slice(8, 10));
  return (d === 1 ? '1er' : String(d)) + ' ' + MONTHS_FR[Number(iso.slice(5, 7)) - 1];
}
// Message en français ; i18n.js (PATTERNS) le traduit côté client en mode anglais.
function blockedMessage(resumesOn) {
  return "Limite d'utilisation de l'IA atteinte pour cette semaine. Elle reprend le " + dateLabelFr(resumesOn) + '.';
}

// check(userId) : { ok, resumesOn, message } — à appeler AVANT chaque appel à l'API.
function check(userId, now) {
  const s = status(userId, now);
  if (!s.blocked) return { ok: true, resumesOn: null, message: null };
  return { ok: false, resumesOn: s.resumesOn, message: blockedMessage(s.resumesOn) };
}

// record(userId, model, usage, feature, now, factor) : enregistre le coût réel d'un appel (factor 0,5 pour un lot Anthropic). Ne lève jamais.
function record(userId, model, usage, feature, now, factor) {
  try {
    const u = usage || {};
    const inTok = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0);
    const outTok = Number(u.output_tokens) || 0;
    db.prepare(`INSERT INTO ai_usage_log (userId, day, model, feature, calls, inputTokens, outputTokens, costUsd)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(userId, day, model, feature) DO UPDATE SET calls = calls + 1,
        inputTokens = inputTokens + excluded.inputTokens, outputTokens = outputTokens + excluded.outputTokens,
        costUsd = costUsd + excluded.costUsd`)
      .run(String(userId || SYSTEM_USER), todayLocal(now), String(model || 'inconnu'), String(feature || 'autre'), inTok, outTok, computeCost(model, u) * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  } catch (e) { console.warn('[aibudget] enregistrement impossible :', e && e.message); }
}

// Utilisateur courant du contexte asynchrone (posé par le middleware HTTP ou runAs).
const als = new AsyncLocalStorage();
function runAs(userId, fn) { return als.run({ userId: userId || null }, fn); }
function currentUser() { const s = als.getStore(); return s && s.userId ? s.userId : null; }

// Remplace fetch(ANTHROPIC_URL, init) : vérifie le budget, appelle l'API, enregistre le coût.
// Bloqué : lève une Error { aiBlocked: true, resumesOn } SANS appeler l'API (les appelants
// l'attrapent déjà comme n'importe quelle panne IA). Renvoie la Response d'origine, intacte.
async function fetchAnthropic(feature, url, init, userId) {
  const uid = userId || currentUser();
  const c = check(uid);
  if (!c.ok) throw Object.assign(new Error(c.message), { aiBlocked: true, resumesOn: c.resumesOn });
  const res = await fetch(url || ANTHROPIC_URL, init);
  if (res && res.ok && typeof res.clone === 'function') {
    try {
      const body = await res.clone().json();
      if (body && body.usage) record(uid, body.model || (init && init.body && JSON.parse(init.body).model), body.usage, feature);
    } catch (e) { /* réponse non lisible : rien à enregistrer */ }
  }
  return res;
}

module.exports = { check, record, status, computeCost, priceFor, trancheOf, nextTrancheStart, blockedMessage, spentMonth, capMonth, runAs, currentUser, fetchAnthropic, todayLocal, SYSTEM_USER };
