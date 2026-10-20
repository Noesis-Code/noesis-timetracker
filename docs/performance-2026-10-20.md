# Performance de l'accueil sur réseau lent — 20 oct. 2026

Mesure : Playwright/Chromium, 390 px, « Fast 3G » simulé (1,6 Mb/s descendant, 150 ms de latence), cache désactivé, service worker bloqué, 3 passes (écart < 0,1 s). Critère : écran Chrono interactif (boutons d'activité présents).

| | Sans gzip | Avec gzip (état actuel) |
|---|---|---|
| Chrono interactif | 12,65 s | 4,55 s |
| Premier affichage (FCP) | 3,2 s | 1,1 s |
| Transféré | 1 972 Ko (52 requêtes) | 576 Ko (57 requêtes) |

Le gzip est déjà actif (`compression` dans `server/index.js`) : rien à gagner de ce côté. Octets décodés : 1 958 Ko.

## Plus gros fichiers (transféré / décodé)
1. `app.js` : 230 Ko / 838 Ko (40 % du transfert).
2. `styles.css` : 53 Ko / 203 Ko.
3. `i18n.js` : 40 Ko / 121 Ko. (`index.html` : 80 Ko gzip / 285 Ko.)

## Ce qui bloque le rendu
- 14 feuilles CSS dans `<head>` (une seule est vraiment nécessaire au Chrono) : le premier affichage attend leur téléchargement.
- ~22 scripts synchrones en fin de `<body>` (`app.js` 838 Ko exécuté avant tout le reste) : l'écran Chrono n'est interactif qu'après leur exécution (DCL ≈ 3,7 s).
- `app.js`, `styles.css`, `i18n.js`, `theme-palette.js`, `sw.js` sont `no-cache` sans `?v=` : revalidés à chaque visite (1 aller-retour de 150 ms chacun).

## Appliqué (invisible)
- `/js/*.js` et `/css/*.css` servis avec `?v=<build>` reçoivent `Cache-Control: public, max-age=31536000, immutable` (l'URL change à chaque déploiement). Visite suivante en 3G : 2,08 s -> 1,42 s. Captures 390 px identiques (octet pour octet). `server/index.js` seul, `public/` intact (pas de bump-sw).

## Propositions (non appliquées)
1. Brotli à la place de gzip (~15-20 % de moins), à condition de précompresser au démarrage (pas à chaque requête) : nouveau mécanisme, à valider.
2. Découper `app.js` : charger en `defer` ou à la demande les écrans hors Chrono (Objectifs, Communauté, Statistiques). Gain attendu le plus fort (-1 s environ) mais risque sur l'ordre d'exécution : à traiter dans un chantier propre avec tests.
3. ~~Poser `?v=` sur `app.js`, `styles.css`, `i18n.js`, `theme-palette.js`~~ : fait (voir ci-dessous).
4. Charger en différé (`media="print"` puis `all`) les feuilles CSS des écrans secondaires (Trade, Stratégie, Connexion IA…) : à valider visuellement.

## Chantier « Basic repli 10 » — 20 oct. 2026 (appliqué)
- `?v=<hash du contenu>` (sha1, 10 car.) sur tous les `<script src>` / `<link href>` locaux de `index.html` (`app.js`, `styles.css`, `i18n.js`, `theme-palette.js`, `qrcode.js`, `legal-en.js`, `offline-queue.js`, `/js/*`, `/css/*`), calculé par `server/lib/assetversion.js` (un fichier modifié change son URL, les autres gardent la leur d'un déploiement à l'autre). Avec `?v=` : `Cache-Control: public, max-age=31536000, immutable` ; sans : `no-cache`. `sw.js` reste `no-cache`. Test : `test/asset-version-test.js`.
- Service worker : inchangé (`public/` intact, pas de bump). Vérifié avec Playwright : SW actif, rechargement hors ligne, l'écran Chrono s'affiche (3 boutons, aucune erreur de page).
- `defer` : NON appliqué. Les scripts sont déjà tous en fin de `<body>` et découverts par le préchargeur : mesuré avec `defer` sur les 20 scripts, aucun gain (Chrono interactif 4,58 s contre 4,60 s, DCL 3,79 s contre 3,76 s). Risque non nul (ordre d'exécution, `legal-en.js`) pour 0 gain : laissé tel quel. Le vrai gain passe par le découpage d'`app.js` (hors périmètre).

| 3G simulée, 390 px, médiane de 3 | Avant (staging) | Après |
|---|---|---|
| 1re visite : Chrono interactif | 4,66 s | 4,60 s |
| 1re visite : FCP / transféré | 1,14 s / 575 Ko | 1,16 s / 575 Ko |
| Visite suivante : FCP | 0,40 s | 0,21 s |
| Visite suivante : DCL | 0,56 s | 0,24 s |
| Visite suivante : Chrono interactif | 1,22 s | 1,26 s (bruit; l'API domine) |
