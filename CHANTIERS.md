# Les 7 chantiers permanents (décision d'Émilien, 19 oct. 2026)

Sept chantiers tournent **en permanence**. Quand l'un se termine, le coordinateur le relance aussitôt sur la suite de sa mission (jamais de créneau vide). Chacun respecte `SIMPLIFICATION.md`, `DESIGN.md` et les règles de `CLAUDE.md` ; aucun n'élargit une demande.

| # | Chantier | Mission permanente |
|---|---|---|
| 1 | **Trade Tracker** | Produit séparé (`trade-tracker/`) : fiabilité, sécurité niveau bancaire (priorité absolue, surtout le compte de l'expert Nick), connecteur Questrade en lecture seule, interface, déploiement, notifications d'achat. **Secteur de l'app : pôle Trading › « Trade Tracker ».** |
| 2 | **Time Tracker Basic** | Offre gratuite (secteur « Basic ») : Chrono et statistiques, Feuille de route, Communauté et profil. Correctifs, tâches du pôle non réservées, robustesse, performance. **Secteur de l'app : pôle Time Tracker › « Basic ».** |
| 3 | **Time Tracker Expansion** | Offre payante (secteur « Expansion ») : accompagnement IA, analyse des documents Drive, plan de la semaine, abonnements. Paiement/Stripe = réservé à Émilien (préparer, ne pas exécuter). **Secteur de l'app : pôle Time Tracker › « Expansion ».** |
| 4 | **Crédits Claude et API** | Claude (abonnement) : répartir le travail pour consommer ~14 % du quota hebdomadaire par jour en moyenne (réinitialisation samedi 5 h, heure de New York), puis faire plus avec moins. Claude API (produit) : mesurer le coût par appel (`ai_usage_log`), réduire le coût sans perdre la qualité (Haiku d'abord, mémos, plafonds) pour maximiser la marge. **Secteur de l'app : pôle Time Tracker › « Crédits Claude et API ».** |
| 5 | **Simplification et design général** | Chantier « Simplificateur » (retirer le superflu, journal « Refusé ») + cohérence visuelle (violet #674EA7, sombre seulement, pop-up centrés avec ✕, pas de fenêtre du bas, identité par fonction). **Secteur de l'app : pôle Time Tracker › « Simplification et design général ».** |
| 6 | **Précision des tâches générées** | Stratégie pour que les tâches proposées par l'IA soient justes : jeu d'évaluation, mesure (précision, rappel, refus), réglage des consignes/prompts, usage de la stratégie d'activité, seuils de confiance. **Secteur de l'app : pôle Time Tracker › « Précision des tâches générées ».** |
| 7 | **Principal et pilotage** | Améliore le fonctionnement de la veille et de l'amélioration permanentes : file des tâches, répartition, règles de travail (ce fichier), tests de non-régression, incidents (stash partagé, fichiers vides…), et **notifications à Émilien** (règles ci-dessous). C'est ici que se règlent la progression et la cadence. **Secteur de l'app : pôle Time Tracker › « Principal et pilotage ».** |

Les noms de secteurs ci-dessus sont exacts (ne pas les reformuler). **Règle** : le coordinateur lit les nouvelles tâches de chaque chantier par secteur (MCP TiMeTracker, `lister_taches`), en plus de `BACKLOG.md`.

Drive NOÈSIS et paiement Stripe : voir `CLAUDE.md` (source unique).

## Règles automatiques du chantier 7 (décision d'Émilien, 19 oct. 2026)
1. **Sept chantiers actifs en tout temps** (directive d'Émilien, 19 oct. 2026) : il ne doit jamais y en avoir moins de sept. Quand un chantier finit, le coordinateur le relance aussitôt avec la première tâche disponible, dans cet ordre : (a) tâches non réservées du secteur principal (`lister_taches`) ; (b) la liste de repli du chantier (section « Listes de repli ») ; (c) à défaut, appliquer la boucle `docs/boucle-veille.md` : le chantier génère 3 tâches candidates (échecs, relectures, mesures, audit de simplicité, benchmark concurrents), chacune au format `docs/modele-tache.md` (incomplète = question à cocher, non lancée), et les inscrit à la fin de sa liste de repli. Les demandes d'Émilien sont copiées mot pour mot dans `docs/intentions.md`. Aucune question à Émilien pour relancer ; ses réponses éventuelles passent en tête de file.
2. **Crédits Claude** : une tâche planifiée quotidienne (8 h 54, heure de New York, « Quota Claude quotidien ») envoie une notification push lui demandant son pourcentage de quota hebdomadaire et la cible attendue (≈ 14 % par jour depuis le samedi 5 h). Quand Émilien répond avec son pourcentage, le coordinateur ajuste le nombre de chantiers en cours (plus d'agents si en retard sur la cible, moins ou plus légers si en avance). Claude ne peut pas lire lui-même le quota.
3. **Claude API** : le chantier 4 rend un rapport de coût (`scripts/ai-cost-report.js`) ; toute économie qui change la qualité visible est proposée à Émilien avant d'être appliquée.

## Notifications à Émilien (règles du chantier 7)
Émilien reçoit une notification sur son téléphone (outil `notifier` de TiMeTracker) **seulement pour une vraie décision** : cas réservé (fusion `main`, action destructrice, légal/Loi 25), dépense ou abonnement, règle produit verrouillée, incident de sécurité. Toute autre question est regroupée dans le chantier principal (un message court par lot : fait / à valider / bloqué, avec capture si l'interface change). Jamais de notification pour relancer un chantier ou choisir une tâche.

## Listes de repli (secondaires)
Alimentent un chantier quand son secteur principal n'a plus de tâche (règle 1). Dans l'ordre ; chaque tâche : dans le périmètre du chantier, sans interface nouvelle, sans dépense, sans règle verrouillée, sans fusion `main` (SIMPLIFICATION.md). Cocher/retirer une tâche faite ; ajouter à la fin.

**1. Trade Tracker** (sécurité)
1. Documentation DEPLOY à jour (variables, étapes, retour arrière). FAIT (repli 3).
2. Test qui échoue si une variable `TRADE_*` lue par le code de Trade manque dans `trade-tracker/DEPLOY.md`. FAIT (repli 3, `deploy-doc-test.js`).
3. Test de bout en bout sauvegarde -> altération -> restauration (`restore.js`) : chaîne d'audit et jetons chiffrés relus après restauration. FAIT (20 oct.).
4. Vérifier que les journaux et réponses d'erreur de Trade ne contiennent jamais une valeur `TRADE_*` secrète (échec de démarrage, erreurs 500). FAIT (20 oct., test anti-secret sur tous les chemins d'erreur).
5. Test de tenue en charge de la synchro Questrade simulée (150 utilisateurs, pannes isolées, idempotence). FAIT (repli 5 bis, `trade-tracker/test/sync-charge-test.js` : ~9 s pour 150 utilisateurs, soit ~60 ms/utilisateur, large marge sur l'intervalle de 15 min).
6. Audit de simplicité de l'écran Trade Tracker (capture 390 px, `docs/boucle-veille.md`) : liste des éléments à retirer en proposition seulement, `docs/audit-trade-<date>.md`. FAIT (20 oct., `docs/audit-trade-2026-10-20.md`, propositions seulement).
7. Benchmark « 0 → 1 » Sharesight et Delta (sources citées, `docs/benchmark-trade-<date>.md`) : ce qu'ils font avec le moins d'éléments, tâches de retrait seulement. Dépend de 6 (fonction unique de l'écran). BLOQUÉ (20 oct. : accès web absent), état dans `docs/benchmark-trade-2026-10-20.md`.
8. Test que `trade-tracker/` n'écrit aucune clé de chiffrement ni jeton Questrade dans ses journaux de démarrage, y compris avec des `TRADE_*` mal formées. Contexte : les tests anti-secret du 20 oct. couvrent les erreurs 500, pas le démarrage. Intention : « sécurité niveau bancaire » (CHANTIERS #1). Fini quand : `node test/run-tests.js` échoue si le démarrage imprime une valeur secrète. Périmètre : `trade-tracker/test/`, aucune interface. FAIT (20 oct., `trade-tracker/test/startup-logs-test.js` : vrai processus, 5 configurations dont production refusée et clés mal formées, ~8 s ; vérifié en y injectant une fuite).
9. Test de reprise après coupure en pleine synchro Questrade simulée (processus tué au milieu) : aucun doublon d'opération, solde cohérent au redémarrage. Fini quand : le test passe deux fois de suite. Périmètre : `trade-tracker/test/`, aucune interface. FAIT (20 oct., `trade-tracker/test/coupure-synchro-test.js` : vrai processus tué par SIGKILL à 11 des 14 écritures d'une synchro prix/positions/soldes/achats, 9 des 12 d'un import du Sheet, et après la copie d'une sauvegarde ; base rouverte = état d'avant exact ou complet après COMMIT, aucun doublon, journal sans faux « OK », reprise identique à une synchro sans coupure ; passé 2 fois, ~8 s ; vérifié en retirant la transaction de `sync.js`).
10. Plafonner chaque test Trade à 20 s (délai explicite plutôt que blocage sous charge). Fini quand : un test bloqué échoue vite avec un message clair. Périmètre : `trade-tracker/test/`. FAIT (20 oct., `test/lib/parallel.js` option `timeoutMs`/`timeouts`, `trade-tracker/test/run.js` : 20 s, 60 s pour les tests lents connus (sync-charge, stepup, broker-e2e, mfa, passkey, mesurés 17-24 s sous charge) ; message « DÉLAI DÉPASSÉ », `TMT_TEST_TIMEOUT_MS` pour changer).
11. Propriété des données, route par route. Contexte : sécurité niveau bancaire (CHANTIERS #1) ; `cloisonnement-test.js` couvre les lectures mais aucune garde n'échoue si une route est ajoutée sans contrôle du propriétaire. Intention : « sécurité niveau bancaire, surtout le compte de l'expert » (CHANTIERS #1). Fini quand : `trade-tracker/test/proprietaire-routes-test.js` (routes lues dans Express, deux clients + expert, identifiants hostiles en query/corps/chemin, route admin) échoue si une route n'est pas classée ou touche le compte voisin. Périmètre : `trade-tracker/test/`. FAIT (20 oct., repli 22 ; vérifié en injectant `req.query.userId` dans `/api/history`).
12. Calculs sur 5 portefeuilles types (frais, vente partielle, dividendes USD, split, position rouverte) comparés à des valeurs calculées à la main. Fini quand : `trade-tracker/test/portefeuilles-types-test.js` passe ; conventions (coût moyen vs FIFO, split) en cases à cocher Q13/Q14 de `docs/questions-emilien-trade.md`. Périmètre : test et docs. FAIT (20 oct., repli 22 : calculs justes ; limite connue = le gain réalisé ignore les splits, `realizedSummary` non branché, garde dans le test).
13. Export et effacement Loi 25 : garde statique des tables. Fini quand : `trade-tracker/test/privacy-tables-test.js` échoue si un `CREATE TABLE` du code n'est pas classé (personnelle exportée/effacée ou NON_PERSONAL), si une table personnelle n'a pas de clé étrangère `ON DELETE CASCADE`, ou si une colonne désigne un autre compte sans traitement. Périmètre : `trade-tracker/test/`. FAIT (20 oct., repli 22 ; vérifié avec une table ajoutée à `db.js`).

**2. Time Tracker Basic** (accessibilité et robustesse)
1. `aria-label` des boutons-icônes et contrastes du texte à vérifier (sans changer la palette). FAIT (20 oct.).
2. Contrastes WCAG des couleurs de texte actuelles : rapport `scripts/contrast-report.js`. FAIT (repli 5) : tout >= 4.5:1 sur fond, carte et surface ; seules exceptions mineures sur `--hover-bg` (violet-trail 4.13, violet-me 4.47, bad 4.02), palette inchangée.
3. Démarrage sans réseau : écran `offline.html` et message clair vérifiés (cache du service worker, FR/EN). FAIT (repli 6).
4. Focus clavier visible (`:focus-visible`) sur les boutons-icônes et ✕ des pop-up, sans nouvelle couleur. FAIT (repli 6).
5. Test que chaque pop-up de `index.html` a une croix ✕ avec `aria-label` et se ferme à Échap ; lister les écarts dans `docs/accessibilite-2026-10-20.md` sans ajouter de croix. FAIT (repli 18, `test/popups-croix-test.js`, `docs/accessibilite-2026-10-20.md` §5). Fini quand : test dans `test/` et liste notée. Périmètre : lecture de `public/index.html`, test seulement.
6. Mesure du poids de la première page (HTML + CSS + JS en gzip) ; lister les 3 plus gros fichiers à alléger par retrait de code mort. FAIT (repli 19, `docs/poids-premiere-page-2026-10-20.md`). Fini quand : tableau dans `docs/`, aucune modification de `public/`.
7. Test d'un chrono démarré, application rouverte 2 h plus tard (horloge simulée) : durée exacte conservée. FAIT (repli 17, `test/fonctionnel-chrono.js`). Fini quand : le test `test/fonctionnel-*.js` passe. Périmètre : test seulement, chrono inchangé.
8. Écart d'horloge, reprise et deux appareils du chrono. FAIT (repli 19, `test/chrono-horloge-test.js` : écart mesuré au milieu de la requête, NaN/> 1 jour ignorés, copie locale sans `serverNow` périmé, récapitulatif d'arrêt non refermé au retour au premier plan, arrêt déjà fait ailleurs = resynchronisation).
9. Retirer le code mort de `public/app.js` (842 Ko, 238 Ko gzip, premier poste de la première page). Contexte : `docs/poids-premiere-page-2026-10-20.md`. Intention : « Simplification : on retire avant d'ajouter » (CLAUDE.md). Fini quand : liste des fonctions sans appelant (relevé outillé) retirée, tests verts, bump sw. Périmètre : `public/app.js` (très partagé : un agent à la fois). On ne touche pas : comportement visible.
10. Charger `legal-en.js` (58 Ko) et `qrcode.js` (58 Ko) seulement quand l'écran qui les utilise s'ouvre. Contexte : même relevé. Fini quand : première page sans ces deux fichiers, écrans concernés vérifiés en capture 390 px, hors ligne inchangé (précache du service worker). Périmètre : `public/index.html`, `public/sw.js`, appelants. Aucune interface nouvelle.
11. Test du chrono quand l'heure du téléphone change PENDANT la session (réglage automatique de l'heure, retour d'un voyage) : durée jamais négative ni absurde. Fini quand : cas ajouté à `test/chrono-horloge-test.js`. Périmètre : test seulement.

**3. Time Tracker Expansion** (préparer, jamais de paiement réel)
1. Portail client Stripe et résiliation : parcours préparé en mode test. FAIT (repli 4) : `POST /offer/portal` + `stripe.createPortalSession`, testé dans `expansion-parcours-test.js` ; reste côté Émilien : activer le portail dans le tableau de bord Stripe (mode test) ; aucune interface ajoutée.
2. Idempotence du webhook Stripe testée (même événement reçu deux fois). FAIT (`test/stripe-webhook-idempotence-test.js`).
3. Textes « Offre 1 » → Expansion dans CGU, confidentialité et code, hors ids et routes. BLOQUÉ (repli 8) : CGU/confidentialité = légal, réservé à Émilien ; question dans `docs/questions-emilien-expansion.md`.
4. Échecs de paiement : `invoice.payment_failed` non traité par le code (200, journalisé) ; `past_due` arrive par `customer.subscription.updated` (testé : `test/stripe-webhook-idempotence-test.js`, `test/expansion-webhook-evenements-test.js`).
5. Messages d'erreur du checkout et du webhook relus (FR/EN, aucun détail interne exposé). FAIT (repli 5) : `Accept-Language`, portail non activé couvert par `expansion-parcours-test.js`.
6. Variables d'env Stripe auditées (`docs/stripe-taxes.md`, `DEPLOIEMENT.md`) : liste unique, rien d'oublié. FAIT (repli 5) : `DEPLOIEMENT.md` §6.
7. Suite complète `node test/run-tests.js` relancée après rebase. FAIT (repli 6, 20 oct. : 100 passées, 0 échouée, rien à corriger côté Expansion).
8. Événements Stripe à cocher dans le tableau de bord (mode test) pour le webhook : ajouter `charge.refunded` et `charge.dispute.created` (comportement : aucun changement d'accès, alerte interne, `server/routes/stripewebhook.js`). E-mails d'abonnement FR/EN et remboursement/litige FAITS (repli 7, `test/subscription-mails-refund-test.js`).
9. Courriels : `RESEND_FROM` avec domaine vérifié requis pour écrire aux abonnés (sinon `onboarding@resend.dev` n'envoie qu'au compte Resend). FAIT (repli 8) : documenté dans `docs/expansion-courriels.md` et `DEPLOIEMENT.md` §6 ; interrupteur `EXPANSION_MAILS=1` (défaut off) en place, activation = Émilien.
10. Litige : `charge.dispute.created` ne porte pas `customer`. FAIT (repli 8) : `stripe.retrieveCharge` (lecture seule) relie la charge à l'abonnement, testé.
11. Test que toute route Expansion refuse (403 clair FR/EN) un utilisateur sans abonnement actif, y compris après `past_due` + délai de grâce. Fini quand : le tableau état x route de `docs/expansion-acces.md` est couvert par un test. Périmètre : `test/`, `docs/`.
12. Test du cron d'abonnement sur un changement d'heure (passage à l'heure d'été) : un renouvellement n'est ni doublé ni sauté. Fini quand : le test passe avec horloge simulée. Périmètre : `test/` ; `server/lib/subscriptioncron.js` seulement si bug trouvé (préparer, aucun paiement).
13. Relire les textes d'erreur Expansion visibles : plus de « Offre 1 » côté utilisateur (hors ids/routes, hors CGU = légal). Fini quand : liste dans le compte rendu, corrections hors légal appliquées.

**4. Crédits Claude et API**
1. Rapport de coût par fonction IA (`scripts/ai-cost-report.js`, `ai_usage_log`). FAIT (rapport hebdomadaire, résumé par fonction).
2. Alerte douce dans le journal serveur (pas de notification) quand le coût journalier estimé dépasse `AI_COST_ALERT_DAY_USD` (défaut 8 $). FAIT (repli 8, `aibudget.js`).
3. Test qu'un appel mémoïsé ne journalise pas de jetons. FAIT (repli 8, `test/ia-alerte-memo-test.js`).
4. Table de la part de chaque fonction IA dans le coût du jour (`ai-cost-report.js --from`), top 3 à réduire en premier. Fini quand : table dans `docs/ia-couts-reels-<date>.md`. Aucune interface.
5. Mesurer quels appels passent encore en Sonnet alors que Haiku suffit (jeu d'évaluation de Précision) et proposer les fonctions à basculer, sans appliquer si la qualité baisse. Fini quand : tableau précision/coût par modèle. Périmètre : `docs/`, `scripts/`.
6. Test qu'un appel IA sans plafond `max_tokens` ou sans délai d'expiration fait échouer la suite. Fini quand : le test existe et passe. Périmètre : `test/`.

**5. Simplification et design général**
1. Propositions 6 à 10 du Simplificateur non réservées : les exécuter.
3. Retrait des doublons (deux entrées vers la même fonction).
4. Audit de simplicité écran par écran (`docs/boucle-veille.md`, un écran par passe, capture 390 px) : Stats, Feuille de route, Communauté, Activité, Profil, Réglages. FAIT (20 oct. : écrans audités, propositions dans `docs/questions-emilien-simplification.md`).
5. Benchmark concurrents « 0 → 1 » (Toggl, Clockify, Harvest) : par écran, ce qu'ils font avec le moins d'éléments ; en tirer des tâches de retrait.
6. Retirer les variables CSS et clés i18n devenues inutilisées depuis le dernier passage (`i18n-unused`, relevé CSS). Fini quand : liste retirée, tests verts, bump sw. Périmètre : `public/styles.css`, `public/i18n.js` (très partagés : un agent à la fois).
7. Exécuter les écarts DESIGN.md de `docs/ecarts-design-2026-10-20.md` qui se règlent par suppression ou alignement sur un jeton existant. Fini quand : capture 390 px avant/après de chaque écran touché. Aucune couleur nouvelle.
8. Retirer les routes serveur sans appelant dans `public/` (liste de `docs/code-mort-2026-10-20.md`) avec test de non-régression. Fini quand : routes supprimées, tests verts. Périmètre : `server/routes/`, sans toucher aux données.

**6. Précision des tâches générées**
1. Cas restants c12 et c54 du jeu d'évaluation.
2. Cas en anglais : étendre le jeu et mesurer. FAIT (45 cas fr/en).
3. Seuils de confiance : revérifier avec `scripts/eval-task-precision.js`. FAIT (seuil 80).
4. Cas limites : titres très courts (1-2 mots) dans le jeu d'évaluation. *(fait 19 oct. : s01-s06 ; seuil 80 confirmé, plateau 50-80 à 98,1 %, 85+ régresse)*
5. Cas limites : formulations avec nom propre seul (« Appeler Marc ») ou verbe sans objet (« Faire le suivi ») : mesurer que le résultat est « incertain » plutôt qu'un secteur choisi au hasard.
6. Seuil de confiance par fournisseur : comparer `--min-confidence` en simulé après chaque nouvelle série de cas, et noter le plateau dans cette liste.
7. Cas limites : titres mixtes fr/en avec dates (« Send invoice avant vendredi ») ; ajouter et mesurer. *(déjà couvert : m01-m15, d01-d09)*
8. Verbes d'action ambigus (« Passer », « Régler », « Gérer », « Traiter ») : mesurer incertain vs secteur. *(fait 20 oct. : a01-a10 ; règle « Régler » = paiement ; restent a05 ex æquo Clients/Prospection et a07 « pharmacie » hors vocabulaire du simulé)*
9. Tâches multi-actions avec « et » (« Appeler le fournisseur et envoyer la facture ») : mesurer qu'elles restent placées sur le secteur dominant ou incertaines, et que la génération les propose scindées.
10. Titres avec nombres/montants et tâches mixtes perso/pro (« Payer 450 $ de loyer », « Rendez-vous dentiste et appel client ») : ajouter et mesurer.
11. Ponctuation et majuscules : titres TOUT EN MAJUSCULES, sans majuscule initiale, puces/guillemets/points de suspension ; mesurer que le placement ne change pas. *(fait 20 oct. : p01-p06)*
12. Abréviations courantes (« fact. », « RDV », « tel », « compta », « qté ») : ajouter et mesurer placement vs incertain. *(fait 20 oct. : p07-p15, expansion fact/compta/qte/tel dans taskprecision.tokens ; 97,7 % sur 172)*
13. Noms propres de clients seuls ou en début de titre (« Acme : maquette », « Dupuis - retouches ») : mesurer que le nom propre ne pèse pas contre le vocabulaire du secteur. *(fait 20 oct. : n01-n08, aucun écart, aucune règle ajoutée)*
14. Titres avec négation ou annulation (« Ne pas oublier la facture », « Annuler le rendez-vous ») : ajouter et mesurer que le secteur reste celui du sujet. Fini quand : cas ajoutés au jeu, score noté ici.
15. Mesurer la précision par longueur de titre (1, 2-3, 4-8, 9+ mots) et noter le palier faible. Fini quand : tableau dans `docs/`, aucune règle changée sans mesure.
16. Rejouer les 60 cas aveugles h01-h60 après les dernières règles généralisées : aucun cas déjà juste ne régresse. Fini quand : `scripts/eval-task-precision.js` compare avant/après, résultat noté.

**7. Principal et pilotage**
1. État des worktrees et branches à nettoyer (`scripts/chantiers-status.js`), liste pour Émilien si suppression distante. FAIT (19 oct.).
2. Relecture croisée des dernières livraisons de `staging`. FAIT (replis 4 à 7, `docs/relecture-*.md`).
3. Mise à jour du Projet Claude NOÈSIS (journal des chantiers). FAIT (journaux des 19 et 20 oct.).
4. Cohérence de `BACKLOG.md` (doublons, périmé). Récurrente, à refaire à chaque lot.
5. Audit de simplicité écran par écran : faire tourner la boucle `docs/boucle-veille.md` sur les écrans non audités et tenir le journal des malentendus. FAIT (20 oct., tous les écrans de TMT et Trade).
6. Benchmark concurrents (Toggl, Clockify, Harvest ; Sharesight, Delta pour Trade) : alimenter les tâches de retrait des autres chantiers. FAIT pour le temps (`docs/benchmark-temps-2026-10-20.md`) ; Trade bloqué (accès web).
7. Après chaque lot, relever les tests de plus de 20 s dans `node test/run-tests.js` et stabiliser ceux qui échouent sous charge (hors `test/mcp-test.js`). Fini quand : liste au journal du jour.
8. Retirer de `docs/questions-emilien-2026-10-20.md` les questions déjà résolues par un commit. Fini quand : index à jour, aucune notification.
9. Contrôle de staging en fin de lot : aucun marqueur de conflit, CACHE_VERSION monotone, `/healthz` OK sur un port libre (tuer par PID). Fini quand : résultat noté au journal.

## Règles communes
- Un chantier = une branche `claude/<sujet>` depuis `origin/staging`, un worktree ; rebase avant push ; jamais `--force` ; **jamais `git stash`** (partagé entre worktrees) : utiliser un commit WIP.
- **Démarrer** par `scripts/new-worktree.sh <sujet>` (worktree + branche depuis `origin/staging`, `node_modules` (et `trade-tracker/node_modules`) liés, PORT libre et `NOESIS_DATA_DIR` temporaire dans `.chantier.env`) : jamais deux chantiers sur le même port ni les mêmes données. Un `git stash` est partagé par tous les worktrees : il a déjà mélangé le travail de plusieurs agents (interdit, commit WIP à la place).
- **CACHE_VERSION** (`public/sw.js`) : ne jamais l'éditer à la main ; après le rebase, `node scripts/bump-sw.js` (écrit max(staging, local)+1 ; `--dry` pour voir). Un seul bump par push.
- **Garde d'intégrité** : `test/guard-integrity.js` (appelé par `node test/run-tests.js`) échoue si un fichier de `public/`, `server/`, `trade-tracker/` est vide, si un fichier critique manque ou si un fichier perd > 60 % de ses lignes vs `origin/staging` (suppression voulue : `GUARD_ALLOW_SHRINK=chemin`). Incident d'origine : eb769ac (deux fichiers Trade Tracker à 0 octet).
- **Vue d'ensemble** : `node scripts/chantiers-status.js [--fetch] [--since="2 days ago"]` (worktrees, branches distantes, derniers commits de staging). Brief standard à coller aux agents : `docs/brief-chantier.md`.
- Avant de pousser : `node --check`, `scripts/suite-verrouillee.sh`, `git diff origin/staging` limité à la demande, aucun fichier vidé ou tronqué.
- Réservé à Émilien : fusion vers `main`, suppression de données, légal/Loi 25, paiement, règle produit verrouillée.
