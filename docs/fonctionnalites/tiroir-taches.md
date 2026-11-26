# Tiroir des tâches (rideau tiré depuis le haut) — MIS DE CÔTÉ le 6 nov. 2026

Émilien a abandonné le tiroir le jour même (« ça apporte de la complexité ») ; il a été livré en v1000 puis retiré de l'interface (poignée, bande de 56 px, rideau, geste, notification, `.cmpHandle` : R26, non partagé).
Le code est gardé au repos pour un futur widget, HORS du bundle chargé et du service worker : `docs/fonctionnalites/repos-tiroir/` (`tiroir.js` : rideau, geste, bande semaine / mois ; `tiroir.css` avec le CSS de `.cmpHandle` ; `tiroir-test.js`). Pour le réactiver : remettre les fichiers dans `public/js` et `public/css`, les relier dans `index.html` et `sw.js`, remettre `.cmpHandle` dans `composants.css` (puis `node scripts/sync-composants.js`).
Les tâches sont revenues dans la Feuille de route : page 1 = sélecteur « Tâches | Objectifs ». Vue Tâches = bande de la semaine + tâches de la journée choisie (voir `docs/objectifs/cas-de-figure-objectifs.md`, section « Vue Tâches par journée »).
