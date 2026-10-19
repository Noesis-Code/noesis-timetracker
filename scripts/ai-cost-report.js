// Rapport du coût IA, LECTURE SEULE, sans appel réseau (ai_usage_log).
// Usage : NOESIS_DATA_DIR=... node scripts/ai-cost-report.js [jours=30]
// Texte court : mois par utilisateur, puis par fonction/modèle (appels, jetons moyens, cache, $), par jour, taux de repli Haiku -> fort.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const DATA_DIR = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, '..', 'data');
const file = path.join(DATA_DIR, 'noesis.db');
if (!fs.existsSync(file)) { console.log('Aucune base : ' + file); process.exit(0); }
const db = new DatabaseSync(file, { readOnly: true });
try { db.prepare('SELECT 1 FROM ai_usage_log LIMIT 1').get(); } catch (e) { console.log('Aucun journal IA (ai_usage_log) dans cette base.'); process.exit(0); }
const capMonth = (() => { const n = Number(process.env.AI_BUDGET_MONTH_USD); return Number.isFinite(n) && n > 0 ? n : 15; })();
const SYSTEM_USER = 'system';
const p2 = (n) => String(n).padStart(2, '0');
const local = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const fmt = (n) => (n || 0).toFixed(2) + ' $';
const days = Math.max(1, Math.floor(Number(process.argv[2])) || 30);
const since = (() => { const d = new Date(); d.setDate(d.getDate() - days + 1); return local(d); })();
const month = local(new Date()).slice(0, 7);

const rows = db.prepare('SELECT userId, SUM(costUsd) AS cost, SUM(calls) AS calls FROM ai_usage_log WHERE day >= ? AND day <= ? GROUP BY userId ORDER BY cost DESC').all(month + '-01', month + '-31');
const users = rows.filter((r) => r.userId !== SYSTEM_USER);
console.log('Coût IA — ' + month + ' (plafond ' + fmt(capMonth) + '/utilisateur)\n');
users.concat(rows.filter((r) => r.userId === SYSTEM_USER)).forEach((r) => console.log(String(r.userId).padEnd(40) + fmt(r.cost).padStart(10) + '  ' + r.calls + ' appel(s)'));
const total = users.reduce((s, r) => s + r.cost, 0);
console.log('\nUtilisateurs actifs : ' + users.length + ' | moyenne ' + fmt(users.length ? total / users.length : 0) + ' (cible 10 $) | max ' + fmt(users.length ? users[0].cost : 0) + ' (limite ' + fmt(capMonth) + ')');

const fm = db.prepare(`SELECT feature, model, SUM(calls) AS calls, SUM(inputTokens) AS inTok, SUM(outputTokens) AS outTok,
    SUM(cacheReadTokens) AS cr, SUM(cacheWriteTokens) AS cw, SUM(costUsd) AS cost
  FROM ai_usage_log WHERE day >= ? GROUP BY feature, model ORDER BY cost DESC`).all(since);
console.log('\nPar fonction et modèle (' + days + ' j) : appels | entrée moy. | sortie moy. | cache lu | $ | $/appel');
fm.forEach((r) => {
  const c = r.calls || 1, hit = r.inTok ? Math.round(100 * r.cr / r.inTok) : 0;
  console.log('  ' + (r.feature + ' [' + String(r.model).replace(/^claude-/, '') + ']').padEnd(52) + String(r.calls).padStart(6) + Math.round(r.inTok / c).toString().padStart(8) + Math.round(r.outTok / c).toString().padStart(7) + (hit + ' %').padStart(7) + fmt(r.cost).padStart(10) + (r.cost / c).toFixed(4).padStart(9));
});

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
