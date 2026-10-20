// Garde-fou : tout commit touchant public/** doit être suivi (ou accompagné) d'un changement de CACHE_VERSION dans public/sw.js.
// Sinon les PWA installées gardent l'ancien code en cache. Ignoré si l'historique git est indisponible (clone superficiel, pas de .git).
// Usage : node test/sw-bump-test.js
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const skip = (why) => { console.log('  ok  garde sw.js ignoré : ' + why); process.exit(0); };

try {
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') skip('pas un dépôt git');
  if (git(['rev-parse', '--is-shallow-repository']) === 'true') skip('clone superficiel');
  git(['rev-parse', '--verify', 'HEAD']);
} catch (e) { skip('git indisponible'); }

try {
  // Dernier commit qui change autre chose que sw.js dans public/ (hors images de docs).
  const last = git(['log', '-1', '--format=%H', '--', 'public', ':(exclude)public/sw.js', ':(exclude)public/docs/img', ':(exclude)docs/img']);
  if (!last) skip('aucun commit public/');
  // Dernier commit qui modifie la ligne CACHE_VERSION.
  const bump = git(['log', '-1', '--format=%H', '-G', "const CACHE_VERSION = 'noesis-v", '--', 'public/sw.js']);
  // Bump en attente dans l'arbre de travail (workflow : bump juste avant le commit).
  const pending = /CACHE_VERSION/.test(execFileSync('git', ['diff', 'HEAD', '--', 'public/sw.js'], { cwd: ROOT, encoding: 'utf8' }));
  let ok = pending;
  if (!ok && bump) {
    if (bump === last) ok = true;
    else { try { git(['merge-base', '--is-ancestor', last, bump]); ok = true; } catch (e) { ok = false; } }
  }
  if (ok) { console.log('  ok  CACHE_VERSION suit la dernière modification de public/'); process.exit(0); }
  console.log('  FAIL le commit ' + last.slice(0, 7) + ' modifie public/ sans bump ultérieur de CACHE_VERSION : lancer node scripts/bump-sw.js');
  process.exit(1);
} catch (e) { skip('historique illisible (' + String(e.message).split('\n')[0] + ')'); }
