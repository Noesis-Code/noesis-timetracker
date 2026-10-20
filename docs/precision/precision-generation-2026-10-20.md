# Précision de la génération depuis des objectifs (repli 21, 20 oct. 2026)

Angle : tâches GÉNÉRÉES par l'IA à partir d'objectifs (`documenttasks.parseDetailed` + `taskprecision.checkGenerated` + consigne `docanalysis.SYSTEM`), pas la saisie manuelle. Aucun appel IA (sorties simulées, `test/precision-objectifs-test.js`, fixture `test/fixtures/task-precision/generees-objectifs.json`).

Méthode : 20 objectifs neutres (sport, études, travail, projet, maison, perso) et leur sortie attendue (3 à 4 tâches, verbe d'action + objet, 5 à 480 min, sans horaire, sans doublon) écrits AVANT relecture du code. Puis sorties simulées bonnes (80 titres) et mauvaises (titres vagues x10, objectif recopié, durées 0 / 1 / négative / texte / 600 / 5000, titres sans verbe x4, horaires, série de 12 x 5 min).

## Mesure AVANT (code staging)
| Mauvaise sortie | Acceptée à tort |
|---|---|
| titres vagues (« Réfléchir », « Avancer », « Penser à l'objectif »...) | 200/200 (100 %) |
| objectif recopié comme tâche | 20/20 |
| durée 600 min (la consigne dit 5 à 480) | 20/20 (5000 min mise à null, 600 gardée : incohérence) |
| 12 tâches de 5 min en série | 20/20 |
| titres nominaux sans verbe (« Devis », « Budget ») | 80/80 |
| durée 0 / 1 / négative / texte | nettoyée en null (déjà correct) |
| horaire fixe (« à 7 h 30 », « de 14h à 15h ») | retiré du titre (déjà correct) |
Faux rejets sur les 80 bonnes tâches : 0/80 ; durées conservées : 80/80.

## Corrections (règles générales)
1. Titre fait uniquement de verbes sans contenu et de mots vides (liste fermée `EMPTY_VERBS` : réfléchir, penser, avancer, continuer, commencer, travailler, planifier, organiser, préparer, faire... + « dessus », « tout », « objectif », « projet », « recherches ») : rejeté `sansSens`. Un verbe concret seul (« Vérifier », « Courir ») ou un verbe vague avec un vrai objet (« Planifier la semaine ») reste accepté.
2. Titre identique (à la mise en forme près, mêmes mots) à un objectif annuel, périodique ou hebdomadaire de l'application : rejeté (`objectif`).
3. Durée > 480 min : durée inconnue (null), la tâche reste (aligné sur la consigne « 5 à 480 min »).
4. 6 tâches ou plus dont au moins 80 % ont exactement la même durée : durées mises à null (estimation sans information), tâches gardées.
5. Consigne : « durée estimée tâche par tâche, jamais la même partout », « jamais un titre vague ni un objectif recopié », « 3 à 8 tâches par objectif, sans micro-étapes de 5 min en série ».

## Mesure APRÈS
Vagues 0/200 acceptés ; objectif recopié 0/20 ; 600 min et série de 12 x 5 min neutralisées ; faux rejets 0/80 sur les bonnes tâches, 0/30 sur 30 titres courts plausibles de contrôle (« Faire les courses », « Voir le dentiste », « Planifier la semaine », « Organiser le garage »...) ; jeu existant (h01-h210) inchangé.

## Non mesurable / non traité (honnête)
- Tâche hors sujet par rapport à l'objectif : impossible de la juger sans modèle ; aucune règle déterministe sûre. À mesurer en `--live` (interdit ici).
- Titre nominal sans verbe (« Devis ») : accepté (80/80). Détecter un verbe français exigerait un lexique ou une règle de terminaison (-er/-ir/-re) qui rejetterait « Courrier », « Mémoire », « Dossier », des titres anglais : refusé.
- Nombre de tâches par objectif : seulement la consigne (pas de plafond par objectif côté code) ; la limite globale reste 80.
- Mesure de l'étape 1 (suite complète) : voir le compte rendu ; un premier passage lancé pendant les modifications a échoué sur `documenttasks-test` et `documenttasks-jour-test` (placeholders « Faire A » : traités par la règle `à`/lettre seule), repris au complet après correction.

## Cases à cocher (règles qui pourraient rejeter ou modifier une bonne tâche)
- [ ] Rejeter « Préparer » / « Organiser » / « Planifier » / « Faire » + « projet » / « objectif » / « tout » / « recherches » seuls (ex. « Faire des recherches », « Préparer le projet ») : trop vague, ou une tâche valable à garder ?
- [ ] Rejeter une tâche dont le titre est identique à un objectif de l'app (ex. objectif « Appeler le notaire » et tâche « Appeler le notaire ») : doublon inutile, ou voulu quand l'objectif est déjà une action ?
- [ ] Durée > 480 min mise à « inconnue » (ex. « Peindre la pièce » 600 min) : acceptable, ou permettre jusqu'à 1440 comme avant ?
- [ ] 6 tâches ou plus avec 80 % de durées identiques (ex. six tâches de 30 min) : durées effacées, ou les garder ?
