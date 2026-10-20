// Budget de coût IA par utilisateur (demande d'Emilien).
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
// TOUS les comptes sont plafonnés (codes d'accès, Emilien, Gaspard compris) ; garde-fou JOURNALIER en plus des tranches :
// AI_BUDGET_DAY_USD (défaut 2 $/jour/utilisateur). Les appels sans utilisateur identifiable ('system') sont plafonnés eux aussi :
// AI_BUDGET_SYSTEM_DAY_USD (défaut 3 $/jour). Le coût compté = réel enregistré + coût maximal estimé des appels directs en vol (réservés avant l'envoi)
// + coût maximal des lots soumis non relevés (drive_batches.estCost) : un lot compte dès sa soumission.
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../db');
const featureCaps = require('./aifeaturecaps');
const aiscrub = require('./aiscrub');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const SYSTEM_USER = 'system';

// Hypothèses de tarifs ($ / million de jetons) — à ajuster via l'environnement si Anthropic change.
const { PRICES } = require('./aimodels'); // tarifs : un seul endroit (aimodels.js)
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
-- Alertes de coût déjà émises (jour de Montréal + type + seuil) : un redémarrage du serveur ne les répète pas. Additif, idempotent, sans compte ni texte.
CREATE TABLE IF NOT EXISTS ai_alerts_sent (
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  PRIMARY KEY (kind, day, key)
);
`);

// Qualité des tâches générées (chantier Précision) : compteur agrégé par jour et par fonction, SANS titre ni compte.
db.exec(`
CREATE TABLE IF NOT EXISTS generation_quality_log (
  day TEXT NOT NULL,
  feature TEXT NOT NULL,
  generated INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  cleaned INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature)
);
`);
// recordQuality(feature, generated, rejected, cleaned, now) : ne lève jamais.
function recordQuality(feature, generated, rejected, cleaned, now) {
  try {
    const n = (v) => Math.max(0, Math.floor(Number(v)) || 0);
    if (!n(generated)) return;
    db.prepare(`INSERT INTO generation_quality_log (day, feature, generated, rejected, cleaned) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(day, feature) DO UPDATE SET generated = generated + excluded.generated, rejected = rejected + excluded.rejected, cleaned = cleaned + excluded.cleaned`)
      .run(todayLocal(now), String(feature || 'autre'), n(generated), n(rejected), n(cleaned));
  } catch (e) { console.warn('[aibudget] qualite non enregistree :', e && e.message); }
}

// Détail du cache de prompt par fonctionnalité (jetons lus / écrits dans le cache), pour mesurer l'efficacité.
for (const col of ['cacheReadTokens', 'cacheWriteTokens']) {
  try { db.exec('ALTER TABLE ai_usage_log ADD COLUMN ' + col + ' INTEGER NOT NULL DEFAULT 0'); } catch (e) { /* colonne déjà présente */ }
}

function todayLocal(now) {
  return featureCaps.dayKey(now); // jour civil de Montréal, indépendant du fuseau du processus
}

function capMonth() {
  const n = Number(process.env.AI_BUDGET_MONTH_USD);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

function capDay() { const n = Number(process.env.AI_BUDGET_DAY_USD); return Number.isFinite(n) && n > 0 ? n : 2; }
function capSystemDay() { const n = Number(process.env.AI_BUDGET_SYSTEM_DAY_USD); return Number.isFinite(n) && n > 0 ? n : 3; }

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
function spentDay(userId, now) {
  const d = todayLocal(now);
  return db.prepare('SELECT COALESCE(SUM(costUsd), 0) AS s FROM ai_usage_log WHERE userId = ? AND day = ?').get(String(userId), d).s || 0;
}

// Appels directs en vol : coût maximal estimé, réservé avant l'envoi, libéré quand le coût réel est enregistré.
const reserved = new Map();
const reservedOf = (u) => reserved.get(String(u)) || 0;
function reserve(u, amount) { reserved.set(String(u), reservedOf(u) + amount); }
function release(u, amount) { const v = reservedOf(u) - amount; if (v > 1e-12) reserved.set(String(u), v); else reserved.delete(String(u)); }
// Lots Anthropic soumis non relevés (table de drivesync.js ; absente => 0).
function batchesInFlight(userId) {
  try { return db.prepare("SELECT COALESCE(SUM(estCost), 0) AS c FROM drive_batches WHERE userId = ? AND status = 'submitted'").get(String(userId)).c || 0; }
  catch (e) { return 0; }
}
// Coût maximal d'un corps /v1/messages : entrée (caractères/4, x1,25 : écriture de cache au pire) + max_tokens de sortie ; factor 0,5 pour un lot.
function estimateMaxCost(body, factor) {
  let b = body;
  try { if (typeof body === 'string') b = JSON.parse(body); } catch (e) { b = null; }
  if (!b || typeof b !== 'object') return 0.05;
  const p = priceFor(b.model);
  const inTok = Math.ceil(JSON.stringify([b.system || '', b.messages || []]).length / 4) * 1.25;
  return (inTok * p.in + (Number(b.max_tokens) || 1024) * p.out) / 1e6 * (factor > 0 ? factor : 1);
}

// État du budget : { spentMonth, capMonth, allowedNow, blocked, resumesOn, period, remaining, spentDay, capDay }.
// Dépenses = réel + en vol (appels directs réservés + lots). Plafond mensuel cumulé par tranche (inchangé) ET plafond du jour.
// 'system' : seulement le plafond du jour système (AI_BUDGET_SYSTEM_DAY_USD).
function status(userId, now) {
  const cap = capMonth();
  const uid = userId || SYSTEM_USER;
  const inflight = reservedOf(uid) + batchesInFlight(uid);
  const sD = spentDay(uid, now) + inflight;
  if (uid === SYSTEM_USER) {
    const cd = capSystemDay(), blocked = sD >= cd - 1e-9;
    return { spentMonth: spentMonth(uid, now), capMonth: cap, allowedNow: cd, spentDay: sD, capDay: cd, remaining: Math.max(0, cd - sD), blocked, period: blocked ? 'jour' : null, resumesOn: blocked ? addDay(now) : null };
  }
  const spent = spentMonth(uid, now) + inflight;
  const allowed = cap * trancheOf(now) / 4;
  const cd = capDay();
  const bTr = spent >= allowed - 1e-9, bDay = sD >= cd - 1e-9;
  const blocked = bTr || bDay;
  // Reprise : le plus tardif des plafonds atteints (tranche suivante, ou demain).
  const resumesOn = !blocked ? null : bTr ? nextTrancheStart(now) : addDay(now);
  return { spentMonth: spent, capMonth: cap, allowedNow: allowed, spentDay: sD, capDay: cd, remaining: Math.max(0, Math.min(allowed - spent, cd - sD)), blocked, period: !blocked ? null : bTr ? 'semaine' : 'jour', resumesOn };
}
function addDay(now) {
  const d = now instanceof Date ? new Date(now.getTime()) : new Date();
  d.setDate(d.getDate() + 1);
  return todayLocal(d);
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateLabelFr(iso) {
  const d = Number(iso.slice(8, 10));
  return (d === 1 ? '1er' : String(d)) + ' ' + MONTHS_FR[Number(iso.slice(5, 7)) - 1];
}
// Message en français ; i18n.js (PATTERNS) le traduit côté client en mode anglais.
function blockedMessage(resumesOn, period) {
  if (period === 'jour') return "Limite d'utilisation de l'IA atteinte pour aujourd'hui. Elle reprend demain.";
  return "Limite d'utilisation de l'IA atteinte pour cette semaine. Elle reprend le " + dateLabelFr(resumesOn) + '.';
}

// check(userId, now, estimate) : { ok, resumesOn, period, message } — à appeler AVANT chaque appel à l'API.
// `estimate` (optionnel) : coût maximal de l'appel envisagé ; refusé s'il dépasse ce qui reste (jour ou tranche).
function check(userId, now, estimate) {
  const s = status(userId, now);
  const est = Number(estimate) > 0 ? Number(estimate) : 0;
  if (!s.blocked && s.remaining + 1e-9 >= est) return { ok: true, resumesOn: null, period: null, message: null };
  let period = s.period, resumesOn = s.resumesOn;
  if (!s.blocked) { // reste insuffisant pour cet appel : la contrainte la plus serrée
    const dayTight = s.capDay - s.spentDay <= s.allowedNow - s.spentMonth || s.capDay === capSystemDay() && (userId || SYSTEM_USER) === SYSTEM_USER;
    period = dayTight ? 'jour' : 'semaine';
    resumesOn = dayTight ? addDay(now) : nextTrancheStart(now);
  }
  return { ok: false, resumesOn, period, message: blockedMessage(resumesOn, period) };
}

// record(userId, model, usage, feature, now, factor) : enregistre le coût réel d'un appel (factor 0,5 pour un lot Anthropic). Ne lève jamais.
function record(userId, model, usage, feature, now, factor) {
  try {
    const u = usage || {};
    const inTok = (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0);
    const outTok = Number(u.output_tokens) || 0;
    db.prepare(`INSERT INTO ai_usage_log (userId, day, model, feature, calls, inputTokens, outputTokens, costUsd, cacheReadTokens, cacheWriteTokens)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(userId, day, model, feature) DO UPDATE SET calls = calls + 1,
        inputTokens = inputTokens + excluded.inputTokens, outputTokens = outputTokens + excluded.outputTokens,
        costUsd = costUsd + excluded.costUsd,
        cacheReadTokens = cacheReadTokens + excluded.cacheReadTokens, cacheWriteTokens = cacheWriteTokens + excluded.cacheWriteTokens`)
      .run(String(userId || SYSTEM_USER), todayLocal(now), String(model || 'inconnu'), String(feature || 'autre'), inTok, outTok, computeCost(model, u) * (Number.isFinite(factor) && factor > 0 ? factor : 1),
        Number(u.cache_read_input_tokens) || 0, Number(u.cache_creation_input_tokens) || 0);
    alertIfDayCostHigh(now);
    alertIfCapNear(userId, feature, now);
  } catch (e) { console.warn('[aibudget] enregistrement impossible :', e && e.message); }
}

// Alerte douce (journal serveur seulement, ni notification ni interface) : coût estimé du jour, tous comptes, au-delà de AI_COST_ALERT_DAY_USD (défaut 8 $).
// Une seule ligne par jour ; 0 ou valeur invalide = défaut.
let alertedDay = null;
// Vrai si l'alerte (kind, jour, clé) n'avait jamais été émise (et la mémorise durablement) ; faux si déjà émise, même avant un redémarrage.
function claimAlert(kind, day, key) {
  try {
    const r = db.prepare('INSERT OR IGNORE INTO ai_alerts_sent (kind, day, key) VALUES (?, ?, ?)').run(kind, day, String(key));
    if (r.changes) db.prepare('DELETE FROM ai_alerts_sent WHERE day < ?').run(day);
    return r.changes > 0;
  } catch (e) { return true; } // base indisponible : on alerte (mieux vaut un doublon qu'un silence)
}
function alertDayUsd(now) {
  // Règle adaptative (désactivée par défaut) : AI_ALERT_ADAPTIVE=1 => 0,50 $ x comptes actifs du jour (aialertthreshold.js).
  if (process.env.AI_ALERT_ADAPTIVE === '1') {
    try {
      const n = db.prepare("SELECT COUNT(DISTINCT userId) AS n FROM ai_usage_log WHERE day = ? AND userId != ?").get(todayLocal(now), SYSTEM_USER).n || 0;
      return require('./aialertthreshold').seuilAlerte(n).jourUsd;
    } catch (e) { /* repli sur le seuil fixe */ }
  }
  const n = Number(process.env.AI_COST_ALERT_DAY_USD); return Number.isFinite(n) && n > 0 ? n : 8;
}
function alertIfDayCostHigh(now) {
  const d = todayLocal(now);
  if (alertedDay === d) return;
  const total = db.prepare('SELECT COALESCE(SUM(costUsd), 0) AS s FROM ai_usage_log WHERE day = ?').get(d).s || 0;
  const seuil = alertDayUsd(now);
  if (total < seuil) return;
  alertedDay = d;
  if (!claimAlert('jour', d, seuil)) return; // déjà émise pour ce jour et ce seuil (avant un redémarrage)
  console.warn('[aibudget] ALERTE coût IA du jour ' + d + ' : ' + total.toFixed(2) + ' $ estimé (seuil ' + seuil + ' $, ' + (process.env.AI_ALERT_ADAPTIVE === '1' ? 'AI_ALERT_ADAPTIVE' : 'AI_COST_ALERT_DAY_USD') + ')');
}
// Remet à zéro la mémoire du processus (simule un redémarrage) ; `all` efface aussi la mémoire durable (tests).
function resetDayAlert(all) { alertedDay = null; alertedCaps.clear(); if (all !== false) { try { db.exec('DELETE FROM ai_alerts_sent'); } catch (e) { /* ignoré */ } } }
// Alerte douce (journal serveur, sans identifiant de compte) : une fonction atteint 80 % de son plafond d'appels du jour pour un compte. Une ligne par fonction et par jour.
const alertedCaps = new Set();
function alertIfCapNear(userId, feature, now) {
  const cap = featureCaps.capFor(feature);
  if (!cap) return;
  const base = featureCaps.baseFeature(feature), d = todayLocal(now), k = base + '|' + d;
  if (alertedCaps.has(k)) return;
  const n = db.prepare("SELECT COALESCE(SUM(calls), 0) AS s FROM ai_usage_log WHERE userId = ? AND day = ? AND (feature = ? OR feature = ?)").get(String(userId || SYSTEM_USER), d, base, base + ':repli').s || 0;
  if (n < cap * 0.8) return;
  for (const x of alertedCaps) if (!x.endsWith('|' + d)) alertedCaps.delete(x);
  alertedCaps.add(k);
  if (!claimAlert('plafond', d, base + '|' + cap)) return;
  console.warn('[aibudget] ALERTE plafond ' + base + ' : ' + n + ' appels aujourd\'hui pour un compte (plafond ' + cap + '/jour, 80 % atteint)');
}

// Rapport de coût par fonctionnalité et modèle sur les `days` derniers jours (tous comptes) : appels, jetons, cache, $.
function usageReport(days) {
  const n = Math.max(1, Math.floor(Number(days)) || 30);
  const d = new Date(); d.setDate(d.getDate() - n + 1);
  return db.prepare(`SELECT feature, model, SUM(calls) AS calls, SUM(inputTokens) AS inputTokens, SUM(outputTokens) AS outputTokens,
      SUM(cacheReadTokens) AS cacheReadTokens, SUM(cacheWriteTokens) AS cacheWriteTokens, ROUND(SUM(costUsd), 4) AS costUsd
    FROM ai_usage_log WHERE day >= ? GROUP BY feature, model ORDER BY costUsd DESC`).all(todayLocal(d));
}

// Taux de repli Haiku -> modèle fort (features « X » et « X:repli ») sur `days` jours : { feature, fastCalls, fallbackCalls, fallbackRate }.
// Le repli suit un essai Haiku : taux = repli / (appels Haiku). 
function fallbackReport(days) {
  const rows = usageReport(days), by = {};
  rows.forEach((r) => {
    const base = r.feature.replace(/:repli$/, '');
    const o = by[base] || (by[base] = { feature: base, fastCalls: 0, fallbackCalls: 0 });
    if (/:repli$/.test(r.feature)) o.fallbackCalls += r.calls; else if (/haiku/i.test(r.model)) o.fastCalls += r.calls;
  });
  return Object.values(by).filter((o) => o.fallbackCalls || o.fastCalls).map((o) => Object.assign(o, { fallbackRate: o.fastCalls ? Math.round(1000 * o.fallbackCalls / o.fastCalls) / 1000 : null }));
}

// Utilisateur courant du contexte asynchrone (posé par le middleware HTTP ou runAs).
const als = new AsyncLocalStorage();
function runAs(userId, fn) { return als.run({ userId: userId || null }, fn); }
function currentUser() { const s = als.getStore(); return s && s.userId ? s.userId : null; }

// Relances sur refus de débit 429 / surcharge 529 (jamais facturés : aucun jeton n'a été produit). Au plus AI_RETRY_MAX relances (défaut 2),
// attente = Retry-After si fourni (abandon sans relance s'il dépasse AI_RETRY_MAX_WAIT_MS, défaut 8 s), sinon reculade exponentielle
// AI_RETRY_BASE_MS x 2^n (défaut 1 s) bornée au même plafond. Les 400/401/403 et toute autre erreur ne sont jamais relancés (inutile de repayer).
// L'attente s'interrompt avec le signal de délai de l'appelant.
function retryDelayMs(res, attempt) {
  const num = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && n >= 0 ? n : d; };
  const cap = num('AI_RETRY_MAX_WAIT_MS', 8000);
  let ra = NaN;
  try { ra = res.headers && typeof res.headers.get === 'function' ? parseFloat(res.headers.get('retry-after')) : NaN; } catch (e) { /* en-tête absent */ }
  if (Number.isFinite(ra) && ra >= 0) return ra * 1000 > cap ? null : ra * 1000;
  return Math.min(cap, num('AI_RETRY_BASE_MS', 1000) * Math.pow(2, attempt));
}
function sleepAbortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(signal.reason || Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal.reason || Object.assign(new Error('aborted'), { name: 'AbortError' })); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}
async function fetchWithRetry(url, init) {
  const maxRetries = Number.isFinite(Number(process.env.AI_RETRY_MAX)) && process.env.AI_RETRY_MAX !== '' ? Math.max(0, Number(process.env.AI_RETRY_MAX)) : 2;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (!res || res.ok || (res.status !== 429 && res.status !== 529) || attempt >= maxRetries) return res;
    const wait = retryDelayMs(res, attempt);
    if (wait == null) return res;
    await sleepAbortable(wait, init && init.signal);
  }
}

// 401/403 de l'API = clé refusée (invalide, révoquée, sans crédit ou sans droit) : toutes les fonctions IA tombent en repli local sans que
// personne ne le voie. Une ligne ALERTE au journal serveur, au plus une par heure (compteur en mémoire), jamais le texte de la réponse ni la clé.
let lastKeyAlert = 0;
function alertKeyRefused(status, now) {
  const t = now == null ? Date.now() : now;
  if (t - lastKeyAlert < 3600000) return false;
  lastKeyAlert = t;
  console.error('[aibudget] ALERTE clé API Anthropic refusée (HTTP ' + status + ') : vérifier ANTHROPIC_API_KEY et le solde du compte ; toutes les fonctions IA sont en repli local (prochaine alerte dans 1 h au plus)');
  return true;
}

// Disjoncteur de panne fournisseur : AI_BREAKER_N échecs de SUITE (défaut 5 ; 529/5xx après relances, ou réseau coupé) => plus aucun appel pendant
// AI_BREAKER_OPEN_MS (défaut 60 s), puis UN seul appel sonde (les autres restent refusés) ; succès = refermé, échec = rouvert. Les 4xx et 429 ne comptent pas.
// Refus = Error « HTTP 529 » (status 529) : mêmes repli local et message « Génération indisponible » que toute panne IA ; rien n'est réservé ni compté.
const breaker = { fails: 0, openUntil: 0, probing: false };
function breakerNum(k, d) { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; }
function breakerGate(now) {
  if (!breaker.openUntil) return;
  if (now < breaker.openUntil || breaker.probing) throw Object.assign(new Error('HTTP 529 (appels IA suspendus après des échecs répétés)'), { status: 529, breakerOpen: true });
  breaker.probing = true; breaker.openUntil = now + breakerNum('AI_BREAKER_OPEN_MS', 60000); // sonde : si elle reste sans réponse, nouvelle sonde après le même délai
}
function breakerResult(failed, now) {
  breaker.probing = false;
  if (!failed) { breaker.fails = 0; breaker.openUntil = 0; return; }
  breaker.fails++;
  if (breaker.fails >= breakerNum('AI_BREAKER_N', 5)) {
    if (!breaker.openUntil) console.warn('[aibudget] ALERTE panne fournisseur IA : ' + breaker.fails + ' échecs de suite, appels suspendus (sonde dans ' + Math.round(breakerNum('AI_BREAKER_OPEN_MS', 60000) / 1000) + ' s)');
    breaker.openUntil = now + breakerNum('AI_BREAKER_OPEN_MS', 60000);
  }
}
function breakerReset() { breaker.fails = 0; breaker.openUntil = 0; breaker.probing = false; }

// Remplace fetch(ANTHROPIC_URL, init) : vérifie le budget, appelle l'API, enregistre le coût.
// Bloqué : lève une Error { aiBlocked: true, resumesOn } SANS appeler l'API (les appelants
// l'attrapent déjà comme n'importe quelle panne IA). Renvoie la Response d'origine, intacte.
async function fetchAnthropic(feature, url, init, userId) {
  const uid = userId || currentUser() || SYSTEM_USER;
  const est = estimateMaxCost(init && init.body);
  const c = check(uid, undefined, est);
  if (!c.ok) throw Object.assign(new Error(c.message), { aiBlocked: true, resumesOn: c.resumesOn, period: c.period });
  breakerGate(Date.now());
  reserve(uid, est);
  try {
    let res;
    try { res = await fetchWithRetry(url || ANTHROPIC_URL, init && typeof init.body === 'string' ? { ...init, body: aiscrub.scrubBody(init.body) } : init); } // Loi 25 : coordonnées masquées avant envoi
    catch (e) { breakerResult(!!e && (e.name === 'TypeError' || /\bECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/.test(String(e.message || '') + String(e.code || ''))), Date.now()); throw e; }
    breakerResult(!!res && (res.status === 529 || (res.status >= 502 && res.status <= 504)), Date.now());
    if (res && (res.status === 401 || res.status === 403)) alertKeyRefused(res.status);
    if (res && res.ok && typeof res.clone === 'function') {
      try {
        const body = await res.clone().json();
        if (body && body.usage) record(uid, body.model || (init && init.body && JSON.parse(init.body).model), body.usage, feature);
      } catch (e) { /* réponse non lisible : rien à enregistrer */ }
    }
    return res;
  } finally { release(uid, est); }
}

module.exports = { recordQuality, usageReport, fallbackReport, check, record, status, computeCost, priceFor, trancheOf, nextTrancheStart, blockedMessage, spentMonth, spentDay, capMonth, capDay, capSystemDay, estimateMaxCost, runAs, currentUser, fetchAnthropic, breakerReset, alertKeyRefused, todayLocal, SYSTEM_USER, alertDayUsd, resetDayAlert };
