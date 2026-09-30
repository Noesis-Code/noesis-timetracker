# TimeTracker (TMT) — Repères pour toute session Claude

Source unique de vérité du fonctionnement du dépôt. Historique détaillé des chantiers : projet Claude NOÈSIS (`noesis-timetracker-*.md`) — à ne consulter que pour retracer une décision passée.

## Mode de travail (depuis le 30 sept. 2026)

Émilien dirige, Claude exécute comme une équipe. **Une seule session coordinatrice** reçoit les directives d'Émilien, les découpe et les confie à des sous-agents (`.claude/agents/`) qui travaillent en parallèle, chacun dans son **worktree Git** et sur sa **branche**. Plus de discussions par segment, plus d'Aiguillage, plus de verrous 🔒, plus de vérification SHA-256 : Git règle les collisions.

- Le coordinateur lit `BACKLOG.md` avant de planifier et le met à jour en fin de tâche.
- Un sous-agent = un chantier = une branche `claude/<sujet>` (depuis `staging` à jour) + un worktree (`git worktree add ../wt-<sujet> -b claude/<sujet> origin/staging`).
- Développeur code → testeur vérifie → relecteur contrôle → le coordinateur fusionne vers `staging`.
- Compte rendu à Émilien : 2-3 lignes (fait / à valider / bloqué). Il veut des réponses très succinctes.

## Autonomie

- **Sans validation** : correctifs, petites fonctionnalités, retouches UI demandées, refactors locaux, tests, docs.
- **Avec validation d'Émilien (proposer puis attendre)** : nouveau mécanisme, changement d'architecture, nouvelle dépendance, nouvelle table/migration lourde, changement de règle produit verrouillée. Décision d'Émilien : pour une demande de design, proposer plusieurs pistes visuelles plutôt que retoucher à l'aveugle.
- **Ne jamais** : fusionner vers `main`, commit direct sur `main`, élargir une demande (ne changer que ce qui est demandé — un style demandé pour UN état ne s'applique pas aux autres).

## Hébergement du code

- Dépôt : https://github.com/Noesis-Code/noesis-timetracker.git — branche d'intégration `staging`.
- Push vers `staging` : direct, une fois le chantier prêt et testé, **sans question de confirmation** (décision du 20 sept. 2026 ; il n'existe pas d'« application Teste » distincte : `staging` EST l'environnement de test).
- `staging` est déployé automatiquement sur Railway (https://web-staging-6d1b.up.railway.app). Fusion `staging` → `main` : toujours par Émilien, après test.
- Fins de ligne : lire celles du fichier avant d'éditer et les préserver (dépôt en LF ; ne jamais réécrire un fichier entier en changeant CRLF/LF).
- Ce dossier local `C:\Users\morel\Projects\noesis-timetracker` (machine `nacarat`) est le clone de référence d'Émilien ; le travail des agents passe par GitHub, il fait `git pull` pour récupérer.

## Vérifier avant de livrer

- `node --check` sur chaque `.js` touché ; parseur CSS sur les `.css` ; `node test/run-tests.js` (sauvegardes uniquement — aucune suite fonctionnelle n'existe encore).
- Test fonctionnel : `NOESIS_DATA_DIR=$(mktemp -d) PORT=3999 node server/index.js` puis appeler les routes touchées (données de test : `server/lib/seed-staging.js`).
- Toute régression silencieuse déjà vue ici : un correctif qui « disparaît » d'un fichier partagé. Avant de conclure, `git diff origin/staging` doit ne contenir QUE ce qui est voulu.

## Cartographie (périmètres de fichiers, pour répartir les sous-agents)

Fichiers très partagés (un seul agent à la fois dessus, sinon conflits de merge à résoudre par le coordinateur) : `public/app.js`, `public/index.html`, `public/styles.css`, `public/sw.js`, `public/i18n.js`, `server/db.js`, `server/index.js`, `server/lib/goals.js`, `server/routes/goals.js`.

| Segment | Fichiers principaux | Notes |
|---|---|---|
| Chrono | routes/lib chrono (`server/routes/timer.js`), bloc CHRONO de `app.js` | sélecteur pôle/secteur (`fillCategorySelect`) |
| Statistiques | `server/lib/categorystats.js`, `routes/categorystats.js`, `stats.js`, camemberts dans `app.js` | classes `.bar*` partagées avec Communauté ; secteurs remontent au pôle (`goals.resolveToPole`) sauf en Répartition |
| Communauté | onglet Communauté, `server/lib/community.js`, `routes/community.js` | ne pas renommer `.barList/.barRow/...` |
| Paramètres & Profil | Réglages, page Profil, onboarding, consentement légal, `server/routes/profile.js` | |
| Notifications | `server/lib/push.js`, `routes/push.js`, adressage `?notif=type&...` (`focusWhenReady`, `.notifHighlight`) | le contenu de chaque notif reste au domaine propriétaire |
| Objectifs — Page 1 (capture, logique métier) | `public/js/objectifs-page1.js`, `css/objectifs-page1.css`, `server/lib/goalscaptureplace.js`, `goalsdailypriority.js`, `dailysuggestioncron.js`, `crosssectorinference.js`, `goalsweeklyauto.js`, planification pure de `goals.js` | |
| Objectifs — Page 2 Arbre périodique | `public/js/objectifs-page2-objectif.js`, `css/objectifs-page2-objectif.css` | |
| Objectifs — Page 2 Tâches quotidiennes | `public/js/objectifs-page2-taches.js`, `css/objectifs-page2-taches.css` | pas de réordonnancement manuel des tâches du jour |
| Objectifs — Page 3 Calendrier | `public/js/objectifs-page3.js`, `css/objectifs-page3.css`, `server/lib/calendarfeed.js`, `goalreminders.js`, `externalcalendar.js`, `routes/calendar.js` | `#goalsDetailPage` z-index 101 (au-dessus de la Page 2) |
| Objectifs — Pôles/secteurs/tâches | gestion pôles/secteurs de `goals.js`/`routes/goals.js`, `goalstasks.js`, `goalstaskclassify.js`, panneau « gérer mes catégories », fenêtre Activité (Tâches/Discussion) | seuls les pôles portent une couleur, jamais les secteurs |
| Objectifs — Planification IA | `goalsauto.js`, `goalsdailyauto.js`, `scripts/apply-offre1-*.js` | |
| Capture hors ligne | `public/offline-queue.js`, `public/sw.js`, `manifest.webmanifest` | |
| Sous-projets | `server/lib/subprojects.js` & co, `routes/subprojects*.js` | UI masquée depuis le 17 sept. ; `bindSubProjectDrag` = code mort à retirer |
| Offre 1 / Paiement | `offerdelivery.js`, `subscriptioncron.js`, `stripe.js`, `routes/offercheckout.js`, `stripewebhook.js` | Stripe jamais testé en live |
| Design — coquille | `.topbar`/`.tabbar`, clavier virtuel, viewport, écran de chargement, `theme-palette.js` | |
| Design — cohérence UX | technique commune transverse (fermetures, glisser-déposer, confirmations, icônes, boutons d'envoi dans la zone) | jamais la logique propre d'un écran |
| Infra | CI, dépendances, `railway.json`, `deploy.ps1`, sauvegardes R2 | |

Hors dépôt : Horaires / client Jacopo (produit séparé, en pause).

## Règles produit verrouillées (extraits)

- Une LISTE de tâches, jamais un horaire à créneaux fixes.
- Les secteurs n'apparaissent pas dans la grille des objectifs, la feuille de temps ni le graphique : leur temps remonte au pôle.
- Les suggestions IA informent, ne décident jamais à la place de l'utilisateur ; jamais d'écrasement d'une saisie manuelle.
- Une seule technique d'interaction par fonction : fermeture d'un plein écran = croix ✕ ; réordonnancement = glisser-déposer ; bouton d'envoi DANS la zone d'écriture.
- Le gate d'installation PWA (`isStandaloneMode()`) ne se déclenche qu'à la création/récupération d'un profil.
