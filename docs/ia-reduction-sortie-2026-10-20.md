# Réduction de la sortie IA (20 oct. 2026, chantier 4, repli 22)

Sans changement visible. Jetons estimés = caractères / 4 (convention du dépôt). Tests : `test/ia-sortie-reduite-test.js`, `test/ia-budget-par-compte-test.js`.

## Examen des trois fonctions à longue sortie (67 % du pire cas)
| Fonction | (a) superflu dans la réponse ? | (b) `max_tokens` vs besoin | (c) déclenchement évitable ? |
|---|---|---|---|
| modifications-proposees (31 %) | Non : format court déjà en place (`["t",id,champ,valeur,raison]`), tous les champs sont lus (`validate`) ; `confidence` (~8 jetons) sert au palier Haiku -> fort, retiré avant lecture | 3000 gardé : jusqu'à 30 changements, pire ligne `text` ~85 jetons => ~2550 ; une réponse tronquée est du JSON coupé donc inutilisable, pas de gain à serrer | Non prouvé : même entrée = mémo 24 h (`aicache.memoize`), aucune donnée = pas d'appel (`generate` rend 0 sans tâche ni objectif), plafond 100/jour |
| redistribution-objectif (19 %) | Non : section « c » seule, dates seulement (consigne), `reason` affichée à l'utilisateur | **3000 -> 1500** : la validation retient au plus 10 changements (`WEEKLY_MAX_CHANGES`) ; pire sortie utile ~496 jetons (10 lignes, raison de 160 car.), marge 3 x | Non prouvé : sans tâche candidate hors semaine visée, `weeklyContext` rend null (aucun appel) ; antirafale, 20/h/compte, mémo |
| objectifs-hebdo (17 %) | Non : `weekIndex`, `text`, `description` tous stockés | **3000 -> 1600** : 4 semaines au plus, pire sortie utile (texte 100 + description 600 car. x 4) ~752 jetons, marge 2 x | Non : l'appel n'a lieu que s'il reste une semaine vide ; mémo 15 min |

Mécanisme : `want.cMax` (docanalysis) = nombre de changements retenus par la validation ; `max_tokens` = min(3000, 150 x cMax). Sans `cMax` (modifications proposées, documents), valeurs inchangées. `validateWeekly`, `parseWeeklyGoals` et `validate` ne sont pas modifiés : la sortie lue par l'app reste identique (test sur fixtures, dont la pire sortie utile lue en entier).

## Avant / après (pire cas par compte et par jour, plafonds d'appels épuisés)
Tarifs `PRICES` (Haiku 1/5, Sonnet 3/15 $ par million), sortie = `max_tokens` x plafond/jour (redistribution 60, hebdo 60).
| Fonction | `max_tokens` | Haiku $/jour | Fort (Sonnet) $/jour |
|---|---|---|---|
| redistribution-objectif | 3000 -> 1500 | 1,26 -> 0,81 | 3,78 -> 2,43 |
| objectifs-hebdo | 3000 -> 1600 | 1,14 -> 0,72 | 3,42 -> 2,16 |
| Total des neuf fonctions | | 6,88 -> 6,01 (-13 %) | 20,18 -> 17,57 (-13 %) |

Sortie en jetons au pire cas : -90 000 jetons/jour/compte (redistribution -90 000 ; hebdo -84 000 ; soit -174 000). La facturation réelle suit la sortie réelle (inchangée) : le gain porte sur le pire cas et sur la réserve du budget (`estimateMaxCost` compte `max_tokens`) : moins de refus injustifiés près du plafond de 2 $/jour.

## Budgets par compte (vérifié)
`ab.check/status` lisent `ai_usage_log` par `userId` : 2 $/jour (`AI_BUDGET_DAY_USD`) et 15 $/mois en tranches (`AI_BUDGET_MONTH_USD`), plus 3 $/jour pour les appels sans compte. Test : un compte à 2,1 $ est bloqué, un autre à 0,5 $ et un compte vierge restent libres ; un compte à 15,6 $ sur le mois est bloqué sans bloquer les autres ; un appel réel d'un compte bloqué lève `aiBlocked` sans aucun appel réseau, avec les messages existants (« ... pour aujourd'hui. Elle reprend demain. » / « ... pour cette semaine. Elle reprend le <date>. ») ; le même appel d'un autre compte passe. Aucun écart trouvé.

## Pistes non faites
- Demander « au plus N » dans la consigne de la redistribution (réduirait la sortie réelle) : change le prompt, exige une évaluation `--live`.
- Réduire `max_tokens` de modifications proposées : risque de réponse tronquée, aucune preuve de gain.
