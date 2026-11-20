# Heures d'un objectif et tâches d'une personne (20 nov. 2026)

Décision d'Émilien : « la capacité de l'objectif est la capacité de chaque personne ».

## Modèle
- Le temps se saisit à la CRÉATION de l'objectif (`metaJson.hoursPerWeek`, page Temps). Aucun temps saisi sur une catégorie.
- La limite de tâches planifiables pour une personne dans un pôle (report, rééquilibrage, surcharge, retard) est SA PART des heures des objectifs EN COURS du pôle (qui couvrent aujourd'hui, ni macro, ni abandonnés, ni sans heures). Une seule fonction : `server/lib/objectifs-capacite.js` (`weeklyShareMinutes`), lue en PREMIER par `goalsauto.capacityMinutesForMember` ; tout le reste (`budgetFor`, `referenceFor`, report, retard, calendrier) passe par elle.
- Part de la personne : activité personnelle = 100 % de SES objectifs ; activité partagée = pourcentage de la Répartition en vigueur (`repartition-membres.partsEnVigueur`, héritage vers le haut), sinon parts ÉGALES entre les membres dont la portée couvre la catégorie. Plusieurs objectifs = somme. Un objectif parent de ses étapes n'est pas compté deux fois.
- Pôle = le plus grand de (somme des objectifs de pôle) et (somme des objectifs de ses secteurs) : les heures d'un secteur sont comprises dans celles du pôle (règle de « Déplacer »), on ne les additionne pas.
- `referenceFor` (surcharge du jour) : avec une part d'heures, la référence est cette part / 7 ; la médiane observée sur 28 jours ne sert qu'en repli. Tolérance +20 % (ou celle de la stratégie), 24 h par jour, disponibilité : inchangées. Aucun plafond de catégorie. Pas de plafond sur les heures d'un objectif.

## Repli (inchangé, utilisé quand la personne n'a aucune heure d'objectif)
(a) heures de période de l'ancien modèle (`goal_periods.mainGoalEstimateMinutes` ÷ semaines) ; (b) ajustement manuel (`goal_capacity_overrides`, 14 j) ; (c) historique chronométré 4 sem. ; (d) défaut 30 h.

## Ajustement du temps d'une catégorie
`repartition-membres.lire` renvoie `objectifsHeures` (total par semaine des objectifs en cours de la catégorie) et `heuresParMembre` (ce total divisé selon les parts en vigueur, égales sans parts). Lecture seule, rien n'est écrit. Le client n'affiche pas encore ces champs (R30 : maquette d'abord).

## Tâches déjà planifiées
Rien ne bouge silencieusement : la nouvelle capacité alimente le report et le rééquilibrage selon les règles actuelles (`retard.md`).

Test : `test/heures-taches-test.js`.
