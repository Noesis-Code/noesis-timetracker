// Cale les plans existants sur la grille de l'année (période 1 = semaine du 1er janvier).
// Usage : node scripts/migrate-year-grid.js [--apply]   (sans --apply : simulation)
const goals = require('../server/lib/goals');
const apply = process.argv.includes('--apply');
const report = goals.migratePlansToYearGrid(!apply);
console.log(JSON.stringify(report, null, 1));
console.log((apply ? 'Appliqué : ' : 'Simulation : ') + report.length + ' plan(s)');
