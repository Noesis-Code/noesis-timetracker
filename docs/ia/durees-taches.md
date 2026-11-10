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

## Phase 3 — facteur silencieux (à venir)
Facteur = médiane de (heures Chrono de la semaine ÷ Σ durées des tâches cochées) sur ≥ 8 semaines, borné entre 0,6 et 2 ; les durées modifiées à la main servent de signal. Le Chrono reste non lié aux tâches.

**Contrôle** : erreur médiane ≤ 30 % sur 100 tâches de référence ; puis part des semaines où le Chrono tombe dans [Σmin, Σmax], cible 95 %.
