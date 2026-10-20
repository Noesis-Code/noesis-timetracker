// Garde-fou vie privée : aucun fichier de docs/ ni de test/ ne doit recopier mot pour mot un titre de tâche personnelle
// (listes /home/claude/taches-secteurs/*.json, champ « tache », lues à l'exécution). Liste absente -> test ignoré proprement.
// Comparaison sans accents ni casse, espaces ignorés ; titres d'au moins 4 mots et 25 caractères (les titres plus courts sont des mots courants).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = process.env.TACHES_SECTEURS_DIR || '/home/claude/taches-secteurs';
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, "'").replace(/\s+/g, ' ').trim();

let files = [];
try { files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')); } catch (e) { /* absent */ }
if (!files.length) { console.log('  ok  titres de tâches personnelles : liste absente, test ignoré'); process.exit(0); }

const titres = new Set();
for (const f of files) {
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (const t of Array.isArray(arr) ? arr : []) {
      const n = norm(t && t.tache || '');
      if (n.length >= 25 && n.split(' ').length >= 4) titres.add(n);
    }
  } catch (e) { /* fichier illisible : ignoré */ }
}
if (!titres.size) { console.log('  ok  titres de tâches personnelles : aucun titre exploitable, test ignoré'); process.exit(0); }

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(md|js|json|txt)$/.test(e.name) && p !== __filename) out.push(p);
  }
}
const cibles = [];
walk(path.join(ROOT, 'docs'), cibles);
walk(path.join(ROOT, 'test'), cibles);
// Rapports de tri des tâches (citent les titres par construction, avec leurs identifiants) : dette connue, aucun AUTRE fichier ne doit en recopier.
const TOLERES = new Set(['docs/tri-taches-basic-2026-10-20.md', 'docs/tri-taches-expansion-2026-10-20.md']);
let bad = 0;
for (const p of cibles) {
  if (TOLERES.has(path.relative(ROOT, p).split(path.sep).join('/'))) continue;
  const txt = norm(fs.readFileSync(p, 'utf8'));
  for (const t of titres) {
    if (txt.includes(t)) { bad++; console.log('  FAIL ' + path.relative(ROOT, p) + ' recopie un titre de tâche personnelle (' + t.slice(0, 20) + '…)'); }
  }
}
if (bad) { console.log('  ' + bad + ' recopie(s) : reformuler (ne jamais citer un titre réel)'); process.exit(1); }
console.log('  ok  aucun titre de tâche personnelle recopié (' + titres.size + ' titres, ' + cibles.length + ' fichiers)');
