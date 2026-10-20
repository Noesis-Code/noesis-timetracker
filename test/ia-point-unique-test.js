// Point d'appel UNIQUE à l'API Anthropic : tout appel de génération passe par aibudget.fetchAnthropic (budget, délai du signal de l'appelant,
// relances 429/529, masquage Loi 25, alerte clé 401/403, journal de coût). Échoue si un fichier de server/ ou scripts/ appelle l'API autrement.
// Usage : node test/ia-point-unique-test.js
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const root = path.join(__dirname, '..');
const files = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.js$/.test(e.name)) files.push(p);
}); })(path.join(root, 'server'));
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (!e.isDirectory() && /\.js$/.test(e.name)) files.push(p); }); })(path.join(root, 'scripts'));
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

// EXCEPTIONS (chemin -> raison). Toute entrée doit rester vraie (le fichier existe et contient bien un accès direct) : sinon la liste est périmée.
const EXCEPTIONS = {
  'server/lib/aibudget.js': 'POINT UNIQUE : contient le seul fetch() des messages (fetchWithRetry) ; budget, réservation, masquage, alerte 401/403, journal.',
  'server/lib/aibatch.js': 'API Batch (endpoint /messages/batches, 50 % du prix, surveillance Drive) : autre protocole asynchrone. Budget vérifié dans submit() (aibudget.check sur le coût maximal x0,5), délai propre (TIMEOUT_MS), masquage (aiscrub), alerte 401/403 (aibudget.alertKeyRefused), coût écrit à la relève des résultats (drivesync, aibudget.record facteur 0,5).',
};
const direct = /(^|[^.\w$])fetch\s*\(|\|\|\s*fetch\)|https?\.request\s*\(|require\(['"]@anthropic-ai\/sdk['"]\)|require\(['"]https?['"]\)/;
const mentions = /api\.anthropic\.com|x-api-key|anthropic-version/;
const offenders = [], seen = {};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!mentions.test(src)) continue;
  const r = rel(f);
  const hasDirect = direct.test(src.replace(/\/\/.*$/gm, ''));
  if (EXCEPTIONS[r]) { seen[r] = hasDirect; continue; }
  if (hasDirect) offenders.push(r);
  else if (/api\.anthropic\.com/.test(src) && !/fetchAnthropic\s*\(/.test(src)) offenders.push(r + ' (URL sans fetchAnthropic)');
}
assert(offenders.length === 0, 'aucun appel direct à l\'API Anthropic hors point unique' + (offenders.length ? ' : ' + offenders.join(', ') : ''));
for (const r of Object.keys(EXCEPTIONS)) assert(seen[r] === true, 'exception à jour (' + r + ') : ' + EXCEPTIONS[r].slice(0, 60) + '…');
// Chaque module IA appelle bien fetchAnthropic
const callers = ['offerdelivery', 'goalsweeklyauto', 'goalsrewrite', 'docanalysis', 'crosssectorinference', 'goalstaskclassify'];
callers.forEach((n) => assert(/aibudget\.fetchAnthropic\s*\(/.test(fs.readFileSync(path.join(root, 'server/lib', n + '.js'), 'utf8')), n + ' : passe par aibudget.fetchAnthropic'));
// Le lot (aibatch) lève aussi l'alerte clé refusée
assert(/alertKeyRefused/.test(fs.readFileSync(path.join(root, 'server/lib/aibatch.js'), 'utf8')), 'aibatch : alerte clé 401/403');
// Détecteur : un faux fichier fautif serait bien attrapé
assert(direct.test("const r = await fetch('https://api.anthropic.com/v1/messages', {})") && !direct.test('await aibudget.fetchAnthropic(f, U, {})'), 'détecteur : fetch() nu attrapé, fetchAnthropic ignoré');
(async () => {
  // Comportement : un lot refusé en 401 écrit l'alerte (une fois par heure, via le même compteur), sans secret.
  process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-unique-'); process.env.ANTHROPIC_API_KEY = 'sk-secret-test';
  const batch = require('../server/lib/aibatch');
  const logs = []; const oe = console.error; console.error = (m) => logs.push(String(m));
  batch.setFetch(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) }));
  let e1 = null; try { await batch.get('b1'); } catch (e) { e1 = e; }
  try { await batch.get('b2'); } catch (e) { /* attendu */ }
  console.error = oe;
  assert(e1 && e1.statusCode === 401 && logs.filter((l) => /ALERTE/.test(l)).length === 1 && !/sk-secret/.test(logs.join('')), 'lot refusé en 401 : une alerte au journal (pas deux), sans la clé');
  console.log(failed ? '\nÉCHEC' : '\nOK'); process.exit(failed ? 1 : 0);
})();
// : '\nOK'); process.exit(failed ? 1 : 0);
