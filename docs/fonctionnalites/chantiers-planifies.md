# Chantiers planifiés

Cinq tâches planifiées (cloud) font avancer les chantiers permanents sans qu'Émilien intervienne. Fuseau : America/Toronto.

## Les 5 tâches

| Chantier | Rythme | Minute |
|---|---|---|
| Trade Tracker | toutes les 2 h | 36 |
| TT Basic | toutes les heures | 12 |
| TT Expansion | toutes les heures | 24 |
| Simplification et design général | toutes les heures | 48 |
| Précision des tâches | toutes les heures | 35 |

## Une exécution

1. Lire les tâches du secteur du chantier dans TiMeTracker PRODUCTION (MCP `lister_taches`, lecture seule). Tâche à traiter = non faite et sans note « Chantier … ».
2. Sinon, repli : `CHANTIERS.md` / feuille de route, en vérifiant réellement l'état du code.
3. Rien de pertinent : s'arrêter en 1 minute.
4. Une seule tâche par exécution : worktree + branche `claude/<sujet>`, tests ciblés, push vers `staging`. Jamais `main`, jamais `--force`.
5. Cocher la tâche (`marquer_tache_faite`) et laisser une note.
6. Déposer un rapport dans la collection `rapports` de la page « Prochaines tâches » (https://claude.ai/artifact/MQx8786BCLjVdjZb4zjMbv ; l'ancienne page de décisions GRFfW6… ne sert plus qu'aux décisions Oui/Non et aux envois, collection `soumission`) :
   - **A** : ce qui est fait ;
   - **B** : jugé inutile, avec la raison ;
   - **C** : vérifié (rien à changer) ;
   - **perf** : comment la génération/lecture des tâches a été améliorée (voir ci-dessous).

## Rôle d'Émilien

Il planifie ses tâches TiMeTracker environ 24 h à l'avance et corrige celles que l'app génère. Claude lit ces corrections et améliore la génération et la lecture des tâches (chantier Précision), en expliquant COMMENT dans le champ `perf` du rapport.

## Coût

Bilan à 24 h après le lancement, puis ajustement du rythme (plus espacé si peu de travail utile).

## Tes modifications de la page Prochaines tâches

Page : https://claude.ai/artifact/MQx8786BCLjVdjZb4zjMbv. Collections db : `prochaines/<basic|expansion|simpl|precision|trade>`, `rapports`, `corrections`.

1. Émilien peut modifier, ajouter ou retirer n'importe quel élément de la liste d'un chantier. Ses éléments portent `par='emilien'` et valent une tâche du secteur : traités en priorité.
2. Quand un chantier réécrit `prochaines/<code>`, il FUSIONNE : il garde les éléments `par='emilien'` en tête, intacts, et ne les écrase jamais.
3. Chaque modification, ajout ou retrait écrit un document dans la collection `corrections` : `{chantier, type: modif|retrait, avant, apres, at}`. Chaque chantier lit les corrections de SON chantier à chaque relance et les prend en compte.
4. Le chantier « Précision des tâches générées » lit toutes les corrections et s'en sert pour améliorer la génération de tâches de l'API (jeu d'évaluation `scripts/eval-task-precision.js`, prompts), et explique dans son rapport (champ `perf`) comment, en lignes simples. Chaque amélioration passe par « Modifications proposées » : jamais de changement silencieux d'une saisie manuelle.
5. Garde de coût : `lister_taches` sur le pôle renvoie tous les secteurs (environ 380 tâches). Toujours borner avec `du`/`au`, sauvegarder le résultat, filtrer en python par champ secteur, ne jamais le lire en entier.
