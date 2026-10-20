# Précision : chemin réel en production (20 oct. 2026, repli 13)

**Conclusion : les règles locales décident 0 % des classements ; le modèle (Haiku, repli Sonnet) décide 100 %.** Aucun compteur n'est nécessaire pour l'établir : c'est lisible dans le code.

## Où `server/lib/taskprecision.js` intervient
- **Un seul appelant de production** : `documenttasks.parseDetailed` (tâches PROPOSÉES par l'IA à partir d'un document). Il n'utilise que `cleanTitle` (titre propre), `matchesIgnore` (« à ignorer » de la stratégie, appliqué après l'IA) et `sameTitle` (doublons). Rien avant l'IA, aucun repli, aucun seuil.
- **Classement d'une tâche saisie** (`goalstaskclassify.classifyCategory` -> `callTiered`) : n'importe PAS `taskprecision`. Chaîne réelle : Haiku avec confiance -> si clé valide et confiance >= 80 (`NOESIS_CLASSIFY_MIN_CONFIDENCE`) on garde ; sinon repli sur le modèle fort ; sans clé API ou en erreur : première catégorie (non strict) ou « à choisir » (strict). Aucune règle locale ne décide.
- Les fonctions de classement de `taskprecision` (`tokens`, `stem`, `ABBREV`, `actionHints`, groupes de synonymes de classement, `isDuplicate` côté classement) ne servent QU'À `scripts/eval-task-precision.js` (fournisseur simulé).

## Ce que mesure l'évaluation simulée
- Mesure : le recouvrement de mots entre un titre et les libellés/descriptions du jeu, avec les listes de `taskprecision`. C'est un test de ces listes, pas du modèle.
- Ne mesure pas : le prompt réel, Haiku/Sonnet, le seuil de confiance, le repli. Les 100 % simulés (et les 60-83 % à l'aveugle) ne disent rien du taux réel de production.
- Seule partie du simulé qui correspond à la production : « à ignorer » et doublons (chemin `documenttasks`).

## Décision
1. **Plus aucune liste de mots** (abréviations, synonymes, noms propres) ajoutée à `taskprecision` pour le classement : sans effet en production.
2. **Prompt de classement** (`buildPrompt`) : la consigne passe de 4 à 6 exemples génériques courts couvrant les ambiguïtés vues dans les échecs à l'aveugle : action vs sujet, document vs personne, abréviation/tuto -> formation, client en place vs prospection (« corrections » = travail livré), vie personnelle, titre flou -> incertain. Coût : **327 -> 328 jetons** (mode strict, 7 catégories, chars/4) et **454 -> 455** (avec confiance) : +1 jeton, car les exemples remplacent la prose précédente. Aucun résultat `--live` n'est dans le dépôt : exemples génériques, pas tirés d'erreurs du modèle. Effet réel à mesurer avec `--live --only=h` (déjà proposé dans `questions-emilien-precision.md`).
3. **Mesure en production : existe déjà**, rien à ajouter. Chaque déplacement manuel de tâche écrit une ligne dans `goal_classify_examples` (`goalstasks.moveCategoryTask` -> `recordCorrection`) ; `node scripts/ai-acceptance-report.js [jours]` donne tâches classées par l'IA, corrigées, % sans modification. Limite connue : le journal garde 50 lignes par activité (les plus récentes) et s'efface à la remise à zéro d'un compte ; sur 30 jours c'est un plancher, pas un total exact. Aucun compteur parallèle créé.
4. **Lot aveugle 3 (h61-h90)** : non. Il ne validerait que des listes de mots qu'on cesse d'étendre.
