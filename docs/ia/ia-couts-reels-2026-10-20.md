# Coûts IA réels par fonction en production (20 oct. 2026)

But : remplacer les estimations de `docs/ia/ia-appels.md` par des mesures. Lecture seule, aucun secret à partager.

## Méthode (à lancer par Émilien)
1. Sur le serveur de production (Railway, onglet Shell du service, ou `railway run`), le dossier de données est déjà configuré : `node scripts/ai-cost-report.js 30` (30 derniers jours) puis `node scripts/ai-cost-weekly.js` (7 jours, avec alerte).
2. Sans accès au shell : exporter la table (`SELECT * FROM ai_usage_log`) en JSON ou CSV avec en-têtes, puis en local `node scripts/ai-cost-report.js --from export.json 30` et `node scripts/ai-cost-weekly.js --from export.json`.
3. Recopier dans le tableau ci-dessous les lignes de « Résumé par fonction » (appels, ent.moy, sort.moy, cache, $, $/appel). La section « Plafonds par compte et par jour » dit si un compte approche d'un plafond.
4. Le rapport se termine (avant les taux de repli) par `Total mensuel projeté` = coût des 7 derniers jours calendaires / 7 x 30 (tous comptes, replis inclus) ; à comparer à la cible (10 $ moyens par utilisateur actif). Test : `test/ai-cost-projection-test.js` (données synthétiques).
5. Refaire à J+7 puis chaque mois ; les replis (`:repli`) sont déjà regroupés dans la fonction.

## Résumé en 10 lignes (21 oct. 2026)
`node scripts/ai-cost-report.js --court 30` (ou `--from export.json --court 30`) : total et projection mensuelle, 4 premières fonctions, 7 derniers jours, 3 premiers comptes anonymisés (A, B, C). Le taux de mémo (`aicache.memoStats`) vit en mémoire du serveur : il n'est pas dans la base, il s'écrit au journal Railway (« [aicache] mémo : ... », tous les 200 appels).
Sur Railway, sans secret à donner : service web > onglet Shell (ou `railway run` depuis ton poste connecté), puis la commande ci-dessus ; lecture seule, aucun appel IA.

## Tableau à remplir (30 j)
| Fonction (feature) | Appels | /jour | Ent. moy | Sort. moy | Cache % | $ total | $/appel | Part | Plus forte journée / plafond |
|---|---|---|---|---|---|---|---|---|---|
| document-taches | | | | | | | | | (10/h) |
| surveillance-drive-batch | | | | | | | | | (40/jour) |
| offre1-plan | | | | | | | | | /10 |
| objectifs-hebdo | | | | | | | | | /60 |
| modifications-proposees | | | | | | | | | /100 |
| redistribution-objectif | | | | | | | | | /60 |
| inter-secteurs | | | | | | | | | (30/activité) |
| classement-tache | | | | | | | | | /500 |
| recurrence-tache | | | | | | | | | /300 |
| rapprochement-objectif | | | | | | | | | /500 |
| reformulation | | | | | | | | | /150 |
| correction-orthographe | | | | | | | | | /200 |
| TOTAL | | | | | | | | 100 % | |

## Seuils d'alerte actuels
| Réglage (variable d'environnement) | Défaut | Effet |
|---|---|---|
| `AI_COST_ALERT_DAY_USD` | 8 $/jour, tous comptes | ligne `ALERTE coût IA du jour` au journal serveur, une par jour |
| `AI_WEEKLY_ALERT_USD` | 5 $/semaine, tous comptes | ligne ALERTE du rapport hebdomadaire ; aussi une fonction en hausse de plus de 50 % (et plus de 0,25 $) |
| Plafond d'appels par fonction | 80 % du plafond du compte | ligne `ALERTE plafond <fonction>` au journal, une par fonction et par jour ; « PROCHE DU PLAFOND » dans le rapport |
| `AI_BUDGET_DAY_USD` | 2 $/jour/utilisateur | blocage de l'IA jusqu'à demain |
| `AI_BUDGET_SYSTEM_DAY_USD` | 3 $/jour (appels sans utilisateur) | idem |
| `AI_BUDGET_MONTH_USD` | 15 $/mois/utilisateur, 4 tranches (cible moyenne 10 $) | blocage jusqu'à la tranche suivante |
| Plafonds d'appels (par compte/jour) | voir tableau ci-dessus ; variables `OFFER_MAX_PER_DAY`, `CHANGES_MAX_PER_DAY`, `REDISTRIB_MAX_PER_DAY`, `HEBDO_MAX_PER_DAY`, `CLASSIFY_MAX_PER_DAY`, `RECURRENCE_MAX_PER_DAY`, `MATCH_MAX_PER_DAY`, `REWRITE_MAX_PER_DAY`, `SPELLFIX_MAX_PER_DAY` (0 = désactivé) | refus = panne IA habituelle (repli local) |

Classement : la description de pôle n'est omise que si la ligne précédente est du MÊME pôle (libellé) et de même description ; deux pôles à description identique ne se confondent donc pas (test `ia-prompts-reduction-test.js`, 4 configurations).

Limite : les plafonds d'appels sont en mémoire (remis à zéro au redémarrage) ; le rapport compte aussi les replis modèle fort, donc la part affichée est une borne haute.
