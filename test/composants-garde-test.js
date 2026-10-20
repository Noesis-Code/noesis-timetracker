// Garde R29 : un seul composant par contrôle (docs/audit-composants-2026-10-20.md, étape 10).
// 1) la copie de Trade Tracker est identique à la source ; 2) les règles ajoutées au fil des migrations ci-dessous.
const fs = require('fs'); const path = require('path');
const R = path.join(__dirname, '..');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');
for (const [a, b] of [['public/css/composants.css', 'trade-tracker/public/composants.css'], ['public/js/composants.js', 'trade-tracker/public/js/composants.js']])
  ok(read(a) === read(b), b + ' identique à ' + a + ' (node scripts/sync-composants.js)');
const index = read('public/index.html'), tindex = read('trade-tracker/public/index.html');
ok(/css\/composants\.css/.test(index) && /js\/composants\.js/.test(index), 'TimeTracker charge composants.css et composants.js');
ok(/composants\.css/.test(tindex) && /js\/composants\.js/.test(tindex), 'Trade Tracker charge composants.css et composants.js');

// Fichiers de sources de l'interface (hors composants eux-mêmes)
function walk(d, out) { for (const n of fs.readdirSync(path.join(R, d))) { const p = d + '/' + n; const st = fs.statSync(path.join(R, p)); if (st.isDirectory()) { if (n !== 'node_modules' && n !== 'icons') walk(p, out); } else if (/\.(js|css|html)$/.test(n) && !/composants\.(js|css)$/.test(n) && !/(legal-en|qrcode|i18n)\.js$/.test(n) && !/\/(sw)\.js$/.test(p)) out.push(p); } return out; }
const files = walk('public', []).concat(walk('trade-tracker/public', []));
const RULES = [];  // [libellé, regex, fichiers exemptés]
const hits = (re) => files.filter((f) => re.test(read(f)));
// Règles activées au fil des étapes (voir tout en bas)
for (const [label, re] of RULES) { const h = hits(re); ok(h.length === 0, label + (h.length ? ' : ' + h.slice(0, 4).join(', ') : '')); }
process.exit(failed ? 1 : 0);
