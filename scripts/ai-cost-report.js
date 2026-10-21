// Rapport du coût IA, LECTURE SEULE, sans appel réseau (ai_usage_log). UNE seule commande :
//   NOESIS_DATA_DIR=... node scripts/ai-cost-report.js [jours=30]    ou   --from export.json|export.csv [jours=30]  (export de ai_usage_log, sans base)
//   --court       : résumé de 10 lignes maximum
//   --semaine     : 7 derniers jours par fonction vs semaine précédente, avec alertes (AI_WEEKLY_ALERT_CAD, défaut 5 CAD)
//   --projection  : projection mensuelle à partir d'hypothèses (scripts/ai-cost-hypotheses.json ; --hyp fichier.json, --detail), sans base
//   --acceptation : apprentissage par l'usage (classements corrigés, propositions acceptées/refusées), sur la base
// Texte court : mois par utilisateur, puis par fonction/modèle (appels, jetons moyens, cache, $), par jour, taux de repli Haiku -> fort.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const fi = args.indexOf('--from');
const fromFile = fi >= 0 ? args.splice(fi, 2)[1] : null;
const court = flag('--court'), semaine = flag('--semaine'), projection = flag('--projection'), acceptation = flag('--acceptation'), detail = flag('--detail');
const days = Math.max(1, Math.floor(Number(args[0])) || 30);
const hi = args.indexOf('--hyp');
const hypFile = hi >= 0 ? args.splice(hi, 2)[1] : path.join(__dirname, 'ai-cost-hypotheses.json');
// --from : lit un export de ai_usage_log (SELECT * FROM ai_usage_log) au lieu de la base, sans accès base.
function parseCsv(txt) {
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) out.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x !== '')) out.push(row);
  const head = (out.shift() || []).map((h) => h.trim());
  return out.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
function openDb() {
  if (fromFile) {
    if (!fs.existsSync(fromFile)) { console.log('Fichier introuvable : ' + fromFile); process.exit(0); }
    const txt = fs.readFileSync(fromFile, 'utf8').replace(/^\uFEFF/, '');
    let rows;
    try { rows = /\.csv$/i.test(fromFile) ? parseCsv(txt) : JSON.parse(txt); } catch (e) { console.log('Export illisible : ' + e.message); process.exit(1); }
    if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) rows = rows.rows;
    if (!Array.isArray(rows)) { console.log('Export illisible : tableau de lignes attendu.'); process.exit(1); }
    const m = new DatabaseSync(':memory:');
    m.exec('CREATE TABLE ai_usage_log (userId TEXT, day TEXT, model TEXT, feature TEXT, calls INTEGER, inputTokens INTEGER, outputTokens INTEGER, costUsd REAL, cacheReadTokens INTEGER, cacheWriteTokens INTEGER)');
    const ins = m.prepare('INSERT INTO ai_usage_log VALUES (?,?,?,?,?,?,?,?,?,?)');
    const num = (v) => Number(v) || 0;
    rows.forEach((r) => ins.run(String(r.userId ?? 'inconnu'), String(r.day ?? ''), String(r.model ?? ''), String(r.feature ?? ''), num(r.calls), num(r.inputTokens), num(r.outputTokens), num(r.costUsd), num(r.cacheReadTokens), num(r.cacheWriteTokens)));
    return m;
  }
  const DATA_DIR = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, '..', 'data');
  const file = path.join(DATA_DIR, 'noesis.db');
  if (!fs.existsSync(file)) { console.log('Aucune base : ' + file); process.exit(0); }
  return new DatabaseSync(file, { readOnly: true });
}
const fx = require('../server/lib/fx');
const fmt = fx.fmtUsd; // tous les coûts du journal sont en USD

// ===== --projection =====
const { PRICES } = require('../server/lib/aimodels');
// Devises : coûts calculés en USD (tarifs Anthropic) ; prix Expansion (Stripe) et plafond mensuel en CAD, convertis par fx.js pour la marge et le %.

const PROFILES = ['leger', 'moyen', 'intensif'];
const SIZES = [10, 100, 1000];
const MILLION = 10 ** 6; // jetons par unite de tarif (PRICES est en $ / million)

// Cout (USD) d'UN appel de la fonction f (memo, relance, repli fort, cache de prompt, remise inclus).
function callCost(f) {
  const one = (price) => ((f.in * (1 - (f.cached || 0) * 0.9) * price.in) + (f.out * price.out)) / MILLION;
  const base = one(PRICES[f.model] || PRICES.haiku);
  const strong = one(PRICES.sonnet);
  return (1 - (f.memo || 0)) * ((1 + (f.retry || 0)) * base + (f.fallback || 0) * strong) * (f.discount == null ? 1 : f.discount);
}

// Cout mensuel (USD) par utilisateur pour un profil (index 0..2) : { total, byFn }.
function perUser(h, profileIdx) {
  const byFn = {};
  let total = 0;
  for (const [name, f] of Object.entries(h.functions)) {
    const c = f.calls[profileIdx] * callCost(f) * h.daysPerMonth;
    byFn[name] = c; total += c;
  }
  return { total, byFn };
}

function project(h) {
  return PROFILES.map((p, i) => {
    const u = perUser(h, i);
    const top = Object.entries(u.byFn).sort((a, b) => b[1] - a[1])[0];
    return { profile: p, perUser: u.total, byFn: u.byFn, top: top[0], topShare: u.total ? top[1] / u.total : 0,
      totals: SIZES.map((n) => n * u.total), margin: (fx.toUsd(h.expansionCadPerMonth) - u.total) / fx.toUsd(h.expansionCadPerMonth) };
  });
}

function mainProjection() {
  const file = hypFile;
  const h = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = project(h);
  const m = (n) => n.toFixed(2).padStart(9) + ' USD';
  const out = [];
  out.push('Projection IA mensuelle (hypotheses : ' + path.basename(file) + ' ; tarifs Haiku ' + PRICES.haiku.in + '/' + PRICES.haiku.out + ', Sonnet ' + PRICES.sonnet.in + '/' + PRICES.sonnet.out + ' USD/M)');
  out.push('Coûts en USD. ' + fx.fxLine());
  out.push('profil     USD/util/mois    10 util.     100 util.    1000 util.  %plafond ' + h.capCadPerMonth + ' CAD  marge/' + h.expansionCadPerMonth + ' CAD  1re fonction');
  r.forEach((x) => out.push(x.profile.padEnd(9) + m(x.perUser) + m(x.totals[0]) + m(x.totals[1]) + m(x.totals[2]) +
    (' ' + Math.round(100 * x.perUser / fx.toUsd(h.capCadPerMonth)) + ' %').padStart(10) + (' ' + Math.round(100 * x.margin) + ' %').padStart(12) + '  ' + x.top + ' (' + Math.round(100 * x.topShare) + ' %)'));
  out.push('Marge brute = (prix Expansion en CAD converti en USD - cout IA en USD) / prix, par abonne a 1 activite, avant frais Stripe et hebergement.');
  if (detail) {
    const names = Object.keys(h.functions).sort((x, y) => r[1].byFn[y] - r[1].byFn[x]);
    out.push('Detail profil moyen (USD/util/mois) :');
    names.forEach((n) => out.push('  ' + n.padEnd(26) + r[1].byFn[n].toFixed(3) + ' USD  (' + Math.round(100 * r[1].byFn[n] / r[1].perUser) + ' %)'));
  }
  console.log(out.join('\n'));
}


// ===== --semaine =====
const alertUsdFixed = (() => { const u = Number(process.env.AI_WEEKLY_ALERT_USD), c = Number(process.env.AI_WEEKLY_ALERT_CAD); return Number.isFinite(u) && u > 0 ? u : fx.toUsd(Number.isFinite(c) && c > 0 ? c : 5); })();
// AI_ALERT_ADAPTIVE=1 (désactivé par défaut) : seuil = 3,50 CAD x comptes actifs sur 7 jours (server/lib/aialertthreshold.js). Sinon seuil fixe inchangé.
const adaptive = process.env.AI_ALERT_ADAPTIVE === '1';
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return local(d); };

// Agrège [{feature, calls, cost}] par fonction (replis regroupés) sur [from, to] inclus.
function aggregate(rows, from, to) {
  const o = {};
  rows.forEach((r) => {
    if (!r.day || r.day < from || r.day > to) return;
    const f = String(r.feature || '').replace(/:repli$/, '');
    const a = o[f] || (o[f] = { calls: 0, cost: 0 });
    a.calls += Number(r.calls) || 0; a.cost += Number(r.costUsd) || 0;
  });
  return o;
}
function weeklyReport(rows, opts) {
  const cur = aggregate(rows, back(6), back(0)), prev = aggregate(rows, back(13), back(7));
  const sum = (o) => Object.values(o).reduce((s, a) => s + a.cost, 0);
  const tc = sum(cur), tp = sum(prev), hasPrev = Object.keys(prev).length > 0;
  const out = [fx.fxLine(), 'Coût IA, 7 derniers jours : ' + fmt(tc) + ' (' + Object.values(cur).reduce((s, a) => s + a.calls, 0) + ' appels)'];
  if (hasPrev) out.push('Semaine précédente : ' + fmt(tp) + (tp ? ' (' + (tc >= tp ? '+' : '') + Math.round(100 * (tc - tp) / tp) + ' %)' : ''));
  else out.push('Semaine précédente : pas de données.');
  const alerts = [];
  if (tc > opts.alertUsd) alerts.push('total ' + fmt(tc) + ' au-dessus du seuil ' + fmt(opts.alertUsd) + ' (' + fx.fmtCad(fx.toCad(opts.alertUsd)) + ')');
  Object.keys(cur).sort((a, b) => cur[b].cost - cur[a].cost).forEach((f) => {
    const c = cur[f], p = prev[f];
    let cmp = '';
    if (hasPrev) {
      if (!p) cmp = '  nouveau';
      else if (p.cost > 0) cmp = '  ' + (c.cost >= p.cost ? '+' : '') + Math.round(100 * (c.cost - p.cost) / p.cost) + ' %';
      if ((!p && c.cost > 0.25) || (p && p.cost > 0 && c.cost > 0.25 && c.cost > 1.5 * p.cost)) alerts.push(f + ' en hausse (' + fmt(c.cost) + (p ? ' vs ' + fmt(p.cost) : '') + ')');
    }
    out.push('  ' + f.padEnd(30) + fmt(c.cost).padStart(11) + String(c.calls).padStart(6) + ' app.' + cmp);
  });
  out.push(alerts.length ? 'ALERTE : ' + alerts.join(' ; ') : 'Aucune alerte.');
  return out.join('\n');
}

// ===== --acceptation =====
function runAcceptation() {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { return []; } };
  const pct = (n, d) => (d ? Math.round(100 * n / d) + ' %' : 'n/a');

  const classified = (q('SELECT COUNT(*) AS n FROM sub_project_items WHERE autoCaptured = 1 AND createdAt >= ?', since)[0] || {}).n || 0;
  const corrected = (q('SELECT COUNT(*) AS n FROM goal_classify_examples WHERE createdAt >= ?', since)[0] || {}).n || 0;
  const kept = Math.max(0, classified - corrected);
  console.log('Apprentissage par l\'usage — ' + days + ' j\n');
  console.log('Classement de tâche : ' + classified + ' classée(s) par l\'IA | sans modification ' + kept + ' (' + pct(kept, classified) + ') | modifiée(s) à la main ' + corrected + ' (' + pct(corrected, classified) + ')');
  const perUser = q('SELECT userId, COUNT(*) AS n FROM goal_classify_examples WHERE createdAt >= ? GROUP BY userId ORDER BY n DESC', since);
  console.log('  corrections par compte : ' + (perUser.length ? perUser.map((r) => (r.userId || 'supprimé') + '=' + r.n).join(', ') : 'aucune'));

  // change_proposals.apply écrit « accepted » (valeur des lignes existantes) ; « applied » est lu aussi par sécurité : les deux comptent comme acceptées.
  const prop = q("SELECT CASE WHEN status IN ('accepted','applied') THEN 'accepted' ELSE status END AS status, COUNT(*) AS n FROM change_proposals WHERE createdAt >= ? GROUP BY 1", since);
  const pc = Object.fromEntries(prop.map((r) => [r.status, r.n]));
  const pDecided = (pc.accepted || 0) + (pc.dismissed || 0);
  console.log('Modifications proposées : acceptées ' + (pc.accepted || 0) + ' (' + pct(pc.accepted || 0, pDecided) + ') | refusées ' + (pc.dismissed || 0) + ' (' + pct(pc.dismissed || 0, pDecided) + ') | en attente ' + (pc.pending || 0) + ' | inapplicables ' + (pc.inapplicable || 0));
  const prByField = q("SELECT field, CASE WHEN status IN ('accepted','applied') THEN 'accepted' ELSE status END AS status, COUNT(*) AS n FROM change_proposals WHERE createdAt >= ? AND status IN ('accepted','applied','dismissed') GROUP BY 1, 2", since);
  prByField.forEach((r) => console.log('  ' + String(r.field).padEnd(14) + r.status.padEnd(10) + r.n));

  const xs = q('SELECT status, COUNT(*) AS n FROM goal_cross_sector_suggestions WHERE createdAt >= ? GROUP BY status', since);
  console.log('Suggestions inter-secteurs : ' + (xs.length ? xs.map((r) => r.status + ' ' + r.n).join(' | ') : 'aucune'));
  console.log('Reformulation : aucun signal stocké (rien n\'est enregistré côté serveur).');

  // Tâches générées : compteur agrégé journalier (generation_quality_log), sans titre ni compte.
  const gq = q('SELECT feature, SUM(generated) AS g, SUM(rejected) AS r, SUM(cleaned) AS c FROM generation_quality_log WHERE day >= ? GROUP BY feature', since.slice(0, 10));
  console.log('Tâches générées : ' + (gq.length ? gq.map((r) => r.feature + ' ' + r.g + ' générée(s), ' + r.r + ' rejetée(s) (' + pct(r.r, r.g) + '), ' + r.c + ' nettoyée(s)').join(' | ') : 'aucune mesure'));
}

if (require.main !== module) { module.exports = { weeklyReport, callCost, perUser, project, PROFILES, SIZES }; return; }
if (projection) { mainProjection(); process.exit(0); }

const db = openDb();
if (acceptation) { runAcceptation(); process.exit(0); }
try { db.prepare('SELECT 1 FROM ai_usage_log LIMIT 1').get(); } catch (e) { console.log('Aucun journal IA (ai_usage_log) dans cette base.'); process.exit(0); }
// Plafond mensuel : 15 CAD (AI_BUDGET_MONTH_CAD) ; l'ancienne AI_BUDGET_MONTH_USD reste acceptée (USD). capMonth est en USD, comme les coûts du journal.
const capMonth = (() => { const u = Number(process.env.AI_BUDGET_MONTH_USD), c = Number(process.env.AI_BUDGET_MONTH_CAD); return Number.isFinite(u) && u > 0 ? u : fx.toUsd(Number.isFinite(c) && c > 0 ? c : 15); })();
const SYSTEM_USER = 'system';
const p2 = (n) => String(n).padStart(2, '0');
const local = (d) => require('../server/lib/aifeaturecaps').dayKey(d); // jour de Montréal, comme le journal ai_usage_log
const since = (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return local(d); })();
const month = local(new Date()).slice(0, 7);

if (semaine) {
  const rows = db.prepare('SELECT userId, day, feature, calls, costUsd FROM ai_usage_log WHERE day >= ?').all(back(13));
  const comptes = new Set(rows.filter((r) => r.day >= back(6) && r.userId && r.userId !== 'system').map((r) => r.userId)).size;
  console.log(weeklyReport(rows, { alertUsd: adaptive && comptes ? require('../server/lib/aialertthreshold').seuilAlerte(comptes).semaineUsd : alertUsdFixed }));
  process.exit(0);
}
if (court) { // Résumé de 10 lignes maximum : total/projection, 4 premières fonctions, 7 derniers jours, 3 premiers comptes (anonymisés), mémo.
  const q = (s, ...a) => db.prepare(s).all(...a);
  const tot = q('SELECT COALESCE(SUM(costUsd),0) AS c, COALESCE(SUM(calls),0) AS n FROM ai_usage_log WHERE day >= ?', since)[0];
  const d7 = new Date(); d7.setDate(d7.getDate() - 6);
  const c7 = q('SELECT COALESCE(SUM(costUsd),0) AS c FROM ai_usage_log WHERE day >= ?', local(d7))[0].c;
  console.log('Coût IA ' + days + ' j : ' + fmt(tot.c) + ', ' + tot.n + ' appels | projection mensuelle ' + fmt(c7 / 7 * 30) + ' (7 j x 30)');
  const top = q('SELECT feature, SUM(calls) AS n, SUM(costUsd) AS c FROM ai_usage_log WHERE day >= ? GROUP BY feature ORDER BY c DESC LIMIT 4', since);
  console.log('Par fonction : ' + (top.map((r) => r.feature + ' ' + fmt(r.c) + ' (' + r.n + ')').join(' ; ') || 'aucune'));
  const dj = q('SELECT day, SUM(costUsd) AS c FROM ai_usage_log WHERE day >= ? GROUP BY day ORDER BY day DESC LIMIT 7', since);
  console.log('Par jour : ' + (dj.map((r) => r.day.slice(5) + ' ' + fmt(r.c)).join(' ; ') || 'aucun'));
  const cu = q('SELECT userId, SUM(costUsd) AS c FROM ai_usage_log WHERE day >= ? AND userId <> ? GROUP BY userId ORDER BY c DESC LIMIT 3', since, SYSTEM_USER);
  console.log('Top comptes (anonymisés) : ' + (cu.map((r, i) => 'compte ' + 'ABC'[i] + ' ' + fmt(r.c)).join(' ; ') || 'aucun'));
  const ms = require('../server/lib/aicache').memoStats(); // en mémoire du processus serveur : un script séparé ne le voit pas
  console.log(ms.total ? 'Mémo : ' + Math.round(100 * ms.rate) + ' % de succès (' + ms.hits + '/' + ms.total + ')' : 'Mémo : taux visible au journal du serveur (ligne « [aicache] mémo : ... », tous les 200 appels), pas dans la base.');
  process.exit(0);
}
const rows = db.prepare('SELECT userId, SUM(costUsd) AS cost, SUM(calls) AS calls FROM ai_usage_log WHERE day >= ? AND day <= ? GROUP BY userId ORDER BY cost DESC').all(month + '-01', month + '-31');
const users = rows.filter((r) => r.userId !== SYSTEM_USER);
console.log('Coût IA (montants en USD, coût réel de l\'API) — ' + month + ' (plafond mensuel ' + fx.fmtCad(fx.toCad(capMonth)) + ' = ' + fmt(capMonth) + ' par utilisateur ; hebdomadaire 3,5 CAD)');
console.log(fx.fxLine());
{ // Tarifs ($/M jetons) : un seul endroit, server/lib/aimodels.js ; le coût du journal est calculé avec eux à chaque appel.
  const { PRICES, PRICES_UPDATED } = require('../server/lib/aimodels');
  const age = Math.floor((Date.now() - Date.parse(PRICES_UPDATED + 'T12:00:00Z')) / 86400000);
  console.log('Tarifs USD/M jetons (entrée/sortie) : ' + Object.keys(PRICES).map((k) => k + ' ' + PRICES[k].in + '/' + PRICES[k].out).join(', ') + ' — mis à jour le ' + PRICES_UPDATED + ' (' + age + ' j)');
  if (!(age <= 90)) console.log('AVERTISSEMENT : tarifs de plus de 90 jours, à confirmer (PRICES dans server/lib/aimodels.js).');
  if (process.env.AI_PRICE_IN_PER_M || process.env.AI_PRICE_OUT_PER_M) console.log('NB : AI_PRICE_IN_PER_M / AI_PRICE_OUT_PER_M surchargent ces tarifs pour tous les modèles.');
  console.log('');
}
users.concat(rows.filter((r) => r.userId === SYSTEM_USER)).forEach((r) => console.log(String(r.userId).padEnd(40) + fmt(r.cost).padStart(10) + '  ' + r.calls + ' appel(s)'));
const total = users.reduce((s, r) => s + r.cost, 0);
console.log('\nUtilisateurs actifs : ' + users.length + ' | moyenne ' + fmt(users.length ? total / users.length : 0) + ' (cible ' + fx.fmtCad(10) + ' = ' + fmt(fx.toUsd(10)) + ') | max ' + fmt(users.length ? users[0].cost : 0) + ' (limite ' + fmt(capMonth) + ')');

// Coût par utilisateur actif : coût total de la période (système compris) ÷ comptes distincts ayant au moins un appel sur la période.
{
  const tot = db.prepare('SELECT SUM(costUsd) AS cost FROM ai_usage_log WHERE day >= ?').get(since).cost || 0;
  const act = db.prepare('SELECT COUNT(DISTINCT userId) AS n FROM ai_usage_log WHERE day >= ? AND userId <> ? AND calls > 0').get(since, SYSTEM_USER).n;
  console.log('Coût par utilisateur actif (' + days + ' j) : ' + fmt(act ? tot / act : 0) + ' (' + fmt(tot) + ' ÷ ' + act + ' compte(s) actif(s))');
}

// Résumé par FONCTION (modèles et replis regroupés), une table texte triée par coût : à lancer sur la base de production.
const ff = db.prepare(`SELECT feature, SUM(calls) AS calls, SUM(inputTokens) AS inTok, SUM(outputTokens) AS outTok, SUM(cacheReadTokens) AS cr, SUM(costUsd) AS cost
  FROM ai_usage_log WHERE day >= ? GROUP BY feature ORDER BY cost DESC`).all(since);
const totCost = ff.reduce((s, r) => s + r.cost, 0), totCalls = ff.reduce((s, r) => s + r.calls, 0);
console.log('\nRésumé par fonction (' + days + ' j, repli inclus) :');
console.log('  ' + 'fonction'.padEnd(30) + 'appels'.padStart(8) + '/jour'.padStart(7) + 'ent.moy'.padStart(9) + 'sort.moy'.padStart(9) + 'cache'.padStart(7) + 'USD'.padStart(11) + 'USD/appel'.padStart(11) + 'part'.padStart(6));
ff.forEach((r) => {
  const c = r.calls || 1;
  console.log('  ' + r.feature.padEnd(30) + String(r.calls).padStart(8) + (r.calls / days).toFixed(1).padStart(7) + String(Math.round(r.inTok / c)).padStart(9) + String(Math.round(r.outTok / c)).padStart(9)
    + ((r.inTok ? Math.round(100 * r.cr / r.inTok) : 0) + ' %').padStart(7) + fmt(r.cost).padStart(11) + (r.cost / c).toFixed(4).padStart(11) + ((totCost ? Math.round(100 * r.cost / totCost) : 0) + ' %').padStart(6));
});
console.log('  ' + 'TOTAL'.padEnd(30) + String(totCalls).padStart(8) + (totCalls / days).toFixed(1).padStart(7) + ''.padStart(25) + fmt(totCost).padStart(11));

const fm = db.prepare(`SELECT feature, model, SUM(calls) AS calls, SUM(inputTokens) AS inTok, SUM(outputTokens) AS outTok,
    SUM(cacheReadTokens) AS cr, SUM(cacheWriteTokens) AS cw, SUM(costUsd) AS cost
  FROM ai_usage_log WHERE day >= ? GROUP BY feature, model ORDER BY cost DESC`).all(since);
console.log('\nPar fonction et modèle (' + days + ' j) : appels | entrée moy. | sortie moy. | cache lu | USD | USD/appel');
fm.forEach((r) => {
  const c = r.calls || 1, hit = r.inTok ? Math.round(100 * r.cr / r.inTok) : 0;
  console.log('  ' + (r.feature + ' [' + String(r.model).replace(/^claude-/, '') + ']').padEnd(52) + String(r.calls).padStart(6) + Math.round(r.inTok / c).toString().padStart(8) + Math.round(r.outTok / c).toString().padStart(7) + (hit + ' %').padStart(7) + fmt(r.cost).padStart(10) + (r.cost / c).toFixed(4).padStart(9));
});

console.log('\nPar jour (' + days + ' j) :');
db.prepare('SELECT day, SUM(calls) AS calls, SUM(costUsd) AS cost FROM ai_usage_log WHERE day >= ? GROUP BY day ORDER BY day DESC').all(since)
  .forEach((r) => console.log('  ' + r.day + fmt(r.cost).padStart(12) + '  ' + r.calls + ' appel(s)'));

// Projection mensuelle : coût moyen par jour (calendaire) des 7 derniers jours x 30.
{
  const d7 = new Date(); d7.setDate(d7.getDate() - 6);
  const c7 = db.prepare('SELECT SUM(costUsd) AS cost FROM ai_usage_log WHERE day >= ?').get(local(d7)).cost || 0;
  console.log('\nTotal mensuel projeté : ' + fmt(c7 / 7 * 30) + ' (moyenne ' + fmt(c7 / 7) + '/jour sur 7 j x 30)');
}

// Repli : « X:repli » suit un essai Haiku de « X ».
const by = {};
fm.forEach((r) => {
  const base = r.feature.replace(/:repli$/, ''), o = by[base] || (by[base] = { fast: 0, fb: 0 });
  if (/:repli$/.test(r.feature)) o.fb += r.calls; else if (/haiku/i.test(r.model)) o.fast += r.calls;
});
const fr = Object.keys(by).filter((k) => by[k].fast || by[k].fb);
if (fr.length) {
  console.log('\nTaux de repli Haiku -> modèle fort (' + days + ' j) :');
  fr.forEach((k) => console.log('  ' + k.padEnd(28) + by[k].fast + ' Haiku, ' + by[k].fb + ' repli(s)' + (by[k].fast ? ' = ' + Math.round(100 * by[k].fb / by[k].fast) + ' %' : '')));
}
