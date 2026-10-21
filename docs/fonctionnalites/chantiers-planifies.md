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

## Modifications visuelles : capture du plan (R30)

Décision d'Émilien, 21 oct. 2026 (mots exacts dans `docs/regles/intentions.md`).

1. **Capture D'ABORD.** Toute tâche qui change l'aspect de l'app (`public/`, `trade-tracker/public/`, CSS, textes visibles, composants) produit une capture 390 px (et 360 px) du résultat prévu : appliquer la modification dans le worktree sans la pousser, `NOESIS_DATA_DIR` + `scripts/dev-seed.js`, puis `scripts/visual-check.py`. Réduire en JPEG (largeur 390, qualité 60, moins de 60 Ko), encoder en data URI et la placer dans le champ `capture` de l'élément de la liste du chantier (collection `prochaines/<code>`, via ArtifactData).
2. **Accord.** Modification visuelle NOUVELLE proposée par un chantier (pas déjà demandée par Émilien dans le chat) : pas de push avant son Oui ; présentée avec sa capture sur la page de décisions ou dans la liste. Modification déjà demandée explicitement : on pousse, capture au rapport.
3. **Fidélité au plan.** Après exécution, nouvelle capture avant/après comparée à celle du plan. Tout écart (couleur, taille, position, texte) est corrigé avant le push, jamais livré. Le relecteur (`.claude/agents/relecteur.md`) refuse une branche visuelle sans capture du plan et sans capture finale conforme.
4. **Pas d'ajout en cours de route** : rien n'est ajouté au plan.

## Rotation et liaison avec la production

1. **Rotation** : l'ordre de TOUS les chantiers (plus de 5) est le tableau 1 « Ordre des chantiers » de la page Prochaines tâches (collection `ordre`, document `chantiers`, champ `items` de `{nom, note}`). Les 5 premiers sont actifs ; quand un chantier actif est fini, le suivant de la liste prend sa place. Seul Émilien change l'ordre.
2. **Tableau 2** : chronologie des tâches par chantier (les cartes de la page, déjà éditables).
3. **Liaison avec la production** : les tâches du tableau 2 sont les tâches réelles de TiMeTracker production, par secteur (lecture). Ce qu'Émilien modifie dans la page se reflète dans l'app dès que les outils d'écriture du connecteur sont en production ; l'ordre des chantiers sera alors aussi enregistré dans l'app (tâches datées par chantier).
4. **Capture du chantier** : une capture 390 px par chantier (staging + améliorations visuelles anticipées, jamais poussées), voir `docs/fonctionnalites/captures-chantiers.md`.
5. **Récapitulatif de fin de session** : à la demande d'Émilien, Claude résume ce que la Précision a appris (champ `perf` des rapports).
