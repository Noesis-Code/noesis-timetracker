# Réduction des prompts IA (20 oct. 2026, chantier 4, repli 14)

Jetons estimés = caractères / 4. Test : `test/ia-prompts-reduction-test.js` (inscrit dans `node test/run-tests.js`).

## Audit (server/)
| Prompt | Contexte inutile ? | Décision |
|---|---|---|
| Classement (`goalstaskclassify.buildPrompt`) | OUI : la description du pôle était répétée sur chaque secteur du même pôle | Réduit (ci-dessous) |
| Orthographe | consigne déjà raccourcie (repli précédent) | Rien |
| Reformulation | 1 consigne + texte, aucun champ superflu | Rien |
| Rapprochement tâche -> objectif | tout champ sert à la réponse (type, date, texte, description) ; le « (semaine N) » double la date mais peut aider à rapprocher « semaine 42 » | Rien (risque de sortie) |
| Inter-secteurs | charge utile déjà sans champs vides ; consigne système non touchée sans `--live` | Rien |
| Exemples de classement | déjà bornés (voir plus bas) | Vérifié |

## Réduction : description de pôle écrite une fois
Dans la liste des catégories, `(pôle : …)` n'est écrit que sur la première ligne d'une suite de secteurs du même pôle (un autre pôle qui s'intercale la fait réapparaître). Même information, aucune ligne de catégorie ni consigne de réponse modifiée.
Jeu de cas du test (2 pôles x 4 secteurs + 1 pôle seul, descriptions de pôle de ~90 caractères) : **549 -> 416 jetons (-24 %)**. Le gain croît avec le nombre de secteurs par pôle et la longueur de la description ; nul si aucun pôle n'a de description. Classement = fonction n°6 du coût, sur chaque tâche sans catégorie.
Risque : la sortie attendue (une clé) ne dépend pas du format, mais la précision réelle n'est mesurable qu'avec `node scripts/eval-task-precision.js --live` (Émilien) ; le mode simulé n'utilise pas le prompt.

## Exemples par utilisateur (N = 5)
`goalsclassifyexamples.recentExamples` : au plus `INJECT_COUNT` = 5 exemples, bloc limité à `MAX_BLOCK_CHARS` = 250 caractères (même si l'appelant passe une limite plus grande ; les plus anciens sont ignorés), seulement ceux de l'utilisateur, aucun sans identifiant. Coût mesuré au pire cas du test : ~57 jetons (en-tête compris), < 100. Borne verrouillée par le test.
