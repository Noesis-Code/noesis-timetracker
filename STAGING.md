# Branche `staging`

Cette branche est l'environnement de test permanent de Noèsis TimeTracker.

Depuis le 10 septembre 2026, sur décision d'Emilien, aucune mise à jour ne part directement en production (`main`) sans avoir d'abord été testée et validée via cette branche.

## Fonctionnement

1. Le travail de développement est poussé sur `staging`.
2. Railway déploie automatiquement un environnement de test temporaire (PR Environment), avec sa propre URL et sa propre base de données vide, à chaque push sur cette branche.
3. Emilien teste et valide sur cet environnement de test.
4. Une fois validé, la Pull Request `staging → main` est fusionnée : le changement part en production, et l'environnement de test est automatiquement détruit par Railway.

Ne jamais fusionner cette Pull Request sans validation explicite d'Emilien.

