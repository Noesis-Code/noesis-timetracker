# Inventaire des options et réglages — TimeTracker et Trade Tracker (20 oct. 2026)

Chantier 5 « Simplification et design général », axe « inventaire des options ». **Rien n'est retiré** : les propositions sont des cases à cocher dans `questions-emilien-simplification.md` (section « 9e passage »). Test appliqué : celui de `SIMPLIFICATION.md` (« puis-je obtenir le même résultat avec moins ? »). Une option demandée mot pour mot par Émilien (`docs/regles/intentions.md`) ou légale (Loi 25, consentements, suppression de compte) est classée « indispensable » ou « légal : réservé », jamais proposée au retrait.

## Méthode (reproductible)
- Contrôles statiques : `index.html` sans commentaires, extraction de `<input|select|textarea|button>` (script Python, 70 contrôles) ; contrôles dynamiques : `grep "createElement('input|select|textarea')"` et `type = 'checkbox'` dans `public/app.js` et `public/js/*.js` (≈ 60 sites) ; réglages serveur : `grep "router.(put|patch)"` dans `server/routes/` (35 routes) et `ALTER TABLE users ADD COLUMN` dans `server/db.js` ; préférences locales : `grep localStorage` (aucune hors cache de profil/modules/file hors ligne).
- **Taps** = nombre de taps depuis l'écran d'accueil pour CHANGER la valeur (⚙ = 1, section dépliée = 2, contrôle = 3, « Enregistrer » = 4 si présent). « ≤ 2 » = oui seulement si le contrôle est atteint en 2 taps au plus.
- **Lignes** = ordre de grandeur (≈) du code dédié : HTML + JS client + CSS + serveur propre à l'option (fichiers dédiés mesurés par `wc -l`, fonctions mesurées une à une, le reste estimé par `grep`). Une librairie ou un dictionnaire partagé est indiqué à part.
- Défaut = valeur d'un compte neuf (`server/lib/modules.js`, `server/db.js`, `POST /profile`).

## 1. TimeTracker — Réglages (⚙), 10 sections

| N° | Option | Où | Défaut | Ce que ça change | ≈ lignes | Taps (≤ 2 ?) | Classe |
|---|---|---|---|---|---|---|---|
| R1 | Prénom ou pseudo | Identité | saisi à la création | nom affiché partout ; unicité prénom + nom | 40 (formulaire d'identité ≈ 175 : HTML 22, JS 35 + 28, `PUT /profile/:id` 90) | 4 (non) | indispensable |
| R2 | Nom de famille | Identité | saisi | recherche de connexion « nom complet » ; unicité | 35 | 4 (non) | indispensable |
| R3 | Téléphone | Identité | saisi (obligatoire) | contact entre abonnés | 35 | 4 (non) | pas d'avis (case 8e passage : facultatif) |
| R4 | Courriel | Identité | saisi (obligatoire) | avis légaux, offre, comptes inactifs | 35 | 4 (non) | indispensable |
| R5 | Autoriser mes abonnés à me contacter par courriel | Identité, interrupteur | éteint | montre le courriel aux abonnés | 30 (partagé avec R6, 50 occurrences) | 4 (non) | à fusionner avec R6 |
| R6 | … par téléphone | Identité, interrupteur | éteint | montre le téléphone aux abonnés | 30 | 4 (non) | à fusionner avec R5 |
| R7 | Photo de profil | Profil (⌂ puis cercle) | aucune (initiale) | avatar partout | 100 | 2 (oui) | pas d'avis |
| R8 | Changer mon code (3 champs) | Sécurité | code choisi | seule voie de récupération du profil | 85 (JS 16 + `set-pin` 60) | 5 (non) | indispensable |
| R9 | Se déconnecter de tous les appareils | Sécurité | — | invalide les sessions (`sessionEpoch`) | 30 | 3 (non) | déjà en case (doublon de « Déconnexion ») |
| R10 | Utilisation commerciale de mes données | Sécurité, interrupteur | éteint | consentement marketing (versionné) | 80 | 3 (non) | légal : réservé |
| R11 | Être trouvable à la connexion | Sécurité, interrupteur | éteint à la création | annuaire de l'écran de connexion | 40 | 3 (non) | légal : réservé |
| R12 | Supprimer mon compte | Supprimer mon compte (code + bouton) | — | efface profil et données | 200 (`accountdeletion.js` 142 + JS 25 + route 25) | 4 (non) | légal : réservé |
| R13 | Langue FR / EN | Langue | `fr` (aucune question, non déduite du navigateur) | toute l'interface | 40 + dictionnaire EN `i18n.js` 1 736 + `legal-en.js` | 3 (non) | indispensable |
| R14 | Module Chrono | Modules, interrupteur | actif | onglets Chrono et Stats (temps) | ≈ 380 pour les 3 modules (`modules.js` 176 + `lib/modules.js` 157 + 41 sites) | 3 (non) | indispensable (demandé 19 oct.) |
| R15 | Module Feuille de route | Modules | actif (embarque Calendrier, Mon IA, stats des tâches) | onglet Objectifs, IA, calendrier | (inclus) | 3 (non) | indispensable |
| R16 | Module Communauté et profil | Modules | **éteint** | onglet Communauté, Profil, abonnés | (inclus) | 3 (non) | indispensable |
| R17 | Notifications › Communauté | Notifications, interrupteur | actif | notification push des publications | 70 (+ `push.js` 419 = la fonction, pas l'option) | 3 (non) | pas d'avis (demandé 10 sept.) |
| R18 | Notifications › un interrupteur par activité | Notifications | actif pour chaque activité | push par activité | 55 | 3 (non) | pas d'avis (demandé 10 sept. mot pour mot) |
| R19 | Mon IA › Autonome / Partiel / Absent | Mon IA ; **pop-up obligatoire à la 1re tâche** | non choisi | qui range les tâches (IA seule / IA proposée / manuel) | 200 (choix + pop-up 110, serveur 20, branches de placement 70) | 3 (non) | à fusionner : défaut « Partiel » sans pop-up |
| R20 | Connecter mon IA › créer / regénérer l'adresse | Mon IA | non connectée | donne à Claude/ChatGPT l'accès MCP en lecture | 530 (`connexion-ia.js` 116 + `mcp.js` 336 + `aitokens.js` 74) | 4 (non) | pas d'avis (fonction demandée) |
| R21 | … Révoquer l'accès | Mon IA | — | supprime l'adresse | 20 | 4 (non) | indispensable (sécurité) |
| R22 | … « Détails » | Mon IA | replié | ouvre 3 lignes d'info + R23 + adresse du serveur | 25 | 4 (non) | déjà en case |
| R23 | … « Autoriser l'IA à cocher mes tâches et m'écrire » | Mon IA › Détails | éteint (lecture seule) | l'adresse suivante peut cocher, noter, notifier (10 par jour) | 40 | 5 (non) | à retirer : IA en lecture seule (le comportement par défaut suffit) |
| R24 | Calendrier › Créer mon lien de calendrier | Calendrier et export | pas de lien | flux ICS des échéances | ≈ 900 (`calendarfeed.js` 594 + route + client 28) | 4 (non) | pas d'avis (fonction demandée) |
| R25 | … Ajouter à Apple Calendar | idem | — | ouvre `webcal://` | 10 | 5 (non) | pas d'avis (une plateforme chacun) |
| R26 | … Ajouter à Google Agenda | idem | — | ouvre le lien Google | 10 | 5 (non) | pas d'avis (une plateforme chacun) |
| R27 | … Activités exportées : interrupteur par activité, puis par pôle (dépliable) | idem | tout inclus | quelles échéances vont dans le flux | 120 (client 44 + route 45 + lib) | 5-6 (non) | à fusionner : un niveau (activité) seulement |
| R28 | Importer un calendrier (URL ICS, liste « URL enregistrées ») | idem | aucune URL | heures occupées d'un agenda externe | 520 (`externalcalendar.js` 348 + client 80 + route 90) | 5 (non) | pas d'avis |
| R29 | … Règles de répartition (mots du titre → max h ou aucun) | idem | aucune règle | plafonne les heures d'un jour selon les titres importés | 200 (client 54 + sauvegarde 40 + serveur 100) | 5+ (non) | à retirer (le temps occupé suffit) |
| R30 | Télécharger mes données | idem | — | export JSON de tout le compte | 460 (`dataexport.js` 407 + route + client 22) | 4 (non) | légal : droit d'accès (réservé) |
| R31 | Partager l'app | Partage | — | partage natif / copie du lien | 100 | 3 (non) | déjà en case (un seul bouton) |
| R32 | Partager mon profil | Partage | — | idem, lien de profil | (inclus) | 3 (non) | déjà en case |
| R33 | QR code du lien | Partage (affiché) | affiché | image du lien | **2 320 (`qrcode.js`, librairie)** + 15 | 2 (oui) | déjà en case : le coût réel est la librairie |
| R34 | Aide › Suggestion / Signaler un bug (2 boutons), message, pièce jointe | Aide et suggestions | « Suggestion » | type du message ; pièce jointe facultative | 250 (client 110, HTML 35, route 100) | 5 (non) | pas d'avis (seule entrée de feedback) |

## 2. TimeTracker — hors Réglages

| N° | Option | Où | Défaut | Ce que ça change | ≈ lignes | Taps (≤ 2 ?) | Classe |
|---|---|---|---|---|---|---|---|
| S1 | Choisir l'activité du chrono | Chrono | aucune | activité du temps enregistré | cœur du Chrono | 1 (oui) | indispensable |
| S2 | Pôle ou secteur (facultatif) pendant le chrono | Chrono | aucun | rattache le temps | 80 | 2 (oui) | indispensable |
| S3 | Début et fin modifiables à l'arrêt (4 champs) | STOP | heures réelles | corrige un oubli | 120 | 2 (oui) | indispensable |
| S4 | Historique : modifier / supprimer une session | Chrono › Historique | — | corrige le passé | 250 | 2 (oui) | indispensable |
| S5 | Filtre Tous / Public / Confidentiel | Stats | Tous | masque les activités confidentielles | 90 | 2 (oui) | déjà en case |
| S6 | Périodes : Feuille de temps (Semaine, Mois, Année) | Stats ⋮ | Semaine | période affichée | 250 pour **10 menus ⋮** (5 surfaces × période + granularité) | 2 (oui) | à fusionner (voir S7) |
| S7 | Graphique : granularité Jour / Semaine / Mois | Stats ⋮ (5 surfaces) | Semaine | pas du graphique | (inclus dans S6) | 2 (oui) | à fusionner : déduite de la période (Semaine → jours, Mois → semaines, Année → mois) |
| S8 | Répartition : Aujourd'hui / Semaine / Mois / Année | Stats ⋮ | Semaine | période du camembert | (inclus) | 2 (oui) | déjà en case (doublon d'étiquette) |
| S9 | Stats d'activité : filtre « Tous les pôles » | Activité › Stats | Tous | restreint aux tâches d'un pôle | 30 | 3 (non) | pas d'avis |
| S10 | Ajouter une activité (nom) | Activité + | — | crée l'activité | 120 | 2 (oui) | indispensable |
| S11 | Couleur de l'activité | Activité › modifier | auto | pastille partout | 40 | 3 (non) | pas d'avis |
| S12 | Publique / Confidentielle (par membre) | Activité › modifier | Publique | visibilité aux autres | 120 (+ filtres serveur) | 3 (non) | indispensable (confidentialité) |
| S13 | Fusionner avec une activité existante | Activité › modifier ; invitation | non | regroupe deux activités | 200 | 3 (non) | pas d'avis |
| S14 | Supprimer l'activité : Conserver / Supprimer les anciens enregistrements | Activité › supprimer | — | efface ou garde l'historique | 80 | 4 (non) | pas d'avis (destructeur) |
| S15 | Trade Tracker « + » dans l'activité | Activité › modifier | absent | relie le module Trade | 40 | 3 (non) | indispensable (demandé 20 oct.) |
| S16 | Nom + description d'un pôle / secteur | Objectifs › gérer | saisi | sert au classement IA | 90 | 3 (non) | indispensable |
| S17 | Plafonds jour / semaine d'un pôle ou secteur | idem (bloc « temps max ») | aucun plafond | alerte « Plafond atteint », rééquilibrage | **≈ 570** (`buildTimeCapsBlock` 107 + `timecaps.js` 188 + `goalsoverload.js` 278) | 4 (non) | pas d'avis (à confirmer : demandé ?) |
| S18 | Estimation du temps par membre (dépliable) | idem (2 membres ou +) | calculée (médiane) | cible par membre | 170 | 4 (non) | pas d'avis |
| S19 | Déplacer / supprimer un secteur (modes tâches) | idem | — | réorganise | 150 | 3-4 (non) | indispensable |
| S20 | Capture : activité, pièce jointe | Objectifs p. 1 | aucune | où va la tâche | cœur | 1-2 (oui) | indispensable |
| S21 | Récurrence : « Ne se répète pas / Se répète », N, unité, **bouton « Arrêter la récurrence »** | Tâche › modifier | ne se répète pas | tâche répétée | 50 client + `taskrecurrence.js` 122 | 3 (non) | à retirer : le bouton Arrêter (le menu fait déjà « Ne se répète pas ») |
| S22 | Date, secteur, responsable d'une tâche | Tâche › modifier | auto (IA/jour) | place la tâche | 150 | 3 (non) | indispensable |
| S23 | Objectif de période : estimation manuelle ou automatique | Objectifs p. 3 | automatique | cible de temps | 60 | 3 (non) | pas d'avis |
| S24 | Stratégie (6 champs, enregistrement auto) | Objectifs p. 2, icône | vide | consignes à l'IA | 200 (`strategie.js` 59 + `lib/strategy.js` 88 + route 29 + CSS 13) | 2 (oui) | pas d'avis (icône demandée 19 oct.) |
| S25 | Filtre « Responsable : Tous » | Objectifs p. 2 | Tous | tâches d'un membre | 40 | 2 (oui) | pas d'avis (activité partagée seulement) |
| S26 | Projets du Profil : nom, description, lien, date (« + Ajouter des détails ») | Profil | — | fiche projet publique | 150 | 3 (non) | à fusionner : nom + description seuls |
| S27 | Sondage : plusieurs réponses, anonyme, suggestions, échéance (4 options) | Profil › sondage | tout éteint | forme du sondage | ≈ 800 (`polls.js` 500 + client 300) | 3 (non) | déjà en case (retrait de la zone « Écrire aux membres ») |
| S28 | Communauté : recherche (champ + bouton Rechercher) | Communauté | — | trouve un membre | 80 | 1 (oui) | déjà en case |
| S29 | Expansion : « J'ai un code » / « Découvrir » | Objectifs p. 1 | — | accès payant | ≈ 230 (code) + ≈ 700 (achat Stripe) | 2 (oui) | déjà en case (réservé : paiement) |

Réglages fixes, **sans interface** (rien à décider) : thème (toujours sombre, `theme` et son rattrapage de palette ≈ 90 lignes dans `profile.js`/`theme.js`), `shareProfile` (toujours 1). **Colonnes sans aucun lecteur ni écrivain** (`server/db.js` seul) : `users.chronoScrollClock` (horloge défilante, refusée 19 oct.) et `users.aiConfirmEach` (bascule « Confirmer chaque tâche », refusée 19 oct.) : données inertes, à lister « à supprimer par Émilien ».

## 3. Trade Tracker (`trade-tracker/public`, 1 896 lignes de front au total)

Défauts de vue : `prefs.js` (`unit: value, chart: donut, minPct: 0`), mémorisés en `localStorage` (`tt.view.v1`). Taps depuis l'ouverture de Trade (barre du bas de Trade = 1 tap par écran).

| N° | Option | Où | Défaut | Ce que ça change | ≈ lignes | Taps (≤ 2 ?) | Classe |
|---|---|---|---|---|---|---|---|
| T1 | Langue FR / EN | Réglages de Trade | langue du navigateur (indépendante de celle de TimeTracker) | toute l'interface Trade | 25 + `i18n.js` 135 | 3 (non) | à fusionner : reprendre la langue de TimeTracker |
| T2 | Sécurité du compte : activer l'authentification (code d'une appli), codes de secours (nouveaux, copier) | Réglages › Sécurité | non activée (obligatoire pour l'expert et le courtier) | accès au compte | 305 (`screen-security.js`) + `mfa.js` 106 + `totp.js` 54 | 3 (non) | indispensable (sécurité) |
| T3 | Passkeys : ajouter / retirer | idem | aucune | connexion sans code | 27 + 138 + 79 | 4 (non) | pas d'avis (sécurité) |
| T4 | Fermer toutes mes sessions | idem | — | déconnecte les autres appareils | 20 | 4 (non) | pas d'avis (même fonction que TimeTracker R9) |
| T5 | Connecter / déconnecter mon courtier (jeton) | Synchro › Connexion | non connecté | alimente les positions | 92 (`screen-broker.js`) + `brokertoken.js` 103 | 2 (oui) | indispensable |
| T6 | Inviter un client ou un expert : rôle Client / Expert (2 puces), courriel | Synchro › Accès (expert) | Client | rôle de l'invité | 81 | 3 (non) | indispensable |
| T7 | Compte : puces « Tous » + un compte par courtier | Accueil, Répartition | Tous | filtre toutes les valeurs | 10 | 1 (oui) | indispensable |
| T8 | Montants : Valeur / % (⋮) | Répartition, Positions | Valeur | unité affichée | 15 (`prefs.js` 49 pour les 3 préférences) | 2 (oui) | indispensable |
| T9 | Graphique : Camembert / Barres (⋮) | Répartition | Camembert | affiche ou masque le camembert (le détail en barres est toujours là) | 15 | 2 (oui) | à retirer (le comportement par défaut suffit) |
| T10 | Masquer les petites positions : Non, < 1 %, < 2 %, < 5 % (⋮) | Répartition, Positions | Non | cache les petites lignes | 25 | 2 (oui) | à retirer (défaut « Non ») |
| T11 | Regrouper par secteur / par compte | Répartition | secteur | regroupement du camembert | 10 | 1 (oui) | pas d'avis |
| T12 | Tri : Valeur, Gain $, Gain %, Symbole + sens ↑↓ | Positions | Valeur ↓ | ordre de la liste | 30 | 1-2 (oui) | indispensable |
| T13 | Filtre Gains / Pertes (3 puces) | Positions | Toutes | liste seulement les gains ou pertes | 15 | 1 (oui) | à retirer (le tri par Gain suffit) |
| T14 | Sélecteur « Tous les secteurs » | Positions | Tous | filtre un secteur | 20 | 2 (oui) | à fusionner avec la Répartition par secteur |
| T15 | Période : 1M, 3M, 6M, 1A, Tout (5 puces) | Historique | 6M | fenêtre du rendement | 10 | 1 (oui) | indispensable |
| T16 | Rendement / Valeur | Historique | Rendement | indice base 100 ou valeur CAD | 15 | 1 (oui) | pas d'avis |
| T17 | Moi / l'expert : Par secteur / Par position | Expert | Par secteur | niveau de détail | 10 | 2 (oui) | pas d'avis |

## 4. Onboarding (profil neuf) : valeur par défaut, question différable
Taps avant/après des étapes Modules, Activités, Confirme le code, téléphone, nom : déjà dans le 8e passage, non répétés.

| Question posée | Défaut raisonnable ? | Peut être posée plus tard ou déduite ? |
|---|---|---|
| Prénom | non (identité) | non |
| Nom de famille | non (unicité du couple, recherche) | non |
| Téléphone | non | oui (déjà en case) |
| Courriel | non | non (avis légaux) |
| Code + confirmation | non | non |
| Case conditions + 16 ans | non (légal) | non |
| Utilisation commerciale (facultatif) | **oui : éteint** | oui : seulement en Réglages (consentement refusé par défaut) ; légal, réservé |
| Être trouvable à la connexion (facultatif) | **oui : éteint** | idem |
| Choix des modules | oui (Chrono + Feuille de route, Communauté éteinte) | oui (déjà en case) |
| Première activité | non | oui (déjà en case) |
| Langue | oui : `fr`, jamais demandée | déduire de `navigator.language` à la création (aucun écran) |
| Mode IA (Autonome / Partiel / Absent) | **non : pop-up obligatoire à la 1re tâche** | oui : défaut « Partiel » (l'IA propose, l'utilisateur valide, conforme à la règle produit), changeable en Réglages › Mon IA |
| Info IA (« J'ai compris », 1re ouverture de la Feuille de route) | oui (fermer vaut accusé) | non (légal, informatif, sans blocage) |
| Autorisation des notifications | oui : demandée seulement au geste « Notifications » | déjà différée |
| Invite marketing (J'accepte / Non merci) | n'apparaît que pour les comptes sans réponse (anciens) | sans objet pour un profil neuf |

## 5. Garde Échap / clic hors fenêtre (vérification du 20 oct.)
Playwright 390 px, trois fenêtres avec saisie :
- **Réglages** (message d'aide, prénom) : Échap masque le panneau, les champs sont conservés à la réouverture ; envoi du message en cours + Échap : la requête part et le résultat s'affiche. Aucune perte.
- **Stratégie** (champ « But ») : Échap enregistre avant de fermer (`close()` sauve) ; réouverture : valeur conservée. Aucune perte.
- **Modifier la tâche** (`.goalTaskEditModal`, retirée du DOM à la fermeture) : une saisie non enregistrée **était perdue** à Échap, et un envoi en cours masquait l'éventuelle erreur. Garde ajoutée dans `public/js/a11y-popups.js` : Échap ne ferme pas une fenêtre `.goalTaskEditModal` / `.reportOverlay` où un champ a été saisi ou dont le bouton principal est en envoi ; la croix ✕ reste le geste volontaire. Aucun élément visible ajouté ; Échap sans saisie ferme comme avant. Test : `test/interactions-test.js` (présence de la garde) et Playwright (saisie + Échap : reste ouverte ; croix : ferme ; sans saisie + Échap : ferme ; envoi en cours + Échap : reste ouverte jusqu'au succès).
- Clic hors fenêtre ajouté au cycle précédent (retrait de pôle/secteur, déplacement, confirmation) : ces fenêtres ne contiennent que des choix (boutons, listes), aucun texte saisi à perdre.
