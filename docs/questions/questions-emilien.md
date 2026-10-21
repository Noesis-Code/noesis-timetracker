# Questions pour Émilien (fichier unique, 21 oct. 2026)

Une case par décision. Cocher = oui ; ajouter une phrase si autre choix. Rien n'est tranché par un commit. Sections : décisions prioritaires, Expansion, Trade, Précision, Basic, Crédits (IA), Simplification, autres. Les propositions de simplification S1 à S15 sont dans `docs/simplifications/propositions.md`.

## Les 5 décisions qui débloquent le plus
- [ ] 1. Expansion en production : Q1 courriels, Q2 CGU « Offre 1 » -> « Expansion », Q3 remboursement, Q4 code gratuit (section Expansion)
- [ ] 2. Trade en production : Q4 service Railway, Q5 « validé », Q6 condition de lancement (section Trade)
- [ ] 3. Lancer les évaluations `--live` (~0,05 $, au plus ~0,15 $) : Précision h01-h60, regroupement des classements (sections Précision et Crédits)
- [ ] 4. Simplification : retirer/garder les ~30 lignes d'audit (section Simplification) et Trade Q7
- [ ] 5. Premier lancement : retirer modules, « Crée tes activités », confirmation du code (section Basic)

## Autres décisions (sans section propre)
- [ ] Healthcheck Railway : ajouter `"healthcheckPath": "/healthz"` et `healthcheckTimeout` dans `deploy` de `railway.json` (route prête, fichier non touché)
- [ ] Loi 25 : registre « Apprentissage du classement des tâches » (`docs/audits/apprentissage-usage.md`) et mention du masquage avant envoi à l'IA (section Crédits)
- [ ] Trade L1 à L5 : effacement, sauvegardes, export, texte légal (`docs/audits/loi25-trade-2026-10-20.md`)
- [ ] Retirer la notification « message d'activité » (`?notif=activity`) : elle ouvre la Page 2 de l'activité (Discussion retirée le 15 oct.) ; aucun message n'est plus envoyé sans écran pour en écrire (`docs/audits/notifications-liens-2026-10-20.md`)
- [ ] Pop-up de placement : liste « Où » en verre translucide (voulu le 5 oct.) ; la rendre opaque (`--float-bg`) ?
- [ ] Feuille de temps, vue Semaine : garder l'ouverture 1 h avant la première case remplie, ou revenir à 0 h ?
- [ ] Contrastes : 3 couleurs sous 4,5:1 (`docs/basic/contrastes-basic.md`)
- [ ] Rappel de 6 h (`docs/audits/fuseaux-serveur-2026-10-20.md`) : choisir UNE option
  - [ ] A. Statu quo : 6 h de Toronto pour tous (Paris reçoit à midi, Vancouver à 3 h)
  - [ ] B. Heure du serveur remplacée par le dernier fuseau vu du téléphone (`X-Client-Tz`) : 6 h locale partout, un champ de profil invisible ; limite : un voyage ou un téléphone muet décale le rappel d'un jour
  - [ ] C. Fuseau choisi dans le profil : 6 h locale fixe, mais un réglage de plus (refus par défaut)
- [ ] Benchmarks (Trade Q8, Simplification, temps) : session avec recherche web, ou accès à Sharesight/Delta/Toggl/Clockify/Harvest
- [ ] Supprimer ~1384 fichiers `/tmp/noesis-verify-*` (68 Mo) et les fichiers à la racine (`/o2.txt`, `/o3.txt`, `/o4.txt`, `/out.txt`, `/x`) : destructeur, à valider ; cause corrigée

## Expansion
Une case par ligne, par urgence. Q1 à Q4 bloquent ou conditionnent l'activation en production (voir `expansion-checklist-production-2026-10-20.md`). Fusions du 20 oct. : anciennes Q3, Q4, Q6 deviennent Q7 ; anciens courriels, Q9 et Q12 deviennent Q1 ; ancienne Q10 devient Q3, Q11 devient Q4, Q5 devient Q5, Q1 devient Q6, Q7 devient Q8, Q8 devient Q9.

### Bloque l'activation en production
- [ ] Q1 Courriels clients (communication, réservé) : valides-tu les textes `docs/expansion/expansion-courriels.md` (confirmation, fin), le rappel avant renouvellement (texte dans ce fichier plus bas) et un courriel « paiement à régulariser » (échec de paiement) ? Effet : `EXPANSION_MAILS=1` ne se pose qu'après ton accord ; sans, aucun courriel ne part et les relances viennent de Stripe seulement (à activer dans son tableau de bord).
- [ ] Q2 Légal (réservé) : remplacer « Offre 1 / Offer 1 » par « Expansion » dans les CGU et la politique de confidentialité (FR `public/index.html`, EN `public/legal-en.js`) ? Effet : sans ton accord, les textes légaux parlent de « Offre 1 » alors que l'achat dit « Expansion ».
- [ ] Q3 Remboursement ou litige (règle financière, réservée) : [ ] garder tel quel (recommandé) / [ ] couper l'accès au remboursement total / [ ] couper aussi au litige.
  Aujourd'hui : un client remboursé garde Expansion et son abonnement se renouvelle tant que tu ne le résilies pas ; tu reçois une alerte (partiel ou total, montant en CAD). Inchangé en attendant.
  Recommandation : garder, et résilier dans Stripe à l'alerte (l'accès se ferme seul, courriel de fin) ; « couper » sans résilier laisserait le client facturé, et un litige abusif priverait à tort.
- [ ] Q4 Code gratuit : valable pour tous les comptes, sans date d'expiration ni limite d'usage (révocation manuelle). [ ] garder / [ ] ajouter une expiration ou un nombre maximal d'utilisations (nouveau mécanisme). Effet : « garder » = un code diffusé reste utilisable jusqu'à retrait.

### Décisions de produit
- [x] Q15 (P1, repli 28) Résiliation : décidée par Émilien le 20 oct., bouton « Résilier mon abonnement » dans la carte Expansion, ouvre le portail Stripe. Fait ; reste à activer le portail dans Stripe (mode test) et à valider la capture 390 px.
- [ ] Q16 (P1, communication/légal, réservé) Courriel de confirmation : la phrase « résiliable depuis Réglages » (chemin inexistant) est retirée, il reste « Il se renouvelle chaque mois ». [ ] ok / [ ] ajouter une phrase de résiliation (contact ou portail) après Q15. Le rappel avant renouvellement (Q1) cite aussi « gestion de l'abonnement dans l'application » : à réécrire selon Q15.
- [ ] Q17 (légal, réservé) CGU art. 4.2 et 6 encore au futur (« n'existe pas encore », « prix envisagé ») : à mettre à jour avant `OFFER_CHECKOUT_OPEN=1` (avec Q2). Texte légal non modifié par Claude.
- [ ] Q5 (#578) Résiliation avec RDV : on passe par le portail Stripe (`docs/expansion/expansion-resiliation.md`), sans nouvel écran. Acceptable, ou case dans l'app ? Effet : « acceptable » = rien à construire.
- [ ] Q6 (#576) Staging utilise déjà des clés de test (aucun vrai paiement). Contourner Checkout sur staging, ou garder le parcours complet ? Effet : « garder » = rien à changer.
- [ ] Q7 (#575, #577, #906, #530, #551) FDR et « formule 1 » : génération automatique depuis le questionnaire (déclencheur : à l'envoi ou à la demande ? livrable ?), manque de l'abonnement actuel (20 $/mois par activité), formule = nouveau prix Stripe ou contenu livré (prix, contenus) ? Effet : débloque 5 tâches ; rien n'est codé d'ici là.
- [ ] Q8 (#849) Suivi post-achat : quels signaux (utilisation, résiliation, courriels) et où les voir ? Effet : sans réponse, aucun tableau de suivi n'est ajouté.
- [ ] Q9 (#570) Espace publicitaire dans l'app : à créer ? Contraire à `SIMPLIFICATION.md`. Effet : sans accord, refusé par défaut.
- [ ] Q11 Retour de Stripe : l'app affiche un message natif du navigateur (`alert`, `handleOffer1ReturnParams` dans `public/app.js`) : « Abonnement à Expansion activé. Merci ! » ou « Paiement annulé — aucun abonnement créé. » (FR/EN). [ ] garder / [ ] remplacer par un message intégré à l'app. Effet : « garder » = rien à changer ; « remplacer » = un message dans l'écran, sans nouveau bouton. Pas de changement fait.
- [ ] Q12 Vocabulaire FR (parcours client du 23, vérifié en 390 px FR/EN) : le titre de la fenêtre d'achat dit « Souscrire à Expansion » alors que tout le reste dit « abonnement / abonné / t'abonner » (EN : toujours « Subscribe / subscription »). [ ] garder « Souscrire » / [ ] « S'abonner à Expansion » (une clé i18n, `public/index.html` + `public/i18n.js`). Effet : un seul mot par concept.
- [ ] Q13 (partiellement traité le 20 oct. : la résiliation programmée s'affiche maintenant dans la ligne d'abonnement existante, « <activité> — résiliation programmée le <date> », sans nouvel élément ; reste la question du texte promotionnel et du bouton « Découvrir Expansion » après abonnement) Carte Expansion déjà abonné : la carte garde le texte promotionnel (« Génère automatiquement… en passant à Expansion ») et le bouton « Découvrir Expansion » après un abonnement actif, et une résiliation programmée (fin de période) ne se voit nulle part (même ligne qu'un abonnement actif). [ ] garder / [ ] adapter (nouveau texte de carte). Effet : « garder » = rien à changer.
- [ ] Q14 Plan livré par la reprise horaire (le webhook a échoué, le balayage livre ensuite) : aujourd'hui aucun courriel de confirmation. [ ] envoyer (recommandé) / [ ] ne pas envoyer.
  Recommandation : envoyer, une seule fois par activité et seulement si EXPANSION_MAILS=1 (le courriel est le reçu d'accès de quelqu'un qui a payé).
  Effet : changer la règle du test du balayage et poser un drapeau « confirmation envoyée » par activité ; rien n'est codé d'ici là.

### Accès
- [ ] Q10 Le MCP TiMeTracker (`lister_taches`) n'était pas branché dans les sessions de repli : relire les tâches du secteur « Expansion » depuis une session où il l'est.

### Texte du rappel avant renouvellement (Q1)
« Objet : Votre abonnement Expansion se renouvelle bientôt. Bonjour, votre abonnement Expansion pour « {activité} » se renouvelle le {date} pour 20 $. Rien à faire pour le conserver. Pour le modifier ou le résilier, ouvrez la gestion de l'abonnement dans l'application. L'équipe Noèsis. » (désactivé par défaut).

## Trade Tracker
Une réponse ferme suffit ; chaque case débloque la tâche citée (`etat-taches-trade-2026-10-20.md`).

- [ ] **Q1** « Temps réel » : mesuré (`trade-delais-2026-10-20.md`) : un changement de prix chez le fournisseur apparaît à l'écran en 8 min en moyenne, 15 min au plus (synchro serveur 15 min EN SÉANCE (1 par heure hors séance : alors le prix affiché peut avoir jusqu'à 1 h, avec son âge) + écran relu toutes les 30 s ; la synchro domine). Quel délai attends-tu ? Cocher : [ ] 15 min convient (rien à changer ; les tâches « synchronisation temps réel » et « optimiser le rafraîchissement » se ferment) [ ] 1 min [ ] 30 s [ ] autre : ___ (moins de 15 min = réglage de l'intervalle EN SÉANCE seulement — lun-ven 9 h 30-16 h heure de l'Est ; hors séance et jours fériés non gérés, la synchro reste à 1 par heure ; coût par utilisateur à 3 comptes : 15 min ≈ 2 700 appels Questrade / semaine, 1 min ≈ 20 900 (pointe 600 / h), 30 s ≈ 40 400 (pointe 1 200 / h, dépasse les limites probables sans flux continu = nouveau mécanisme) ; détail et limites à vérifier : `trade-delais-2026-10-20.md`) — tâches bloquées : Implémenter la synchronisation temps réel ; Optimiser les performances de rafraîchissement — champ manquant : 3
- [ ] **Q2** « Lien privé » : le lien signé TimeTracker -> Trade (2 min, usage unique) et le code d'invitation client (7 jours) existent déjà et sont testés. C'est bien ça ? (oui = fermer la tâche après un essai sur staging / non = décrire ce qui manque) — tâche bloquée : Créer le système de génération de lien privé — champ manquant : 3
- [x] **Q3** (RÉPONDU 20 oct. : non, tous les filtres de Positions restent) Filtres/options de visualisation : lesquels garder sur l'écran Positions ? Cocher : [ ] comptes [ ] 1 tri (valeur) [ ] tris gain [ ] filtre Gains/Pertes [ ] secteur [ ] montants valeur/% [ ] camembert/barres [ ] masquer petites positions. (Par défaut proposé : comptes + tri par valeur seulement, le reste retiré.) — tâche bloquée : mise en place des filtres de visualisation — champ manquant : 3
- [x] **Q4** (RÉPONDU 20 oct. : oui mais URL du service Railway Trade encore inconnue, en recherche) Déploiement staging : le service Railway Trade existe-t-il déjà ? (oui = donner l'URL / non = tu le crées avec DEPLOY.md, les agents préparent seulement) — tâche bloquée : Déployer l'extension en staging — champ manquant : 3
- [x] **Q5** (RÉPONDU 20 oct. : non : on compare TOUT avec le portefeuille de l'expert) Portefeuille de l'expert : « validé » = quels chiffres comparés (valeur totale, encaisse, positions, gain par compte) et quelle tolérance ? (proposé : les 4, écart <= 0,5 %) — tâche bloquée : Valider avec le portefeuille réel de l'expert — champ manquant : 3-4
- [ ] **Q6** Production : date ou condition de lancement ? (proposé : seulement après Q4 et Q5 faits et la check-list de l'état des tâches cochée) — tâche bloquée : Mettre en production (réservée à Émilien) — champ manquant : 3
- [x] **Q7** (RÉPONDU 20 oct. : oui : fait (répartition et « À surveiller » retirés de l'Accueil, onglet Synchro rangé dans la pastille)) Écran Trade : d'accord pour étudier les retraits de `audit-trade-2026-10-20.md` (Accueil : retirer répartition, doublon meilleures/à surveiller ; onglet Synchro rangé dans la pastille) ? (oui / non / seulement certains numéros : ___) — tâche bloquée : retraits Trade — champ manquant : 3
- [ ] **Q8** Benchmark Sharesight/Delta : autoriser l'accès web à ces domaines pour les agents, ou le faire dans une session avec recherche web ? (vaut aussi pour le benchmark Toggl, Clockify, Harvest) — tâche bloquée : Benchmark Trade — champ manquant : 1
- [x] **Q9** (RÉPONDU 20 oct. : non, aucune ligne ajoutée) Gain réalisé : l'afficher à l'écran ? `calc.realizedSummary` existe (testé) mais n'est branché nulle part. (oui = une ligne « Gain réalisé » s'ajoute sur la carte du portefeuille, converti au taux courant, avec les dividendes reçus / non = rien ne change, seul le gain non réalisé reste visible) — tâche bloquée : afficher le gain réalisé — champ manquant : 3
- [ ] **Q10** Import du Sheet, deux lignes strictement identiques (même compte, date, type, symbole, quantité, prix) dans le même fichier sans colonne id : (a) les garder toutes les deux et les signaler dans le compte rendu d'import (appliqué pour l'instant : deux achats identiques le même jour sont légitimes) / (b) n'en garder qu'une / (c) demander à chaque fois. Le réimport, lui, ne double plus jamais rien, même fichier réordonné. — champ manquant : 3
- [ ] **Q11** Lien signé émis juste avant le retrait de Trade (« + » retiré dans l'activité) : il reste valable 2 min, une seule fois (analyse dans `trade-integration-2026-10-20.md`, « Risque du lien de dernière minute »). Cocher : [ ] accepter la limite de 2 min (recommandé : aucune donnée en jeu pour un tiers, lien lié au compte et au navigateur, MFA exigé ensuite) [ ] ajouter un rappel Trade -> TMT à l'ouverture (nouveau mécanisme : Trade interroge TMT, dépendance réseau entre les deux services). Autre point lié, à cocher aussi : une session Trade déjà ouverte survit au retrait (inactivité 15 min, durée absolue 12 h) : [ ] accepter [ ] fermer les sessions Trade au retrait (nouvel appel TMT -> Trade, nouveau mécanisme) — tâche : intégration TMT-Trade — champ manquant : 3
- [ ] **Q12** Bouton Danger de Trade (cycle 17) : fond `--brique-stop` #C4483F (texte blanc lisible 4,8:1, un peu plus rouge) au lieu du fond `--brique` #C2694A d’avant (3,9:1, celui de TMT). Cocher : [ ] garder (Trade lisible, léger écart avec TMT) [ ] revenir à `--brique` (identique à TMT, texte moins lisible) — détail : `ecarts-design-trade-2026-10-20.md` n°4 — champ manquant : 3
- [x] **Q13** (RÉPONDU 20 oct. : oui, coût moyen pondéré, frais inclus) Gain réalisé : coût de revient. Appliqué (et épinglé par `portefeuilles-types-test.js`) : COÛT MOYEN pondéré, frais inclus. Exemple : 100 à 10 $ + 100 à 20 $, vente de 100 à 25 $ = gain 1 000 $ (coût moyen) ; en FIFO 1 500 $. Cocher : [ ] coût moyen (convention de Questrade et de l'impôt canadien : « coût moyen ajusté ») [ ] FIFO — tâche : calculs du gain réalisé — champ manquant : 3
- [ ] **Q14** Split d'action : l'affichage actuel (coût, valeur, gain non réalisé) lit la position du courtier, donc il est juste après un split. Le gain RÉALISÉ ne l'est pas (le split n'est pas une transaction ; `realizedSummary` n'est branché nulle part, donc aucun chiffre faux n'est montré). Ampleur mesurée (`portefeuilles-types-test.js`, P3) : achat de 100 à 25 $, split 2 pour 1, vente de 50 à 14 $ → gain affiché −550 $ au lieu de +75 $, soit un écart de 625 $ (25 % du coût de 2 500 $). Correction non faite : aucune source de split n'existe (le courtier rapporte seulement l'état final, l'activité « Other » est ignorée), il faut un type SPLIT lu chez Questrade. Proposition : lire les splits chez Questrade (quantité ×ratio, coût unitaire ÷ratio, coût total inchangé) avec Q9. Si Q9 = oui, prévoir de lire les splits chez Questrade (type SPLIT, mécanisme nouveau, lecture seule). Cocher : [ ] oui, le prévoir avec Q9 [ ] non, Q9 reste non — tâche : gain réalisé — champ manquant : 3
- [ ] **Q15** Verrou par adresse IP : le seuil d'échecs de code/lien par IP passe de 10 à 30 (repli 25). Raison : une IP partagée (NAT d'entreprise) était verrouillée pour tous dès 10 erreurs de frappe cumulées, donc personne ne pouvait se connecter. Le verrou PAR COMPTE reste à 5 échecs. Cocher : [ ] 30 convient [ ] revenir à 10 (plus strict, risque de blocage en bureau) — tâche : limites de débit (Trade n°18) — champ manquant : 3

## Précision des tâches
Cas réels de `test/fixtures/task-precision/cases.json` dont le bon résultat dépend d'une préférence. Cocher = oui ; ajouter une phrase si autre choix. Tant que rien n'est coché, le comportement actuel reste.

- [ ] « Horaire des serveurs de la semaine prochaine » (r15) : « horaire » = gestion du personnel (travail) plutôt que tâche personnelle ? Actuellement : Personnel/RH.
- [ ] « Payer loyer » (s01) : dans un restaurant, loyer du local (Comptabilité) ou loyer personnel ? Actuellement : incertain, la tâche reste à classer.
- [ ] « Envoyer la facture à Marie-Ève demain avant-midi » (r01) : « avant-midi » = 9 h ? (sans heure fixe, la tâche reste sur le jour seulement). Actuellement : jour seulement.
- [ ] « Payer l'abonnement Claude » (s21) : Crédits Claude et API (coût) ou Expansion (abonnements) ? Actuellement : incertain.
- [ ] « Penser au projet » (c45) : un titre à verbe flou et sans sujet précis doit rester « incertain » plutôt qu'être placé sur le premier secteur qui parle de projets ?

- [ ] Lancer l'évaluation réelle sur les 60 cas à l'aveugle h01-h60 (seule mesure fiable du taux réel). Commande : `ANTHROPIC_API_KEY=... node scripts/eval-task-precision.js --live --only=h`. Coût estimé : 60 cas, dont ~11 refusés sans appel (« à ignorer ») = ~49 appels de classement Haiku à ~0,0009 $ = environ 0,05 $ (au plus ~0,15 $ si le repli Sonnet, ~0,0027 $, est déclenché partout). Tarifs et modèles : `docs/ia/ia-appels.md`.

- [ ] Horaire fixe dans un titre généré par l'IA (aucun champ d'heure sur les tâches ; règle « une liste, jamais des créneaux fixes »). Cocher UNE option :
  - [ ] A. Retirer l'heure (actuel). « Réunion à 9 h » -> « Réunion » ; « Appeler Paul à 14 h 30 » -> « Appeler Paul » ; « Dentiste 10:30 » -> « Dentiste ». L'heure est perdue.
  - [ ] B. Garder en mention non contraignante. « Réunion à 9 h » -> « Réunion (vers 9 h) » ; « Appeler Paul à 14 h 30 » -> « Appeler Paul (vers 14 h 30) » ; « Dentiste 10:30 » -> « Dentiste (vers 10 h 30) ». Aucun créneau, l'information survit dans le titre.
  - [ ] C. Garder tel quel. « Réunion à 9 h » -> « Réunion à 9 h » (le titre de l'IA n'est pas touché ; l'heure reste lisible mais ressemble à un horaire fixe).
  Recommandation : B (rien de perdu, aucune heure contraignante). Non appliqué tant que rien n'est coché.

- [ ] Récurrence « chaque jour ouvrable » / « 3 fois par semaine » : l'app ne sait dire que « tous les N jours / semaines / mois ». Cocher UNE option :
  - [ ] A. Ignorer (actuel). Aucune proposition de récurrence ; la tâche est créée normalement, titre intact (« Courir 3 fois par semaine »), à refaire à la main.
  - [ ] B. Approcher par récurrence hebdomadaire. « 3 fois par semaine » -> proposition « chaque semaine » (à valider dans le pop-up) ; « jour ouvrable » -> « chaque jour » (inclut samedi et dimanche : faux). Le sens exact est perdu.
  - [ ] C. Ne rien faire de plus. Identique à A (aucune proposition), mais sans en parler dans les consignes de l'IA.
  Recommandation : A (une approximation fausse est pire qu'aucune proposition).


- [ ] « Fin de semaine » (et « week-end ») sans jour précis : quel jour proposer ? Seule une suggestion, modifiable. Cocher UNE option :
  - [ ] A. Samedi (actuel). « Magasiner pour la fin de semaine » -> samedi ; dimanche = le jour même.
  - [ ] B. Vendredi soir. « Faire l'épicerie pour la fin de semaine » -> vendredi (avant le début du week-end).
  - [ ] C. Dimanche. « Préparer la semaine d'ici la fin de semaine » -> dimanche (fin du week-end).
  Recommandation : A (aucune récurrence, un seul jour, l'utilisateur peut changer).

- [ ] « EOW » / « by EOW » (anglais, fin de semaine de travail) : quel jour proposer ? Seule une suggestion, échéance modifiable. Cocher UNE option :
  - [ ] A. Vendredi (fin de la semaine de travail). « Draft newsletter by EOW » -> échéance vendredi.
  - [ ] B. Dimanche (fin de la semaine civile lundi-dimanche).
  - [ ] C. Ignorer (actuel). Aucun indice de date, le titre reste intact.
  Recommandation : C tant que rien n'est coché (aucune date inventée).

## Basic
Classe B du tri (`tri-taches-basic-2026-10-20.md`). Cocher = oui ; ajouter une phrase si autre choix. Les plus utiles d'abord.

- [ ] Feuille de route : ajouter les vues jour / semaine / mois / année et n'afficher que la semaine en première page (#535-537, #1258, #1259, #1453) ? (ajoute de l'interface)
- [ ] Peux-tu coller la liste des 26 bugs de staging du 2 oct. et des correctifs en attente (#1299, #1307, #1308) ? Sans liste, rien n'est lancé.
- [ ] Responsable de tâche (#1455, #540) : un seul champ « responsable » dans la tâche, choisi parmi les membres de l'activité ?
- [ ] Simplification : retirer les écrans/options listés dans `docs/simplifications/propositions.md` et la section Simplification ci-dessous (#600, #2424-2433), et ne PAS ajouter thèmes, widgets, raccourcis, modules (#2436-2448) ?
- [ ] Liste d'objectifs avec les 3 prochaines tâches, couleurs réalisé/archive et bouton « besoin » dans le Chrono (#703, #704, #1507-1510) : à faire ?
- [ ] Communauté : zone de communication pour un contributeur, entre-aide et modération proactive (#753, #907, #1553, #1274, #1281) : à faire dans Basic ?
- [ ] Ajouter prise de RDV, phase découverte et animation du N (#581, #1476, #622, #1490, #1491, #613) : à faire dans Basic ?
- [ ] Effacer les valeurs nom de famille et téléphone déjà en base (#1256, #1268, #1289) : suppression irréversible, tu autorises (après sauvegarde) ?
- [ ] Entrée qui passe minuit (ex. dimanche 23 h → lundi 1 h) : attribuer aussi l'heure après minuit au lundi ? Aujourd'hui les 2 h comptent entièrement le dimanche (jour de départ) : le lundi semble avoir 1 h de moins et, si c'est un dimanche de fin de semaine, cette heure sort de la semaine suivante. Changer demande de découper l'entrée par jour dans stats, communauté et objectifs.
- [ ] Feuille de route hors ligne : mettre l'ajout d'une tâche en file d'attente, comme les autres captures ? Aujourd'hui, sans réseau, l'appui sur « Ajouter » affiche « Connexion impossible. Réessaie. » et garde le texte ; avec la file, la tâche reste en attente sur le téléphone, le texte est libéré, et elle est classée et ajoutée toute seule au retour du réseau (sans doublon).

### Premier lancement et récupération (`premier-lancement-2026-10-20.md`)

- [ ] Récupération de profil : aujourd'hui, si « Être trouvable à la connexion » est resté décoché (réglage par défaut), un utilisateur qui perd son téléphone ne retrouve pas son profil (« Aucun profil trouvé. »). Option : cocher cette case par défaut à la création (reste décochable) ? (touche au consentement Loi 25 : ta décision)
- [ ] Récupération, autre piste sans toucher au consentement : retrouver le profil par courriel + code (sans liste publique) ? (nouveau mécanisme, à préparer seulement si tu le demandes)
- [ ] Simplification du premier chrono (13 taps aujourd'hui, dont 6 champs) : retirer l'étape « Choix des modules » à la création (modules par défaut, réglables dans Réglages) ? (-1 écran, -1 tap)
- [ ] Retirer l'étape « Crée tes activités » de l'onboarding : créer une activité par défaut (le prénom du profil ou « Mon activité ») pour que le chrono soit démarrable dès l'arrivée ? (-3 taps)
- [ ] Demander seulement prénom, courriel et code à la création (nom de famille et téléphone plus tard, ou jamais) ? (-2 champs ; touche à l'identité complète exigée depuis le 29 août et à l'unicité prénom + nom)
- [ ] Retirer la confirmation du code à la création (« Confirme le code ») ? (-1 champ)
- [ ] Activité neuve sans pôle : à la première tâche, ouvrir directement l'écran « Cette activité n'a pas encore de pôle » au lieu d'afficher un message ? (ou créer un pôle par défaut « Général » ; contredit « aucun pôle par défaut »)
- [ ] « Créer mon profil » grisé sans explication : laisser tel quel, ou faire apparaître le message « Tu dois accepter… » au tap sur le bouton grisé ?

### Loi 25 : export, effacement, rappels (repli 24)

- [ ] Export de mes données : les fichiers joints aux discussions (images/PDF, 5 Mo max chacun) n'y sont pas. Choix : (a) ajouter seulement la liste (nom, type, taille, date : ~150 octets par fichier, aucune lourdeur) / (b) inclure les fichiers dans une archive (jusqu'à 5 Mo par fichier, l'export JSON seul devient une archive .zip : nouveau format de téléchargement) / (c) laisser tel quel. Recommandé : (a). Rien n'est fait sans ta réponse.
- [ ] Messages que j'ai écrits dans le fil d'une activité PARTAGÉE : à la suppression de mon compte ils sont effacés (les autres membres perdent ces lignes), alors que mes messages de sous-projet restent sous « Compte supprimé ». Choix : (a) effacer partout / (b) garder tous les messages de discussion avec l'auteur « Compte supprimé ». Aujourd'hui : (a) pour le fil d'activité. Recommandé : (a) (le plus protecteur de la vie privée), à écrire dans la politique.
- [ ] Rétention des sauvegardes et journal d'inactivité : voir les deux cases de `docs/audits/retention-effacement-2026-10-20.md`.
- [ ] Rappels et suggestions du matin (6 h) : ils suivent l'heure de Toronto pour tout le monde (aucun fuseau enregistré au profil) ; à Vancouver la suggestion arrive à 3 h, à Paris à midi. Les rappels de fin de période partent au premier balayage après minuit (Toronto), donc vers minuit. Choix : (a) laisser / (b) n'envoyer qu'entre 8 h et 21 h (heure de Toronto, sans nouveau réglage) / (c) mémoriser le fuseau du téléphone au profil (champ invisible, nouvelle colonne) et envoyer à 6 h / 8 h locales. Recommandé : (b) tout de suite, (c) ensuite.

## Crédits Claude et API
Regroupées par thème (20 oct. 2026). « Reco. » = recommandation de l'agent. Rapport hebdomadaire : `node scripts/ai-cost-report.js --semaine` (base) ou `--from export.json`. Projection : `node scripts/ai-cost-report.js --projection` (`docs/ia/ia-appels.md`).

### 1. Alertes de coût
Aujourd'hui les alertes (coût du jour tous comptes, plafond à 80 %, rapport hebdo) vont au journal serveur seulement, une fois par jour de Montréal. Le seuil global existe mais est FIXE (8 $/jour, 5 $/semaine) : franchi tous les jours vers 100 utilisateurs moyens, muet à 10 comptes intensifs (`docs/ia/ia-appels.md`).
- Décision d'Émilien (20 oct.) : NON au seuil quotidien de 0,50 $ x comptes (trop strict) ; coût limité PAR SEMAINE seulement.
  - [ ] Seuil hebdomadaire = 3,5 $ x comptes actifs (10 comptes : 35 $ ; 100 : 350 $), à la place de 5 $ fixes ? Calcul prêt et testé (`server/lib/aialertthreshold.js`, `scripts/ai-cost-report.js --semaine`), désactivé tant que `AI_ALERT_ADAPTIVE=1` n'est pas posé. Le seuil quotidien de 8 $ reste inchangé.
- Canal d'alerte, un seul à choisir. Reco. : push à ton compte (rien à configurer sauf une variable désignant ton compte).
  - [ ] Journal seulement (statu quo) : il faut lire les journaux Railway ; aucun bruit.
  - [ ] Notification push à ton compte : un message au premier dépassement du jour et par seuil ; demande de désigner ton compte par une variable d'environnement.
  - [ ] Courriel Resend : un courriel par dépassement ; demande `ALERT_EMAIL` et une clé Resend active en production.

### Décisions validées OUI (Émilien, 20 oct. 2026)
Délais d'expiration plus courts, relances 429/529, retrait des replis payants, réparation locale du JSON, tarifs (Haiku 1/5, Sonnet 3/15, Opus 15/75). Le disjoncteur de panne est documenté dans `docs/ia/ia-appels.md`.

### 2. Tarifs
`PRICES` dans `server/lib/aimodels.js` (mis à jour le 2026-10-16, non vérifiés en ligne). Le rapport avertit au-delà de 90 jours.
- [ ] Confirmer les tarifs ($ par million de jetons, entrée/sortie) : Haiku 1/5, Sonnet 3/15, Opus 15/75 ? Si faux, donner les bons chiffres. Reco. : confirmer (toute la projection en dépend).

### 3. Évaluations `--live` (toi seul peux les lancer : coût réel)
- [ ] Regrouper plusieurs classements de tâches en un seul appel IA (économie attendue, qualité à mesurer) ? Reco. : évaluer après le point suivant, gain modeste (le classement pèse ~15 % du coût).
- [ ] `eval-task-precision.js --live` pour décider de retirer le repli Sonnet du classement (Haiku seul) ? Reco. : oui, c'est la mesure qui débloque les deux.

### 4. Réduire l'entrée envoyée (qualité non mesurable hors `--live`)
- [ ] Rapprochement tâche -> objectif : plafond de candidats envoyés 60 -> 25 (pire cas 5236 -> ~2200 jetons ; avec les hypothèses de la projection, profil moyen 2,35 -> 2,12 $/mois, -10 % du total ; `docs/ia/ia-appels.md`) ? Risque : un objectif sans mot commun au-delà du 25e n'est plus proposé (le repli lexical reste). Reco. : oui, c'est la fonction qui pèse le plus.
- [ ] Troncature inter-secteurs (objectif du candidat 240 caractères, description 160 ; -56 % d'entrée au pire cas, `docs/ia/ia-appels.md`) : l'accepter ? Si non, retirer `cut(...)` dans `buildPayload` (`crosssectorinference.js`). Reco. : accepter (jamais d'identifiant coupé, vérifié).

### 5. Mesure et mémoire
- [ ] Conserver les réponses IA répétées (orthographe, classement) après un redémarrage, via une table de la base ? Reco. : non tant que la projection n'est pas confirmée en production (l'orthographe ne pèse que ~5 %).
- [ ] Enregistrer, sans le texte, si une reformulation proposée est utilisée (mesurer son utilité, la retirer si personne ne s'en sert) ? Reco. : oui, 1 compteur, aucune interface.

### 6. Loi 25 (registre des traitements, texte légal non modifié par l'agent)
- [ ] Ajouter au registre (et à la politique de confidentialité si utile) : « Les courriels, numéros de téléphone et numéros de carte/NAS probables écrits dans un texte libre sont masqués automatiquement avant tout envoi à l'IA » (`server/lib/aiscrub.js`) ? Reco. : oui.

### 7. Devises (20 oct. 2026, `docs/ia/ia-appels.md`)
- [ ] Oui / non : 1 CAD = 0,72 USD est-il le bon taux à retenir (estimation, non vérifiée) ? Sinon donner le taux ; à revérifier tous les 90 jours (`FX_UPDATED`, `server/lib/fx.js`).
- Plafonds IA : décision d'Émilien du 21 oct. 2026 = seulement 3,5 CAD par semaine et 15 CAD par mois et par compte (plus de plafond du jour ni par fonction).

### Information (rien à cocher)
Relance unique de la génération de tâches (`documenttasks.propose`) : au plus UN appel de plus quand toutes les tâches générées sont rejetées, sans créneau horaire de plus, après vérification du budget par compte ; les plafonds en dollars (semaine, mois) bornent le total relances comprises (`test/precision-repli-test.js`).

## Simplification
Pour chaque ligne : cocher **retirer**, **garder** ou **déplacer**. Détails : `audit-stats-…`, `audit-feuille-de-temps-…`, `audit-communaute-…`, `benchmark-temps-…` (tous du 20 oct., dans `docs/audits/`). Les propositions S1 à S15 sont dans `docs/simplifications/propositions.md`.

### Feuille de temps
- [ ] Titre « Feuille de temps » (2 lignes à 390 px) : retirer / garder / raccourcir (« Semaine »)
- [ ] Libellé de période : en faire le bouton qui ouvre le menu Semaine/Mois/Année (supprime le ⋮) : retirer le ⋮ / garder
- [ ] Filtre « Tous ▾ » Public/Confidentiel (ajout du 6 oct.) : retirer / garder / déplacer dans le ⋮ de la Feuille de temps
- [ ] Trois copies du bloc Feuille de temps (Stats, fenêtre d'un secteur, Activité) : garder / retirer la copie du secteur

### Stats
- [ ] Libellé de période sous « Répartition » (doublon de la Feuille de temps) : retirer / garder
- [ ] Légende du Graphique (doublon de celle de la Répartition) : retirer / garder
- [ ] Graphique : courbes par activité en plus du Total : garder / ne garder que Total
- [ ] Pages 2 et 3 (Tâches / Objectifs) : fusionner en une page avec bascule / garder deux pages
- [ ] Bouton « Ajouter une information » (pages 2-3) : retirer / garder
- [ ] Une seule visualisation par écran Stats (Feuille de temps, Répartition, Graphique en pages) : garder le défilement actuel / déplacer en pages

### Communauté
- [ ] Bouton « Rechercher » : retirer (touche Entrée) / garder
- [ ] Filtres « je cherche… » de la découverte : retirer / garder
- [ ] Rangée d'avatars de découverte sous la recherche : retirer / garder / déplacer (visible seulement pendant la recherche)

### Coquille (déjà signalée à l'audit Chrono)
- [ ] Pastille orange sur « Feuille de route » : passer en violet / retirer / garder

### Benchmark
- Benchmark Toggl, Clockify, Harvest (web refusé) : fusionné avec Trade Q8 (une seule case : session avec accès web, la section Trade ci-dessous).

### Réglages, Profil, Objectifs, Activité (audit `audit-ecrans-…`, 20 oct.)
- [ ] Orange hors suppression (bouton « Déconnexion », bandeaux « Plafond atteint / Non réalisées », pastilles d'activité) : passer en violet / retirer / garder
- [ ] Carte Expansion (« À VENIR… Découvrir Expansion · J'ai un code ») au-dessus de la zone de capture : déplacer sous « Historique » / déplacer en Réglages / garder
- [ ] Page 2 Tâches : deux bandeaux d'alerte + carte « Avancement quotidien » avant les tâches : garder tout / un seul bandeau / retirer la carte « Avancement quotidien »
- [ ] Fenêtre Activité : bascule « Catégories / Statistiques » (doublon de l'onglet Stats) : retirer / garder
- [ ] Profil : zone « Écrire aux membres » (écrire, sondage, pièce jointe) : retirer (écrire = Communauté) / garder
- [ ] Réglages › Partage : « Partager l'app » + « Partager mon profil » + QR : un seul bouton sans QR / garder
- [ ] Réglages › Mon IA : bouton « Détails » de « Connecter mon IA » : retirer / garder
- [ ] Réglages › Sécurité : « Se déconnecter de tous les appareils » (en plus de « Déconnexion ») : retirer / garder


### Routes dormantes (4e passage code mort)
- [ ] `routes/offerforms.js` (`/activities/:id/forms`, `/profile-form`) : aucun appelant client, flux Offre 1 « formulaires » dormant ; l'Offre 1 lit pourtant ces données : retirer les routes / garder

### 6e passage : traduction EN du module « Ajouter des tâches > document »
`objectifs-document-taches.js` n'a aucune traduction EN (~60 phrases restent en français). Le corriger ajoute un mécanisme de traduction au module. Veux-tu qu'on le traduise (oui/non) ? Voir aussi les 4 clés EN en conflit (`Valider`, `Atteint`, `En cours`, `En retard`) (ancien audit code mort, retiré).

### 8e passage : simplicité vue par l'utilisateur (20 oct.)

#### Première minute d'un profil neuf (Playwright 390 px, mesuré)
Profil neuf, app installée → premier chrono : **4 écrans** (Création, Modules, Activités, Chrono), **13 taps** (6 pour poser le curseur dans un champ d'identité + 1 pour le nom d'activité, 6 d'action), **8 champs/interrupteurs** (6 champs, 1 case obligatoire, 2 interrupteurs facultatifs laissés éteints). Rien d'illisible ni hors écran. Le consentement légal (case conditions/16 ans) et les deux consentements facultatifs restent intacts dans toutes les propositions.
- [ ] Étape « Choisis ce dont tu as besoin » (modules) : la sauter en gardant le choix par défaut (Chrono + Feuille de route), changeable en Réglages > Modules : 13 → 12 taps, 4 → 3 écrans
- [ ] Étape « Crée tes activités » : quitter l'étape dès la première activité ajoutée (sans taper « Continuer ») : 13 → 12 taps ; ou la sauter (le Chrono vide dit déjà « ajoutes-en une dans Activité ») : 13 → 10 taps mais le premier chrono demande alors d'aller créer l'activité plus tard
- [ ] Création : curseur posé d'emblée dans « Prénom » et touche « Suivant » du clavier de champ en champ (même écran, aucun élément nouveau) : 13 → 8 taps ; même chose pour le nom de la première activité : 8 → 7
- [ ] Création : « Confirme le code » (2e saisie du code) : retirer / garder. Gain 2 taps (13 → 11), mais risque de faute de frappe qui verrouille le compte (le code est la seule voie de récupération) : à garder sauf avis contraire
- [ ] Création : téléphone obligatoire (le courriel l'est déjà) : le rendre facultatif / garder. Gain 1 champ et 1 tap (13 → 12). Choix d'avril 2026 pour la recherche de profil et le partage de contact ; ce n'est pas un consentement légal
- [ ] Création : deux champs « Prénom » et « Nom de famille » : un seul champ « Nom » / garder. Gain 1 tap ; demande de changer le stockage (nom + nom de famille séparés partout) : à garder

#### Textes à l'écran
- Libellés > 40 caractères relevés (hors textes légaux) : « Autoriser mes abonnés à me contacter par email / par téléphone » (46-50), « Déjà casée dans le planning hebdomadaire Objectifs » (50), « Calculé par Noèsis d'après les tâches réalisées » (47), « Replie les projets pour pouvoir les réordonner » (46), « Afficher/masquer les jours de cette semaine » (43), « Gouvernance des renseignements personnels » (41, titre légal). Aucun n'est tronqué à 390 px ; raccourcir ne change aucune fonction.
- [ ] Raccourcir ces libellés (ex. « Contact par email », « Déjà planifiée », « Calculé d'après tes tâches ») : oui / non
- Doublons de sens : « Être trouvable à la connexion » (création) et « Être trouvable dans la recherche de l'écran de connexion » (Réglages) ; « Aucune activité ajoutée pour l'instant. » (onboarding) et « Aucune activité pour l'instant — ajoutes-en une dans Activité. » (Chrono) ; « Déconnexion » et « Se déconnecter de tous les appareils » (déjà en case plus haut).
- [ ] Un seul libellé « Être trouvable à la connexion » aux deux endroits : oui / non
- Corrigé sans nouvel écran : un message technique brut pouvait s'afficher à l'utilisateur (« Anthropic a refusé l'appel (HTTP 529) : … » dans le résultat d'une tâche non ajoutée par l'IA ; message d'erreur interne sur 3 routes du calendrier). Il devient « Erreur serveur » / « Server error » (`server/lib/usermessage.js`, test `test/messages-clairs-test.js`). Côté client, « Failed to fetch » / « Load failed » étaient déjà remplacés par « Connexion impossible. Réessaie. ».
- Laissé tel quel : « Module inconnu : <id> » (`lib/modules.js`), jamais atteignable depuis l'interface (identifiants fixes).

#### Routes serveur sans appelant dans l'interface (preuve : aucune occurrence du chemin, même construit par concaténation/gabarit, dans `public/`, repérage par script sur les 231 routes de `server/routes/`)
Hors liste, vivantes : routes appelées par chemin construit (`change-proposals/*`, `goals/overload|unfinished|realism|recalc`), webhooks externes (`/stripe/webhook`, `/webhooks/resend-inbound`), retour OAuth (`/drive/callback`), page du lien de courriel (`/offer/parental-consent/:token`), `/mcp`.
- [ ] `POST /import/history` (import CSV de l'ancienne feuille Google ; usage unique, décrit en tête de `routes/import.js`, aucun test, aucun script) : retirer / garder
- [ ] `POST /offer/portal` (portail de facturation Stripe ; testé côté serveur, aucun bouton ne l'appelle ; lié au paiement) : retirer / garder (réservé à Émilien : paiement)
- [ ] `DELETE /profile/:id/ai-examples` (remise à zéro de l'apprentissage du classement IA ; « sans écran » par décision, testé) : retirer / garder
- [ ] `GET /push/status` (état de l'abonnement aux notifications ; seulement dans `test/modules-gating-test.js`) : retirer / garder
- [ ] `routes/offerforms.js` (4 routes `/activities/:id/forms`, `/profile-form`) : voir case plus haut

### 9e passage : inventaire des options et réglages (20 oct.)
Inventaire retiré (S15, 21 oct. 2026). Rien n'est retiré ; une ligne par option, effet « avant → après ». Les options déjà en case plus haut, demandées par Émilien ou légales ne sont pas répétées. Coût à connaître pour la case « Partager » : le QR code coûte 2 320 lignes (librairie `qrcode.js`).

#### TimeTracker
- [ ] Contact par courriel + par téléphone (Identité) : un seul interrupteur « Autoriser mes abonnés à me contacter » / garder deux. Avant : 2 interrupteurs ; après : 1 (les deux colonnes restent, écrites ensemble)
- [ ] Mode IA (Autonome / Partiel / Absent) : défaut « Partiel » sans pop-up à la première tâche, changeable en Réglages › Mon IA / garder le pop-up obligatoire. Avant : 1 pop-up et 1 tap à la 1re tâche ; après : 0
- [ ] Mon IA › case « Autoriser l'IA à cocher mes tâches et m'écrire » (cachée sous Détails) : retirer (IA toujours en lecture seule) / garder. Avant : 1 case + 2 phrases ; après : rien (l'adresse est en lecture seule)
- [ ] Calendrier › « Activités exportées » : un interrupteur par activité seulement, sans le niveau par pôle / garder. Avant : activité puis pôles dépliables ; après : activité seule
- [ ] Calendrier › « Règles de répartition » (mots du titre → max heures) : retirer (les heures occupées importées suffisent) / garder. Avant : règles à écrire (mots, heures, ajouter) ; après : aucune règle, ≈ 200 lignes en moins
- [ ] Graphique (Jour / Semaine / Mois) : granularité déduite de la période de la Feuille de temps (Semaine → jours, Mois → semaines, Année → mois) / garder les 2 menus ⋮. Avant : 2 menus ⋮ par écran de stats (10 au total) ; après : 1 (5 menus en moins)
- [ ] Tâche récurrente : retirer le bouton « Arrêter la récurrence » (le menu « Ne se répète pas » fait la même chose) / garder. Avant : 2 chemins ; après : 1
- [ ] Projet du Profil : nom + description seulement, sans « + Ajouter des détails » (lien externe, date de début) / garder. Avant : 4 champs dont 2 cachés ; après : 2

#### Trade Tracker
- [ ] Langue de Trade : reprendre celle de TimeTracker (transmise dans le lien), retirer le choix FR/EN de Trade / garder. Avant : deux choix de langue indépendants ; après : un seul (celui de TimeTracker)
- [ ] Graphique Camembert / Barres (⋮ Répartition) : retirer (camembert + détail en barres toujours affichés) / garder. Avant : 1 groupe de 2 choix ; après : aucun
- [ ] « Masquer les petites positions » (< 1 %, < 2 %, < 5 %) : retirer (défaut « Non ») / garder. Avant : 4 choix ; après : aucun
- [ ] Filtre Gains / Pertes de Positions : retirer (le tri « Gain $ / Gain % » suffit) / garder. Avant : 3 puces ; après : aucune
- [ ] Sélecteur « Tous les secteurs » de Positions : retirer (la Répartition regroupe déjà par secteur) / garder. Avant : 1 sélecteur ; après : aucun

#### Onboarding
- [ ] Langue : déduite du navigateur à la création (aucun écran, aucune question) / garder `fr` pour tous. Avant : un utilisateur anglophone démarre en français ; après : démarre dans sa langue
- [ ] Création : retirer les deux interrupteurs facultatifs (usage commercial, trouvable à la connexion) de l'écran, ils restent en Réglages › Sécurité, éteints par défaut / garder. Avant : 2 interrupteurs + « En savoir plus » à la création ; après : aucun (légal/Loi 25 : réservé à Émilien)

#### Sans interface, à noter
- Colonnes sans lecteur ni écrivain : `users.chronoScrollClock` (horloge défilante) et `users.aiConfirmEach` (confirmation par tâche), deux options déjà refusées. Données inertes, à supprimer par Émilien si souhaité.
