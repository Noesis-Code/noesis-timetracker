// Échéance de revérification des tarifs IA : AVERTIT (ne fait jamais échouer) si PRICES_UPDATED a plus de 90 jours. Vérifie seulement le format de la date
// et que l'échéance est écrite dans docs/ia/ia-modeles.md. Usage : node test/ia-tarifs-echeance-test.js
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { PRICES_UPDATED } = require('../server/lib/aimodels');
const t = Date.parse(PRICES_UPDATED + 'T12:00:00Z');
assert(/^\d{4}-\d\d-\d\d$/.test(PRICES_UPDATED) && Number.isFinite(t) && t <= Date.now() + 86400000, 'PRICES_UPDATED : date valide, pas dans le futur (' + PRICES_UPDATED + ')');
const age = Math.floor((Date.now() - t) / 86400000);
const due = new Date(t + 90 * 86400000).toISOString().slice(0, 10);
if (age > 90) console.log('  AVERTISSEMENT tarifs IA non revérifiés depuis ' + age + ' jours (PRICES_UPDATED ' + PRICES_UPDATED + ', échéance ' + due + ') : comparer server/lib/aimodels.js au barème Anthropic, puis mettre PRICES_UPDATED à jour (docs/questions/questions-emilien-credits.md).');
else console.log('  ok  tarifs revérifiés il y a ' + age + ' j (prochaine échéance ' + due + ')');
const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ia', 'ia-modeles.md'), 'utf8');
assert(/PRICES_UPDATED/.test(doc) && /90 jours/.test(doc), 'docs/ia/ia-modeles.md : échéance de revérification des tarifs (90 jours) écrite');
console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
