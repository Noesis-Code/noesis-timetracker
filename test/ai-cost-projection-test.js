// Projection mensuelle du rapport de coût IA, sur données synthétiques (--from).
// Usage : node test/ai-cost-projection-test.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = require('./lib/tmpdir').mkTmp('tmt-cost-proj-');
const p2 = (n) => String(n).padStart(2, '0');
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
const row = (n, cost) => ({ userId: 'u1', day: dayAgo(n), model: 'claude-haiku', feature: 'classement-tache', calls: 1, inputTokens: 100, outputTokens: 10, costUsd: cost });
// 7 derniers jours (0..6) : 0,70 $ au total ; jours 7+ : 100 $ à ignorer
const f = path.join(dir, 'e.json');
fs.writeFileSync(f, JSON.stringify([row(0, 0.3), row(3, 0.2), row(6, 0.2), row(7, 50), row(20, 50)]));
const out = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '--from', f, '30'], { encoding: 'utf8' });
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
assert(/Total mensuel projeté : 3\.00 \$ \(moyenne 0\.10 \$\/jour/.test(out), '0,70 $ / 7 x 30 = 3,00 $ (jours > 7 ignorés)');
fs.writeFileSync(f, JSON.stringify([row(10, 5)]));
assert(/Total mensuel projeté : 0\.00 \$/.test(execFileSync('node', [path.join(__dirname, '..', 'scripts', 'ai-cost-report.js'), '--from', f], { encoding: 'utf8' })), 'aucun appel récent : 0,00 $');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
if (failed) process.exit(1);
console.log('OK');
