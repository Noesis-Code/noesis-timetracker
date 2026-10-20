#!/usr/bin/env node
// Rapport de contraste WCAG des couleurs de texte actuelles de public/styles.css (palette inchangée).
// Usage : node scripts/contrast-report.js   (code de sortie 0 : rapport seulement)
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
const v = {};
for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) if (!(m[1] in v)) v[m[1]] = m[2];
const lum = h => {
  h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const texts = ['text', 'text-light', 'brique-text', 'violet-soft', 'violet-trail', 'violet-me', 'grey-violet',
  'link-blue', 'good-text', 'warn-text-1', 'warn-text-2', 'warn-gold', 'tab-idle-dark', 'onb-purple', 'violet-promo', 'bad', 'good', 'partial'];
const bgs = ['bg', 'bg-raised', 'card', 'surface-dim', 'hover-bg'];
let low = 0;
console.log('texte'.padEnd(16) + bgs.map(b => b.padStart(12)).join(''));
for (const t of texts) {
  if (!v[t]) continue;
  console.log(t.padEnd(16) + bgs.map(b => {
    const r = ratio(v[t], v[b]); if (r < 4.5) low++;
    return (r.toFixed(2) + (r < 4.5 ? '*' : ' ')).padStart(12);
  }).join(''));
}
console.log('\n* = sous 4.5:1 (WCAG AA, texte normal). Paires sous le seuil : ' + low);
