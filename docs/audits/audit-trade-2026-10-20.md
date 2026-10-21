# Audit de simplicité : écran Trade Tracker (20 oct. 2026)

Méthode : `docs/regles/boucle-veille.md`. Captures 390 px (données de démonstration `?demo=1`, serveur local) : `docs/img/trade-accueil-390.png` (Accueil) et `docs/img/trade-positions-menu-390.png` (Positions, menu ⋮ ouvert). **Tout est en PROPOSITION : rien n'est retiré.** Aucune citation d'Émilien ne décrit le contenu de ces écrans (`docs/regles/intentions.md` : seulement « connecter le module à l'activité ») ; donc « personne n'a demandé » vaut pour tout, mais retirer sans son avis un écran déjà livré et utilisé par l'expert serait risqué : décision demandée (Q3, Q7 dans `questions-emilien.md`).

**Fonction unique de l'écran** : voir d'un coup d'oeil la valeur et la composition de son portefeuille (et, pour un client, l'écart avec celui de l'expert).

## Inventaire (390 px)
Barre haute : titre, pastille « démo », pastille de synchro, réglages, retour TimeTracker. Barre du bas : 6 onglets (Accueil, Positions, Répartition, Historique, Expert, Synchro). Accueil : puces de compte, valeur totale, Encaisse, Rendement, Répartition par secteur (barre + 5 lignes), Meilleures positions (3), À surveiller (3), « Dernière synchro ».
Positions : puces de compte, 4 tris, menu ⋮ (2 groupes), 3 filtres Gains/Pertes, liste de secteurs, résumé, puis les cartes. La première carte est sous 3 rangées de contrôles et le menu ⋮ recouvre le contenu.

## Éléments à retirer ou fusionner (proposition, du plus sûr au plus discutable)
| # | Élément | Pourquoi (fonction unique) | Proposition |
|---|---|---|---|
| 1 | Menu ⋮ : « Graphique camembert/barres » et « Masquer les petites positions » | Deux réglages d'affichage jamais demandés ; chacun double un autre contrôle (la barre de secteur existe déjà ; le tri par valeur met les petites positions en bas) | Retirer (code `prefs.js`, CSS, i18n) |
| 2 | Menu ⋮ : « Montants valeur / % » | Un deuxième mode d'affichage de chaque carte ; défaut « valeur » suffit | Retirer ; supprimer alors tout le menu ⋮ (une fonction = une entrée) |
| 3 | Filtre Toutes/Gains/Pertes (Positions) | Le tri par « Gain $ » ou « Gain % » donne déjà gagnants et perdants en tête/en queue | Retirer |
| 4 | Tris « Gain $ » et « Gain % » côte à côte | Deux tris quasi identiques | Garder un seul (« Gain ») ou aucun |
| 5 | Liste déroulante de secteur (Positions) | Les secteurs sont déjà dans Répartition ; deuxième chemin vers la même vue | Retirer ou la fusionner dans Répartition |
| 6 | Accueil : bloc « Répartition par secteur » | Doublon de l'onglet Répartition | Retirer de l'Accueil (garder l'onglet) |
| 7 | Accueil : « Meilleures positions » ET « À surveiller » | Doublon de Positions triées par gain ; « À surveiller » affiche le même titre (LITH) deux fois (une ligne par compte) : donnée brouillonne | Garder un seul bloc, agrégé par titre, ou aucun |
| 8 | Accueil : carte « Encaisse » et carte « Rendement » | Rendement (hors apports) et gain latent sous la valeur totale disent presque la même chose | Garder Encaisse, fusionner le rendement dans la carte principale |
| 9 | Barre haute : icône horloge « Retour à TimeTracker » | Icône horloge peu parlante ; pointe vers l'URL staging codée en dur | Garder (retour utile) mais corriger l'URL (tâche 7 de `etat-taches-trade-2026-10-20.md`) |
| 10 | Pastille de synchro (haut) ET « Dernière synchro » (bas) ET onglet Synchro | Trois endroits pour une information | Retirer le texte du bas ; envisager de fusionner l'onglet Synchro dans la pastille |
| 11 | 6 onglets dont Synchro (technique) et Expert (clients seulement) | Un onglet de plus que les 5 de TMT ; Synchro est un écran d'exploitation, pas un usage quotidien | Ranger Synchro derrière la pastille ; masquer Expert pour l'expert lui-même |
| 12 | Pastille « démo » | Utile seulement en mode fictif | Garder (jamais en production) |

## Ce qu'on garde (justifie la différence)
Valeur totale + gain, composition par secteur (cœur du suivi de l'expert), liste des positions, comparaison à l'expert (Expert), sécurité (TOTP).

## Estimation du gain
Les points 1 à 6 retirent environ 9 contrôles de l'écran Positions (4 tris -> 1, 3 filtres, 1 liste, menu ⋮) : la première position passerait de la 4e rangée à la 2e.

## Test de simplicité
Rien n'a été ajouté par cet audit (aucun code touché). Aucun élément n'a pu être retiré directement : pas de preuve d'ajout après demande d'Émilien non plus, d'où la décision à cocher.
