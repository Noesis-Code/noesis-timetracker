# Heures d'un objectif et tâches d'une personne (20 nov. 2026)

Décision d'Émilien : « la capacité de l'objectif est la capacité de chaque personne ».

## Modèle
- Le temps se saisit à la CRÉATION de l'objectif (`metaJson.hoursPerWeek`, page Temps). Aucun temps saisi sur une catégorie.
- La limite de tâches planifiables pour une personne dans un pôle (report, rééquilibrage, surcharge, retard) est SA PART des heures des objectifs EN COURS du pôle (qui couvrent aujourd'hui, ni macro, ni abandonnés, ni sans heures). Une seule fonction : `server/lib/objectifs-capacite.js` (`weeklyShareMinutes`), lue en PREMIER par `goalsauto.capacityMinutesForMember` ; tout le reste (`budgetFor`, `referenceFor`, report, retard, calendrier) passe par elle.
- Part de la personne : activité personnelle = 100 % de SES objectifs ; activité partagée = pourcentage de la Répartition en vigueur (`repartition-membres.partsEnVigueur`, héritage vers le haut), sinon parts ÉGALES entre les membres dont la portée couvre la catégorie. Plusieurs objectifs = somme. Un objectif parent de ses étapes n'est pas compté deux fois.
## Invariant de somme (Émilien, 20 nov. 2026) : un parent EST la somme de ses enfants
Du haut vers le bas : (1) total de l'objectif d'ACTIVITÉ en cours = somme des heures allouées à ses pôles ; (2) total d'un pôle = somme de ses secteurs ; (3) total d'un secteur (ou d'un pôle sans secteur) = somme des parts de ses MEMBRES. Un parent n'est JAMAIS additionné à ses enfants (la règle « le plus grand des deux » est supprimée). Source unique : `objectifs-capacite.js` (`arbre`).
- Défaut = répartition ÉGALE à chaque niveau (activité vers pôles, pôle vers secteurs, secteur vers membres). Un enfant qui porte ses propres heures (objectif posé sur lui) les garde ; le reste du parent (parent moins heures propres des enfants) se répartit également entre les enfants sans heures propres. Exemple testé : 100 h, 2 pôles 50/50, pôle 1 en 2 secteurs 25/25, chaque secteur partagé entre 2 membres ; un pôle posé à 20 h : l'autre reprend 80 h.
- Capacité de tâches d'une personne = somme, sur les feuilles du pôle (secteurs, ou le pôle sans secteur), de heures de la feuille x part de la personne (Répartition en vigueur, égale sans répartition posée).
- Un membre n'a PAS 0 % par défaut ; 0 % seulement s'il est posé à la main (alors capacité nulle, voir plus bas).
- `ecarts(activityId)` liste les niveaux où les heures propres d'un objectif ne valent pas la somme de ses enfants (heures du parent non réparties : elles restent sur le pôle, jamais perdues ni comptées deux fois).

### Écarts d'invariant trouvés dans l'enregistrement (non corrigés, pas de refonte)
1. Baisser les heures d'un secteur ou d'un pôle (`tempsbudget.plan`, delta < 0) ne touche rien d'autre : « le temps libéré reste libre ». Le parent garde son total, la somme des enfants baisse : écart. Dans le calcul le reste retourne aux frères sans heures propres, ou reste sur le pôle ; mais l'enregistrement ne l'écrit pas.
2. « Ajouter » ne fait grandir que les parents qui ont un objectif (cases vides ignorées) : cohérent seulement si la chaîne est complète.
3. « Déplacer » ne prend que sur des frères qui ont un objectif (sinon sur « Reste ») : total du dessus constant, mais un frère sans objectif ne peut pas céder.
4. Les parts des membres (`category_shares`) font toujours 100 % (validé), mais `heuresParMembre` est arrondi à 0,1 h par membre : la somme peut s'écarter de 0,1 h.
5. Objectif d'activité plus petit que la somme des objectifs de ses pôles, ou pôle plus petit que ses secteurs : rien ne l'interdit à la saisie (signalé par `ecarts`).

## Surcharge du jour
- `referenceFor` (surcharge du jour) : avec une part d'heures, la référence est cette part / 7 ; la médiane observée sur 28 jours ne sert qu'en repli. Tolérance +20 % (ou celle de la stratégie), 24 h par jour, disponibilité : inchangées. Aucun plafond de catégorie. Pas de plafond sur les heures d'un objectif.

- **Part explicitement à 0 %** dans la Répartition (décision d'Émilien, 20 nov. 2026) : capacité NULLE (0), aucune tâche planifiable, pas de repli sur 30 h ; `budgetFor` et la capacité hebdomadaire de l'activité n'ont alors pas de plancher. Les tâches déjà planifiées ne bougent pas silencieusement. À ne pas confondre avec **aucune part posée** (parts égales par défaut) ou personne hors de la catégorie : repli.

## Repli (inchangé, utilisé quand la personne n'a aucune heure d'objectif)
(a) heures de période de l'ancien modèle (`goal_periods.mainGoalEstimateMinutes` ÷ semaines) ; (b) ajustement manuel (`goal_capacity_overrides`, 14 j) ; (c) historique chronométré 4 sem. ; (d) défaut 30 h.

## Ajustement du temps d'une catégorie
`repartition-membres.lire` renvoie `objectifsHeures` (total par semaine des objectifs en cours de la catégorie) et `heuresParMembre` (ce total divisé selon les parts en vigueur, égales sans parts). Lecture seule, rien n'est écrit. Le client n'affiche pas encore ces champs (R30 : maquette d'abord).

## Tâches déjà planifiées
Rien ne bouge silencieusement : la nouvelle capacité alimente le report et le rééquilibrage selon les règles actuelles (`retard.md`).

Test : `test/heures-taches-test.js`.

## Objectif atteint (Émilien, 20 nov. 2026)
Un objectif n'est ATTEINT que si la personne le confirme : faire toutes ses tâches ne suffit pas (on peut en découvrir d'autres). Code : `server/lib/objectifs-atteint.js`.
- Quand la personne coche la DERNIÈRE tâche ouverte rangée dans un objectif, la réponse du PUT de la tâche porte `objectifQuestion` ; le client pose UNE fois « Objectif atteint ? » dans la fenêtre standard `TMT.ui.confirm` (`TMT.ui.objectifQuestion`, aucun nouveau composant).
- OUI : `metaJson.atteintConfirme` = date ; l'objectif sort des objectifs « en cours » de `objectifs-capacite.js` (ses heures sont libérées) ; il s'affiche comme les autres (statut « atteint ») ; il reste dans l'export (`etat: realise`, `atteintLe`) ; rien n'est supprimé.
- PAS ENCORE (ou ✕) : il reste en cours ; `metaJson.atteintDemande` retient le nombre de tâches : la question ne revient que si une tâche a été AJOUTÉE puis terminée.
- Décocher une tâche d'un objectif atteint propose « Rouvrir l'objectif ? » (même fenêtre, `POST /api/objectifs/:id/atteint` action `rouvrir`) ; jamais de réouverture silencieuse. Une NOUVELLE tâche rangée dans un objectif atteint ne pose pas encore de question (à coder si Émilien le veut).
- Responsable seulement : la question n'est posée qu'au propriétaire de l'objectif dont la portée couvre la catégorie ; un simple membre coche sans la voir, et le serveur refuse sa réponse (403). Les anciens `meta.abandoned` restent lisibles.
