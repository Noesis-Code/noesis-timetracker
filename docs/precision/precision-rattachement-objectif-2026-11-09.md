# Rattachement tâche → objectif : trois leviers (9 nov. 2026)

Cible d'Émilien : 99 % de bons rattachements sur les tâches claires, sans deviner quand l'IA hésite.

## 1. Hésitation : deux propositions, jamais une devinette
- Le prompt de rattachement (`goalscaptureplace.buildMatchPrompt`) demande un `second` objectif quand deux conviennent presque autant.
- `decideAnswer` (règle pure) : confiance ≥ seuil existant (50 %) → rattaché ; confiance sous le seuil + un deuxième objectif **hebdomadaire** → hésitation ; sinon comportement inchangé.
- Hésitation : aucune tâche rattachée, aucune date devinée. `proposeHesitation` crée deux lignes « Objectif » dans les « Modifications proposées » (mécanisme existant, champ `goalweekly`), **décochées**. Aucun nouveau style d'interface.
- Cocher une ligne et appliquer rattache la tâche ; l'autre proposition est écartée (refus mémorisé par hash : jamais reproposée). Le texte de l'objectif est lu en base, jamais fourni par l'IA.

## 2. Apprentissage
- Table `goal_objective_examples` (par activité et par utilisateur, 50 exemples au plus par activité, bloc de 420 caractères et 6 exemples au plus dans le prompt).
- Enregistrés : l'objectif **choisi** et l'objectif **refusé** (l'autre ligne écartée, ou une ligne refusée). Rien d'autre n'est mémorisé.
- Jamais d'exemple d'un autre utilisateur ni d'une autre activité ; remise à zéro avec `DELETE /api/profile/:id/ai-examples` et à la suppression du compte.
- Note : l'application n'a pas d'action « déplacer une tâche vers un autre objectif » ; l'apprentissage part donc du choix entre les deux propositions et du refus d'une proposition.

## 3. Mesure
- `node scripts/eval-objective-match.js` (simulé, sans coût) ou `--live` (modèle réel, clé requise, lancé par Émilien). `--verbose` liste les écarts, `--json` le détail, `--min=99` échoue sous le score des clairs.
- Jeu : `test/fixtures/task-precision/objectifs.json` (57 cas : clairs, ambigus, vagues, hors sujet). Une ligne de score, dont les « faux rattachements » (objectif choisi à tort : l'erreur à éviter en priorité).
- Le fournisseur simulé (recouvrement de racines) n'est PAS le modèle : son score vérifie le harnais et la règle de décision. Le score réel exige `--live`.
