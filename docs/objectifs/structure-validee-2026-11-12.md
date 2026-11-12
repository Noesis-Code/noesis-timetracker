# Structure des objectifs : règles validées par Émilien (11-12 nov. 2026)

Source : le résumé « Résumé de la structure » (artefact) et ses commentaires. **À lire avant de coder la création d'objectif, l'arbre, l'étape Temps, le Chrono ou la répartition des tâches.** Une règle ici ne se change qu'avec l'accord d'Émilien.

## Vocabulaire
- **Cadre** : les trois étages activité, pôle, secteur (créés **seulement dans Réglages**).
- **Catégorie** : un élément précis du cadre (ex. le pôle TiMeTracker) = une colonne de l'arbre.
- **Type** : la durée de l'objectif : pluriannuel, annuel, périodique, hebdomadaire = une ligne de l'arbre.
- Une **case** = une catégorie (colonne) × une période (ligne).

## Modèle
1. Un objectif ne crée **jamais** de secteur ni de pôle.
2. **Un seul objectif par case.** Deux objectifs en même temps dans une même catégorie : un autre secteur. Créer un objectif = remplir un trou.
3. Un objectif couvre plusieurs cases **seulement sur l'axe horizontal** (il relie des activités, pôles ou secteurs entre eux : le macro, mode « Étendre »). Dans le temps, une seule case.
4. Chaque type a son niveau du cadre :

| Type | Activité avec secteurs | Avec pôles seuls | Sans catégorie |
|---|---|---|---|
| Pluriannuel | Activité | Activité | Activité |
| Annuel | Pôle | Pôle | Activité |
| Périodique | Secteur | Pôle | Activité |
| Hebdomadaire | Secteur | Pôle | Activité |

Sans catégorie : le nom de l'activité seul est affiché, clé interne invisible `__activite` (correctif à la création d'un pôle : attend l'accord d'Émilien).
5. **Tâches** : liée, selon sa date d'échéance, à l'objectif du plus bas niveau qui couvre la date ; sinon à l'objectif du niveau au-dessus qui la couvre ; sinon à aucun objectif (placée à sa date).
6. **Priorités** : les paliers d'urgence (maintenance urgente, réforme) gardent le dessus. Dans un même objectif : cadrage avant réalisation avant finition ; une tâche de cadrage non terminée est reportée en tête le lendemain. Pas de « niveau de l'objectif servi » comme critère.
7. **Couleur** : celle de la catégorie de l'objectif (activité, pôle ; secteur = nuance de son pôle), jamais celle de la ligne. Format de l'étiquette identique partout.

## Temps
- Chaque catégorie a une **capacité allouée** par semaine, saisie **dans l'arbre seul**, valable pour toutes les périodes suivantes jusqu'au changement (5 h en 2027, 8 h dès 2028, 3 h dès 2029 : 2030 et après = 3 h). Elle remplace l'ancienne capacité manuelle de l'activité. Ajouter / Déplacer modifient ces allocations.
- Trois chiffres par catégorie : **Alloué** (intention), **Chrono** (mesuré, vérifie, ne modifie jamais l'alloué), **Objectifs** (somme des rythmes).
- **Seuil de création : 100 %, sans tolérance.** Le 120 % ne vaut que pour le report des tâches (règle de retard), jamais affiché sur l'écran Temps.
- L'utilisateur ne fixe qu'un rythme par objectif ; l'app calcule la charge par période. Pas de moyenne sur la durée.
- **Déplacer** = un prêt aux catégories voisines (secteurs du même pôle, pôles de la même activité), avec une **date de fin** : le début du prochain objectif de la catégorie qui prête.
- Écran Temps : niveau activité regroupé par pôle (flèche à droite pour déplier) ; pôle et secteur à plat. Colonnes Alloué / Chrono / Objectifs. Ajouter et Déplacer toujours possibles.
- **Arbre** : colonne de droite = heures totales calculées, **sans aucun avertissement** ; au toucher on voit et on modifie les niveaux (allocation).

## Parcours de création
- Cible : un « + » en haut à droite d'une **case vide** de l'arbre ; la case décide le cadre, le type et l'échéance ; plus de bouton « Nouvel objectif ». Étapes restantes : Objectif (titre, 3 questions, « Avancé »), Niveau, Temps, Objectifs inférieurs. Chaque activité a son arbre par défaut, qu'on masque (sans effacer les objectifs) dans ses réglages.
- Fait (v1243) : « + » violet sur les cases vides, création pré-remplie ; les étapes Emplacement et Échéance restent à retirer, après la publication.
- Chaque type propose celui du dessous à la fin (pluriannuel → annuels, annuel → périodiques, périodique → hebdomadaires).

## Après le lancement (App Store / Play Store)
Tout ce qui exige de la donnée utilisateur se revoit **après** le lancement : estimations qui s'améliorent (phases 2 et 3), banque commune, seuil du Chrono qui propose d'ajuster l'allocation (à approfondir), mesure 3 questions contre 9.
- Validé, à coder avec l'allocation : le Chrono qui connaît le plan (connexion objectif ↔ Chrono visible sur le volet Chrono : « il te reste 1 h cette semaine pour ce cadre »).
- Projection honnête : dans les statistiques des tâches et des objectifs, barres par activité sur l'axe du temps (prévu en pointillé, réalisé plein ; jour, semaine, période, année, pluriannuel).

## Méthode
Du plus macro au plus micro : modèle, parcours, écrans en gris, détails. Un niveau n'est abordé que quand le précédent est signé. Aucun détail visuel avant la structure.
