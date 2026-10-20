# Écran de chargement N — mesures (20 oct. 2026)

**Contrôle** : le bloc `#bootSplash` (CSS, SVG, script de départ) de `public/index.html` est identique octet pour octet à `origin/main` (diff vide sur les trois extraits).

**Règle de départ (déjà en place, inchangée)** : le script du `<head>` retire l'écran au plus tard de deux conditions : fin de `bsWord` (dernière animation du N, 1,5 s après le début) ET app prête (`hideBootSplash()`). Filets : 6 s sans `animationend`, 12 s absolu. Sous « réduire les animations », le N est affiché d'un bloc, aucun délai.

**Mesures** (Chromium mobile 390x844, cache désactivé, service worker bloqué, 2 passes, ms depuis la navigation) :

| Réseau | 1er rendu du N | Fin de l'ident | Départ de l'écran | N complet avant départ |
|---|---|---|---|---|
| Rapide (sans limite) | 240-380 | 1790-1930 | 1790-1930 (= fin de l'ident) | oui |
| 3G rapide (1,6 Mb/s, 150 ms) | 1120 | 2660 | 4360-4370 | oui |
| 3G lent (400 kb/s, 400 ms) | 4160-4180 | 5710-5770 | ~16160 (filet 12 s) | oui |

Durée de l'ident mesurée : 1500 ms (stable). Réseau rapide : l'écran part exactement à la fin de l'animation, jamais avant.

**Conclusion** : garanti, aucune correction nécessaire. Cas limite théorique non observé : le filet `IDENT_MAX` (6 s après l'exécution du script) pourrait couper l'ident si le premier rendu arrivait plus de 6 s après le script ; à 3G lent l'écart est ~0,1 s.
