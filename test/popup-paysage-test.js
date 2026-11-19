// Pop-ups de l'arbre en paysage (19 nov. 2026) : le panneau de création / modification / 4 semaines / fiche (.objDock) a la même largeur et les mêmes marges que le pop-up des heures (jeton --obj-pop-w, R29) ; le portrait ne change pas.
const fs = require('fs'), assert = require('assert');
const css = fs.readFileSync('public/css/objectifs-creer.css', 'utf8');
assert(/:root \{ --obj-pop-w: 440px; \}/.test(css), 'largeur commune définie une seule fois');
assert(/\.objModal \.goalTaskEditCard \{ width: 100%; max-width: var\(--obj-pop-w\); \}/.test(css), 'le pop-up des heures lit le jeton');
assert(/@media \(orientation: landscape\) and \(max-height: 500px\) \{ \.objDock\.tasksDock \{ width: min\(var\(--obj-pop-w\), calc\(100% - 32px\)\); \} \}/.test(css), 'paysage : le panneau du bas prend la même largeur (marges égales)');
assert(!/@media[^{]*portrait[^{]*\{[^}]*--obj-pop-w/.test(css), 'le portrait n\'est pas touché');
// Hauteur des pop-ups (19 nov. 2026) : la hauteur suit le contenu, plafond = espace disponible (écran moins bouton du bas et marges), jamais 55vh / 440px ; mesures navigateur : scripts/verif-popup-hauteur.js
assert(css.includes('.objDock.objDockBar .tasksPropose { max-height: calc(var(--dock-vh, 100dvh) - max(16px, env(safe-area-inset-bottom)) - 60px - max(16px, env(safe-area-inset-top))); }'), 'plafond du panneau = espace disponible');
assert(css.includes(':root .objModal.goalsPlacementModal .goalTaskEditCard { max-height: calc(100dvh - 32px); }'), 'pop-ups centrés : plafond = écran moins marges');
console.log('popup-paysage-test OK');
