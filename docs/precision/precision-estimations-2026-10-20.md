# Précision des estimations d'objectifs (repli 28, 20 oct. 2026)

## 1. Estimation d'objectif (`goals.estimateForGoal`)
Où elle sert : champ « temps estimé » d'un objectif hebdomadaire / périodique (`setWeekly`, `setMain`, `goalsweeklyauto`, `goalsauto`), charge de la semaine (`goalscapacity`, `goalsoverload`, `goalsdailypriority`, `goalscaptureplace`), minutes des tâches liées (`weeklyTaskMinutes`), stats (`statsinsights`). Jamais écrite sur une valeur `manual`.
Cause : le chrono ne connaît que l'activité ; `pastSamplesFor` attribuait à CHAQUE objectif passé tout le temps chronométré de la semaine (tous secteurs) : surestimation x N.
Correction (même champ, même place, aucun libellé changé) : le temps de la plage est PARTAGÉ entre les objectifs de l'activité sur cette plage (tous secteurs), proportionnellement à leur temps planifié (parts égales si aucun n'est planifié ; un non planifié reçoit la moyenne des planifiés). Un seul objectif = tout le temps. Test : `test/estimation-partage-test.js`.

| # | Scénario | Avant | Après (attendu) |
|---|---|---|---|
| 1 | 3 objectifs 30/30/30, 165 min chronométrées | 165 | 55 |
| 2 | 1 objectif, 90 min | 90 | 90 |
| 3 | planifié 60/30/30, 120 min | 120 | 60 |
| 4 | 2 secteurs 30/90, 120 min | 120 / 120 | 30 / 90 |
| 5 | semaine vide | 0 | 0 |
| 6 | rien de planifié, 3 objectifs, 90 min | 90 | 30 |
| 7 | semaine en cours | aucun échantillon | aucun échantillon |
| 8 | 2 semaines (60 min à 2 objectifs, 50 min seul) | 55 | 40 |
| 9 | un planifié 40 + un non planifié, 80 min | 80 | 40 |
| 10 | grands objectifs de 2 secteurs, 480 min | 480 / 480 | 240 / 240 |

Limite assumée : un objectif dont le temps est réellement plus grand que sa part planifiée reste sous-estimé tant que le chrono n'est pas rattaché à l'objectif (nouveau mécanisme, non fait).

## 2. Proposition inapplicable
Avant : un échec d'application (cible verrouillée, erreur transitoire, valeur changée) passait en `dismissed` = refus mémorisé, jamais re-proposé. Maintenant : statut `inapplicable` (non compté comme refus ; le rapport d'acceptation ne le compte plus en refus) ; la même proposition peut revenir. Un vrai refus reste mémorisé.
Note (hors périmètre) : `apply` écrit `accepted` alors que `scripts/ai-acceptance-report.js` compte `applied` : le rapport affiche 0 acceptée.

## 3. Borne temporelle des refus (rien n'est implémenté)
- [ ] Un refus expire après 90 jours (recommandé : une situation change, la même proposition peut redevenir pertinente ; exemple : « Temps estimé 30 -> 45 » refusée le 1er janv. peut revenir le 1er avr.). Sinon : jamais d'expiration (actuel).

## 4. Durée de tâche
Les tâches (`sub_project_items`) n'ont aucune durée stockée. Fonctions qui en montrent une, sans la conserver : (a) fenêtre « tâches proposées » (`objectifs-document-taches.js`, « N min » par tâche et avertissements de capacité) ; (b) consigne IA (« durée estimée tâche par tâche ») ; (c) charge par jour : durée par défaut `DEFAULT_TASK_MINUTES` (`documenttasks.acceptedLoadByDay`). Aucun document ne promet à l'utilisateur une durée sur une tâche existante ; la fonction « tâches éphémères avec durée » est refusée (BACKLOG).
