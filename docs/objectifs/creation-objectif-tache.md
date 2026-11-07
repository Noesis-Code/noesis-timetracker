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
