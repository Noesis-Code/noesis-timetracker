#!/usr/bin/env node
// Incrémente CACHE_VERSION de public/sw.js sans conflit entre agents.
// Lit la valeur sur origin/staging (après fetch), la compare à la valeur locale,
// écrit max(staging, local)+1. À lancer EN DERNIER, juste après le rebase et avant le push.
// Usage : node scripts/bump-sw.js [--dry]   (--dry : affiche sans écrire)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RE = /const CACHE_VERSION = 'noesis-v(\d+)'/;
const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });

try { git(['fetch', 'origin', 'staging']); } catch (e) { console.error('fetch impossible : ' + e.message.split('\n')[0]); process.exit(1); }
const remote = git(['show', 'origin/staging:public/sw.js']).match(RE);
const file = path.join(ROOT, 'public', 'sw.js');
const src = fs.readFileSync(file, 'utf8'); // préserve les fins de ligne (aucune conversion)
const local = src.match(RE);
if (!remote || !local) { console.error('CACHE_VERSION introuvable'); process.exit(1); }
const next = Math.max(+remote[1], +local[1]) + 1;
console.log(`staging v${remote[1]}, local v${local[1]} -> v${next}`);
if (process.argv.includes('--dry')) process.exit(0);
fs.writeFileSync(file, src.replace(RE, `const CACHE_VERSION = 'noesis-v${next}'`));
