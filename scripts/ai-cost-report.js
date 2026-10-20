// Rapport du coût IA, LECTURE SEULE, sans appel réseau (ai_usage_log).
// Usage : NOESIS_DATA_DIR=... node scripts/ai-cost-report.js [jours=30]
//     ou : node scripts/ai-cost-report.js --from export.json|export.csv [jours=30]  (export de ai_usage_log, sans accès base)
// Texte court : mois par utilisateur, puis par fonction/modèle (appels, jetons moyens, cache, $), par jour, taux de repli Haiku -> fort.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const args = process.argv.slice(2);
const fi = args.indexOf('--from');
const fromFile = fi >= 0 ? args.splice(fi, 2)[1] : null;
const ci = args.indexOf('--court');
const court = ci >= 0; if (court) args.splice(ci, 1); // --court : 10 lignes maximum (voir plus bas)
// --from <export.json|export.csv> : lit un export de ai_usage_log (SELECT * FROM ai_usage_log) au lieu de la base, sans accès base.
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
const db = openDb();
try { db.prepare('SELECT 1 FROM ai_usage_log LIMIT 1').get(); } catch (e) { console.log('Aucun journal IA (ai_usage_log) dans cette base.'); process.exit(0); }
const fx = require('../server/lib/fx');
// Plafond mensuel : 15 CAD (AI_BUDGET_MONTH_CAD) ; l'ancienne AI_BUDGET_MONTH_USD reste acceptée (USD). capMonth est en USD, comme les coûts du journal.
const capMonth = (() => { const u = Number(process.env.AI_BUDGET_MONTH_USD), c = Number(process.env.AI_BUDGET_MONTH_CAD); return Number.isFinite(u) && u > 0 ? u : fx.toUsd(Number.isFinite(c) && c > 0 ? c : 15); })();
const SYSTEM_USER = 'system';
const p2 = (n) => String(n).padStart(2, '0');
const local = (d) => require('../server/lib/aifeaturecaps').dayKey(d); // jour de Montréal, comme le journal ai_usage_log
const fmt = fx.fmtUsd; // tous les coûts du journal sont en USD
const days = Math.max(1, Math.floor(Number(args[0])) || 30);
const since = (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return local(d); })();
const month = local(new Date()).slice(0, 7);

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
console.log('Coût IA (montants en USD, coût réel de l\'API) — ' + month + ' (plafond ' + fx.fmtCad(fx.toCad(capMonth)) + ' = ' + fmt(capMonth) + ' par utilisateur)');
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

// Plafonds d'appels par compte et par jour (aifeaturecaps) : plus forte journée d'un compte sur la période, repli inclus (borne haute).
{
  const { capUsage } = require('../server/lib/aifeaturecaps');
  const cu = capUsage(db.prepare('SELECT userId, day, feature, calls FROM ai_usage_log WHERE day >= ?').all(since));
  console.log('\nPlafonds par compte et par jour (' + days + ' j) : plus forte journée | plafond | part');
  cu.forEach((u) => console.log('  ' + (u.feature + ' (' + u.env + ')').padEnd(52) + String(u.maxCallsPerAccountDay).padStart(6) + (u.cap ? String(u.cap) : 'aucun').padStart(8) + (u.share === null ? '' : (Math.round(100 * u.share) + ' %').padStart(7) + (u.share >= 0.8 ? '  PROCHE DU PLAFOND' : ''))));
}

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
