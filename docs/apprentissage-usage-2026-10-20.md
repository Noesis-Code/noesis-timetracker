# Apprentissage par l'usage à coût zéro (20 oct. 2026)

Suite de `apprentissage-usage.md`. Aucun code de production modifié ; un test ajouté (`test/apprentissage-usage-test.js`, refus mémorisés).

## 1. Ce qui est appris de l'usage aujourd'hui
| Signal | Appris ? | Où |
|---|---|---|
| Corrections de secteur à la main | OUI (5 derniers du compte, bloc <= 250 car., injectés dans le classement) | `goalsclassifyexamples.js` |
| Acceptations / refus de propositions | MESURÉS seulement (rapport) ; refus mémorisés par hash (jamais re-proposé) | `ai-acceptance-report.js`, `changeproposals.js` |
| Qualité des générations (rejetées / nettoyées) | MESURÉE par jour et fonction, sans titre ni compte | `generation_quality_log` |
| Durées réelles vs estimées | PARTIELLEMENT (voir 2) | `goals.estimateForGoal` |
| Corrections de titre (reformulation) | NON : rien n'est stocké | - |
| Tâches classées sans modification | approximation (classées - corrigées) | rapport |

## 2. Mesure : « Faire le lavage » estimé 30 min, réalisé 55 min, 3 semaines
Seed synthétique : 3 objectifs hebdo « Faire le lavage » (30 min, manuel), 55 min chronométrées sous la note « Faire le lavage » chaque semaine, plus d'autres entrées (20 / 300 / 20 min) la même semaine. Résultat de `estimateForGoal` : **168 min** (source `similarity`, confiance 0,6). Non : la durée suivante ne tient PAS compte de la durée réelle du titre. `pastSamplesFor` attribue à chaque objectif TOUT le temps chronométré de l'activité pendant la semaine (`actualSecondsForRange`, tous secteurs), pas celui du titre. L'estimation suit donc la charge de la semaine, pas la tâche.

Obstacle structurel : les tâches (`sub_project_items`) n'ont AUCUN champ de durée estimée et les entrées de temps n'y sont pas rattachées (seulement `subProjectId`, `goalCategory` et une `note` libre). Le champ « Temps estimé » des Modifications proposées n'existe que pour les objectifs hebdomadaires (`FIELDS.weekly.time`). Pas d'implémentation : aucun mécanisme existant ne porte une durée de tâche ; la règle ci-dessous exigerait d'abord un lien tâche - entrée de temps (nouveau mécanisme).

## 3. Règle proposée (sans IA) - non implémentée
- Source : durées réelles (`time_entries.durationSeconds`) du MÊME utilisateur dont la note (normalisée : minuscules, sans accents, `normText`) est égale au titre de la tâche (sameTitle prudent : égalité stricte, pas de Jaccard).
- Valeur : médiane des 3 à 5 dernières, arrondie au pas de 5 min ; moins de 3 durées = aucune proposition.
- Écart : proposée seulement si la médiane diffère d'au moins 25 % de l'estimation actuelle.
- Garde-fous : proposition seulement (ligne `pending` « Temps estimé », avant/après, cochable) ; jamais sur une estimation `manual` déjà posée ; jamais écrite en silence ; refus mémorisé par hash comme les autres.
- Déclenchement : calcul SQL dans `list()` (modèle `syncCrossSector`), 0 appel IA, aucun écran ni bouton.
- Prérequis : durée estimée sur les tâches, ou limiter aux objectifs hebdo dont le titre = note chronométrée.
- [ ] Émilien : autoriser le lien durée estimée - entrées de temps (nouveau mécanisme) puis cette règle.

## 4. Refus mémorisés (testé)
Un refus (`dismissed`) n'expire JAMAIS (index unique `activityId, hash`) : même cible + champ + valeur proposée ne revient plus, même 2 ans après. Une autre valeur (autre date) reste une nouvelle proposition, donc un refus ancien ne bloque pas une suggestion différente. Défaut relevé : une proposition devenue inapplicable (cible modifiée ou disparue entre-temps, `apply` -> `skipped`) est marquée `dismissed` comme un vrai refus, donc ne peut plus revenir avec la même valeur. Les exemples de correction du classement, eux, vivent jusqu'à 50 par activité sans date de péremption.
- [ ] Émilien : traiter un « inapplicable » comme `obsolete` (non mémorisé) plutôt que comme refus ? (petit correctif, `changeproposals.apply`).

## 5. Coût
- Mécanisme proposé : 0 appel IA, 0 jeton ; requête SQL indexée sur quelques dizaines de lignes par ouverture de la fenêtre.
- Exemples injectés : aujourd'hui jusqu'à 5 exemples / 250 car. = ~90 jetons par classement = 0,00009 $ (Haiku 1 $/M) ; à 20 classements/jour = 0,0018 $/jour/utilisateur, ~5,4 $/mois pour 100 utilisateurs (chiffre de `apprentissage-usage.md`).
- Bornés par la qualité plutôt que par la date (garder seulement les exemples dont le titre partage un mot avec la tâche à classer, 2 au plus, et un exemple par secteur) : environ 0 à 40 jetons, moyenne estimée ~30 : gain ~60 jetons par appel, soit ~0,0012 $/jour/utilisateur, ~3,6 $/mois pour 100 utilisateurs (-65 %). Risque : moins d'exemples quand l'utilisateur écrit un titre nouveau ; précision à re-mesurer (`eval-task-precision.js --fake`, puis `--live` par Émilien). Hypothèse de moyenne non mesurée sur de vrais comptes.
- [ ] Émilien : appliquer la sélection par pertinence des exemples injectés (non appliquée).
