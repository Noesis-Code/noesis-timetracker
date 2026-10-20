# Précision des prompts de génération de tâches (20 oct. 2026, repli 14)

Référence : `modele-tache.md` / `intentions.md` (verbe d'action + objet précis, durée plausible, LISTE sans horaire fixe, pas de doublon, langue de l'utilisateur).

## Prompts qui génèrent des tâches
- `docanalysis.SYSTEM` (utilisé par `documenttasks` : documents -> tâches, « Ajouter des tâches », surveillance Drive, planification) : seul prompt de tâches libres.
- `offerdelivery.SYSTEM_PROMPT` : tâches des 3 sous-projets de l'Offre 1.
- Sans prompt de tâches : `goalsauto.js` et `dailysuggestioncron.js` (déterministes, aucun appel modèle) ; `goalsweeklyauto.js` produit des OBJECTIFS hebdomadaires, pas des tâches.

## Écarts relevés -> correction
| Prompt | Écart | Correction |
|---|---|---|
| docanalysis | Titre « court, 200 car. » : trop vague, 200 > 140 voulus | 140 car. max |
| docanalysis | « verbe d'action » sans « objet précis » | verbe + objet précis, avec exemple |
| docanalysis | Langue de sortie absente | « dans la langue du document ou de la consigne » |
| docanalysis | Durée : « entier ou null » sans plausibilité (le code accepte 5-1440) | « durée plausible (5 à 480 min) » |
| docanalysis | Pas de doublon : dit seulement SANS document | « jamais un doublon d'une tâche déjà ouverte » (toujours) |
| offerdelivery | Tâches : seulement une longueur max (300) | « verbe d'action + objet, sans horaire » |
| goalsweeklyauto | Objectifs : « en français » codé en dur (ignore la langue de l'utilisateur) | NON corrigé (hors tâches, hors périmètre : à décider) |
| docanalysis (section c) | Libellé de modification : 200 car. | inchangé (modification, pas génération) |

Jetons (chars/4) : docanalysis 6474 -> 6656 car. (+2,8 %) ; offerdelivery 925 -> 964 car. (+4,2 %). Sous 5 %.

## Validateur local `taskprecision.checkGenerated` (après la réponse du modèle)
Appliqué dans `documenttasks.parseDetailed` (existant = tâches ouvertes de l'activité, `ctx.app.open`) et `offerdelivery.parsePlan`. Rejette : titre vide ; mot seul ou groupe nominal introduit par un article (pas d'action + objet) ; > 140 car. ; doublon d'une tâche existante (`sameTitle`). Nettoie : horaire à créneau fixe (« à 14 h 30 », « 10:30 », « 3pm », « de 9 h à 10 h »), rejeté si rien ne reste. Une durée nue (« 2 h ») n'est pas un horaire. Compteurs : `dropped.invalide` (nouveau), `doublon`, `vide`.
Limites : pas de détection réelle du verbe (liste de verbes = faux rejets) : seuls les cas évidents sont écartés. Ne s'applique jamais à une saisie manuelle ; une suggestion ne remplace rien (propositions inchangées). Tests : `test/precision-generees-test.js` (25 sorties simulées + branchement).
Effet réel sur la précision du modèle : à mesurer en production (non simulable).
