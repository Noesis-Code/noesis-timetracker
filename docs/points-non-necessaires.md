# Points non nécessaires — propositions de retrait (tâche 599, 20 oct. 2026)

PROPOSITIONS seulement : rien n'est retiré. Sources : `docs/audit-chrono-2026-10-20.md` et lecture rapide de `public/index.html` (sans capture). Critère : `SIMPLIFICATION.md` (une fonction = une entrée ; retirer avant d'ajouter). Décision d'Émilien pour chaque ligne.

| # | Écran | Élément | Pourquoi | Proposition |
|---|---|---|---|---|
| 1 | Chrono | Bouton « Historique » | Corriger/supprimer une session n'est pas lancer le chrono | Le déplacer dans Stats (ou garder, demandé le 31 août) |
| 2 | Barre du bas | Pastille orange sur « Feuille de route » (`#goalsTabUnreadDot`) | Orange = couleur d'interface proscrite hors suppression | Retirer, ou passer au violet |
| 3 | Stats | Filtre « Tous / Public / Confidentiel » (`#statsVisBtn`) | Un filtre de plus sur un écran déjà chargé ; usage inconnu | Mesurer l'usage, retirer si rare |
| 4 | Stats | Trois blocs superposés (feuille de temps, camembert, graphique) + bouton « Aujourd'hui » du camembert | Trois lectures du même temps | Garder la feuille de temps et le camembert ; proposer de retirer le graphique ou le bouton |
| 5 | Stats | Deux menus de période (`#tsPeriodBtn`, `#chartPeriodBtn`) | Deux entrées pour choisir une période | Un seul menu partagé |
| 6 | Réglages | Section « Calendrier et export de données » | Deux fonctions (calendrier externe, export) sous un titre | Séparer ou retirer la moins utilisée |
| 7 | Réglages | Sections « Sécurité » et « Supprimer mon compte » | Deux sections pour la gestion du compte | Les fusionner en une |
| 8 | Réglages | « Partage » et « Aide et suggestions » | Chevauchent Profil (partage) et le canal de feedback | Déplacer « Partage » au Profil |
| 9 | Réglages | Section « Modules » | Le seul chemin pour désactiver un module ; utile seulement si peu de modules | Garder si Émilien tient aux modules ; sinon retirer et afficher les modules du palier |
| 10 | Code | `bindSubProjectDrag` et UI sous-projets masquée depuis le 17 sept. | Code mort (CLAUDE.md) | Retirer le code (pas les données) |
| 11 | Code | Sélecteur d'activité répété (`caSubProjectBtn/Menu`) réutilisé pour le filtre Stats | Classe de sous-projets pour une autre fonction | Renommer ou supprimer avec le point 3 |

Non vérifié : états en cours (chrono lancé), Communauté, Profil, Trade Tracker (passes d'audit suivantes, voir `boucle-veille.md`).
