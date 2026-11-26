// Diagnostic (lecture seule) : rang, nuance et clarté de chaque pôle d'une activité, dans l'ordre d'AFFICHAGE du contexte de création. Usage : NOESIS_DATA_DIR=... node scripts/diag-couleurs-poles.js <userId> <activityId>
const db = require('../server/db');
const goals = require('../server/lib/goals');
const cs = require('../server/lib/categorystats');
const P = require('../public/theme-palette.js');
const [userId, aid] = [process.argv[2], Number(process.argv[3])];
const a = db.prepare('SELECT a.id, a.name, m.color FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE a.id = ? AND m.userId = ?').get(aid, userId);
console.log('activité', a);
console.log('lignes activity_goal_categories (position, id) :');
db.prepare('SELECT id, key, label, parentKey, position FROM activity_goal_categories WHERE activityId = ? ORDER BY position ASC, id ASC').all(aid).forEach((r) => console.log('  ', JSON.stringify(r)));
const sr = cs.shadeRanks(aid);
console.log('shadeRanks count =', sr.count);
goals.categoriesForActivity(aid).forEach((p, i) => {
  const rank = sr.ranks.has(p.key) ? sr.ranks.get(p.key) : 0, hex = P.poleColor(a.color, rank);
  console.log('  ordre d’affichage', i, p.key, JSON.stringify(p.label), 'rang', rank, 'hex', hex, 'clarté L*', P.labLightness ? Math.round(P.labLightness(hex)) : '?');
});
