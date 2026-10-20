// API Batch d'Anthropic : lots asynchrones à 50 % du prix, réservés à la SURVEILLANCE programmée de Drive
// (drivesync.js). Fonctions : submit(requests) -> { id } ; get(id) -> { processing_status, results_url } ; results(url) -> lignes JSONL
// { custom_id, result: { type: succeeded|errored|canceled|expired, message? } }. fetch natif, injectable pour les tests (setFetch).
// Jamais de contenu de document ni de tâche dans les logs.
const classify = require('./goalstaskclassify');
const aibudget = require('./aibudget');
const aiscrub = require('./aiscrub');

const BASE = 'https://api.anthropic.com/v1/messages/batches';
const TIMEOUT_MS = 60000;
let fetchImpl = null;
function setFetch(fn) { fetchImpl = fn; }
function available() { return !!fetchImpl || classify.configured(); }
const doFetch = (url, init) => (fetchImpl || fetch)(url, init);
const headers = () => ({ 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' });

async function request(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(url, { ...init, signal: controller.signal, headers: headers() });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) aibudget.alertKeyRefused(res.status); // même alerte horaire que les appels directs
      let detail = '';
      try { const j = await res.json(); detail = (j && j.error && j.error.message) || ''; } catch (e) { /* corps illisible */ }
      throw Object.assign(new Error('HTTP ' + res.status), { statusCode: res.status, creditLow: /credit balance/i.test(String(detail)) });
    }
    return res;
  } finally { clearTimeout(timer); }
}

// requests : [{ custom_id, params }]
// userId : le budget IA (jour + tranche, lots en vol compris) est vérifié sur le coût maximal du lot (x0,5) avant tout envoi.
async function submit(requests, userId) {
  const est = (requests || []).reduce((a, r) => a + aibudget.estimateMaxCost(r && r.params, 0.5), 0);
  const c = aibudget.check(userId || aibudget.currentUser() || aibudget.SYSTEM_USER, undefined, est);
  if (!c.ok) throw Object.assign(new Error(c.message), { aiBlocked: true, resumesOn: c.resumesOn, period: c.period });
  const res = await request(BASE, { method: 'POST', body: JSON.stringify({ requests: (requests || []).map((r) => (r && r.params ? { ...r, params: aiscrub.scrubParams(r.params) } : r)) }) });
  const j = await res.json();
  if (!j || !j.id) throw new Error('lot sans identifiant');
  return { id: j.id };
}

async function get(batchId) {
  const res = await request(BASE + '/' + encodeURIComponent(batchId), { method: 'GET' });
  const j = await res.json();
  return { processing_status: j.processing_status, results_url: j.results_url || null, request_counts: j.request_counts || null };
}

async function results(url) {
  const res = await request(url, { method: 'GET' });
  const text = await res.text();
  const out = [];
  String(text).split('\n').forEach((line) => { if (!line.trim()) return; try { out.push(JSON.parse(line)); } catch (e) { /* ligne illisible : ignorée */ } });
  return out;
}

module.exports = { submit, get, results, setFetch, available };
