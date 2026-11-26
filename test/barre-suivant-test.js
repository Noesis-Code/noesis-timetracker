// Création d'un objectif : le bouton Suivant / Terminer REMPLACE la barre des volets (même place, même hauteur 52 px) ; la barre revient à la fermeture ou à la fin.
const fs = require('fs'), assert = require('assert');
const js = fs.readFileSync('public/js/objectifs-creer.js', 'utf8'), css = fs.readFileSync('public/css/objectifs-creer.css', 'utf8');
assert(js.includes("dock.classList.add('expSave', 'objDockBar')"), 'la création marque le bouton du bas (objDockBar) à chaque étape');
assert(js.includes("dock.classList.remove('expSave', 'expExtend', 'objDockBar')"), 'fermeture ou fin : la marque est retirée (endFlow)');
assert(js.includes("document.documentElement.classList.toggle('objBarOn', dock.classList.contains('objDockBar') && !dock.classList.contains('hidden'))"), 'classe objBarOn sur <html> seulement tant que le bouton est visible (syncDock : suit aussi hide(), le balayage et la fermeture)');
assert(/:root\.objBarOn \.tabbar \{ visibility: hidden; \}/.test(css), 'barre des volets masquée sans changer sa taille (--tabbar-h intact)');
assert(/\.objDock\.objDockBar \{ bottom: max\(16px, env\(safe-area-inset-bottom\)\); \}/.test(css), 'même bas que la barre des volets (16 px ou zone de sécurité)');
assert(/\.objDock\.objDockBar \.objStepBtn \{ height: 52px; \}/.test(css), 'même hauteur que la barre des volets (52 px)');
assert(!/\.objBar \{[^}]*bottom/.test(css), 'la classe .objBar (marge de champ) n\'est pas réutilisée');
assert(!/:root\.objBarOn [^{]*\{[^}]*display: none/.test(css), 'aucun display:none sur la barre (mesures --tabbar-h)');
console.log('barre-suivant-test OK');
