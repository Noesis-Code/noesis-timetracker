# Rangement des tâches (18 nov. 2026)

Schéma de référence : « Rangement d'une tâche » (8 blocs : date, catégorie, tâche regroupante, objectif, importance, rang, place, validation).

## Livré (lot 1)

- **Modèle** (`server/lib/taches-rangement.js`) : une tâche porte `objectiveId` (objectif qui l'accueille), `parentItemId` (« étape de » une autre tâche) et `chainRank` (rang dans la chaîne). Colonnes nullables, aucune donnée supprimée. Un lien vers un objectif supprimé est ignoré à la lecture.
- **Classement silencieux de toute tâche créée** (`createItem`) : nature, phase, urgence par règles gratuites (`taskkind.js`), sans IA. Une tâche déjà classée n'est jamais reclassée.
- **Choix de la catégorie et de l'objectif** (`server/lib/taches-choix.js`, `POST /api/taches/choix`) : UN seul appel IA avec l'arbre de la catégorie, UNE seule proposition, doute = échéance la plus proche, tâche avec date = objectifs qui couvrent la date, mémoire exacte du titre déjà rangé (aucun appel), repli par règles. Rien n'est écrit.
- **Correction apprise** (`POST /api/taches/rangement/corriger`) : objectif, étape de, rang, nature, phase.
- **Apprentissage** (`server/lib/taches-apprentissage.js`) : journal personnel des corrections (réinjecté dans les prompts), motifs globaux anonymes, délais réels entre paliers.
- **Responsable de la tâche** (`server/lib/taches-responsable.js`) : une seule proposition, correctible, correction apprise (champ `responsable`). Un seul membre : la tâche est à lui. Plusieurs membres : les parts voulues (`task_share_wanted`, « toi 60 %, moi 40 % ») décident l'attribution automatique (la plus en dessous de sa part), puis le responsable de la catégorie avec héritage départage ou sert quand aucune part n'est saisie. Règles gratuites, sans IA.
- **Connecteur IA** : `creer_tache` et `modifier_tache` acceptent `objectif`, `nature`, `etape_de`. L'outil `ranger_tache` exige tous les champs structurés (catégorie, objectif, nature, raison courte d'une phrase, confiance 0 à 100) et le consentement ; il alimente des exemples étiquetés anonymes (motif générique, valeur, confiance : jamais la raison en texte libre, qui reste dans le journal de la personne). Noèsis ne lit que ces champs, jamais le prompt ni le modèle de la personne.
- **Cadre de décalage** (`cadreDeDecalage`) : hebdomadaire = sa période ; périodique = son année ; annuel et pluriannuel = la fin de son bloc de 5 ans (une tâche peut viser un objectif dans 5 ans ; le bloc commence à l'année en cours). Le décalage lui-même est livré au lot 2.

## Anonymat et consentement

- Le journal personnel reste celui de la personne (remise à zéro par l'API, effacé avec le compte).
- Les motifs globaux (`rangement_motifs`, `paliers_delais_globaux`) ne contiennent AUCUN identifiant ni texte brut : le titre est réduit à un motif générique (au plus 2 mots courants, jamais de nom propre, de chiffre ni d'adresse), la personne est une empreinte salée. Ils ne servent qu'avec au moins 5 personnes distinctes et 90 % de convergence.
- Alimentés SEULEMENT avec le consentement (`rangement_consentement`). Retrait du consentement : les contributions de la personne sortent des agrégats.
- `POST /api/ai-tokens` accepte `consentement: true` (journalise la date) et refuse `consentement: false`. Il est OBLIGATOIRE par défaut depuis le 18 nov. 2026 (la fenêtre « Connecter mon IA » affiche le texte de consentement ; `GET /api/ai-tokens` renvoie `consentement`, déjà accepté = pas redemandé) ; `CONNECTEUR_CONSENTEMENT_OBLIGATOIRE=0` le désactive.

## Lot 2 : place d'une tâche dans son objectif (18 nov. 2026, `server/lib/taches-place.js`)

- **Importance** selon le TYPE de l'objectif (`objectifs-type.js`, repli : des paliers chiffrés = progression, sinon projet) : projet = maintenance urgente (rang 1), réformer (2), cadrage (3), réalisation ou finition (4) ; progression = paliers, petite valeur d'abord (diminution : sens inverse).
- **Rang dans la chaîne** : jamais avant son prérequis (palier ou phase précédente) ; une tâche sans chiffre ni phase garde son ordre d'ajout.
- **Place** : semaine par semaine dans le cadre de l'objectif (`cadreDeDecalage`) ; sans place dans la semaine, la progression efficace passe en premier et les moins utiles reculent suivant la courbe de l'objectif (délai réel de la personne, puis global ≥ 5 personnes consentantes, puis tableau général, jamais une seule case). Rien ne trouve de place : dépassement dans son objectif, AUCUN transfert d'heures.
- **API** : `POST /api/taches/place` (proposition unique : `rangement`, `decales`, `chaine`, `depassements`, `responsable`, `membres`, `lignes`) ; `POST /api/taches/place/appliquer` (écrit date = lundi de la semaine, rang, objectif, responsable ; chaque ligne changée est apprise, champ `place`). Aucune heure modifiée.
- **Date d'atteinte** d'un objectif : `metaJson.atteintLe` posée à la première lecture qui le voit atteint ; avec une famille et des chiffres, l'écart réel entre paliers alimente les délais personnalisés.
- **Interface** : panneau « Rangement proposé » (`TMT.rangerTache`, `public/js/objectifs-page1.js`) avec le composant de « Modifications proposées » (`TMT.ui.confirm`) ; fenêtre de consentement dans `public/js/connexion-ia.js`. Aucun nouveau style.
