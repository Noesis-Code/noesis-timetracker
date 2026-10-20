// Toute variable TRADE_* / TMT_BASE_URL lue par le code de Trade doit figurer dans DEPLOY.md (rien d'oublié).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(root, 'DEPLOY.md'), 'utf8');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'test' || e.name === 'public') continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) files.push(f);
  }
})(root);
const used = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(TRADE_[A-Z][A-Z_]*[A-Z]|TMT_BASE_URL)\b/g)) used.add(m[1]);
used.delete('TRADE_TOKEN_KEY_V'); // préfixe de TRADE_TOKEN_KEY_V<n>, documenté sous cette forme
const missing = [...used].filter((v) => !doc.includes(v));
if (!doc.includes('TRADE_TOKEN_KEY_V<n>')) missing.push('TRADE_TOKEN_KEY_V<n>');
if (missing.length) { console.error('Variables absentes de DEPLOY.md : ' + missing.join(', ')); process.exit(1); }
console.log('ok : ' + used.size + ' variables documentées');
