// Rapport hebdomadaire de coût IA : comparaison à la semaine précédente et alertes. Usage : node test/ia-rapport-hebdo-test.js
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const dir = require('./lib/tmpdir').mkTmp('tmt-hebdo-');
const p2 = (n) => String(n).padStart(2, '0');
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const row = (day, feature, calls, costUsd) => ({ userId: 'u1', day, model: 'claude-haiku-4-5', feature, calls, costUsd });
const run = (rows, env) => {
  const f = path.join(dir, 'e.json'); fs.writeFileSync(f, JSON.stringify(rows));
  return execFileSync('node', [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '--semaine', '--from', f], { encoding: 'utf8', env: { ...process.env, ...env } });
};
let o = run([row(back(1), 'classement-tache', 10, 1), row(back(2), 'classement-tache:repli', 1, 0.7), row(back(9), 'classement-tache', 10, 1), row(back(3), 'plan', 2, 0.1)]);
assert(/7 derniers jours : 1\.80 USD/.test(o), 'total semaine 1.80 $ (repli regroupé)');
assert(/Semaine précédente : 1\.00 USD \(\+80 %\)/.test(o), 'comparaison +80 %');
assert(/ALERTE : classement-tache en hausse/.test(o), 'alerte hausse de fonction');
assert(!/ALERTE.*total/.test(o), 'pas d\'alerte de total sous le seuil');
o = run([row(back(1), 'plan', 1, 0.3)], { AI_WEEKLY_ALERT_USD: '0.2' });
assert(/pas de données/.test(o) && /ALERTE : total/.test(o), 'sans semaine précédente + seuil dépassé');
o = run([row(back(1), 'plan', 1, 0.1), row(back(8), 'plan', 1, 0.1)]);
assert(/Aucune alerte/.test(o), 'stable : aucune alerte');
process.exit(failed ? 1 : 0);
