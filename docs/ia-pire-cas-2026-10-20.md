# Coût IA au pire cas théorique (20 oct. 2026)

Hypothèse : un compte épuise, chaque jour, tous ses plafonds d'appels par fonction (`server/lib/aifeaturecaps.js`). Tarifs `PRICES` (`aimodels.js`, 2026-10-16, non vérifiés) : Haiku 1/5, Sonnet 3/15 $ par million de jetons (entrée/sortie). Tailles d'entrée = estimations de `docs/ia-appels.md` ; sortie = `max_tokens` du code (borne haute : la sortie réelle est souvent bien plus courte). Aucun appel mémoïsé ni refus : tout est facturé. Les plafonds comptent aussi les replis, donc « tout au modèle fort » est la vraie borne haute ; « tout Haiku » est le cas où aucun repli n'a lieu. L'orthographe est Haiku seul dans les deux colonnes fortes.

| Fonction | Plafond/jour | Ent. / sort. max (jetons) | Tout Haiku $/jour | Tout fort (Sonnet) $/jour | Part (fort) |
|---|---|---|---|---|---|
| modifications-proposees | 100 | 6000 / 3000 | 2,100 | 6,300 | 31 % |
| redistribution-objectif | 60 | 6000 / 3000 | 1,260 | 3,780 | 19 % |
| objectifs-hebdo | 60 | 4000 / 3000 | 1,140 | 3,420 | 17 % |
| classement-tache | 500 | 900 / 92 | 0,680 | 2,040 | 10 % |
| rapprochement-objectif | 500 | 800 / 120 | 0,700 | 2,100 | 10 % |
| reformulation | 150 | 300 / 312 | 0,279 | 0,837 | 4 % |
| offre1-plan | 10 | 5000 / 4096 | 0,255 | 0,764 | 4 % |
| recurrence-tache | 300 | 500 / 60 | 0,240 | 0,720 | 4 % |
| correction-orthographe (Haiku) | 200 | 110 / 200 | 0,222 | 0,222 | 1 % |
| **Total par compte** | | | **6,88** | **20,18** | 100 % |

Fonction dominante : **modifications proposées** (31 %), puis redistribution et objectifs hebdo : les trois appels à longue sortie (3000 jetons) font 67 % du pire cas. Les appels très fréquents (classement, rapprochement, orthographe) comptent peu par appel mais pèsent 21 % ensemble. Non inclus (plafonds hors `aifeaturecaps`) : documents 10/h (jusqu'à 8000 de sortie, ~0,14 $ l'appel en fort), Drive 40/jour, inter-secteurs 30/activité/jour ; ils ne changent pas la conclusion ci-dessous car le budget par compte s'applique à tout.

## Ce qui borne réellement le coût
Le budget par compte (`aibudget`) coupe l'IA avant les plafonds : 2 $/jour (`AI_BUDGET_DAY_USD`) et 15 $/mois (`AI_BUDGET_MONTH_USD`), plus 3 $/jour pour les appels sans compte. Le pire cas théorique par compte est donc d'abord limité par ces budgets (le contrôle précède l'appel avec une estimation du coût maximal), pas par les plafonds d'appels.

| Comptes | Plafonds seuls, tout fort (20,18 $/j, 30 j) | Plafonds seuls, tout Haiku (6,88 $/j) | Avec budgets (2 $/j, 15 $/mois par compte) |
|---|---|---|---|
| 1 | 20 $/jour, 605 $/mois | 6,9 $/jour, 206 $/mois | 2 $/jour, 15 $/mois |
| 10 | 202 $/jour, 6 055 $/mois | 69 $/jour, 2 065 $/mois | 20 $/jour, 150 $/mois (+ 3 $/jour système) |
| 100 | 2 018 $/jour, 60 550 $/mois | 688 $/jour, 20 650 $/mois | 200 $/jour, 1 500 $/mois |
| 1000 | 20 180 $/jour, 605 500 $/mois | 6 880 $/jour, 206 500 $/mois | 2 000 $/jour, 15 000 $/mois |

Le plafond mensuel (15 $) est plus serré que 30 x 2 $ = 60 $ : il décide du pire mois. Cible produit : 10 $ en moyenne par compte actif et par mois, soit 0,33 $/jour. Le pire cas réel est donc 1,5 fois la cible par compte, mais seulement si TOUS les comptes sont au maximum.

## Cohérence des seuils d'alerte (aucun changement fait)
- `AI_COST_ALERT_DAY_USD` = 8 $/jour tous comptes : correspond à ~4 comptes qui atteignent leur budget de 2 $, ou à ~24 comptes à la cible moyenne. Cohérent pour moins de ~25 comptes actifs, trop bas ensuite (alerte chaque jour).
- `AI_WEEKLY_ALERT_USD` = 5 $/semaine : **incohérent** avec l'alerte du jour (une seule journée à 8 $ suffit à dépasser la semaine) ; à la cible, 2 comptes actifs font déjà 4,7 $/semaine. L'alerte hebdomadaire se déclenchera donc en permanence dès 3 comptes.
- Seuils proposés (à valider par Émilien, formule : jour = 3 x cible quotidienne x N, semaine = 1,5 x cible hebdomadaire x N, plancher aux défauts actuels) :

| Comptes actifs | `AI_COST_ALERT_DAY_USD` | `AI_WEEKLY_ALERT_USD` |
|---|---|---|
| 10 | 10 $ | 35 $ |
| 100 | 100 $ | 350 $ |
| 1000 | 1 000 $ | 3 500 $ |

Règle simple : jour = 1 $ x N, semaine = 3,5 $ x N (la semaine reste ainsi toujours supérieure au jour). En dessous de 8 comptes, garder 8 $ / 35 $ plutôt que 5 $ pour la semaine.
