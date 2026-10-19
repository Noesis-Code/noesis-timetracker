// Coût IA réel par fonctionnalité (table ai_usage_log). Usage : node scripts/ai-cost-report.js [jours=30]
const aibudget = require('../server/lib/aibudget');
const rows = aibudget.usageReport(process.argv[2]);
console.table(rows);
console.log('Total $ :', rows.reduce((a, r) => a + r.costUsd, 0).toFixed(4));
