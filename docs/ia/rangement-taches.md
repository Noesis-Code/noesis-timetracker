# Rangement des tâches (18 nov. 2026)

Schéma de référence : « Rangement d'une tâche » (8 blocs : date, catégorie, tâche regroupante, objectif, importance, rang, place, validation).

## Livré (lot 1)

- **Modèle** (`server/lib/taches-rangement.js`) : une tâche porte `objectiveId` (objectif qui l'accueille), `parentItemId` (« étape de » une autre tâche) et `chainRank` (rang dans la chaîne). Colonnes nullables, aucune donnée supprimée. Un lien vers un objectif supprimé est ignoré à la lecture.
- **Classement silencieux de toute tâche créée** (`createItem`) : nature, phase, urgence par règles gratuites (`taskkind.js`), sans IA. Une tâche déjà classée n'est jamais reclassée.
- **Choix de la catégorie et de l'objectif** (`server/lib/taches-choix.js`, `POST /api/taches/choix`) : UN seul appel IA avec l'arbre de la catégorie, UNE seule proposition, doute = échéance la plus proche, tâche avec date = objectifs qui couvrent la date, mémoire exacte du titre déjà rangé (aucun appel), repli par règles. Rien n'est écrit.
- **Correction apprise** (`POST /api/taches/rangement/corriger`) : objectif, étape de, rang, nature, phase.
- **Apprentissage** (`server/lib/taches-apprentissage.js`) : journal personnel des corrections (réinjecté dans les prompts), motifs globaux anonymes, délais réels entre paliers.
- **Connecteur IA** : `creer_tache` et `modifier_tache` acceptent `objectif`, `nature`, `etape_de`. Noèsis ne lit que ces champs, jamais le prompt ni le modèle de la personne.

## Anonymat et consentement

- Le journal personnel reste celui de la personne (remise à zéro par l'API, effacé avec le compte).
- Les motifs globaux (`rangement_motifs`, `paliers_delais_globaux`) ne contiennent AUCUN identifiant ni texte brut : le titre est réduit à un motif générique (au plus 2 mots courants, jamais de nom propre, de chiffre ni d'adresse), la personne est une empreinte salée. Ils ne servent qu'avec au moins 5 personnes distinctes et 90 % de convergence.
- Alimentés SEULEMENT avec le consentement (`rangement_consentement`). Retrait du consentement : les contributions de la personne sortent des agrégats.
- `POST /api/ai-tokens` accepte `consentement: true` (journalise la date) et refuse `consentement: false`. Il devient OBLIGATOIRE avec la variable `CONNECTEUR_CONSENTEMENT_OBLIGATOIRE=1` : à activer quand la fenêtre « Connecter mon IA » affichera le texte de consentement (interface à maquetter d'abord, règle R30).

## Pas encore livré (lot 2)

Blocs 5 à 7 du schéma : importance liée au type de l'objectif, rang dans la chaîne, place (semaine, périodique, année), décalage des tâches moins utiles, dépassement sans transfert d'heures, panneau de validation avec la chaîne affichée.
