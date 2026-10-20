// Apprentissage par l'usage : exemples par utilisateur, plafond de prompt, remise à zéro, précision inchangée, rapport. Aucun réseau.
const os = require('os'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = require('./lib/tmpdir').mkTmp('tmt-appr-');
process.env.NOESIS_DATA_DIR = dir; process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const ex = require('../server/lib/goalsclassifyexamples');
const cls = require('../server/lib/goalstaskclassify');
(async () => {
  const now = new Date().toISOString();
  ['u1', 'u2'].forEach((u) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(u, u, now));
  const A = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid;
  const cands = [{ key: 'k1', label: 'Admin → Compta' }, { key: 'k2', label: 'Prod → Achats' }];
  for (let i = 0; i < 8; i++) ex.recordCorrection(A, 'u1', 'Payer facture numéro ' + i, 'k1');
  ex.recordCorrection(A, 'u2', 'Secret de u2', 'k2');
  const mine = ex.recentExamples(A, cands, undefined, 'u1');
  assert(mine.length === 5 && mine[0].label === 'Payer facture numéro 7', 'N=5, du plus récent au plus ancien');
  assert(!mine.some((e) => /u2/.test(e.label)), 'jamais les exemples d\'un autre compte');
  assert(ex.recentExamples(A, cands, undefined, 'u2').length === 1 && ex.recentExamples(A, cands).length === 0, 'chacun les siens ; sans compte : aucun');
  for (let i = 0; i < 6; i++) ex.recordCorrection(A, 'u1', 'Un libellé de tâche assez long pour tester le plafond ' + i, 'k1');
  const capped = ex.recentExamples(A, cands, undefined, 'u1');
  assert(capped.length < 5 && capped.reduce((s, e) => s + e.label.length + e.categoryLabel.length + 6, 0) <= ex.MAX_BLOCK_CHARS, 'plafond de taille du bloc respecté');
  // Surcoût du prompt sur 12 catégories.
  const cats = Array.from({ length: 12 }, (_, i) => ({ key: 'c' + i, label: 'Pôle → Secteur ' + i, description: 'Description du secteur numéro ' + i + ' avec quelques mots', poleDescription: 'Pôle' }));
  const o = { allowUncertain: true, confidence: true };
  const base = cls.buildPrompt('Payer la facture', cats, [], o).length / 4;
  const worst = cls.buildPrompt('Payer la facture', cats, Array.from({ length: 5 }, (_, i) => ({ label: 'Libellé de tâche assez long ' + i, categoryLabel: 'Pôle → Secteur ' + i })), o).length / 4;
  assert(worst / base - 1 <= 0.15, 'surcoût du prompt <= +15 % (' + Math.round(100 * (worst / base - 1)) + ' %)');
  assert(cls.buildPrompt('x', cats, [], o) === cls.buildPrompt('x', cats, undefined, o), 'sans exemple : prompt inchangé');
  // Remise à zéro.
  assert(ex.resetForUser('u1') === 14 && ex.recentExamples(A, cands, undefined, 'u1').length === 0, 'remise à zéro : tous les exemples du compte effacés');
  assert(ex.recentExamples(A, cands, undefined, 'u2').length === 1, 'remise à zéro : ceux des autres intacts');
  // Précision (fournisseur simulé) inchangée.
  const ev = require('../scripts/eval-task-precision');
  const out = await ev.run({});
  assert(out.metrics.precision >= 98, 'précision simulée >= 98 % (' + out.metrics.precision + ')');
  // Rapport.
  const rep = execFileSync('node', [path.join(__dirname, '../scripts/ai-acceptance-report.js'), '30'], { encoding: 'utf8', env: Object.assign({}, process.env, { NOESIS_DATA_DIR: dir }) });
  assert(/Classement de tâche/.test(rep) && /modifiée/.test(rep), 'rapport d\'acceptation produit');
  // Refus mémorisés (20 oct. 2026) : un refus (ou une proposition devenue inapplicable) est conservé SANS expiration ; même cible+champ+valeur ne revient jamais, une autre valeur est une nouvelle proposition.
  const cp = require('../server/lib/changeproposals');
  const chg = (after) => ({ target: 'task', targetId: 999, field: 'date', before: '', after, reason: 'test' });
  assert(cp.store('u1', A, [chg('2099-01-10')]) === 1, 'refus : proposition créée');
  const pend = db.prepare("SELECT id FROM change_proposals WHERE activityId = ? AND status = 'pending'").all(A);
  cp.dismiss(A, pend.map((r) => r.id));
  db.prepare("UPDATE change_proposals SET createdAt = '2024-01-01T00:00:00.000Z', resolvedAt = '2024-01-02T00:00:00.000Z'").run();
  assert(cp.store('u1', A, [chg('2099-01-10')]) === 0, 'refus vieux de 2 ans : toujours mémorisé (aucune expiration)');
  assert(cp.store('u1', A, [chg('2099-01-11')]) === 1, 'même cible, autre valeur : nouvelle proposition possible');
  const p2 = db.prepare("SELECT id FROM change_proposals WHERE activityId = ? AND status = 'pending'").all(A);
  const ap = cp.apply('u1', A, p2.map((r) => r.id));
  assert(ap.skipped.length === 1 && cp.store('u1', A, [chg('2099-01-11')]) === 1 && !db.prepare("SELECT 1 FROM change_proposals WHERE status = 'dismissed' AND afterValue = '2099-01-11'").get(), 'proposition inapplicable (cible disparue) : statut « inapplicable », pas un refus, donc pas mémorisée');
  fs.rmSync(dir, { recursive: true, force: true });
  if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
  process.exit(0);
})();
