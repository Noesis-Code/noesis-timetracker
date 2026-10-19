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

**Drive NOÈSIS** (dossier partagé avec Gaspard) : suit les pôles/secteurs de l'app (TiMeTracker, Communauté, Entreprise, PARTNERS ; secteurs de TiMeTracker = ceux du tableau). Renommage seul, jamais de nouveau document sans demande.

**Paiement Stripe** : `staging` = clés de test uniquement, aucun vrai paiement ; le bouton d'achat Expansion n'est actif que sur staging.

## Règles automatiques du chantier 7 (décision d'Émilien, 19 oct. 2026)
1. **Chantier terminé sans nouvelle tâche** : le coordinateur ne le laisse pas vide. Il envoie aussitôt un message dans le chantier principal et demande à Émilien (AskUserQuestion) de **choisir un autre chantier à réaliser ou d'ajouter de nouvelles tâches**.
2. **Crédits Claude** : une tâche planifiée quotidienne (8 h 54, heure de New York, « Quota Claude quotidien ») envoie une notification push lui demandant son pourcentage de quota hebdomadaire et la cible attendue (≈ 14 % par jour depuis le samedi 5 h). Quand Émilien répond avec son pourcentage, le coordinateur ajuste le nombre de chantiers en cours (plus d'agents si en retard sur la cible, moins ou plus légers si en avance). Claude ne peut pas lire lui-même le quota.
3. **Claude API** : le chantier 4 rend un rapport de coût (`scripts/ai-cost-report.js`) ; toute économie qui change la qualité visible est proposée à Émilien avant d'être appliquée.

## Notifications à Émilien (règles du chantier 7)
À définir avec lui ; en attendant : un message court à chaque lot livré (fait / à valider / bloqué) avec une capture si l'interface change ; une notification push (outil `notifier` de TiMeTracker) seulement pour un blocage qui exige sa décision ou un incident de sécurité.

## Règles communes
- Un chantier = une branche `claude/<sujet>` depuis `origin/staging`, un worktree ; rebase avant push ; jamais `--force` ; **jamais `git stash`** (partagé entre worktrees) : utiliser un commit WIP.
- **Démarrer** par `scripts/new-worktree.sh <sujet>` (worktree + branche depuis `origin/staging`, `node_modules` lié, PORT libre et `NOESIS_DATA_DIR` temporaire dans `.chantier.env`) : jamais deux chantiers sur le même port ni les mêmes données. Un `git stash` est partagé par tous les worktrees : il a déjà mélangé le travail de plusieurs agents (interdit, commit WIP à la place).
- **CACHE_VERSION** (`public/sw.js`) : ne jamais l'éditer à la main ; après le rebase, `node scripts/bump-sw.js` (écrit max(staging, local)+1 ; `--dry` pour voir). Un seul bump par push.
- **Garde d'intégrité** : `test/guard-integrity.js` (appelé par `node test/run-tests.js`) échoue si un fichier de `public/`, `server/`, `trade-tracker/` est vide, si un fichier critique manque ou si un fichier perd > 60 % de ses lignes vs `origin/staging` (suppression voulue : `GUARD_ALLOW_SHRINK=chemin`). Incident d'origine : eb769ac (deux fichiers Trade Tracker à 0 octet).
- **Vue d'ensemble** : `node scripts/chantiers-status.js [--fetch] [--since="2 days ago"]` (worktrees, branches distantes, derniers commits de staging). Brief standard à coller aux agents : `docs/brief-chantier.md`.
- Avant de pousser : `node --check`, `node test/run-tests.js`, `git diff origin/staging` limité à la demande, aucun fichier vidé ou tronqué.
- Réservé à Émilien : fusion vers `main`, suppression de données, légal/Loi 25, paiement, règle produit verrouillée.
