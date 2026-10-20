# Écarts de palette Trade Tracker / DESIGN.md (20 oct. 2026) : relevé seulement, rien n'est changé

Mode sombre uniquement (comme TMT). Comparé : `trade-tracker/public/tokens.css`, `styles.css`, `security.css`, `js/*.js`, `index.html`, `manifest.webmanifest` contre `public/styles.css` (bloc `:root`) et `DESIGN.md`.

## Conforme
- Violet principal `--purple` #674EA7 : bouton principal, puce active, onglet actif, halo d'accueil `rgba(var(--purple-rgb), .32)` ; tous les jetons de `tokens.css` ont la même valeur que dans TMT (0 écart de valeur).
- Fond noir `--bg`, cartes en verre `--glass-*`, ombres et rayons en variables ; barre du haut noire (`theme-color` #000000) ; pastilles de synchro vert / orange / rouge par `--green`, `--warn-orange`, `--red` (comme TMT).
- Graphiques : rampe de 8 teintes construite uniquement avec des violets/gris-violets de TMT (`--ramp-1..8` : `--purple`, `--violet-me`, `--violet-soft`, `--violet-trail`, `--grey-violet`, `--purple-dark`, `--lilac-bg`, `--tab-idle`), encaisse en `--text-light`. Aucune teinte étrangère.

## Écarts (à décider par Émilien)
1. **Couleurs en dur** (DESIGN.md §5 : variables seulement) : `rgba(170, 150, 230, 0.55)` x3 (`.tabBtn.active`, `.chip.active`, `.kebabBtn[aria-expanded]`) absent de TMT ; `rgba(133, 108, 200, 0.55)` (onglet actif, copie de TMT:441) ; `rgba(255,255,255, .05/.10/.14/.22/.34)` (liserés de verre, squelette).
2. **Jetons présents dans Trade, absents de TMT** : `--grey`, `--violet-pale`, `--shadow-badge` (copie partielle du bloc TOKENS ; inutilisés).
3. **Gain / perte** : `.pos` = `--good` #6fc9a0 (vert), `.neg` = `--bad` #e0626b (rouge) ; sur l'écran Expert, écarts en violet (plus) et gris (moins) sans connotation. Le vert/rouge n'existe pas ailleurs dans TMT pour des montants : choix de Trade à confirmer.
4. **Bouton Danger** : fond `--brique-stop` #C4483F au lieu de `--brique` #C2694A (contraste du texte blanc 4,83:1 au lieu de 3,88:1) ; TMT garde `--brique`, donc le même bouton est légèrement plus rouge dans Trade. À aligner côté TMT si Émilien est d'accord.
5. **Rayons en pixels** : 12, 15, 17, 36 px au lieu de `--radius-*` (8, 10, 14, 20, 24) ; 3 px (barres).
6. **Manifeste** : `background_color` #000000 (TMT : #15171b).
7. **Halo** : seul le halo d'accueil violet existe ; pas de halos indigo/prune des fenêtres de niveau 1/2 (`--halo-n1-*` référencé 2 fois, `--halo-n2` jamais).
