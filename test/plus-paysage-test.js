// « + » de l'arbre en paysage = LE MÊME bouton que celui de la barre des volets (R29) : un seul rendu partagé, enfoncé = verre, jamais deux « + ».
const fs = require('fs'), assert = require('assert');
const css = fs.readFileSync('public/css/barre-volets.css', 'utf8'), arbre = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8'), bar = fs.readFileSync('public/js/barre-volets.js', 'utf8');
assert(css.includes('.tabbar .tabBtnAdd, .barAddBtn, .arAddSlot {') && css.includes('width: var(--bar-h, 52px); height: var(--bar-h, 52px)') && css.includes('border: 1.5px dashed var(--cmp-dash)'), 'un seul rendu pour la barre et le slot');
assert(css.includes('.arAddSlot svg { width: 22px; height: 22px; }'), 'même « + » de 22 px (jamais l\'icône à 100 %)');
assert(css.includes('.arAddSlot[aria-pressed="true"] { border: 1px solid var(--glass-border); background: var(--glass-bg);'), 'enfoncé = verre (jetons --glass-*)');
assert(/\.arAddSlot \{[^}]*--bar-h: 44px/.test(css), 'le slot ne change que l\'échelle (--bar-h), pas le style');
assert(css.includes('@media (orientation: landscape) and (max-height: 500px) { html.arbreOn .arAddSlot { display: flex; } }'), 'visible seulement en paysage (barre masquée) : jamais deux « + »');
assert((arbre.match(/hin\.appendChild\(addSlot\(\)\)/g) || []).length === 1 && arbre.includes("100cqw - 64px"), 'un seul slot, colonne des heures gardée dans l\'écran en paysage');
assert(bar.includes("setAttribute('aria-pressed', pressed(kind)") && bar.includes("'tmt:arbre-edit'"), 'aria-pressed du slot suit le mode édition');
console.log('plus-paysage-test OK');
