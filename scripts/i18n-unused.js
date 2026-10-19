#!/usr/bin/env node
// Liste (lecture seule) les clés de DICT (public/i18n.js) sans aucune référence
// dans public/ (hors i18n.js et legal-en.js), server/ et test/.
// Usage : node scripts/i18n-unused.js [--json]   (--json : [{key,start,end}] lignes 1-based)
// Une clé est « utilisée » si, dans le corpus, on retrouve :
//  - la clé entière (brute, ou normalisée : espaces repliés, entités HTML, \' \" décodés) ;
//  - ou, pour une clé à variables {x}, tous ses segments littéraux significatifs ;
//  - ou un préfixe/suffixe dynamique : un littéral du code qui est un préfixe (>= 12 car.) de la clé
//    et se termine par un espace ou une ponctuation, suivi d'une concaténation / ${...} / variable.
// Ces règles sont volontairement prudentes : mieux vaut garder une clé inutile que retirer une utilisée.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8');
const lines = src.split('\n');

// --- 1. entrées de DICT (avec plage de lignes) ---
const open = lines.findIndex((l) => /^\s*var DICT = \{/.test(l));
let close = -1;
for (let i = open + 1; i < lines.length; i++) if (/^  \};/.test(lines[i])) { close = i; break; }
const entries = [];
for (let i = open + 1; i < close; i++) {
  if (!/^\s*['"]/.test(lines[i])) continue;
  let text = lines[i];
  let j = i;
  for (;;) {
    let obj = null;
    try { obj = new Function('return ({' + text + '\n})')(); } catch (e) { /* entrée incomplète */ }
    if (obj && Object.keys(obj).length === 1) { entries.push({ key: Object.keys(obj)[0], start: i + 1, end: j + 1 }); break; }
    j++;
    if (j >= close) throw new Error('entrée non parsable ligne ' + (i + 1));
    text += '\n' + lines[j];
  }
  i = j;
}

// --- 2. corpus ---
function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules' || f.name === '.git') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (/\.(js|html|json|webmanifest|css|md)$/.test(f.name)) out.push(p);
  }
  return out;
}
const skip = new Set([path.join(root, 'public/i18n.js'), path.join(root, 'public/legal-en.js')]);
const files = ['public', 'server', 'test'].flatMap((d) => (fs.existsSync(path.join(root, d)) ? walk(path.join(root, d), []) : [])).filter((f) => !skip.has(f));
const raw = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\u00a0/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/\u2026/g, '...')
  .replace(/\\(['"`])/g, '$1').replace(/\\n/g, ' ');
const norm = (s) => decode(s).replace(/\s+/g, ' ');
const corpus = norm(raw);
// littéraux de chaînes du code (pour la détection de préfixes dynamiques)
const literals = new Set();
(raw.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []).forEach((l) => literals.add(norm(l.slice(1, -1))));
const dynPrefixes = [...literals].filter((l) => l.length >= 12);

function used(key) {
  const k = norm(key);
  if (corpus.includes(k)) return true;
  if (/[{%$]/.test(k) || /\{[a-zA-Z_]+\}/.test(k)) {
    const segs = k.split(/\{[^}]*\}|%[sd]/).map((s) => s.trim()).filter((s) => s.length >= 8);
    if (segs.length && segs.every((s) => corpus.includes(s))) return true;
  }
  // préfixe composé dynamiquement : littéral du code qui commence la clé
  for (const p of dynPrefixes) if (k.length > p.length && k.startsWith(p)) return true;
  // suffixe : clé qui se termine par un littéral de code (ex. ' ?') — seulement si assez long
  for (const p of dynPrefixes) if (k.length > p.length && k.endsWith(p)) return true;
  return false;
}

const unused = entries.filter((e) => !used(e.key));
if (process.argv.includes('--json')) console.log(JSON.stringify(unused));
else {
  unused.forEach((e) => console.log(e.start + (e.end > e.start ? '-' + e.end : '') + '\t' + e.key.slice(0, 110)));
  console.error(unused.length + ' clé(s) inutilisée(s) sur ' + entries.length);
}
