# Retard d'un objectif de période

Ordre d'Émilien, 10 nov. 2026. Lot 1 : logique serveur, première version. **Lot 2A : logique alignée sur le schéma FINAL** (ce document). Schéma Miro, tableau « Coordinateur — Produit », cadre « Retard d'un objectif : de la tâche au message » : https://miro.com/app/board/uXjVEVoTVf4=/?moveToWidget=3458764690046243370

## Règle d'Émilien, en ses mots (10 nov. 2026)
« Lors d'un report, les urgentes ont toujours la priorité. Elles sont reportées par rapport à l'urgence des tâches de la semaine d'après : si les tâches de la semaine d'après sont moins urgentes que la plus urgente des tâches reportées, elles passent toutes après. Ensuite c'est exactement comme pour la création d'une tâche. Si toutes les tâches de la semaine d'après sont urgentes et qu'on dépasse 120 %, on reste à 120 % et on décale à la semaine d'après les moins urgentes des tâches les plus urgentes. C'est toujours un classement du plus urgent au moins urgent, toujours. Si on dépasse 120 %, on met juste les moins urgentes à la fin. C'est tout : une question d'urgence, en fonction de la maintenance, du développement, de la réforme. »

## Un seul classement, un seul placement
Le même classement (`taskkind.comparePlacement`, du plus urgent au moins urgent) sert à l'ajout, au report et au retrait d'une tâche. Il ne dépend QUE de l'importance :

| Palier | Tâches |
|---|---|
| 0 | maintenance urgente |
| 0,5 | réforme (`reform.js`), juste après |
| 1 | maintenance longue |
| 2 | développement sans objectif |
| 3 | développement avec objectif (continuité : annuel, périodique, hebdomadaire, ordre du titre, cycle des verbes) |
| 4 | maintenance courte |

Dans un palier : l'essentiel (`taskkind.rankOf`) puis l'échéance, comme avant (palier 0 et réformes : essentiel puis échéance). Les tâches sans type calculé restent au palier 3.

**Aucune protection.** La règle « une date fixée à la main ne bouge jamais sans validation » est SUPPRIMÉE (ordre d'Émilien, 10 nov. 2026) : une date saisie à la main n'est pas plus importante qu'une autre (`dueDateAuto` ne protège plus rien dans `goalsoverload`, `goalscaptureplace.redispatchOverdue`, le rééquilibrage et le retard). Le palier 0 et la réforme ne sont pas « intouchables » par un statut à part : ils passent en premier du classement. Il n'existe aucun cas particulier au-delà du classement, sauf l'étalement sur plusieurs jours d'une tâche seule plus longue que la capacité (déjà en place, elle n'est pas décalée).
Non touché : les plafonds de temps (`timecaps.computeCapMoves`, qui ne déplace que les dates posées par le moteur) — à décider séparément.

## Placement dans la semaine (fonction pure `placerSemaines`)
Capacité d'une semaine = capacité du pôle (`capacityMinutesForMember`, plafond `timecaps`) bornée par l'agenda externe (vacances = 0), moins le temps déjà pris par les autres objectifs du pôle. On remplit de HAUT EN BAS du classement jusqu'à **120 % de la capacité** pour TOUTES les tâches, urgentes comprises ; ce qui dépasse (les dernières du classement) passe à la FIN de la semaine suivante, mêlé à ses tâches et reclassé, en cascade, jamais au-delà de l'échéance de la période. Aucune exception « l'urgente entre toujours au-delà de 120 % » : si la semaine n'est faite que d'urgences, les moins urgentes glissent. Exemple testé : 2 maintenances, 1 tâche moins importante cette semaine et une urgente non faite la semaine d'avant : l'urgente passe en premier, la moins importante glisse à la semaine d'après.

## Période, niveau A, niveau B (fonction pure `evaluerRetard`)
1. Si du travail ne rentre pas avant la **fin de la période** : report sur la période suivante, mêlé à ses tâches dans le classement, jusqu'à 120 % de sa capacité (même règle de cascade par semaine). Si tout rentre : report silencieux, aucun état.
2. Si tout ne rentre pas : on **RETIRE** de la période suivante les dernières du classement parmi ce qui y était prévu avant (les tâches restent OUVERTES, **sans date** ; le rééquilibrage les reprend dès qu'il y a de la place, par priorité) et on enregistre l'état « retard » **NIVEAU A** : liste des tâches retirées (id, titre, durée), objectif, activité / pôle / secteur, heures manquantes, % de dépassement.
3. **NIVEAU B** (obligatoire) : après cela, du travail ne peut toujours pas se placer avant l'échéance de l'objectif (dernière période : directement). Les placements et retraits calculés sont appliqués ; le reste demeure où il est.
Le report regarde les périodes suivantes dans l'ordre jusqu'à l'échéance de l'objectif. Les tâches des AUTRES objectifs du même pôle comptent comme temps déjà pris (elles ne sont ni déplacées ni retirées par le retard d'un autre objectif).

## Définitions
- **Objectif concerné** : `user_objectives` du membre, niveau de temps « période » (`objectifs-temps.deduce`, 13 semaines au plus), ni macro, ni abandonné, ni terminé. La période est un élément de `stepsJson` ; on juge la période qui contient aujourd'hui. Les semaines d'une période se comptent par tranches de 7 jours depuis son début (la première commence aujourd'hui).
- **Travail** = `taskMinutes(tâche)` (point unique : médiane stockée, sinon estimation historique, sinon 30 min). Une tâche en retard ou sans date compte dans la première semaine de la période en cours ; une tâche retirée (sans date, listée dans un état « retard ») est mise à part jusqu'à ce qu'elle trouve sa place.
- **% de dépassement** = (travail de la période suivante, report compris − ses heures) / ses heures, en pourcentage ; dernière période : (travail − ses heures) / ses heures.
- **Heures manquantes** = travail qui ne rentrait pas avant la fin de la période (niveau A) ; travail encore sans place (niveau B).
- **Temps du pôle** = capacité hebdomadaire actuelle du pôle (minutes) ; **temps nécessaire** = (travail restant de l'objectif + temps pris par les autres objectifs du pôle jusqu'à son échéance) / (120 % × nombre de semaines restantes), pour que tout rentre.

## Fonctions (`server/lib/goalsperiodlate.js`)
`placerSemaines`, `evaluerRetard`, `reprendre`, `capaciteSur` (pures) ; `evaluerObjectif`, `verifier(userId, activityId)`, `lister`, `marquer`, `recalculer`. Déclenchement : `goalstoday.tasksToday` et `calendarfeed` juste après `rebalance` (au plus une fois par 30 s et par activité), et par `recalculer` (route).

## État « retard » (table additive `objectif_retards`)
Utilisateur, objectif, période, activité / pôle / secteur, niveau (A ou B), heures manquantes, % de dépassement, temps du pôle, temps nécessaire, tâches retirées (id, titre, durée), date de calcul, `seenAt` (vu), `dismissedAt` (refusé). Un état par objectif et par période (les colonnes du lot 1 sont conservées, rien n'est perdu).
- **A** : un refus est mémorisé pour la période, pas de nouveau message.
- **B** : revient à chaque ouverture tant que ce n'est pas réglé : non refusable.
- L'état disparaît quand le calcul montre que tout rentre et que plus aucune tâche n'est retirée.

## Routes
- `GET /api/objectifs/retard` → `{ retards: [ { id, niveau: 'A'|'B', objectifId, titre, activite, pole, secteur (ou null), poleId, heuresManquantes (heures, 1 décimale), depassementPct, tachesRetirees: [ { id, titre, minutes } ], totalRetireMinutes, tempsPoleMinutesSemaine, necessaireMinutesSemaine } ] }` : retards non refusés seulement (A refusé exclu, B toujours inclus).
- `POST /api/objectifs/retard/:id/refuser` : niveau A seulement (B : 400).
- `POST /api/objectifs/retard/recalculer` : recalcule côté serveur (toutes les activités du membre) et renvoie la même forme que le GET. Les suppressions de tâches utilisent la route existante.

Tests : `test/retard-objectif-periode-test.js` (pur : classement, semaine, report, niveaux A et B, dernière période, temps nul, idempotence ; base : déclenchement, retrait, reprise ; routes), `test/rebalance-silencieux-test.js`, `test/importance-test.js` (adaptés : plus de protection des dates saisies).
