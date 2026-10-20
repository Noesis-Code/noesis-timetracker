# Questions pour Émilien — Simplification (audits Stats, Communauté, Feuille de temps, Écrans, 20 oct. 2026)

Pour chaque ligne : cocher **retirer**, **garder** ou **déplacer**. Détails : `audit-stats-…`, `audit-feuille-de-temps-…`, `audit-communaute-…`, `benchmark-temps-…` (tous du 20 oct.).

## Feuille de temps
- [ ] Titre « Feuille de temps » (2 lignes à 390 px) : retirer / garder / raccourcir (« Semaine »)
- [ ] Libellé de période : en faire le bouton qui ouvre le menu Semaine/Mois/Année (supprime le ⋮) : retirer le ⋮ / garder
- [ ] Filtre « Tous ▾ » Public/Confidentiel (ajout du 6 oct.) : retirer / garder / déplacer dans le ⋮ de la Feuille de temps
- [ ] Trois copies du bloc Feuille de temps (Stats, fenêtre d'un secteur, Activité) : garder / retirer la copie du secteur

## Stats
- [ ] Libellé de période sous « Répartition » (doublon de la Feuille de temps) : retirer / garder
- [ ] Légende du Graphique (doublon de celle de la Répartition) : retirer / garder
- [ ] Graphique : courbes par activité en plus du Total : garder / ne garder que Total
- [ ] Pages 2 et 3 (Tâches / Objectifs) : fusionner en une page avec bascule / garder deux pages
- [ ] Bouton « Ajouter une information » (pages 2-3) : retirer / garder
- [ ] Une seule visualisation par écran Stats (Feuille de temps, Répartition, Graphique en pages) : garder le défilement actuel / déplacer en pages

## Communauté
- [ ] Bouton « Rechercher » : retirer (touche Entrée) / garder
- [ ] Filtres « je cherche… » de la découverte : retirer / garder
- [ ] Rangée d'avatars de découverte sous la recherche : retirer / garder / déplacer (visible seulement pendant la recherche)
- [ ] Commentaires périmés sur `liveFeed` dans `index.html`/`app.js` : retirer (sans effet visible) / garder

## Coquille (déjà signalée à l'audit Chrono)
- [ ] Pastille orange sur « Feuille de route » : passer en violet / retirer / garder

## Benchmark
- Benchmark Toggl, Clockify, Harvest (web refusé) : fusionné avec Trade Q8 (une seule case : session avec accès web, `questions-emilien-trade.md`).

## Réglages, Profil, Objectifs, Activité (audit `audit-ecrans-…`, 20 oct.)
- [ ] Orange hors suppression (bouton « Déconnexion », bandeaux « Plafond atteint / Non réalisées », pastilles d'activité) : passer en violet / retirer / garder
- [ ] Carte Expansion (« À VENIR… Découvrir Expansion · J'ai un code ») au-dessus de la zone de capture : déplacer sous « Historique » / déplacer en Réglages / garder
- [ ] Page 2 Tâches : deux bandeaux d'alerte + carte « Avancement quotidien » avant les tâches : garder tout / un seul bandeau / retirer la carte « Avancement quotidien »
- [ ] Fenêtre Activité : bascule « Catégories / Statistiques » (doublon de l'onglet Stats) : retirer / garder
- [ ] Profil : zone « Écrire aux membres » (écrire, sondage, pièce jointe) : retirer (écrire = Communauté) / garder
- [ ] Réglages › Partage : « Partager l'app » + « Partager mon profil » + QR : un seul bouton sans QR / garder
- [ ] Réglages › Mon IA : bouton « Détails » de « Connecter mon IA » : retirer / garder
- [ ] Réglages › Sécurité : « Se déconnecter de tous les appareils » (en plus de « Déconnexion ») : retirer / garder


## Routes dormantes (4e passage code mort)
- [ ] `routes/offerforms.js` (`/activities/:id/forms`, `/profile-form`) : aucun appelant client, flux Offre 1 « formulaires » dormant ; l'Offre 1 lit pourtant ces données : retirer les routes / garder

## 6e passage : traduction EN du module « Ajouter des tâches > document »
`objectifs-document-taches.js` n'a aucune traduction EN (~60 phrases restent en français). Le corriger ajoute un mécanisme de traduction au module. Veux-tu qu'on le traduise (oui/non) ? Voir aussi les 4 clés EN en conflit (`Valider`, `Atteint`, `En cours`, `En retard`) dans `code-mort-2026-10-20.md`.

## 8e passage : simplicité vue par l'utilisateur (20 oct.)

### Première minute d'un profil neuf (Playwright 390 px, mesuré)
Profil neuf, app installée → premier chrono : **4 écrans** (Création, Modules, Activités, Chrono), **13 taps** (6 pour poser le curseur dans un champ d'identité + 1 pour le nom d'activité, 6 d'action), **8 champs/interrupteurs** (6 champs, 1 case obligatoire, 2 interrupteurs facultatifs laissés éteints). Rien d'illisible ni hors écran. Le consentement légal (case conditions/16 ans) et les deux consentements facultatifs restent intacts dans toutes les propositions.
- [ ] Étape « Choisis ce dont tu as besoin » (modules) : la sauter en gardant le choix par défaut (Chrono + Feuille de route), changeable en Réglages > Modules : 13 → 12 taps, 4 → 3 écrans
- [ ] Étape « Crée tes activités » : quitter l'étape dès la première activité ajoutée (sans taper « Continuer ») : 13 → 12 taps ; ou la sauter (le Chrono vide dit déjà « ajoutes-en une dans Activité ») : 13 → 10 taps mais le premier chrono demande alors d'aller créer l'activité plus tard
- [ ] Création : curseur posé d'emblée dans « Prénom » et touche « Suivant » du clavier de champ en champ (même écran, aucun élément nouveau) : 13 → 8 taps ; même chose pour le nom de la première activité : 8 → 7
- [ ] Création : « Confirme le code » (2e saisie du code) : retirer / garder. Gain 2 taps (13 → 11), mais risque de faute de frappe qui verrouille le compte (le code est la seule voie de récupération) : à garder sauf avis contraire
- [ ] Création : téléphone obligatoire (le courriel l'est déjà) : le rendre facultatif / garder. Gain 1 champ et 1 tap (13 → 12). Choix d'avril 2026 pour la recherche de profil et le partage de contact ; ce n'est pas un consentement légal
- [ ] Création : deux champs « Prénom » et « Nom de famille » : un seul champ « Nom » / garder. Gain 1 tap ; demande de changer le stockage (nom + nom de famille séparés partout) : à garder

### Textes à l'écran
- Libellés > 40 caractères relevés (hors textes légaux) : « Autoriser mes abonnés à me contacter par email / par téléphone » (46-50), « Déjà casée dans le planning hebdomadaire Objectifs » (50), « Calculé par Noèsis d'après les tâches réalisées » (47), « Replie les projets pour pouvoir les réordonner » (46), « Afficher/masquer les jours de cette semaine » (43), « Gouvernance des renseignements personnels » (41, titre légal). Aucun n'est tronqué à 390 px ; raccourcir ne change aucune fonction.
- [ ] Raccourcir ces libellés (ex. « Contact par email », « Déjà planifiée », « Calculé d'après tes tâches ») : oui / non
- Doublons de sens : « Être trouvable à la connexion » (création) et « Être trouvable dans la recherche de l'écran de connexion » (Réglages) ; « Aucune activité ajoutée pour l'instant. » (onboarding) et « Aucune activité pour l'instant — ajoutes-en une dans Activité. » (Chrono) ; « Déconnexion » et « Se déconnecter de tous les appareils » (déjà en case plus haut).
- [ ] Un seul libellé « Être trouvable à la connexion » aux deux endroits : oui / non
- Corrigé sans nouvel écran : un message technique brut pouvait s'afficher à l'utilisateur (« Anthropic a refusé l'appel (HTTP 529) : … » dans le résultat d'une tâche non ajoutée par l'IA ; message d'erreur interne sur 3 routes du calendrier). Il devient « Erreur serveur » / « Server error » (`server/lib/usermessage.js`, test `test/messages-clairs-test.js`). Côté client, « Failed to fetch » / « Load failed » étaient déjà remplacés par « Connexion impossible. Réessaie. ».
- Laissé tel quel : « Module inconnu : <id> » (`lib/modules.js`), jamais atteignable depuis l'interface (identifiants fixes).

### Routes serveur sans appelant dans l'interface (preuve : aucune occurrence du chemin, même construit par concaténation/gabarit, dans `public/`, repérage par script sur les 231 routes de `server/routes/`)
Hors liste, vivantes : routes appelées par chemin construit (`change-proposals/*`, `goals/overload|unfinished|realism|recalc`), webhooks externes (`/stripe/webhook`, `/webhooks/resend-inbound`), retour OAuth (`/drive/callback`), page du lien de courriel (`/offer/parental-consent/:token`), `/mcp`.
- [ ] `POST /import/history` (import CSV de l'ancienne feuille Google ; usage unique, décrit en tête de `routes/import.js`, aucun test, aucun script) : retirer / garder
- [ ] `POST /offer/portal` (portail de facturation Stripe ; testé côté serveur, aucun bouton ne l'appelle ; lié au paiement) : retirer / garder (réservé à Émilien : paiement)
- [ ] `DELETE /profile/:id/ai-examples` (remise à zéro de l'apprentissage du classement IA ; « sans écran » par décision, testé) : retirer / garder
- [ ] `GET /push/status` (état de l'abonnement aux notifications ; seulement dans `test/modules-gating-test.js`) : retirer / garder
- [ ] `routes/offerforms.js` (4 routes `/activities/:id/forms`, `/profile-form`) : voir case plus haut

## 9e passage : inventaire des options et réglages (20 oct.)
Tableau complet (63 options TimeTracker, 17 Trade, ≈ lignes de code, taps) : `inventaire-options-2026-10-20.md`. Rien n'est retiré ; une ligne par option, effet « avant → après ». Les options déjà en case plus haut, demandées par Émilien ou légales ne sont pas répétées. Coût à connaître pour la case « Partager » : le QR code coûte 2 320 lignes (librairie `qrcode.js`).

### TimeTracker
- [ ] Contact par courriel + par téléphone (Identité) : un seul interrupteur « Autoriser mes abonnés à me contacter » / garder deux. Avant : 2 interrupteurs ; après : 1 (les deux colonnes restent, écrites ensemble)
- [ ] Mode IA (Autonome / Partiel / Absent) : défaut « Partiel » sans pop-up à la première tâche, changeable en Réglages › Mon IA / garder le pop-up obligatoire. Avant : 1 pop-up et 1 tap à la 1re tâche ; après : 0
- [ ] Mon IA › case « Autoriser l'IA à cocher mes tâches et m'écrire » (cachée sous Détails) : retirer (IA toujours en lecture seule) / garder. Avant : 1 case + 2 phrases ; après : rien (l'adresse est en lecture seule)
- [ ] Calendrier › « Activités exportées » : un interrupteur par activité seulement, sans le niveau par pôle / garder. Avant : activité puis pôles dépliables ; après : activité seule
- [ ] Calendrier › « Règles de répartition » (mots du titre → max heures) : retirer (les heures occupées importées suffisent) / garder. Avant : règles à écrire (mots, heures, ajouter) ; après : aucune règle, ≈ 200 lignes en moins
- [ ] Graphique (Jour / Semaine / Mois) : granularité déduite de la période de la Feuille de temps (Semaine → jours, Mois → semaines, Année → mois) / garder les 2 menus ⋮. Avant : 2 menus ⋮ par écran de stats (10 au total) ; après : 1 (5 menus en moins)
- [ ] Tâche récurrente : retirer le bouton « Arrêter la récurrence » (le menu « Ne se répète pas » fait la même chose) / garder. Avant : 2 chemins ; après : 1
- [ ] Projet du Profil : nom + description seulement, sans « + Ajouter des détails » (lien externe, date de début) / garder. Avant : 4 champs dont 2 cachés ; après : 2

### Trade Tracker
- [ ] Langue de Trade : reprendre celle de TimeTracker (transmise dans le lien), retirer le choix FR/EN de Trade / garder. Avant : deux choix de langue indépendants ; après : un seul (celui de TimeTracker)
- [ ] Graphique Camembert / Barres (⋮ Répartition) : retirer (camembert + détail en barres toujours affichés) / garder. Avant : 1 groupe de 2 choix ; après : aucun
- [ ] « Masquer les petites positions » (< 1 %, < 2 %, < 5 %) : retirer (défaut « Non ») / garder. Avant : 4 choix ; après : aucun
- [ ] Filtre Gains / Pertes de Positions : retirer (le tri « Gain $ / Gain % » suffit) / garder. Avant : 3 puces ; après : aucune
- [ ] Sélecteur « Tous les secteurs » de Positions : retirer (la Répartition regroupe déjà par secteur) / garder. Avant : 1 sélecteur ; après : aucun

### Onboarding
- [ ] Langue : déduite du navigateur à la création (aucun écran, aucune question) / garder `fr` pour tous. Avant : un utilisateur anglophone démarre en français ; après : démarre dans sa langue
- [ ] Création : retirer les deux interrupteurs facultatifs (usage commercial, trouvable à la connexion) de l'écran, ils restent en Réglages › Sécurité, éteints par défaut / garder. Avant : 2 interrupteurs + « En savoir plus » à la création ; après : aucun (légal/Loi 25 : réservé à Émilien)

### Sans interface, à noter
- Colonnes sans lecteur ni écrivain : `users.chronoScrollClock` (horloge défilante) et `users.aiConfirmEach` (confirmation par tâche), deux options déjà refusées. Données inertes, à supprimer par Émilien si souhaité.
