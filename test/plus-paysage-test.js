// « + » de l'arbre en paysage = LE MÊME bouton que celui de la barre des volets (R29) : un seul rendu partagé, enfoncé = verre, jamais deux « + ».
const fs = require('fs'), assert = require('assert');
const css = fs.readFileSync('public/css/barre-volets.css', 'utf8'), arbre = fs.readFileSync('public/js/objectifs-arbre.js', 'utf8'), bar = fs.readFileSync('public/js/barre-volets.js', 'utf8');
assert(css.includes('.tabbar .tabBtnAdd, .barAddBtn, .arAddSlot {') && css.includes('width: var(--bar-h, 52px); height: var(--bar-h, 52px)') && css.includes('border: var(--cmp-dashed-lg) var(--cmp-dash)'), 'un seul rendu pour la barre et le slot');
assert(css.includes('.arAddSlot svg { width: 22px; height: 22px; }'), 'même « + » de 22 px (jamais l\'icône à 100 %)');
assert(css.includes('.arAddSlot[aria-pressed="true"] { border: 1px solid var(--glass-border); background: var(--glass-bg);'), 'enfoncé = verre (jetons --glass-*)');
// Égalité à l'identique avec le « + » de la barre (portrait) : le slot (paysage) ne porte AUCUNE taille, bordure, rayon, couleur ni icône propres ; seule sa position change. Mesuré en navigateur (844×390 et 390×844) : 52×52, svg 22×22, pointillé dashed rgba(243,238,232,.28), rayon 50 %, « + » rgb(156,140,200) ; enfoncé = solide rgba(243,238,232,.12), fond .05, « + » rgb(243,238,232) : identiques au pixel.
const slotRule = (css.match(/\n\.arAddSlot \{([^}]*)\}/) || [])[1] || '';
assert(slotRule && !/--bar-h|width|height|border|radius|color|background|padding/.test(slotRule), 'le slot ne surcharge ni taille (plus de --bar-h: 44px), ni bordure, ni rayon, ni couleur : seulement la position');
assert(!/--bar-h\s*:\s*44px/.test(css), 'jamais de « + » de 44 px');
assert(/html\.arbreOn \.arBaseWrap \{ padding-top: 8px; padding-bottom: 8px; \}/.test(fs.readFileSync('public/css/objectifs-arbre.css', 'utf8')), 'la rangée des titres (8 + 48 + 8 = 64 px) s\'agrandit pour le « + » de 52 px, jamais l\'inverse');
assert(/\.arAddSlot \{[^}]*bottom: 8px/.test(css), 'le slot est posé dans la rangée des titres, sous la colonne des heures');
assert(css.includes('@media (orientation: landscape) and (max-height: 500px) { html.arbreOn .arAddSlot { display: flex; } }'), 'visible seulement en paysage (barre masquée) : jamais deux « + »');
assert((arbre.match(/hin\.appendChild\(addSlot\(\)\)/g) || []).length === 1 && arbre.includes("100cqw - 64px"), 'un seul slot, colonne des heures gardée dans l\'écran en paysage');
assert(bar.includes("setAttribute('aria-pressed', pressed(kind)") && bar.includes("'tmt:arbre-edit'"), 'aria-pressed du slot suit le mode édition');
console.log('plus-paysage-test OK');
