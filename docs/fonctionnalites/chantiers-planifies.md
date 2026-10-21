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
6. Déposer un rapport dans la collection `rapports` de la page de décisions (https://claude.ai/artifact/GRFfW6WLRuAubgEAPN24Wg) :
   - **A** : ce qui est fait ;
   - **B** : jugé inutile, avec la raison ;
   - **C** : vérifié (rien à changer) ;
   - **perf** : comment la génération/lecture des tâches a été améliorée (voir ci-dessous).

## Rôle d'Émilien

Il planifie ses tâches TiMeTracker environ 24 h à l'avance et corrige celles que l'app génère. Claude lit ces corrections et améliore la génération et la lecture des tâches (chantier Précision), en expliquant COMMENT dans le champ `perf` du rapport.

## Coût

Bilan à 24 h après le lancement, puis ajustement du rythme (plus espacé si peu de travail utile).
