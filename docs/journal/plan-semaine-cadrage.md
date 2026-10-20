# Plan de la semaine (Expansion) — cadrage

But : proposer comment répartir la charge d'une semaine selon la capacité de chacun. Il propose, il n'applique jamais (règle produit : les suggestions informent, l'utilisateur décide ; une LISTE de tâches, jamais un horaire à créneaux).

## Entrées
- Tâches de la semaine : id, minutes estimées, propriétaire, importance, épinglée ou non (`weeks[].items`).
- Capacité hebdomadaire par personne, en minutes : cible manuelle (`users.weeklyCapacityMinutes`, 0 à 10080), sinon moyenne chronométrée des 28 derniers jours (`getWeeklyCapacity`).
- Membres de l'activité et nombre de semaines de report permises (`carryLimitWeeks`, 1 par défaut).

## Sorties (`planWeeks`, fonction pure, sans base ni IA)
- Par semaine : `placements` (ce qui tient dans la capacité) et `proposals`.
- Trois types de proposition : `deleguer` (à un autre membre qui a la marge), `reporter` (à la semaine suivante, dans la limite permise), `non_planifiable` (rien ne tient).
- Ordre de retrait en cas de dépassement : les moins importants d'abord ; une tâche épinglée n'est jamais retirée.
- La capacité alimente aussi les propositions existantes : jour proposé et charge par jour (`documenttasks.js`, `goalscaptureplace.js`) et modifications proposées (`changeproposals.js`).

## Limites
- État actuel : `planWeeks` n'est appelée par aucune route ni écran (testée seule, `test/weekplanner-test.js`). Seule la capacité est utilisée en production.
- Pas de nouvelle interface sans demande d'Émilien (SIMPLIFICATION.md) : si branché, les propositions passent par « Modifications proposées » (avant/après, validées, refus mémorisé).
- Une proposition ne modifie jamais une saisie manuelle sans validation ; aucune heure de début, aucun créneau.
- Les secteurs ne sont pas planifiés : leur temps remonte au pôle.
- Pas de contrainte entre tâches (dépendances), pas d'agenda externe, pas d'apprentissage des durées réelles.
- Le report est borné (`carryLimitWeeks`) ; au-delà, la tâche reste `non_planifiable` et l'utilisateur tranche.
- Réservé à Expansion (accès : `offer1access.hasOffer1Access`).
