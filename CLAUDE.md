# TimeTracker (TMT) — Repères pour toute session Claude

Source unique de vérité du fonctionnement du dépôt. Historique détaillé des chantiers : projet Claude NOÈSIS (`noesis-timetracker-*.md`) — à ne consulter que pour retracer une décision passée.

## Mode de travail (depuis le 30 sept. 2026)

Émilien dirige, Claude exécute comme une équipe. **Une seule session coordinatrice** reçoit les directives d'Émilien, les découpe et les confie à des sous-agents (`.claude/agents/`) qui travaillent en parallèle, chacun dans son **worktree Git** et sur sa **branche**. Plus de discussions par segment, plus d'Aiguillage, plus de verrous 🔒, plus de vérification SHA-256 : Git règle les collisions.

- Le coordinateur lit `BACKLOG.md` avant de planifier et le met à jour en fin de tâche.
- Un sous-agent = un chantier = une branche `claude/<sujet>` (depuis `staging` à jour) + un worktree (`git worktree add ../wt-<sujet> -b claude/<sujet> origin/staging`).
- Développeur code → testeur vérifie → relecteur contrôle → le coordinateur fusionne vers `staging`.
- Compte rendu à Émilien : 2-3 lignes (fait / à valider / bloqué). Il veut des réponses très succinctes.

## Rapidité (1er oct. 2026)

Émilien trouve les délais trop longs. Règles : découper chaque lot de demandes en tâches indépendantes lancées EN PARALLÈLE (un sous-agent par segment de fichiers, plusieurs agents dans un même message) ; ne pas refaire soi-même ce qu'un agent fait ; vérification ciblée (`node --check`, tests, une capture de l'écran touché, pas de balayage complet) ; réponse finale en 2-4 lignes ; les corrections de détail (CSS, libellés) se font directement sans agent.

## Chantiers permanents (19 oct. 2026)

Cinq chantiers tournent en veille permanente (décision d'Émilien, 20 oct. 2026) : Trade Tracker, TT Basic, TT Expansion, Simplification et design général, Précision des tâches ; plus UN chantier éphémère quand Émilien est actif (sa demande du moment). Crédits Claude et API et Principal/pilotage sont suspendus comme chantiers (le coordinateur applique leurs règles : ~45 % du quota hebdomadaire, pas de relance inutile). Missions et règles dans `CHANTIERS.md`. Exécution planifiée (cloud, 5 tâches) : `docs/fonctionnalites/chantiers-planifies.md`. Chaque chantier est relié à un secteur de l'app (pôle Trading : « Trade Tracker » ; pôle Time Tracker : « Basic », « Expansion », « Simplification et design général », « Précision des tâches générées ») : le coordinateur lit les nouvelles tâches par secteur (MCP TiMeTracker `lister_taches`). **Maximum 5 chantiers permanents + 1 éphémère, modèle léger (sonnet) par défaut** : un chantier fini se met en veille et ne repart que s'il y a une tâche du secteur ou un élément de repli utile (pas de tâches auto-générées pour remplir) ; notification téléphone à Émilien seulement pour une vraie décision.

- **Drive NOÈSIS** (dossier partagé avec Gaspard) : il suit les pôles/secteurs de l'app (TiMeTracker, Communauté, Entreprise, PARTNERS ; secteurs de TiMeTracker = ceux ci-dessus). Renommage seul ; jamais de nouveau document sans demande.
- **Paiement Stripe** : `staging` = clés de test uniquement, aucun vrai paiement ; le bouton d'achat Expansion n'est actif que sur staging.

## Simplification (19 oct. 2026) — priorité permanente

Émilien veut une application **simple** : on retire avant d'ajouter. Lire `SIMPLIFICATION.md` (principes, test de simplicité à passer avant tout push d'un chantier UI, journal « Refusé par Émilien »). Un chantier permanent « Simplificateur » relit les livraisons et retire le superflu. Aucun bouton, option, réglage, écran ni couleur nouveau sans demande explicite.

**Règles de rangement (20 oct. 2026) — obligatoires pour tout agent** : `docs/regles/regles-rangement.md` (R1 à R13, modèles Linear, Apple, Things 3, Bear, Oura).
**Référence design unique** : ce même fichier fait foi pour la palette « Violet cendré » (R11), les couleurs sémantiques (R12) et la fermeture ✕ (R13) ; le code garde l'ancienne palette jusqu'à demande d'Émilien.
- Lire ce fichier avant toute modification d'interface (`public/`) ; ne pas l'assouplir sans accord d'Émilien.
- Joindre au compte rendu la checklist R1–R29 (cochée ou justifiée) et les captures avant/après à 390 px et 360 px. **R30 (21 oct. 2026)** : toute modification visuelle a d'abord une capture du plan (champ `capture` de la liste Prochaines tâches), une nouvelle modification visuelle attend le Oui d'Émilien, et la capture finale doit être conforme au plan (mode d'emploi : `docs/fonctionnalites/chantiers-planifies.md`).
- Nouvelle règle = application partout : chaque règle ajoutée à `docs/regles/regles-rangement.md` déclenche un audit de toute l'app (`public/`, `trade-tracker/`, Expansion) par le chantier « Simplification et design général » (ou tâche « à venir »), en réutilisant le composant unique de R29 (jamais recopié).
- Le relecteur refuse toute branche touchant `public/` sans cette checklist ou avec une règle violée sans justification.

## Rangement de docs/ (20 oct. 2026)

Tout nouveau document va dans le sous-dossier de son sujet (`docs/regles|audits|ia|expansion|trade|basic|precision|questions|journal|simplifications/`) et est listé dans `docs/INDEX.md`. Jamais à plat dans `docs/`.

## Autonomie

Décision d'Émilien, 30 sept. 2026 : **plus d'autonomie, plus de demande de permission**. Tout s'exécute sans validation préalable (correctifs, fonctionnalités, nouveaux mécanismes, architecture, dépendances, migrations) dès que c'est cohérent avec la demande ; on le signale en une ligne dans le compte rendu au lieu de demander avant.

- **Réservé à Émilien (préparer, ne pas exécuter)** : fusion vers `main`, actions irréversibles ou destructrices (suppression de données/prod, réécriture d'historique git), changement d'une règle produit verrouillée, dépense ou abonnement payant.
- **Design** : si une direction est donnée, l'exécuter. Plusieurs pistes visuelles seulement quand la demande est réellement ambiguë.
- **Ne jamais** élargir une demande : ne changer que ce qui est demandé (un style demandé pour UN état ne s'applique pas aux autres ; « zones précises » ≠ couleur principale — le **violet reste la couleur principale** de l'app, halos compris, sauf demande explicite).

## Travail à deux (Émilien + Gaspard)

Chacun dirige sa propre discussion Claude sur le même dépôt. Pour ne pas s'écraser :
- **Un propriétaire par segment à la fois** (cartographie ci-dessous) ; un segment déjà pris ne se touche pas.
- **Une branche par chantier** : `claude/<sujet>` depuis `origin/staging` à jour.
- **Rebase obligatoire avant chaque push** : `git fetch origin && git rebase origin/staging`, puis vérifier `git diff origin/staging` (que ce qui est voulu), puis `git push origin HEAD:staging`. Jamais de `--force` sur `staging`. Un push refusé (non fast-forward) = refaire le rebase, pas forcer.
- Fichiers très partagés : petits commits, rebase juste avant le push. Un conflit que Claude ne peut pas résoudre sans perdre le travail de l'autre → s'arrêter et prévenir.
- `main` : toujours fusionné par Émilien seulement.

## Hébergement du code

- Dépôt : https://github.com/Noesis-Code/noesis-timetracker.git — branche d'intégration `staging`.
- Push vers `staging` : direct, une fois le chantier prêt et testé, **sans question de confirmation** (décision du 20 sept. 2026 ; il n'existe pas d'« application Teste » distincte : `staging` EST l'environnement de test).
- `staging` est déployé automatiquement sur Railway (https://web-staging-6d1b.up.railway.app). Fusion `staging` → `main` : toujours par Émilien, après test.
- Depuis le 10 sept. 2026, rien ne part en production (`main`) sans avoir été testé et validé sur `staging` ; la PR `staging` → `main` n'est jamais fusionnée sans validation explicite d'Émilien.
- Fins de ligne : lire celles du fichier avant d'éditer et les préserver (dépôt en LF ; ne jamais réécrire un fichier entier en changeant CRLF/LF).
- Ce dossier local `C:\Users\morel\Projects\noesis-timetracker` (machine `nacarat`) est le clone de référence d'Émilien ; le travail des agents passe par GitHub, il fait `git pull` pour récupérer.

## Vérifier avant de livrer

- `node --check` sur chaque `.js` touché ; parseur CSS sur les `.css` ; `node test/run-tests.js` (unitaires, parcours fonctionnels `test/fonctionnel-*.js`, Trade Tracker ; Trade exige `cd trade-tracker && npm ci` une fois, `scripts/new-worktree.sh` lie ses `node_modules`).
- Test fonctionnel : `NOESIS_DATA_DIR=$(mktemp -d) PORT=3999 node server/index.js` puis appeler les routes touchées (données de test : `server/lib/seed-staging.js`).
- Toute régression silencieuse déjà vue ici : un correctif qui « disparaît » d'un fichier partagé. Avant de conclure, `git diff origin/staging` doit ne contenir QUE ce qui est voulu.

## Vérification visuelle (UI)

`NOESIS_DATA_DIR=$D RAILWAY_ENVIRONMENT_NAME=staging node scripts/dev-seed.js` (affiche l'id d'Emilien), puis `NOESIS_DATA_DIR=$D PORT=3999 node server/index.js &`, puis `python3 scripts/visual-check.py <id> <dossier> [dark|light]` et lire les PNG. Pour un écran précis, copier le script et cliquer jusqu'à lui. Toute retouche de design se vérifie en capture avant de rendre la main.

Toute modification d'interface suit `DESIGN.md` (lexique de design) ; relire ce fichier avant de coder et signaler tout écart. L'application n'a PAS de mode clair : sombre uniquement.

## Travailleurs en arrière-plan (depuis le 30 sept. 2026)

Émilien envoie ses demandes au coordinateur, qui les lance chacune dans une tâche en arrière-plan (tâche planifiée « Chantier TMT » déclenchée à la demande). Un travailleur : lit ce fichier et `BACKLOG.md`, prend UNE demande, travaille sur `claude/<sujet>` (depuis `origin/staging` à jour), teste, puis fusionne vers `staging` (il ne s'arrête pour proposer que pour les cas réservés à Émilien), puis rend un compte rendu de 2 lignes. Il ne modifie pas `BACKLOG.md` (le coordinateur le tient).

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
| Objectifs — Planification IA | `goalsauto.js`, `scripts/apply-offre1-*.js` | |
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
- Les suggestions IA informent, ne décident jamais à la place de l'utilisateur ; une saisie manuelle ne change que par proposition validée, montrant l'avant et l'après (champ par champ, jamais de modification silencieuse ; un refus est mémorisé). **Exception décidée par Émilien le 16 oct. 2026** : seules les corrections d'orthographe/grammaire s'appliquent en silence à l'entrée d'une tâche (`server/lib/silentspellfix.js`, jamais listées dans « Modifications proposées ») ; tout autre changement d'une saisie manuelle reste une proposition validée.
- Une seule technique d'interaction par fonction : fermeture d'un plein écran = croix ✕ ; réordonnancement = glisser-déposer ; bouton d'envoi DANS la zone d'écriture.
- Le gate d'installation PWA (`isStandaloneMode()`) ne se déclenche qu'à la création/récupération d'un profil.
- **Connecteur IA libre (21 oct. 2026, décision d'Émilien)** : un compte gratuit peut faire toute l'organisation d'Expansion avec SA propre IA via « Connecter mon IA » (outils d'écriture gratuits, compte du jeton seulement, journal, retrait réversible, limite de débit) ; seule l'IA INTÉGRÉE payée par Noèsis reste payante (E3 ajustée). Voir `docs/expansion/connecteur-ia-libre.md`.
