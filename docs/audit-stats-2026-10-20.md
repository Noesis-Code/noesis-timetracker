# Audit de simplicité — Stats : Répartition, Graphique, pages 2 et 3 (20 oct. 2026)

Propositions seulement, rien retiré. Captures 390 px : `docs/img/audit-stats-2026-10-20.png` (Répartition + Graphique), `docs/img/audit-stats-page2-2026-10-20.png` (page 2 « Tâches » ; la page 3 « Objectifs » a la même structure). La Feuille de temps a son propre audit : `audit-feuille-de-temps-2026-10-20.md`.
Fonction unique de l'écran : **voir où va mon temps** (Répartition) et **comment il évolue** (Graphique) ; pages 2-3 : **suivre ma progression sur les tâches/objectifs**.

| Élément | Sert la fonction ? | Qui l'utilise / origine | Verdict |
|---|---|---|---|
| Camembert + total au centre | oui | demandé | garder |
| Libellé de période au-dessus du camembert | redondant avec le libellé de la Feuille de temps (même texte, juste au-dessus) | aucune demande ; « Répartition dépend de la feuille de temps » (1er sept.) | PROPOSITION : retirer (la période est déjà affichée 1 écran plus haut) |
| Légende sous le camembert (nom, durée, %) | oui, mais durée et % sont répétés dans `aria` et dans la légende | demandé | garder |
| Bouton « Aujourd'hui » | désynchronise le camembert de la grille (2 modes) | demandé le 3 sept. | garder, mais voir questions |
| Graphique : courbe par activité + courbe Total + points | la courbe Total répond à la fonction ; une courbe par activité (4 à 9 lignes colorées d'une même teinte de pôle, voir capture) se confond | demandé (29 août) | PROPOSITION : ne garder que Total par défaut ; sinon laisser |
| Menu ⋮ Jour/Semaine/Mois (granularité) | oui | demandé | garder |
| Légende du graphique (répète exactement la légende du camembert, mêmes couleurs) | non : doublon de la Répartition | aucune demande | PROPOSITION : retirer (ou n'afficher que « Total ») |
| Pastille orange sur « Feuille de route » dans la barre du bas (visible sur toutes les captures) | hors écran, coquille | orange proscrit hors suppression (SIMPLIFICATION.md, 19 oct.) | PROPOSITION : la passer en violet ou la retirer — décision d'Émilien (déjà signalée dans l'audit Chrono) |
| Points de pagination (3 points) | oui, indique les 3 pages | demandé (2 oct.) | garder |
| Page 2/3 : onglets d'activité en haut (pastilles défilantes) | sert le choix de l'activité ; la 3e pastille est coupée à l'écran | demandé | garder |
| Page 2/3 : graphique Prévu / En avance / En retard + légende à 3 entrées | oui | demandé (9 oct.) | garder |
| Page 2/3 : bouton « Ajouter une information » (cartes ajoutables) | élargit la fonction : l'utilisateur compose son tableau ; sur la démo il ne contient rien d'autre | ajouté le 9 oct. (« cartes d'information ajoutables ») ; usage : aucune donnée | PROPOSITION : le retirer au profit de cartes fixes (comme déjà fait pour un profil visité) |
| Page 2/3 : menu ⋮ (Année/Mois/Semaine) | oui | demandé | garder |
| Pages 2 et 3 quasi identiques (même graphique, titre différent) | deux écrans pour une même structure | demandé (10 oct. : onglets Tâches/Objectifs) | PROPOSITION : les fusionner en une page avec la bascule Tâches/Objectifs, supprimant 1 page et 1 point |

## Vide
La page 2/3 laisse ~50 % de l'écran vide (sous « Ajouter une information ») : un signe que la page porte peu d'information.
