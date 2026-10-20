// Une seule technique d'interaction par fonction : Échap ferme partout où la croix ✕ ferme ; zone tactile des croix >= 44 px. Analyse de texte.
const fs = require('fs');
const path = require('path');
const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const all = ['index.html', 'app.js'].map(pub).join('\n') + fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).map((f) => pub('js/' + f)).join('\n');
let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
const a11y = pub('js/a11y-popups.js');
const m = a11y.match(/var ESC_ONLY = '([^']+)'/);
if (!m) fail('ESC_ONLY absent de a11y-popups.js');
else m[1].split(',').map((s) => s.trim()).forEach((sel) => {
  const name = sel.slice(1);
  const ok = sel[0] === '#' ? new RegExp('id="' + name + '"|id = \'' + name + '\'|\\$\\(\'' + name + '\'\\)').test(all) : new RegExp('className = \'[^\']*\\b' + name + '\\b|class="[^"]*\\b' + name + '\\b').test(all);
  if (!ok) fail('ESC_ONLY : ' + sel + ' introuvable dans le code');
});
if (!/e\.defaultPrevented/.test(a11y)) fail('Échap : une saisie qui gère déjà Échap doit passer d\'abord');
if (!/durPickerOverlay/.test(a11y)) fail('Échap : la roue de durée garde sa propre fermeture');
if ((pub('app.js').match(/modal\.onclick = function \(e\) \{ if \(e\.target === modal\) close\(\); \}/g) || []).length < 3) fail('clic hors fenêtre : retrait pôle/secteur, confirmation générique et déplacement doivent fermer comme la croix');
const css = pub('styles.css');
if (!/\.reportHead \.menuBtn::after[^{]*\{[^}]*max\(100%, 44px\)/.test(css)) fail('zone tactile 44 px des croix absente');
// Toute croix ✕ créée en JS porte un aria-label
all.split('\n').forEach((l, i) => {
  if (/textContent = '(✕|\\u2715)'/.test(l)) {
    const ctx = all.split('\n').slice(Math.max(0, i - 6), i + 4).join('\n');
    if (!/aria-label|setAttribute\('aria-label'/.test(ctx)) fail('croix ✕ sans aria-label près de : ' + l.trim().slice(0, 80));
  }
});
if (bad) process.exit(1);
console.log('  ✓ Échap sur les plein écrans/fenêtres à croix, zone 44 px, aria-label des croix');
