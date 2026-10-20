# Inventaire des appels IA (19 oct. 2026)

Tailles = estimations (jetons ~ caractères/4) à confirmer avec `node scripts/ai-cost-report.js 30` sur la base de production (colonne « ent.moy »). Plafonds communs à tous : `aibudget` (2 $/jour/utilisateur, 3 $/jour « system », 15 $/mois en 4 tranches), `max_tokens` serré par fonction. « Mémo » = `aicache.memoize` (mémoire, 24 h, température 0, perdu au redémarrage).

| Rang coût | Fonction (feature) | Modèle | Prompt typique | Mémo / cache | Plafond propre | Déclenchement |
|---|---|---|---|---|---|---|
| 1 | Surveillance Drive (`document-taches`, `surveillance-drive-batch`) — `drivesync.js`, `docanalysis.js` | Haiku puis fort sur confiance < 80 ; lots -50 % | 2-8 k (blocs nouveaux seulement) | mémo + cache de prompt Anthropic + empreintes de blocs | `DRIVE_SYNC_MAX_AI_PER_PASS` 10, `..._PER_DAY` optionnel | toutes les 60 min par connexion, seulement si fichier modifié |
| 2 | Plan Offre 1 (`offre1`) — `offerdelivery.js` | Haiku puis fort (sonnet-5), 4096 sortie | 3-5 k | mémo 24 h | aucun (rare, mémo 24 h suffit) | achat/reprise de l'offre |
| 3 | Objectifs hebdo (`objectifs-hebdo`) — `goalsweeklyauto.js` | Haiku puis fort, 3000 sortie | 2-4 k | mémo 15 min | aucun propre | génération/aperçu d'un objectif périodique |
| 4 | Document / modifications proposées / redistribution (`document-taches`, `modifications-proposees`, `redistribution-objectif`) — `docanalysis.js` | Haiku puis fort | 1-6 k | mémo + cache de prompt | limite horaire (redistribution) | import de document, édition d'objectif |
| 5 | Inter-secteurs (`inter-secteurs`) — `crosssectorinference.js` | Haiku puis fort, 2500 sortie max | 0,6-1,5 k, aucun cache de prompt | déduplication par hash 24 h (mémoire) | 30/activité/jour | pose d'un objectif ou d'une tâche (fire-and-forget) |
| 6 | Classement de tâche (`classement-tache`, `:repli`) — `goalstaskclassify.js` | Haiku puis fort, 32-92 sortie | 0,5-0,9 k (catégories + exemples) | mémo 24 h (clé = prompt entier, les exemples récents la font varier) | 500/compte/jour (`CLASSIFY_MAX_PER_DAY`, appels réels seulement) | chaque tâche ajoutée sans catégorie ; plus fréquent après l'orthographe |
| 7 | Reformulation (`reformulation`) — `goalsrewrite.js` | Haiku puis fort, 312 sortie | ~0,3 k | mémo 24 h | 150/compte/jour (`REWRITE_MAX_PER_DAY`, appels réels seulement) | clic explicite de l'utilisateur |
| 8 | Orthographe (`correction-orthographe`) — `silentspellfix.js` | Haiku seul, 200 sortie | ~110 jetons | mémo par titre (borné 500) + mémo 24 h de `callModel` | 200/compte/jour | CHAQUE création/modification de titre de tâche : la plus fréquente, la moins chère (~0,0002 $/appel) |

Pas d'appel IA : planification quotidienne (`goalsdailypriority`, `dailysuggestioncron`), `goalsauto.js`, `subprojects.js` (règles locales).

## Réduction appliquée (la plus sûre sur la fonction la plus fréquente)
Orthographe : consigne système raccourcie à sens identique (127 -> 110 jetons d'entrée estimés, -13 % d'entrée, ~-8 % du coût par appel : 0,202 -> 0,185 $ / 1000 appels Haiku) ; clé de mémo normalisée (espaces multiples = même titre). Les cas de rejet `isPureSpellingFix` sont inchangés (garde-fou qualité).

## Pistes non faites (mesurer d'abord avec le rapport)
- Classement : retirer le paragraphe de règle d'exemple (~90 jetons) ou limiter les exemples récents (demande un jeu d'évaluation).
- Inter-secteurs : cache de prompt ou consigne plus courte (nécessite évaluation chantier 6).
- Mémo persistant (table SQLite) pour orthographe/classement : survit aux redémarrages Railway.

## Plafonds et mémos (chantier 4, tâche 2, 19 oct. 2026)
Sans plafond propre restant : Plan Offre 1 et Objectifs hebdo (rares, mémo actif, budget commun). Ajoutés, invisibles en usage normal : reformulation 150/compte/jour, classement 500/compte/jour (`aicache.takeDailyCap`, compté seulement sur un appel réel, après le mémo ; refus = comme une panne IA : repli habituel, jamais mémorisé). Sans compte identifié, pas de plafond propre (budget commun). Test : `test/ia-plafonds-test.js`.

## Taille des prompts (tâche 3)
Classement (12 catégories avec description) : 1635 -> 1553 caractères (strict) et 1931 -> 1834 (avec confiance), soit ~-5 %, par retrait de phrases redondantes à sens identique. `scripts/eval-task-precision.js --fake` n'utilise pas le prompt (résultats inchangés par construction : précision 98,6) ; à confirmer en `--live` par Émilien. Inter-secteurs : charge utile déjà minimale (champs vides omis) ; la consigne système (~1450 caractères) n'est pas touchée sans évaluation réelle.

## Rapport sans accès base (repli 5)
Exporter la table (`SELECT * FROM ai_usage_log` en JSON ou CSV avec en-têtes) puis `node scripts/ai-cost-report.js --from export.csv 30`. Test : `test/ia-rapport-export-test.js`.

## Garde-fou de documentation et de journal (repli 6)
`test/ia-appels-doc-test.js` échoue si un fichier de `server/` appelle Anthropic (`api.anthropic.com`, `callModel(`, `docanalysis.call(`) sans être nommé dans ce document, ou si un appel IA échappe à `ai_usage_log` (URL Anthropic hors `aibudget.fetchAnthropic`/`record`, ou `callModel` sans `feature`). Ajouter une ligne ci-dessous en créant un appel.

Appels secondaires (coût marginal, journalisés sous leur propre `feature`) :
- `taskrecurrence.js` (`recurrence-tache`) : suggestion de récurrence, 60 sortie, mémo 24 h ; avant, comptée à tort en « classement-tache ».
- `goalscaptureplace.js` (`rapprochement-objectif`) : rapprochement tâche -> objectif, 120 sortie, au plus deux appels par tâche ; avant, comptée à tort en « classement-tache ».
- `aibatch.js` : lots Drive à -50 %, coût enregistré à la relève par `drivesync.js` (`surveillance-drive-batch`).
- `documenttasks.js` (`document-taches`) et `changeproposals.js` (`modifications-proposees`, `redistribution-objectif`) : passent par `docanalysis.js`.
