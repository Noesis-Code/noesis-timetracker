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
const capMonth = (() => { const n = Number(process.env.AI_BUDGET_MONTH_USD); return Number.isFinite(n) && n > 0 ? n : 15; })();
const SYSTEM_USER = 'system';
const p2 = (n) => String(n).padStart(2, '0');
const local = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const fmt = (n) => (n || 0).toFixed(2) + ' $';
const days = Math.max(1, Math.floor(Number(args[0])) || 30);
const since = (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return local(d); })();
const month = local(new Date()).slice(0, 7);

const rows = db.prepare('SELECT userId, SUM(costUsd) AS cost, SUM(calls) AS calls FROM ai_usage_log WHERE day >= ? AND day <= ? GROUP BY userId ORDER BY cost DESC').all(month + '-01', month + '-31');
const users = rows.filter((r) => r.userId !== SYSTEM_USER);
console.log('Coût IA — ' + month + ' (plafond ' + fmt(capMonth) + '/utilisateur)\n');
users.concat(rows.filter((r) => r.userId === SYSTEM_USER)).forEach((r) => console.log(String(r.userId).padEnd(40) + fmt(r.cost).padStart(10) + '  ' + r.calls + ' appel(s)'));
const total = users.reduce((s, r) => s + r.cost, 0);
console.log('\nUtilisateurs actifs : ' + users.length + ' | moyenne ' + fmt(users.length ? total / users.length : 0) + ' (cible 10 $) | max ' + fmt(users.length ? users[0].cost : 0) + ' (limite ' + fmt(capMonth) + ')');

// Résumé par FONCTION (modèles et replis regroupés), une table texte triée par coût : à lancer sur la base de production.
const ff = db.prepare(`SELECT feature, SUM(calls) AS calls, SUM(inputTokens) AS inTok, SUM(outputTokens) AS outTok, SUM(cacheReadTokens) AS cr, SUM(costUsd) AS cost
  FROM ai_usage_log WHERE day >= ? GROUP BY feature ORDER BY cost DESC`).all(since);
const totCost = ff.reduce((s, r) => s + r.cost, 0), totCalls = ff.reduce((s, r) => s + r.calls, 0);
console.log('\nRésumé par fonction (' + days + ' j, repli inclus) :');
console.log('  ' + 'fonction'.padEnd(30) + 'appels'.padStart(8) + '/jour'.padStart(7) + 'ent.moy'.padStart(9) + 'sort.moy'.padStart(9) + 'cache'.padStart(7) + '$'.padStart(9) + '$/appel'.padStart(9) + 'part'.padStart(6));
ff.forEach((r) => {
  const c = r.calls || 1;
  console.log('  ' + r.feature.padEnd(30) + String(r.calls).padStart(8) + (r.calls / days).toFixed(1).padStart(7) + String(Math.round(r.inTok / c)).padStart(9) + String(Math.round(r.outTok / c)).padStart(9)
    + ((r.inTok ? Math.round(100 * r.cr / r.inTok) : 0) + ' %').padStart(7) + fmt(r.cost).padStart(9) + (r.cost / c).toFixed(4).padStart(9) + ((totCost ? Math.round(100 * r.cost / totCost) : 0) + ' %').padStart(6));
});
console.log('  ' + 'TOTAL'.padEnd(30) + String(totCalls).padStart(8) + (totCalls / days).toFixed(1).padStart(7) + ''.padStart(25) + fmt(totCost).padStart(9));

const fm = db.prepare(`SELECT feature, model, SUM(calls) AS calls, SUM(inputTokens) AS inTok, SUM(outputTokens) AS outTok,
    SUM(cacheReadTokens) AS cr, SUM(cacheWriteTokens) AS cw, SUM(costUsd) AS cost
  FROM ai_usage_log WHERE day >= ? GROUP BY feature, model ORDER BY cost DESC`).all(since);
console.log('\nPar fonction et modèle (' + days + ' j) : appels | entrée moy. | sortie moy. | cache lu | $ | $/appel');
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
  .forEach((r) => console.log('  ' + r.day + fmt(r.cost).padStart(10) + '  ' + r.calls + ' appel(s)'));

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
