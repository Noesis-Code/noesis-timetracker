// Non-régression : le panneau « Noèsis propose » (.tasksPropose > .tasksProposeBody > .tasksPages) ne défilait pas.
// .tasksPages (overflow hidden) est un enfant flex : sans flex: none son min-height tombe à 0, il rétrécit à la hauteur
// du panneau et rogne ses lignes, donc .tasksProposeBody (le défilant) n'a jamais de contenu qui dépasse.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'aujourdhui.css'), 'utf8');
const m = css.match(/\.tasksPages\s*\{([^}]*)\}/);
if (!m || !/flex\s*:\s*none/.test(m[1])) { console.log('  ✗ .tasksPages doit avoir flex: none (sinon le panneau de tâches proposées ne défile pas)'); process.exit(1); }
console.log('  ✓ .tasksPages ne rétrécit pas : le corps du panneau défile');
