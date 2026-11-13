# Durée d'une tâche — plan en 3 phases

Décisions d'Émilien (10 nov. 2026) : aucune question de plus à l'utilisateur ; aucun punch in/out par tâche ; le Chrono n'est PAS lié aux tâches ; la durée vient d'une estimation de l'IA (plus tard : banque commune alimentée par recherche web) ; rien de nouveau à l'écran.

## Phase 1 — livrée : stockage + micro-étapes (sans recherche web)

- **Stockage** : colonnes additives nullables sur `sub_project_items` (`minMinutes`, `medianMinutes`, `maxMinutes`, `durSource`, `durConfidence`), migration idempotente dans `server/db.js`. `durSource` : `ia-micro` (étapes + fourchette), `ia` (durée ou fourchette seule). La durée de l'IA n'est plus jetée.
- **Estimation** : l'IA décompose la tâche en 2 à 6 micro-étapes de 5 à 15 min (nombres seulement) et donne min et max ; le CODE valide (`server/lib/taskminutes.js`) : nombres finis, 5 ≤ min ≤ max ≤ 480, médiane = somme des étapes bornée dans [min, max] (sans étapes valides : milieu de la fourchette). Aucun coefficient inventé.
  - Tâche saisie à la main : le MÊME appel de classement (`classement-tache`) rend aussi `min-max | étapes` (36 jetons de plus, pas de nouvel appel). Seul cas à appel séparé : catégorie déjà connue (choix de l'utilisateur, un seul pôle) → `estimation-duree`, Haiku, 36 sortie, mémo 24 h.
  - Tâches proposées (`document-taches`) : minutes actuelles de l'IA + `min` et `max` au format court `["titre","clé","jour",minutes,min,max]` ; stockées à l'acceptation (`documenttasks.apply`).
- **Utilisation** : un point unique `taskMinutes(task, fallback)` (`taskminutes.js`) : médiane stockée, sinon estimation historique (`goals.estimateForGoal`), sinon 30 min. Le planificateur et la charge par jour utilisent la médiane ; les alertes de surcharge (`goalsoverload.overloadMarks`) utilisent la borne haute (`taskMaxMinutes`).
- **Repli** : appel échoué, plafond gratuit atteint (3 $ CA/mois, `aibudget.js`) ou réponse invalide → 30 min, jamais d'erreur visible ni de blocage.
- Tests : `test/durees-taches-test.js`.

## Phase 2 — banque commune + recherche web (à venir)
Banque de durées de référence alimentée par recherche web sourcée (≥ 2 sources), médiane, fourchette, stockage ; consultée avant l'estimation par micro-étapes.

## Phase 3 — facteur silencieux (livrée le 13 nov. 2026, `server/lib/dureefacteur.js`)
Par catégorie : facteur = temps RÉEL (entrées du Chrono) ÷ temps ESTIMÉ (durées prévues, estimation brute, des tâches cochées). Deux fenêtres : COURTE = la période en cours (28 jours) ; LONGUE = jusqu'à 12 mois ; la courte l'emporte quand elle a assez de données, sinon la longue. Moins de 4 semaines de Chrono dans la catégorie sur la fenêtre = facteur 1 (jamais de temps inventé, dormant sans données). Facteur borné entre 0,5 et 3 (ancienne règle 0,6 à 2 et 8 semaines remplacée par décision d'Émilien). Il corrige en silence les durées PROPOSÉES par l'IA pour les nouvelles tâches (jamais celles saisies à la main) ; l'estimation d'origine est gardée (`rawMedianMinutes`) : le facteur se mesure toujours contre elle, il ne se corrige pas lui-même. Le Chrono reste non lié aux tâches. Tests : `test/duree-facteur-test.js`.

**Contrôle** : erreur médiane ≤ 30 % sur 100 tâches de référence ; puis part des semaines où le Chrono tombe dans [Σmin, Σmax], cible 95 %.
