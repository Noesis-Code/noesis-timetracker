# Réglages de la création d'un objectif et d'une tâche (inventaire, 7 nov. 2026)

Factuel, lu dans le code de `origin/staging` (b979346f). Rien n'est changé tant qu'Émilien n'a pas décidé (S1).

## Objectif : barre « Nouvel objectif… » (`public/js/objectifs-creer.js`, `server/lib/objectifs.js` `creer`)

Barre : 140 caractères, épingle (photo/fichier → objectifs lus), ↑. Puis panneau en 3 à 5 pages « Suivant n/total » puis « Terminer » (rien n'est créé avant).

| Page | Champ | Défaut | Obligatoire | Visible / Avancé |
|---|---|---|---|---|
| Description | Objectif (titre) | texte de la barre | oui, 140 max | visible |
| | Description | vide | non, 500 max (1000 en édition) | visible |
| | Activité liée | suggérée (3 premières, « Autre activité… », « Créer l'activité ») ; verrouillée si créé depuis une case de l'arbre | oui | visible |
| | Avancé : Relier à (macro), Nom du macro | fermé, aucun | non | Avancé |
| Rattachement | Rattaché à (Avant/Après), Objectif macro | proposition seulement s'il y a un candidat | Accepter ou Refuser | visible, conditionnelle |
| Temps | Durée (nombre + semaines/mois/années) ou date choisie | estimation de la base de durées, sinon à saisir | **échéance obligatoire, précise, jamais passée** | visible |
| | Date de l'échéance (si date imposée détectée) | vide | oui | visible |
| | Objectifs hebdomadaires (interrupteur) | oui | non | visible |
| | Nombre recommandé / Heures par semaine | historique Chrono | non (1 à 80) | visible |
| Niveau | « Ton niveau actuel » + « Passer (je suis débutant) » | vide | non | visible, seulement si info manquante |
| Tâches | Expansion : « Tâches générées automatiquement » ; gratuit : bouton d'offre | — | — | visible |

Posés sans champ : début = aujourd'hui, périodes 13 × 4 semaines, niveau d'arbre (activité/pôle/secteur) et pôle/secteur = ceux de la colonne touchée, jusqu'à 5 tâches de la semaine 1 (Expansion seulement).

## Tâche : barre « Nouvelle tâche… » (`public/js/aujourdhui.js`, `taches-ligne.js`, routes `goals.js`)

Barre : 300 caractères, épingle (document/image), ↑ (appui long = demande Expansion). Après ↑, panneau « Noèsis propose » / « À ranger » :

| Champ | Défaut | Visible |
|---|---|---|
| Activité | proposée par le classement (grisé s'il n'y en a qu'une) | visible |
| Pôle | proposé | visible |
| Secteur | proposé (absent si le pôle n'a pas de secteur) | visible si le pôle en a |
| Date | jour de la vue | visible |
| Responsable | absent ; apparaît s'il y a plus d'un membre | visible conditionnel |

Pas de durée, priorité, description ni objectif lié à la création. Orthographe corrigée en silence ; tout autre changement = proposition. Génération IA : 5 tâches au plus sauf nombre demandé, liste cochable, bouton Enregistrer fixe.

## Écarts relevés (à décider)

1. Vocabulaire : le parcours montre « Suivant 2/4 », « Niveau » et un champ « Ton niveau actuel » ; « niveau » désigne aussi activité/pôle/secteur.
2. Description : visible à la création, sous Avancé en édition (décision du 7 nov.), 500 contre 1000 caractères.
3. Temps : « Objectifs hebdomadaires » et « Heures par semaine » visibles ; l'édition n'a ni temps attribué ni hebdomadaire.
4. Pas de lien objectif ↔ tâche à la création d'une tâche.
5. Date de tâche passée : acceptée sans avertissement.

## Idée gardée de côté : page « Tâches » à la création d'un objectif (7 nov. 2026)

Décision d'Émilien : l'offre Expansion est laissée de côté jusqu'à son lancement (objectif : dans environ deux semaines). La 5e page du panneau (« Tâches générées automatiquement » avec Expansion, ou bouton d'offre « Génère automatiquement tes tâches avec Noèsis » en gratuit) est retirée du parcours : `TACHES_PAGE = false` dans `public/js/objectifs-creer.js`, le code de la page (`boxes.taches`, `offerBtn`) est conservé. À remettre à `true` dès qu'Expansion est en ligne. Le parcours passe à 4 pages au plus : Description, Rattachement (si candidat), Temps, Activité, Niveau (si info manquante).

## Temps par membre, responsables (décisions d'Émilien, 8 nov. 2026)
- **Page Temps** : pour le niveau choisi (activité, pôle ou secteur), une ligne par membre : heures par semaine passées (moyenne des 4 dernières semaines, statistiques) en gris + temps prévu modifiable ; total du niveau recalculé en haut.
- **Origines d'un changement de temps** : s'ajoute · pris sur une autre activité (SEULEMENT pour son propre temps) · pris sur un autre pôle/secteur de la même activité · échangé entre responsables (total constant).
- **Responsables** : le propriétaire de l'activité et les responsables ajoutés (plusieurs possibles). Un responsable d'activité l'est aussi de tous ses pôles et secteurs. TOUS les responsables sont égaux : ils modifient directement le temps de n'importe quel membre, propriétaire compris. Réglable dans les paramètres de l'activité et en touchant l'activité au titre de l'arbre périodique.
- **Notification** au membre modifié (avant → après, par qui). Si c'est du temps additionnel, il choisit depuis la notification de le prendre sur une autre activité à lui ou de l'ajouter.
- **Statistiques** : tableau de tous les temps par activité et par pôle, avec historique continu et case « changements demandés » (branche à part, côté Chrono/Statistiques).
- **Ordre** : 1) responsables, 2) temps passé par membre dans la page Temps, 3) modification avec les 4 origines. Ensuite : « Objectifs inclus » retiré de la page Temps et remplacé, à la fin du parcours, par « Générer les objectifs périodiques / hebdomadaires » (avec description de chacun, on peut passer).
- Points de contact avec d'autres sessions : titre de l'activité dans l'arbre (Feuille de route), paramètres d'une activité (Réglages), notifications (Notifications).
