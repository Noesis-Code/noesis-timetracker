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
3. Poser `?v=<build>` aussi sur `app.js`, `styles.css`, `i18n.js`, `theme-palette.js` (puis immutable) : supprime 4 revalidations ; demande de vérifier ce que le service worker précache.
4. Charger en différé (`media="print"` puis `all`) les feuilles CSS des écrans secondaires (Trade, Stratégie, Connexion IA…) : à valider visuellement.
