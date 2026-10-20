// Chaque pop-up de index.html (classes gérées par js/a11y-popups.js) contient une croix ✕ avec aria-label (Échap l'active). Analyse de texte.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const re = /<div\b[^>]*\bid="([^"]+)"[^>]*class="[^"]*\b(communityMembersModal|imageViewer|docTasksPop|strategyPop)\b[^"]*"[^>]*>/g;
const found = [...html.matchAll(re)];
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
if (found.length < 15) fail('trop peu de pop-up détectés : ' + found.length);
const SANS_CROIX = ['marketingInviteModal']; // question de consentement : le choix J'accepte / Non merci tient lieu de fermeture (écart voulu, légal)
found.forEach((m, i) => {
  if (SANS_CROIX.includes(m[1])) return;
  const end = i + 1 < found.length ? found[i + 1].index : m.index + 12000;
  const block = html.slice(m.index, Math.min(end, m.index + 12000));
  const x = [...block.matchAll(/<button\b([^>]*)>\s*(?:✕|×|&times;)\s*<\/button>/g)];
  if (!x.length) return fail(m[1] + ' : aucune croix ✕');
  if (!x.some((b) => /aria-label="[^"]+"/.test(b[1]))) fail(m[1] + ' : croix ✕ sans aria-label');
});
if (bad) process.exit(1);
console.log('  ✓ ' + found.length + ' pop-up : croix ✕ avec aria-label');
