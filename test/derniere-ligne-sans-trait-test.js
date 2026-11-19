// R51 : la dernière ligne d'une liste / d'un pop-up n'a jamais de trait en dessous (règle commune dans composants.css).
const fs = require('fs'), assert = require('assert');
const css = fs.readFileSync('public/css/composants.css', 'utf8');
assert(css.includes('.cmpSepRow:last-child::after { content: none; }'), 'R51 : .cmpSepRow perd son trait quand elle est la dernière');
assert(/:root:root:root :is\([^)]*\.tasksPopRow[^)]*\.activityEditBar\):last-child \{ border-bottom: 0; \}/.test(css), 'R51 : lignes à trait du bas : pas de trait sous la dernière (dont « Ajouter un responsable » = .tasksPopRow)');
assert(fs.readFileSync('public/css/verre-calme.css', 'utf8').includes('#communityMembersModalList > .activityRow:last-child { border-bottom: 0 !important; }'), 'R51 : dernier membre de la fenêtre membres');
assert(/R51\./.test(fs.readFileSync('docs/regles/regles-rangement.md', 'utf8')) && /R51/.test(fs.readFileSync('DESIGN.md', 'utf8')), 'R51 écrite dans les règles et DESIGN.md');
console.log('derniere-ligne-sans-trait-test OK');
