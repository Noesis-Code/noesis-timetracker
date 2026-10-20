# Premier lancement et récupération de profil — 20 oct. 2026

Chantier Basic (repli 14). Test Playwright 390 px (mode installé simulé), nouveau profil de bout en bout, plus test serveur `test/fonctionnel-recuperation.js` (35 vérifications, ajouté à `run-tests.js`). Console : seule erreur = `GET /api/offer1/access` 401 avant connexion (sans effet visible, notée plus bas). Captures : `docs/img/premier-lancement-*.png`.

## Parcours d'un nouveau profil

| Étape | Capture | Taps utiles |
|---|---|---|
| Gate d'installation (navigateur classique, avant tout profil) | `premier-lancement-30-gate-pwa.png` | 0 (hors de l'app : ajouter à l'écran d'accueil) |
| Création : 6 champs + case conditions/16 ans + « Créer mon profil » | `premier-lancement-01-creation.png` | 2 (case, Créer) + 6 champs |
| Choix des modules (Chrono et Feuille de route actifs, Communauté éteinte) | `premier-lancement-03c-modules.png` | 1 (Valider) |
| Création de la première activité | `premier-lancement-05-activites.png` | 2 + 1 champ (Ajouter, Continuer) |
| Écran Chrono, une activité | `premier-lancement-06-app.png` | |
| Premier chrono démarré | `premier-lancement-07-chrono-demarre.png` | 1 (toucher l'activité) |

**Nombre de taps entre l'ouverture de l'app (déjà installée) et le premier chrono : 13** (mesuré), dont 7 pour placer le curseur dans un champ (6 d'identité + le nom d'activité) et 6 d'action : case conditions/16 ans, Créer, Valider les modules, Ajouter l'activité, Continuer, toucher l'activité.

Aucun texte coupé, aucun bouton hors écran, aucun défilement horizontal à 390 × 844 : la création tient en un écran (`scrollHeight` = 844, boutons entre y = 695 et 772). Fenêtre « Comment Noèsis utilise vos renseignements » (première visite de la Feuille de route) : ✕ présent, « J'ai compris » atteignable par défilement.

### Premier chrono : OK
Un tap sur l'activité démarre le chrono, STOP l'arrête.

### Première tâche : une impasse (corrigée) et deux points à décider
1. **Corrigé (texte seul).** Une activité neuve n'a aucun pôle (décision produit : « aucun pôle par défaut »). La première tâche saisie dans la Feuille de route échouait dans les 3 modes IA avec « Aucune catégorie sur cette activité. », sans dire quoi faire (`premier-lancement-11-tache-ajoutee.png`, avant). Le message dit maintenant : « Cette activité n'a pas encore de pôle. Vide le champ, puis touche son nom pour en créer un. » (FR/EN ; `premier-lancement-14-apres-choix-ia.png`, après). Cette consigne mène à l'écran « Cette activité n'a pas encore de pôle » (`premier-lancement-23-goals.png`) qui propose « + Ajouter un pôle ». Fichiers : `server/lib/goalstaskclassify.js`, `public/i18n.js`. Aucun bouton ni écran ajouté.
2. Avant d'échouer, la première tâche ouvre d'abord la fenêtre « Comment Noèsis gère tes tâches ? » (choix du mode IA, ✕ présent) : 1 tap de plus, c'est voulu, mais le choix précède l'impasse du pôle manquant.
3. Sur une activité sans pôle, saisir la tâche puis choisir l'activité ajoute aussi un tap (« Quelle activité pour cette tâche ? ») quand plusieurs choix sont possibles.

## Constats qui bloquent ou freinent (non corrigés : décision d'Émilien)

- **Récupération impossible si « Être trouvable à la connexion » est resté décoché (réglage par défaut).** La recherche de profil ne renvoie que les profils qui l'ont coché : un utilisateur qui perd son téléphone et n'a pas coché la case voit « Aucun profil trouvé. » (`premier-lancement-32-recuperation-aucun.png`) et ne peut pas récupérer ses données. Prouvé par le test serveur (recherche partielle et recherche exacte). Le texte sous le champ code de la création (« Ce code te sera redemandé si tu récupères ce profil… ») laisse croire le contraire. C'est lié au consentement (Loi 25) : réservé à Émilien, voir questions.
- **Ancien profil sans code sur un nouvel appareil** : retrouvé (hasPin = false) mais « Définis un code » est refusé (401, session requise, volontaire depuis l'incident de sécurité). Concerne seulement les comptes créés avant l'ajout du code ; aucun test sur la prod possible ici.
- **Blocage 30 min après 3 codes faux, par compte** : quiconque connaît un nom (annuaire coché) peut bloquer ce compte pendant 30 min. Choix de sécurité existant, non modifié.
- Console à l'ouverture sans profil : `GET /api/offer1/access` répond 401 (erreur dans la console, aucun effet visible). Sans conséquence ; à retirer si l'appel est rendu conditionnel à la session.
- Champ obligatoire non signalé : « Créer mon profil » reste grisé tant que la case conditions/16 ans n'est pas cochée, sans message qui dise pourquoi (le texte d'erreur n'apparaît que si le bouton est activé puis retourné). Voir question.

## Récupération de profil (test serveur, `test/fonctionnel-recuperation.js`)

Prouvé de bout en bout : nouvel appareil sans session → recherche par sous-chaîne du nom (3 caractères minimum, ne révèle ni téléphone, ni courriel, ni code) → mauvais code 401, sans session → bon code 200, session posée → historique et activités de l'ancien appareil retrouvés, chrono démarrable → 3 mauvais codes = blocage 30 min même avec le bon code. Captures : `premier-lancement-33-recuperation-resultats.png` (résultat trouvé), `premier-lancement-32-recuperation-aucun.png` (non trouvé).
