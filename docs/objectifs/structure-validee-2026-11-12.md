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
- Projection honnête : dans les statistiques des tâches et des objectifs, barres par activité sur l'axe du temps (prévu en pointillé, réalisé plein ; jour, semaine, période, année, pluriannuel).  Les barres prennent toujours les vraies couleurs d'activité.

## Méthode
Du plus macro au plus micro : modèle, parcours, écrans en gris, détails. Un niveau n'est abordé que quand le précédent est signé. Aucun détail visuel avant la structure.

## Statistiques : un onglet dédié (décision du 12 nov. 2026, à coder après le lancement)
- Option B retenue : un **onglet « Statistiques »** réunissant les statistiques du Chrono et celles des objectifs (et tâches), avec la projection honnête. La règle « 4 onglets au plus » (F1/R18) sera modifiée **quand il sera temps de le coder**, pas maintenant. Un volet Objectif refait en parallèle.
- Les **statistiques communes** (activités partagées, 3e page du Chrono) restent **à leur place** pour le moment : ce ne sont plus vraiment des statistiques mais des variables qui informent le Chrono ou les objectifs.
- Rien de ceci ne se code avant le lancement App Store / Play Store.

## Plan proposé à la création (décision du 12 nov. 2026)
- À chaque création, l'app propose TOUJOURS un plan : du plus proche objectif existant du MÊME niveau (ou d'aujourd'hui) jusqu'au nouvel objectif, jamais au-delà, et **borné à la cellule englobante** du niveau au-dessus (périodique : son année ; annuel : son bloc de 5 ans ; pluriannuel : l'arbre).
- Le **trou** = les cases du même niveau entre l'objectif existant et le nouveau. 1 ou 2 cases : on propose les objectifs du niveau du DESSOUS (périodique → les semaines de ces périodes ; annuel → périodiques ; pluriannuel → annuels), 8 lignes au plus. De 3 à 8 cases : TOUTES les cases du trou. Plus de 8 : 8 cases (l'IA choisit des jalons personnalisés : titre, période, part du temps ; le reste se remplit plus tard).
- **Plafond : 8 lignes.** Repli sans IA (indisponible ou plafond de coût atteint) : jalons répartis ; pour des années, 4 jalons fixes par an (périodes 3, 6, 9, 13).
- **Validation ligne par ligne** : chaque ligne modifiable (titre, date / période, heures héritées du parent mais modifiables) ou retirable ; rien n'est écrit sans le oui de la personne ; les objectifs écrits par l'utilisateur ne sont jamais écrasés ni redessinés. Un enfant avec d'autres heures REMPLACE celles du parent pendant sa durée (pas de double comptage).
- Un seul appel IA, mis en cache, compté dans le plafond gratuit. Aucun nouveau type d'objectif, aucune ligne d'arbre. Le REDESSIN d'objectifs automatiques existants (tableau Avant/Après) n'est pas dans ce lot.
- Code : `server/lib/objectifs-trou.js` (règle, sans IA, route `POST /api/objectifs/inferieurs/trou`), tests `test/objectifs-trou-test.js`. Les blocs de 5 ans sont alignés sur l'année en cours, comme l'arbre. Panneau « Objectifs » : lignes = règle du trou (`POST /api/objectifs/inferieurs/proposition` avec `trou: true`), titres par l'IA (un appel, en cache) ou repli `case · titre`, cochées par défaut, titre et date modifiables dans la ligne dépliée, heures héritées modifiables ; rien n'est écrit avant « Terminer ». Test : `test/plan-trou-panneau-test.js`.
