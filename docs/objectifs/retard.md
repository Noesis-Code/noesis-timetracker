# Retard d'un objectif de période

Ordre d'Émilien, 10 nov. 2026 (lot 1 : logique serveur, aucune interface). Schéma Miro, tableau « Coordinateur — Produit », cadre « Retard d'un objectif » : https://miro.com/app/board/uXjVEVoTVf4=/?moveToWidget=3458764690046243370

## Règle (un seul test, un seul message)
1. **Rééquilibrage silencieux** : déjà en place (`goalsoverload.rebalance`, `goalscarryover.repriseUnmet`, priorités `taskkind` / réformes / importance). Seules les dates posées par le moteur (`dueDateAuto = 1`) bougent, jamais une date saisie à la main, une réforme ni une maintenance urgente. Inchangé.
2. Si du travail ne rentre plus avant la **fin de la période** d'un objectif (niveau période) : essai de report du reste sur les premières semaines de la **période suivante**.
3. Si, report compris, la période suivante dépasse **20 % de retard** (travail à faire de la suivante, report compris, moins son temps disponible, comparé à 20 % de SES heures) : **aucun déplacement**, un état « retard » est enregistré (il déclenchera UN message, lot 2). Sinon le report est appliqué en silence (mêmes règles de déplacement que `rebalance`).
4. Dernière période d'un objectif (pas de suivante) : report impossible, état « retard ».
Plus de note intermédiaire, plus de seuil à 50 %, plus de seuil absolu d'une heure. Hebdomadaires et tâches : déjà réglés par le rééquilibrage ; le niveau annuel n'a pas de test propre. Le bilan de retard d'`openDetail` (> 20 % du rythme) est inchangé.

## Définitions choisies
- **Objectif concerné** : `user_objectives` du membre, niveau de temps « période » (`objectifs-temps.deduce`, 13 semaines au plus), ni macro, ni abandonné, ni terminé. La **période** est un élément de `stepsJson` (découpage `periodWeeks` de l'objectif) ; on juge la période qui contient aujourd'hui, la suivante est l'élément qui la suit.
- **Travail restant d'une période** = somme de `taskMinutes(tâche)` (point unique : médiane stockée, sinon estimation historique, sinon 30 min) des tâches ouvertes de l'objectif (`taskIdsJson`) dont l'échéance est au plus tard la fin de la période (retards compris). Une tâche sans date est rattachée à la période en cours et n'est jamais déplacée.
- **Temps restant avant la fin de la période** = capacité d'aujourd'hui (ou du début de la période) à sa fin, moins les durées des tâches ouvertes des **autres objectifs** du même membre (même pôle, ou toute l'activité si l'objectif est au niveau activité) échues dans la fenêtre. Capacité = `goalsauto.capacityMinutesForMember` du pôle (maximum hebdomadaire de `timecaps` s'il existe) divisé par 7 par jour, borné par la capacité du jour de l'agenda externe (vacances = 0 ; lecture du cache seulement, jamais de réseau bloquant). Un temps négatif compte pour 0 : l'écart ne dépasse jamais le travail de la période.
- **Heures d'une période** = capacité sur toute la période (fonction `capaciteSur`).
- **Retard de la suivante** = travail déjà prévu dans la suivante + écart reporté − son temps disponible ; message si ce retard est **strictement supérieur** à 20 % de ses heures.
- **Report appliqué** : les tâches les moins importantes dont la date vient du moteur (`dueDateAuto = 1`, ni réforme ni maintenance urgente ni tâche longue) passent sur les premiers jours libres de la suivante (référence de charge + 20 % comme `rebalance`). Si ces tâches ne couvrent pas l'écart, rien n'est déplacé : état « retard » avec la raison `fixe`.

## Fonctions
`server/lib/goalsperiodlate.js` : `evaluerRetard` (pure : « rentre » / « report » / « message »), `capaciteSur` (pure), `evaluerObjectif`, `verifier(userId, activityId)`, `lister`, `marquer`. Déclenchement : `goalstoday.tasksToday` et `calendarfeed` juste après `rebalance` (au plus une fois par 30 s et par activité).

## État « retard » (table additive `objectif_retards`)
Utilisateur, objectif, période (n, début, fin), activité / pôle / secteur, heures manquantes, retard de la suivante et seuil, raison (`suivante`, `derniere`, `fixe`), tâches qui pèsent le plus (ids et durées), date de calcul, `seenAt` (vu), `dismissedAt` (refusé). Un état par objectif et par période. Un refus est mémorisé : aucun nouveau message pour la même période. L'état disparaît (sauf refusé) quand le travail rentre de nouveau.

## Route
`GET /api/objectifs/retard` : `{ retards: [...] }`, états non refusés du membre. Aucune route d'écriture ni interface dans ce lot (`marquer` attend le lot 2).

Test : `test/retard-objectif-periode-test.js`.
