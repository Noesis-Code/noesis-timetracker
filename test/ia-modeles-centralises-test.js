// Les identifiants de modèle IA ne sont codés en dur que dans server/lib/aimodels.js ; surcharge par variable d'environnement.
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const root = path.join(__dirname, '..', 'server');
const files = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.js$/.test(e.name)) files.push(p);
}); })(root);
const central = path.join(root, 'lib', 'aimodels.js');
const offenders = files.filter((f) => f !== central && /claude-(haiku|sonnet|opus|\d)/i.test(fs.readFileSync(f, 'utf8')));
assert(offenders.length === 0, 'aucun identifiant de modèle hors aimodels.js' + (offenders.length ? ' : ' + offenders.map((f) => path.relative(root, f)).join(', ') : ''));
// Tarifs ($ / M jetons) : un seul endroit (PRICES). Aucun littéral de prix ni conversion « par million » hors aimodels.js, sauf aibudget.js (calcul via priceFor)
// et drivesync.js (estimation de lot via priceFor, facteur 0,5 = remise des lots).
const jsFiles = files.slice();
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.js$/.test(e.name)) jsFiles.push(p); }); })(path.join(__dirname, '..', 'scripts'));
const priceLiteral = /\b(?:in|input|out|output)\s*:\s*\d+(?:\.\d+)?\s*,\s*(?:in|input|out|output)\s*:\s*\d/;
const perMillion = /(?:\/|\*)\s*(?:1e6|1_?000_?000)\b|\b(?:1e6|1_?000_?000)\s*\*/;
const allowPerM = ['aibudget.js', 'drivesync.js'];
const priceOffenders = jsFiles.filter((f) => path.basename(f) !== 'aimodels.js' && (priceLiteral.test(fs.readFileSync(f, 'utf8')) || (perMillion.test(fs.readFileSync(f, 'utf8')) && !allowPerM.includes(path.basename(f)))));
assert(priceOffenders.length === 0, 'aucun prix IA codé en dur hors aimodels.js (server/ et scripts/)' + (priceOffenders.length ? ' : ' + priceOffenders.map((f) => path.relative(path.join(__dirname, '..'), f)).join(', ') : ''));
['aibudget.js', 'drivesync.js'].forEach((n) => { const src = fs.readFileSync(jsFiles.find((f) => path.basename(f) === n), 'utf8'); assert(/priceFor\(|PRICES/.test(src), n + ' : tarifs lus via priceFor/PRICES'); });
const KEYS = ['ANTHROPIC_MODEL', 'NOESIS_TASK_CATEGORY_MODEL', 'NOESIS_GOALS_REWRITE_MODEL', 'DRIVE_SYNC_MODEL', 'NOESIS_SPELLFIX_MODEL', 'X_FAST'];
KEYS.forEach((k) => delete process.env[k]);
const m = require('../server/lib/aimodels');
assert(m.strongModel() === 'claude-sonnet-5' && m.classifyModel() === 'claude-sonnet-4-5-20250929' && m.rewriteModel() === 'claude-sonnet-4-5-20250929', 'valeurs par défaut inchangées (fort)');
assert(m.driveModel() === 'claude-haiku-4-5' && m.spellModel() === 'claude-haiku-4-5' && m.fastModelRaw('X_FAST') === 'claude-haiku-4-5', 'valeurs par défaut inchangées (rapide)');
process.env.ANTHROPIC_MODEL = 'a'; process.env.NOESIS_TASK_CATEGORY_MODEL = 'b'; process.env.DRIVE_SYNC_MODEL = 'c'; process.env.NOESIS_SPELLFIX_MODEL = 'd'; process.env.X_FAST = ' e ';
assert(m.strongModel() === 'a' && m.classifyModel() === 'b' && m.rewriteModel() === 'b' && m.driveModel() === 'c' && m.spellModel() === 'd' && m.fastModelRaw('X_FAST') === 'e', 'surcharge par variable d\'environnement');
process.env.NOESIS_GOALS_REWRITE_MODEL = 'f';
assert(m.rewriteModel() === 'f', 'reformulation : variable propre prioritaire');
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
