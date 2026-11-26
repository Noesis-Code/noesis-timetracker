#!/usr/bin/env node
// Prépare le contenu de la coque iOS : copie public/ vers mobile/www-ios (jamais commité), sans ce qui ne sert pas en natif.
// Usage : node scripts/prepare-ios.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public');
const DEST = path.join(__dirname, '..', 'mobile', 'www-ios');
// Service worker et page hors ligne : inutiles en natif (le paquet est déjà local).
const SKIP = new Set(['sw.js', 'offline.html']);

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
let n = 0;
for (const name of fs.readdirSync(SRC)) {
  if (SKIP.has(name)) continue;
  fs.cpSync(path.join(SRC, name), path.join(DEST, name), { recursive: true });
  n++;
}
console.log('[prepare-ios] ' + n + ' éléments copiés vers ' + path.relative(process.cwd(), DEST));
