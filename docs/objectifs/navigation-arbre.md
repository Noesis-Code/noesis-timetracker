# Navigation de l'arbre des objectifs : DEUX gestes (9 nov. 2026, S2)

**Niveaux** (du haut vers le bas) : Activités (blocs fixes de 5 ans) > Pôles d'une activité (années) > Secteurs d'un pôle (périodes de 28 jours). Un macro multi-activités descend vers les pôles (puis les secteurs) de toutes ses activités, ensemble, bornés au bloc de 5 ans de son échéance.

**1. Appui court = naviguer.**
- Carte pleine (ou carte de macro) : descend d'UN niveau. Au dernier niveau (secteurs), une case occupée ouvre le calendrier des tâches de la période.
- Titre d'une colonne (bulle d'activité, de pôle, de secteur) : ouvre la fiche de l'élément (temps dépensé, objectifs en cours, responsables, temps prévu) ; jamais un changement d'arbre.
- Case VIDE : si des objectifs de niveaux plus bas (n'importe lequel : secteur, hebdomadaire…) tombent dans la période qu'elle couvre pour sa colonne, elle montre un repère (la pastille numérotée des repères du temps, R23 ; toute la case est la zone de toucher, R25) : le nombre de cases du niveau du dessous qui en contiennent (5 au plus pour un bloc, 13 pour une année). L'appui court descend là, où ils sont visibles. À chaque descente la case vide suivante montre son propre repère. Rien en dessous : l'appui court propose de créer, comme avant.

**2. Appui long (500 ms, TMT.ui.holdDrag, même mécanique que les activités, R27) sur une carte = menu d'actions** (composant commun TMT.ui.dotsMenu, R29) :
- **Relier** : lance le mode de liaison (mêmes cases éclairées, même éligibilité, `objectifs-liaison.js`) ; sur un macro : colonnes reliées, Séparer…
- **Modifier** : le panneau de modification de l'objectif (sur une carte qui en regroupe plusieurs : on choisit d'abord lequel).
- **Supprimer** (rouge, R28) : avec la confirmation commune `TMT.ui.confirm` ; données détachées jamais perdues.

**Sortie** : la flèche ‹ en haut à gauche, un niveau à la fois ; dans le mode de liaison, ✕ ou toucher hors de la zone.

**Plus de mode Modifier** : le crayon et la bascule du haut sont retirés (code seulement : aucune donnée supprimée). **Aucune autre entrée** : ni pincer, ni l'ancienne page « Pôle · Année ».

**Balayage horizontal** : tout toucher dans l'arbre (repères, bandeau compris) suit la règle du défilement horizontal du pager commun (`stats-avance.js`, `data-hscroll`) : aucun passage aux statistiques dans le sens du défilement ; un nouveau balayage après relâchement.
