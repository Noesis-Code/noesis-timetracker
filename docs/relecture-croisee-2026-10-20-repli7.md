# Relecture croisée staging a85aacb..433f55e (chantier 7, repli 7)

Relecture seule (16 commits + gzip, idempotence hors ligne, connexion Trade). Intégrité : aucun marqueur de conflit, aucun fichier vide, `server/db.js` toujours CRLF (2505 lignes, inchangé), `CACHE_VERSION` monotone (v479 -> v483), aucun secret dans le dépôt.

## Défauts
1. **Loi 25 (corrigé)** : `idempotency_keys` n'a pas de clé étrangère ; la suppression de compte laissait les réponses (libellés de tâches) orphelines. `accountdeletion.js` les efface maintenant.
2. **Rétention (à faire, fichiers partagés)** : `idempotency_keys` n'est jamais purgée. Ajouter une purge (> 7 jours, p. ex. dans un cron existant) ; `server/db.js` / `routes/goals.js` sont très partagés, laissé au propriétaire.
3. Mineur : un appel `recurrence-tache` / `rapprochement-objectif` au plafond renvoie « Plafond quotidien de classement atteint » (message générique, sans conséquence : erreur avalée par les appelants).
4. Mineur : la clé d'idempotence est lue avant la validation du corps ; une clé réutilisée avec un autre libellé renvoie l'ancienne tâche (voulu pour le renvoi, à garder en tête).

## Tests
Trois exécutions d'affilée de `node test/run-tests.js` en worktree neuf : voir résultat ci-dessous.
