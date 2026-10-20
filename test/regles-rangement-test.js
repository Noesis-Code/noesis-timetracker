// Garde statique : les règles de rangement existent (R1 à R10) et CLAUDE.md et les deux agents les mentionnent.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const regles = read('docs/regles-rangement.md');
ok(regles.length > 0, 'docs/regles-rangement.md existe');
for (let i = 1; i <= 10; i++) ok(new RegExp('\\bR' + i + '\\.').test(regles), 'règle R' + i + ' présente');
for (const f of ['CLAUDE.md', '.claude/agents/relecteur.md', '.claude/agents/developpeur.md']) ok(read(f).includes('regles-rangement.md'), f + ' mentionne regles-rangement.md');
process.exit(failed ? 1 : 0);
