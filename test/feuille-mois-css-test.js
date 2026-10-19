// Non-régression : la vue Mois de la Feuille de temps posait la couleur des cases
// en style inline ; une règle `.tsCalSlot { background: transparent !important }`
// (verre-calme.css) les rendait invisibles. Seules les cases vides (sans style) peuvent être neutralisées.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'verre-calme.css'), 'utf8');
const blocks = css.match(/[^{}]+\{[^{}]*transparent\s*!important[^{}]*\}/g) || [];
let bad = 0;
for (const b of blocks) {
  const sels = b.split('{')[0].split(',').map(s => s.trim());
  for (const s of sels) if (/\.tsCalSlot\b/.test(s) && !/:not\(\[style\]\)/.test(s)) { bad++; console.log('  ✗ règle masquant les cases remplies :', s); }
}
if (bad) process.exit(1);
console.log('  ✓ aucune règle !important ne masque les cases remplies de la vue Mois');
