// Garde-fou des sources (incident f7e5583 : marqueurs de conflit commités dans public/app.js, corrigés 76 s plus tard).
// 1) aucun fichier suivi par git (hors docs/) ne contient de marqueur de conflit en début de ligne ;
// 2) node --check passe sur tous les public/**/*.js ; 3) accolades/parenthèses/commentaires équilibrés dans public/**/*.css.
// Usage : node test/garde-sources-test.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
  .filter((f) => fs.existsSync(path.join(ROOT, f)));

// 1. Marqueurs de conflit. « <<<<<<< » et « >>>>>>> » suivis d'un espace ou de la fin de ligne ; « ======= » seul seulement dans le code
// (en Markdown c'est un soulignement de titre légitime, d'où l'exclusion de docs/ et des .md).
const CODE = /\.(js|css|html|json|sh|ya?ml|webmanifest|ps1|py)$/;
const bad = [];
for (const f of tracked) {
  if (f.startsWith('docs/') || /\.(png|jpe?g|gif|ico|woff2?|pdf|zip|sqlite|db)$/i.test(f)) continue;
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (s.indexOf('\0') !== -1) continue;
  const lines = s.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^(<{7}|>{7})( |$)/.test(l) || (CODE.test(f) && /^={7}$/.test(l))) { bad.push(f + ':' + (i + 1)); break; }
  }
}
ok(bad.length === 0, 'aucun marqueur de conflit hors docs/' + (bad.length ? ' : ' + bad.slice(0, 5).join(', ') : ''));

// 2. Syntaxe JS de tout public/
const jsFiles = tracked.filter((f) => f.startsWith('public/') && /\.js$/.test(f));
const jsBad = [];
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); }
  catch (e) { jsBad.push(f + ' : ' + String(e.stderr || e.message).split('\n').slice(0, 4).join(' | ')); }
}
ok(jsFiles.length > 0 && jsBad.length === 0, 'node --check passe sur les ' + jsFiles.length + ' fichiers public/**/*.js' + (jsBad.length ? ' : ' + jsBad[0] : ''));

// 3. Équilibre CSS : commentaires fermés, accolades et parenthèses équilibrées (hors chaînes et commentaires).
function cssBalance(src) {
  let i = 0, brace = 0, paren = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) return 'commentaire non fermé'; i = e + 2; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; if (src[j] !== c) return 'chaîne non fermée'; i = j + 1; continue; }
    if (c === '\\') { i += 2; continue; }
    if (c === '{') brace++; else if (c === '}') { if (--brace < 0) return '« } » en trop'; }
    else if (c === '(') paren++; else if (c === ')') { if (--paren < 0) return '« ) » en trop'; }
    i++;
  }
  return brace ? 'accolade non fermée' : paren ? 'parenthèse non fermée' : '';
}
const cssFiles = tracked.filter((f) => f.startsWith('public/') && /\.css$/.test(f));
const cssBad = [];
for (const f of cssFiles) { const r = cssBalance(fs.readFileSync(path.join(ROOT, f), 'utf8')); if (r) cssBad.push(f + ' : ' + r); }
ok(cssFiles.length > 0 && cssBad.length === 0, 'CSS équilibré (accolades, parenthèses, commentaires) sur les ' + cssFiles.length + ' fichiers public/**/*.css' + (cssBad.length ? ' : ' + cssBad[0] : ''));
// Le contrôle détecte bien les défauts (sinon il ne garantirait rien)
ok(cssBalance('a{color:red') && cssBalance('a{}}') && cssBalance('a{b:url(x}') && cssBalance('/* a') && !cssBalance('a{b:c(d)} /* { */ .x::after{content:"{"}'), 'le contrôle CSS repère accolade/parenthèse/commentaire manquants');
process.exit(failed ? 1 : 0);
