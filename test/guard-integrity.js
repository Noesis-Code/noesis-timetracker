// Garde-fou d'intégrité : échoue si un fichier suivi par git sous public/, server/,
// trade-tracker/ est vide, si un fichier critique manque, ou si un fichier a perdu
// plus de 60 % de ses lignes par rapport à origin/staging (réf. GUARD_BASE).
// Dérogation volontaire (suppression assumée) : GUARD_ALLOW_SHRINK=chemin1,chemin2
// Incident d'origine : eb769ac a poussé trade-tracker/public/styles.css et screen-compare.js à 0 octet.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['public', 'server', 'trade-tracker'];
const CRITICAL = ['public/app.js', 'public/index.html', 'public/styles.css', 'public/sw.js', 'public/i18n.js',
  'server/index.js', 'server/db.js', 'trade-tracker/public/styles.css', 'trade-tracker/public/index.html'];
const BASE = process.env.GUARD_BASE || 'origin/staging';
const MIN_BASE_LINES = 40, MAX_LOSS = 0.6;
const allow = new Set((process.env.GUARD_ALLOW_SHRINK || '').split(',').filter(Boolean));

const git = (args, opt) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opt });
const countLines = (s) => (s.match(/\n/g) || []).length;

function run() {
  const problems = [];
  const files = git(['ls-files', '-z', '--', ...DIRS]).split('\0').filter(Boolean);
  const present = new Set();
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue; // supprimé dans l'arbre de travail : vu par git diff
    present.add(f);
    if (fs.statSync(p).size === 0) problems.push(`VIDE : ${f}`);
  }
  for (const f of CRITICAL) if (!present.has(f)) problems.push(`CRITIQUE ABSENT : ${f}`);

  let baseOk = true;
  try { git(['rev-parse', '--verify', '-q', BASE]); } catch (e) { baseOk = false; }
  let compared = 0;
  if (baseOk) {
    for (const f of present) {
      if (allow.has(f)) continue;
      let before;
      try { before = git(['show', `${BASE}:${f}`]); } catch (e) { continue; } // nouveau fichier
      const b = countLines(before);
      if (b < MIN_BASE_LINES) continue;
      const a = countLines(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      compared++;
      if (a < b * (1 - MAX_LOSS)) problems.push(`TRONQUÉ : ${f} (${b} -> ${a} lignes, > ${MAX_LOSS * 100} % perdus vs ${BASE})`);
    }
  }
  return { problems, count: present.size, compared, baseOk };
}

if (require.main === module) {
  const r = run();
  r.problems.forEach((p) => console.log('  ✗ ' + p));
  console.log(`guard-integrity : ${r.count} fichiers, ${r.compared} comparés à ${BASE}${r.baseOk ? '' : ' (base absente, comparaison sautée)'}, ${r.problems.length} problème(s)`);
  process.exit(r.problems.length ? 1 : 0);
}
module.exports = { run };
