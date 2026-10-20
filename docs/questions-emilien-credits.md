# Questions à cocher — Crédits Claude et API

- [ ] Lancer une évaluation `--live` du regroupement de plusieurs classements de tâches en un seul appel IA (économie attendue, qualité à mesurer) ? — tâche bloquée : Regrouper les classements en un appel — champ manquant : 4 (critère de fin : seule une mesure `--live` d'Émilien peut valider la qualité)
- [ ] Seuil d'alerte hebdomadaire du rapport (`AI_WEEKLY_ALERT_USD`, défaut 5 $ par semaine pour l'ensemble des utilisateurs) : garder 5 $ ? — tâche : Rapport hebdomadaire de coût — champ manquant : 3
- Lecture des tâches du secteur « Crédits Claude et API » : l'outil MCP `lister_taches` n'était pas disponible dans cette session de repli ; aucune tâche traitée.

Rapport hebdomadaire : `node scripts/ai-cost-weekly.js` (base) ou `--from export.json`.

Pistes d'amélioration IA (`docs/ia-amelioration-2026-10-20.md`) :
- [ ] Conserver les réponses IA répétées (orthographe, classement) après un redémarrage du serveur, via une table de la base ? — tâche bloquée : Mémo persistant — champ manquant : 3 (citation d'intention)
- [ ] Enregistrer, sans le texte, si une reformulation proposée est utilisée, pour mesurer son utilité (et la retirer si personne ne s'en sert) ? — tâche bloquée : Signal d'acceptation de la reformulation — champ manquant : 3
- [ ] Lancer l'évaluation `eval-task-precision.js --live` pour décider de retirer le repli Sonnet du classement ? — tâche bloquée : Classement Haiku seul — champ manquant : 4
