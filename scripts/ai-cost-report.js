// Rapport du coût IA du mois courant. Usage : NOESIS_DATA_DIR=... node scripts/ai-cost-report.js
const db = require('../server/db');
const ab = require('../server/lib/aibudget');
const month = ab.todayLocal().slice(0, 7);
const fmt = (n) => n.toFixed(2) + ' $';
const rows = db.prepare(`SELECT userId, SUM(costUsd) AS cost, SUM(calls) AS calls FROM ai_usage_log
  WHERE day >= ? AND day <= ? GROUP BY userId ORDER BY cost DESC`).all(month + '-01', month + '-31');
const users = rows.filter((r) => r.userId !== ab.SYSTEM_USER);
console.log('Coût IA — ' + month + ' (plafond ' + fmt(ab.capMonth()) + '/utilisateur)\n');
users.concat(rows.filter((r) => r.userId === ab.SYSTEM_USER)).forEach((r) => console.log(String(r.userId).padEnd(40) + fmt(r.cost).padStart(10) + '  ' + r.calls + ' appel(s)'));
const total = users.reduce((s, r) => s + r.cost, 0);
const avg = users.length ? total / users.length : 0;
const max = users.length ? users[0].cost : 0;
console.log('\nUtilisateurs actifs : ' + users.length);
console.log('Moyenne par utilisateur actif : ' + fmt(avg) + ' (cible 10 $)');
console.log('Maximum : ' + fmt(max) + ' (limite ' + fmt(ab.capMonth()) + ')');
console.log('\nRépartition par fonctionnalité :');
db.prepare(`SELECT feature, SUM(costUsd) AS cost, SUM(calls) AS calls FROM ai_usage_log WHERE day >= ? AND day <= ? GROUP BY feature ORDER BY cost DESC`)
  .all(month + '-01', month + '-31').forEach((r) => console.log('  ' + r.feature.padEnd(30) + fmt(r.cost).padStart(10) + '  ' + r.calls + ' appel(s)'));
