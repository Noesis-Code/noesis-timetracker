// Rapport de coût IA lu depuis un export JSON/CSV de ai_usage_log (--from). Usage : node test/ia-rapport-export-test.js
const os = require('os'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const dir = require('./lib/tmpdir').mkTmp('tmt-rapport-');
const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
const day = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const rows = [
  { userId: 'u1', day, model: 'claude-haiku-4-5', feature: 'classement-tache', calls: 10, inputTokens: 5000, outputTokens: 400, costUsd: 0.5, cacheReadTokens: 0, cacheWriteTokens: 0 },
  { userId: 'u1', day, model: 'claude-sonnet-5', feature: 'classement-tache:repli', calls: 1, inputTokens: 500, outputTokens: 40, costUsd: 0.25, cacheReadTokens: 0, cacheWriteTokens: 0 },
];
const js = path.join(dir, 'e.json'), csv = path.join(dir, 'e.csv');
fs.writeFileSync(js, JSON.stringify(rows));
const cols = Object.keys(rows[0]);
fs.writeFileSync(csv, '﻿' + cols.join(',') + '\r\n' + rows.map((r) => cols.map((c) => /,/.test(r[c]) ? '"' + r[c] + '"' : r[c]).join(',')).join('\r\n') + '\r\n');
const run = (f) => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '--from', f, '7'], { encoding: 'utf8' });
for (const f of [js, csv]) {
  const o = run(f);
  assert(/classement-tache/.test(o) && /TOTAL/.test(o) && /0\.75 \$/.test(o), path.extname(f) + ' : total 0.75 $ par fonction');
  assert(/= 10 %/.test(o), path.extname(f) + ' : taux de repli 10 %');
}
{ // --court : 10 lignes maximum, comptes anonymisés
  const o = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '--from', js, '--court', '7'], { encoding: 'utf8' }).trim().split('\n');
  assert(o.length <= 10 && /0\.75 \$/.test(o[0]) && /compte A/.test(o.join('\n')) && !/u1/.test(o.join('\n')), '--court : au plus 10 lignes, total, compte anonymisé');
}
fs.writeFileSync(path.join(dir, 'bad.json'), '{pas du json');
let code = 0; try { run(path.join(dir, 'bad.json')); } catch (e) { code = e.status; }
assert(code === 1, 'export illisible : sortie en erreur');
process.exit(failed ? 1 : 0);
