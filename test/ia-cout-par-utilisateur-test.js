// Coût par utilisateur actif (total ÷ comptes actifs sur la période) du rapport de coût IA, sur données synthétiques. Aucun réseau.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const dir = require('./lib/tmpdir').mkTmp('tmt-coutuser-');
const p2 = (n) => String(n).padStart(2, '0');
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const row = (userId, day, costUsd, calls) => ({ userId, day, model: 'claude-haiku-4-5', feature: 'classement-tache', calls, inputTokens: 100, outputTokens: 10, costUsd, cacheReadTokens: 0, cacheWriteTokens: 0 });
const rows = [row('u1', ago(0), 1.0, 5), row('u1', ago(3), 0.5, 2), row('u2', ago(10), 0.5, 4), row('system', ago(1), 0.5, 3), row('u3', ago(40), 5, 9), row('u4', ago(2), 0, 0)];
const f = path.join(dir, 'e.json');
fs.writeFileSync(f, JSON.stringify(rows));
const run = (...a) => execFileSync('node', [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '--from', f, ...a], { encoding: 'utf8' });
const line = (o) => (o.split('\n').find((l) => /^Coût par utilisateur actif/.test(l)) || '');
let l = line(run('30'));
assert(/2\.50 USD ÷ 2 compte/.test(l) && /1\.25 USD/.test(l), '30 j : (1 + 0,5 + 0,5 + 0,5 système) ÷ 2 comptes actifs = 1,25 $ (' + l + ')');
l = line(run('5'));
assert(/2\.00 USD ÷ 1 compte/.test(l) && /2\.00 USD/.test(l), '5 j : 2,00 $ ÷ 1 compte actif (u2 hors période, u4 sans appel)');
fs.writeFileSync(f, JSON.stringify([row('system', ago(0), 1, 1)]));
assert(/0\.00 USD \(1\.00 USD ÷ 0 compte/.test(line(run('30'))), 'aucun compte actif : 0,00 $, pas de division par zéro');
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
