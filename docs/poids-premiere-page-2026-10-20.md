# Poids de la première page (gzip -9) — 20 oct. 2026

Mesure : fichiers référencés par `public/index.html`. HTML : 285 Ko (80 Ko gzip). JS + CSS : 1 994 Ko bruts, **566 Ko gzip**. Total ~646 Ko gzip.

| Rang | Fichier | Brut | gzip |
|---|---|---|---|
| 1 | `app.js` | 842 Ko | 238 Ko |
| 2 | `styles.css` | 202 Ko | 52 Ko |
| 3 | `i18n.js` | 116 Ko | 38 Ko |
| 4 | `js/objectifs-page3.js` | 112 Ko | 31 Ko |
| 5 | `js/objectifs-page2-objectif.js` | 88 Ko | 27 Ko |

À alléger en premier (retrait de code mort, tâche 9 du repli Basic) : `app.js` (42 % du poids), `styles.css`, `i18n.js` (clés inutilisées, voir chantier Simplification n° 6). Chargement différé possible de `legal-en.js` (18 Ko gzip) et `qrcode.js` (12 Ko gzip) : tâche 10. Aucune modification de `public/` dans cette mesure.
