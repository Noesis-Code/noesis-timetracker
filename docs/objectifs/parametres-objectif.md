# Paramètres d'un objectif (inventaire, 7 nov. 2026)

Factuel : colonne « Existe » = ce que le code fait déjà (table `user_objectives`, `server/routes/objectifs.js`, détail `openDetail` dans `public/js/objectifs-creer.js`). « Placement » = proposition, R8 (visible = utile à chaque fois ; Avancé = fermé par défaut). Rien n'est codé dans le panneau d'édition tant qu'Émilien n'a pas validé (S1).

| Paramètre | Existe | Défaut raisonnable | Placement proposé |
|---|---|---|---|
| Titre | Oui à la création (`title`) ; pas de route pour le modifier | Texte saisi dans la barre | Visible |
| Description | Oui à la création (`metaJson`), affichée dans le détail ; pas de route pour la modifier | Vide | Avancé |
| Échéance (obligatoire) | Oui : `PUT /:id/echeance` (`modifierEcheance`) ; durée `amount` + `unit` | Celle lue dans la saisie, sinon refus de créer sans échéance | Visible |
| Début | Oui (`startDate`), posé à la création (aujourd'hui) ; pas de route | Aujourd'hui | Avancé |
| Activité / pôle / secteur | Oui : `PUT /:id/activite` (activité) ; `level`, `poleKey`, `categoryKey` posés à la création ; pas de route pour pôle/secteur | Ceux de la colonne où l'objectif a été créé | Visible (secteur(s) demandé par Émilien) |
| Temps attribué (h/semaine) | Partiel : `weekly` (suivi hebdomadaire oui/non) et `weeklyHoursHistory` ; pas de champ « heures par semaine » propre à l'objectif | Aucun : pas de temps attribué tant que non saisi | Visible (à décider avec l'inventaire du temps) |
| Parent / macro (lier, délier) | Oui : `PUT /:id/parent`, `PUT /:id/macro`, glisser-déposer dans l'arbre, « Rattaché à » dans Avancé | Aucun (objectif final) | Avancé (le glisser-déposer reste le geste principal) |
| État (en cours / réalisé / abandonné) | Oui : abandon et réactivation (`/abandon`, `/reactiver`) ; « réalisé » se déduit de l'échéance et des tâches | En cours | Bas du panneau, séparé (abandon violet, suppression = croix rouge) |
| Responsable (délégation) | Non | Moi | Plus tard : rien à afficher d'ici là |
| Rappel | Non pour l'objectif lui-même (les rappels de fin de période ont été supprimés le 7 nov. 2026) | Aucun | Plus tard |
| Couleur | Non, et jamais : vient de l'activité, nuance par rang du pôle (R16) | — | Absente |

## Ce que le mode édition peut offrir sans nouveau code serveur

Échéance, activité, parent/macro, abandon/réactivation, suppression (avec confirmation listant les objectifs rattachés, qui sont détachés et jamais supprimés). Titre, description, début et secteur demanderaient une route de modification : à valider avant de les coder.

## Choix validés par Émilien (7 nov. 2026) : panneau du mode édition

- Modifiables : TITRE (visible, `PUT /api/objectifs/:id/titre`, non vide, 140 au plus, orthographe corrigée en silence, rien d'autre), ÉCHÉANCE (visible, règles parent/enfant existantes, messages courts), DESCRIPTION « Description (pour l'IA) » (sous « Avancé » fermé, `PUT /api/objectifs/:id/description`, 1000 au plus), Rattaché à (sous Avancé), abandon/réactivation en bas. Bouton Enregistrer R35 (gris puis violet).
- Pas de secteur/pôle, pas de début, pas de temps attribué.
- La description est lue par l'IA (300 caractères au plus par objectif) dans la proposition de rattachement et dans le titre/résumé IA des comptes Expansion ; les comptes sans IA ne l'utilisent pas (aucun appel).
