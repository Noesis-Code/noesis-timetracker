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
1. **Sept chantiers actifs en tout temps** (directive d'Émilien, 19 oct. 2026) : il ne doit jamais y en avoir moins de sept. Quand un chantier finit, le coordinateur le relance aussitôt avec la première tâche disponible, dans cet ordre : (a) tâches non réservées du secteur principal (`lister_taches`) ; (b) la liste de repli du chantier (section « Listes de repli ») ; (c) à défaut, le chantier génère lui-même 3 tâches utiles dans son périmètre et les inscrit à la fin de sa liste de repli. Aucune question à Émilien pour relancer ; ses réponses éventuelles passent en tête de file.
2. **Crédits Claude** : une tâche planifiée quotidienne (8 h 54, heure de New York, « Quota Claude quotidien ») envoie une notification push lui demandant son pourcentage de quota hebdomadaire et la cible attendue (≈ 14 % par jour depuis le samedi 5 h). Quand Émilien répond avec son pourcentage, le coordinateur ajuste le nombre de chantiers en cours (plus d'agents si en retard sur la cible, moins ou plus légers si en avance). Claude ne peut pas lire lui-même le quota.
3. **Claude API** : le chantier 4 rend un rapport de coût (`scripts/ai-cost-report.js`) ; toute économie qui change la qualité visible est proposée à Émilien avant d'être appliquée.

## Notifications à Émilien (règles du chantier 7)
Émilien reçoit une notification sur son téléphone (outil `notifier` de TiMeTracker) **seulement pour une vraie décision** : cas réservé (fusion `main`, action destructrice, légal/Loi 25), dépense ou abonnement, règle produit verrouillée, incident de sécurité. Toute autre question est regroupée dans le chantier principal (un message court par lot : fait / à valider / bloqué, avec capture si l'interface change). Jamais de notification pour relancer un chantier ou choisir une tâche.

## Listes de repli (secondaires)
Alimentent un chantier quand son secteur principal n'a plus de tâche (règle 1). Dans l'ordre ; chaque tâche : dans le périmètre du chantier, sans interface nouvelle, sans dépense, sans règle verrouillée, sans fusion `main` (SIMPLIFICATION.md). Cocher/retirer une tâche faite ; ajouter à la fin.

**1. Trade Tracker** (sécurité)
1. Documentation DEPLOY à jour (variables, étapes, retour arrière). FAIT (repli 3).
2. Test qui échoue si une variable `TRADE_*` lue par le code de Trade manque dans `trade-tracker/DEPLOY.md`. FAIT (repli 3, `deploy-doc-test.js`).
3. Test de bout en bout sauvegarde -> altération -> restauration (`restore.js`) : chaîne d'audit et jetons chiffrés relus après restauration.
4. Vérifier que les journaux et réponses d'erreur de Trade ne contiennent jamais une valeur `TRADE_*` secrète (échec de démarrage, erreurs 500).

**2. Time Tracker Basic** (accessibilité et robustesse)
1. `aria-label` des boutons-icônes et contrastes du texte à vérifier (sans changer la palette).

**3. Time Tracker Expansion** (préparer, jamais de paiement réel)
1. Portail client Stripe et résiliation : parcours préparé en mode test. FAIT (repli 4) : `POST /offer/portal` + `stripe.createPortalSession`, testé dans `expansion-parcours-test.js` ; reste côté Émilien : activer le portail dans le tableau de bord Stripe (mode test) ; aucune interface ajoutée.
2. Idempotence du webhook Stripe testée (même événement reçu deux fois). FAIT (`test/stripe-webhook-idempotence-test.js`).
3. Textes « Offre 1 » → Expansion dans CGU, confidentialité et code, hors ids et routes.
4. Échecs de paiement : `invoice.payment_failed` testé par événement signé local (fait, `test/stripe-webhook-idempotence-test.js`).
5. Messages d'erreur du checkout et du webhook relus (FR/EN, aucun détail interne exposé). FAIT (repli 5) : `Accept-Language`, portail non activé couvert par `expansion-parcours-test.js`.
6. Variables d'env Stripe auditées (`docs/stripe-taxes.md`, `DEPLOIEMENT.md`) : liste unique, rien d'oublié. FAIT (repli 5) : `DEPLOIEMENT.md` §6.

**4. Crédits Claude et API**
1. Rapport de coût par fonction IA (`scripts/ai-cost-report.js`, `ai_usage_log`).

**5. Simplification et design général**
1. Propositions 6 à 10 du Simplificateur non réservées : les exécuter.
3. Retrait des doublons (deux entrées vers la même fonction).

**6. Précision des tâches générées**
1. Cas restants c12 et c54 du jeu d'évaluation.
2. Cas en anglais : étendre le jeu et mesurer.
3. Seuils de confiance : revérifier avec `scripts/eval-task-precision.js`.
4. Cas limites : titres très courts (1-2 mots) dans le jeu d'évaluation. *(fait 19 oct. : s01-s06 ; seuil 80 confirmé, plateau 50-80 à 98,1 %, 85+ régresse)*
5. Cas limites : formulations avec nom propre seul (« Appeler Marc ») ou verbe sans objet (« Faire le suivi ») : mesurer que le résultat est « incertain » plutôt qu'un secteur choisi au hasard.
6. Seuil de confiance par fournisseur : comparer `--min-confidence` en simulé après chaque nouvelle série de cas, et noter le plateau dans cette liste.
7. Cas limites : titres mixtes fr/en avec dates (« Send invoice avant vendredi ») ; ajouter et mesurer. *(déjà couvert : m01-m15, d01-d09)*
8. Verbes d'action ambigus (« Passer », « Régler », « Gérer », « Traiter ») : mesurer incertain vs secteur. *(fait 20 oct. : a01-a10 ; règle « Régler » = paiement ; restent a05 ex æquo Clients/Prospection et a07 « pharmacie » hors vocabulaire du simulé)*
9. Tâches multi-actions avec « et » (« Appeler le fournisseur et envoyer la facture ») : mesurer qu'elles restent placées sur le secteur dominant ou incertaines, et que la génération les propose scindées.
10. Titres avec nombres/montants et tâches mixtes perso/pro (« Payer 450 $ de loyer », « Rendez-vous dentiste et appel client ») : ajouter et mesurer.

**7. Principal et pilotage**
1. État des worktrees et branches à nettoyer (`scripts/chantiers-status.js`), liste pour Émilien si suppression distante.
2. Relecture croisée des dernières livraisons de `staging`.
3. Mise à jour du Projet Claude NOÈSIS (journal des chantiers).
4. Cohérence de `BACKLOG.md` (doublons, périmé).

## Règles communes
- Un chantier = une branche `claude/<sujet>` depuis `origin/staging`, un worktree ; rebase avant push ; jamais `--force` ; **jamais `git stash`** (partagé entre worktrees) : utiliser un commit WIP.
- **Démarrer** par `scripts/new-worktree.sh <sujet>` (worktree + branche depuis `origin/staging`, `node_modules` (et `trade-tracker/node_modules`) liés, PORT libre et `NOESIS_DATA_DIR` temporaire dans `.chantier.env`) : jamais deux chantiers sur le même port ni les mêmes données. Un `git stash` est partagé par tous les worktrees : il a déjà mélangé le travail de plusieurs agents (interdit, commit WIP à la place).
- **CACHE_VERSION** (`public/sw.js`) : ne jamais l'éditer à la main ; après le rebase, `node scripts/bump-sw.js` (écrit max(staging, local)+1 ; `--dry` pour voir). Un seul bump par push.
- **Garde d'intégrité** : `test/guard-integrity.js` (appelé par `node test/run-tests.js`) échoue si un fichier de `public/`, `server/`, `trade-tracker/` est vide, si un fichier critique manque ou si un fichier perd > 60 % de ses lignes vs `origin/staging` (suppression voulue : `GUARD_ALLOW_SHRINK=chemin`). Incident d'origine : eb769ac (deux fichiers Trade Tracker à 0 octet).
- **Vue d'ensemble** : `node scripts/chantiers-status.js [--fetch] [--since="2 days ago"]` (worktrees, branches distantes, derniers commits de staging). Brief standard à coller aux agents : `docs/brief-chantier.md`.
- Avant de pousser : `node --check`, `node test/run-tests.js`, `git diff origin/staging` limité à la demande, aucun fichier vidé ou tronqué.
- Réservé à Émilien : fusion vers `main`, suppression de données, légal/Loi 25, paiement, règle produit verrouillée.
