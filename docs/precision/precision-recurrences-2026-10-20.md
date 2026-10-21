# Précision : récurrences, rapprochement, durées et dates (repli 18, 20 oct. 2026)

Test : `test/recurrence-ia-test.js` (faux client IA, aucun réseau) et lot aveugle `test/fixtures/task-precision/blind-h121-h150.json` (dans `precision-generees-test.js`).

## Récurrences (cap RECURRENCE)
Chemin : `captureTaskForActivities` (goalstaskclassify) -> Partiel : `taskrecurrence.suggest` (proposition `recurrenceSuggestion`, pré-remplie dans le pop-up, enregistrée seulement à la validation) ; Autonome : `parseExplicit` (seulement si le mot « récurrente » est écrit) ; Absence : rien. Cochée -> `spawnNextOccurrence` (une seule ouverte, date = jour).

| Formulation | Avant | Maintenant |
|---|---|---|
| « tous les lundis » | proposée chaque semaine, mais départ à une date quelconque (« lundis » sans date) | proposée chaque semaine ; départ = prochain lundi |
| « aux deux semaines » (mot « récurrente » écrit) | lu comme chaque semaine (faux) | 2 semaines |
| « le 1er de chaque mois » | proposée chaque mois, départ quelconque | chaque mois ; départ = prochain 1er |
| « chaque jour ouvrable » | « chaque jour » (samedi/dimanche inclus) | aucune récurrence ni proposition |
| « 3 fois par semaine » | « toutes les 3 semaines » possible (faux) | aucune récurrence ni proposition |
| « une fois » | pouvait être proposée | aucune récurrence |
| unité inconnue (trimestre, année) / fréquence non entière | rejet par `normalize` | inchangé, plus rien d'approximatif (non entier refusé) |
| IA en panne | aucune proposition | inchangé |

Aucune récurrence n'est créée sans l'utilisateur : Partiel = proposition validée dans le pop-up ; Autonome = son propre mot « récurrente ». Les cas non exprimables ne coûtent aucun appel IA.

Expansion des dates (jours calendaires locaux, testés en fuseau Montréal) : semaine à travers les changements d'heure de mars et novembre, fins de mois 28/29/30/31, 29 févr. + 12 mois, passage d'année, pas de 2 et 3 mois, retard (saut au prochain jour à venir). Toujours un jour AAAA-MM-JJ, jamais une heure (règle « liste, pas de créneaux »).

**Vérifié (repli 19)** : types supportés = jour / semaine / mois (`UNITS`), « tous les N ». « Jour ouvrable », « N fois par semaine », « une fois » sont donc volontairement sans proposition (pas une régression) ; la tâche reste créée normalement, titre gardé (testé en Partiel et Autonome). Choix à confirmer : `docs/questions/questions-emilien.md`.

**Dérive « le 31 » corrigée sans colonne** : le jour demandé est lu dans le titre (`anchorDayFromLabel`, jours 29-31 seulement : « …le 31 », « le 30 de chaque mois », « on the 31st »). À la coche, `spawnNextOccurrence` le réapplique tant que l'échéance précédente en est la version ramenée à la fin du mois (31 janv. -> 28 févr. -> 31 mars -> 30 avr. -> 31 mai). Date déplacée à la main = respectée ; titre sans ce jour = ancien comportement (le jour de départ n'est stocké nulle part ailleurs).

## Rapprochement tâche -> objectif (cap MATCH)
| Contrôle | Résultat |
|---|---|
| `matchObjective` n'écrit rien | OK (objectifs inchangés) |
| Placement = suggestion modifiable (`dueDateAuto = 2`), rattachée à un objectif du MÊME compte | OK |
| Objectif / tâche d'un autre compte absents du prompt IA et jamais retenus (même texte quasi identique) | OK |
| Index IA hors liste, confiance faible, panne | repli lexical / aucun, jamais appliqué tel quel |
| Date choisie par l'utilisateur (refus de la suggestion) | jamais re-suggérée ni écrasée |

## Lot aveugle h121-h150 : durées et dates dans les titres (écrit avant mesure)
Mesure initiale : **10 échecs sur 30** (6 titres de durée déformés, 4 indices de date absents ; 66,7 % sur le validateur, 20/30 sans compter les indices).

| Défaut | Exemple | Règle généralisée |
|---|---|---|
| Durée prise pour une heure | « (1 h 30) », « environ 1h30 », « de 2 h 15 », « 1 h 30 max » devenaient des titres tronqués | `H h MM` est une durée s'il est précédé de ( / pendant / environ / pour / de / durée ou suivi de ) / max |
| « de 3 heures » mangé en « eures » | « Atelier de 3 heures » | « de » n'est un horaire que dans une plage « de 9 h à 10 h » ; « à 3 heures » retiré en entier |
| Parenthèse vide laissée | « Rapport ( ) » | parenthèses vidées retirées ; « (à 9 h) » retiré aussi |
| Pas d'indice « dans N jours/semaines » | « dans 3 jours », « dans 2 semaines » | jour = aujourd'hui + N (ou 7N) |
| « le 15 » nu en fin de titre | « Payer le loyer le 15 » | prochain 15 (pas « le 15 chapitres ») |
| Anglais courant | « tomorrow », « today » | comme demain / aujourd'hui |
| Pluriel / mois | « tous les lundis », « le 1er de chaque mois » | prochain lundi / prochain 1er |

Après correction : 0/30 en échec (non indépendant, le lot a servi à corriger). Les anciens lots (h61-h120) et le jeu `eval-task-precision --fake` restent à 100 %. Limite : « d'ici vendredi » sans autre mot, « mardi prochain » un mardi, « fin du mois » étaient déjà justes ; « by Friday » (jours de semaine en anglais) reste sans indice.
