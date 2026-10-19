# BACKLOG TimeTracker

Tenu à jour par le coordinateur. Priorité : 🔴 bloquant · 🟠 à faire · 🟡 quand possible · ❓ à trancher par Émilien.
Dernière mise à jour : 30 sept. 2026 (construit à partir de `chantiers-en-cours.md` ; tout le code écrit sur le disque d'Émilien au 30 sept. est déjà dans `staging` sauf la Piste B « verre » ci-dessous).

## 1. En attente de validation d'Émilien (code déjà dans `staging`, confirmation visuelle)
- Page 3 Objectifs s'ouvre par-dessus la Page 2 (z-index 101), fermeture qui revient sur la Page 2.
- Page 2 Objectifs en fenêtre plein écran + boutons Tâches/Objectifs façon onglets d'activité.
- Page 1 : puces d'activité (état au repos gris + point ; états d'écriture inchangés).
- Épuration visuelle : bouton d'envoi dans la zone (Profil, Feedback), topbar (Noesis→profil, profil→réglages), icône + étiquette « Feuille de route », page Profil en fenêtre, Réglages mode épuré.

## 2. En cours
- (rien) — Piste B « verre » + « verre partout » fusionnées dans `staging` le 30 sept., validées par Émilien.
- 🟡 Vérifier en thème clair (captures non concluantes) le « + » des projets du Profil et les bascules en verre.
- 🟡 `server/lib/seed-staging.js` n'est appelé nulle part : `staging` démarre-t-il sans données de test ? À vérifier.

## 3. À trancher (❓ Émilien)
- ❓ Panneaux flottants / menus : ajouter une croix ✕ en plus du clic en dehors ? (jamais posé).
- ❓ Faut-il migrer le bloc capacité/génération jour par jour (Planification IA) et les sections Tâches/Discussion vers un fichier de page, ou les laisser dans le tronc commun ?
- ❓ Sous-projets : aucune discussion dédiée ; garder le segment ou l'absorber ?

## 4. Bugs connus / à vérifier
- 🟠 Diagnostic clavier sur l'écran Catégories (fenêtre Activité) : HUD de diagnostic posé, capture de l'écran précis jamais obtenue ; bandeau clavier natif.
- 🟠 Bandeau/zone teintée pointillée au-dessus du clavier sur la Page 3 quand la période a déjà un objectif (non reproduit ; piste : pincement clavier partagé dans `app.js`).
- 🟡 `bindActivityDrag` (`app.js` ~L16046) : ajouter `click → stopPropagation()` sur la poignée (même défaut corrigé sur `bindProjectDrag`).
- 🟡 `users.stripeCustomerId` et `notifyEnabled`/`communityNotifyEnabled` : présents dans `db.js` ; vérifier qu'ils survivent sur une base NEUVE (le testeur démarre le serveur sur base vide).

## 5. Fonctionnalités à finir
- 🟠 Vision (18 oct. 2026, Émilien) : à terme l'utilisateur de l'offre Expansion ne saisit que son OBJECTIF ANNUEL et sa STRATÉGIE ; l'IA propose ensuite objectifs périodiques, hebdomadaires et tâches, par pôle/secteur créés par l'utilisateur (toujours en proposition validée avant/après). Étape 1 en cours : formulaire de stratégie par activité + filtre IA des tâches IA hors stratégie (branche `claude/strategie`). Étape 2 : génération des objectifs périodiques/hebdo/tâches à partir de objectif annuel + stratégie.
- 🟡 Persistance du geste « reporter à plus tard » (liste du jour) — nécessite une table, cadrage d'abord.
- 🟡 Affichage de la suggestion cross-secteur en attente (moteur livré, affichage hors scope jusqu'ici).
- 🟡 Retrait de l'option « Publier » dans Communauté (zone recherche seule, bouton dedans) — vérifier l'état dans le code.
- 🟡 Notifications : adressage au clic pour demande de suivi (`#profileNotifPanel`), publication, tâche du jour (`activityId`/`taskId`) — vérifier ce qui est livré.
- 🟡 Objectifs : cohérence pôle sans secteur / secteur gelé (scénarios 1, 2, 5 du brief « cohérence secteur/tâches/objectif »).

## 6. Hors code (Émilien)
- Relecture avocat (politique de confidentialité, mentions légales, CGU) ; CGU Offre 1 (écarts à trancher) ; consentement parental Offre 1.
- Test Stripe live avant le premier abonnement ; Offre 1 pas encore mergée en production.
- Fusion `staging` → `main` après test sur Railway.
- Module Horaires / Jacopo : en pause depuis le 15 sept. (PR #3 déployée, à reprendre).

## 7. Dette / méta
- 🟡 Aucune suite de tests fonctionnelle (seulement les sauvegardes) : créer un smoke test qui démarre le serveur sur base neuve et appelle les routes principales — **à proposer à Émilien (nouveau mécanisme)**.
- 🟡 Archiver les règles « device_list_dir / SHA-256 / verrou 🔒 » : obsolètes depuis le passage au flux Git (fait dans CLAUDE.md, reste à nettoyer dans les docs du projet Claude).

## À supprimer par Émilien (tables inertes)
- Tables des conversations par projet / notes de tâches / tâches éphémères (créées par l'ancien server/lib/conversations.js, retiré) : plus utilisées, données laissées en base.

## Propositions du Simplificateur (19 oct. 2026, passe 1 ; non exécutées, par impact)
1. [FAIT, claude/simplif-1-2] Réglage « Confirmer chaque tâche ajoutée par l'IA » (Mon IA, 49a7324) : option de plus ; garder la confirmation toujours active et retirer la bascule (si #1451 ne la demandait pas mot pour mot).
2. [FAIT, claude/simplif-1-2] Modules : deux chemins vers « désactiver un module » (Réglages > Modules ET appui long + ✕ dans la barre du bas) ; n'en garder qu'un.
3. (FAIT 19 oct., approuvé par Émilien) Réglages > Calendrier : « Exporter vers le calendrier », « Activités exportées », « Importer » et « Exporter mes données » en 4 blocs ; fusionner export agenda + activités en un seul bloc.
4. Chrono : zone « Une amélioration à suggérer ? » (57b813a) double le signalement/feedback existant ; RÉSERVÉ Émilien (touche le Chrono).
5. Signalement de messages + mots bloqués configurables (7328aab) : surface de modération ; RÉSERVÉ Émilien (légal/Loi 25), à évaluer pour réduction.
6. Écran d'onboarding « Choisis ce dont tu as besoin » (a35e500) doublon de Réglages > Modules ; défaut tout actif et retirer l'écran.
7. « Mon IA » : sous-section « détails repliés » de la connexion MCP, à réduire à état + bouton + révocation.
8. Bouton « Tout supprimer » (Nouvelles tâches / Modifications proposées, 7405e05) : doublon du tri case par case ; à confirmer utile.
9. Feuille de temps : vue Année dans le menu de période (8675c9f), à garder seulement si utilisée ; sinon retirer.
10. Textes d'aide ⓘ des Réglages agenda : raccourcir à une ligne.

## Économie des crédits (Claude API, chantier 4, 19 oct. 2026)
Déjà en place avant ce lot : Haiku d'abord + repli fort sur seuil de confiance (classement, inter-secteurs, reformulation, hebdo, plan quotidien, offre 1, document-taches), mémo 24 h à température 0 (classement, reformulation, hebdo, document-taches), cache de prompt Anthropic, lots à -50 % (Drive), plafonds par utilisateur/jour/tranche et « system », max_tokens serrés. Seule l'orthographe est en Haiku seul.

| Changement | Économie estimée |
|---|---|
| Mémo 24 h du plan Offre 1 (`generateSubProjectsPlan`) : relivraison Stripe/reprise avec mêmes formulaires = 0 appel | ~0,05-0,10 $ par relivraison évitée (rare) |
| `scripts/ai-cost-report.js` : lecture seule, par fonction/modèle/jour, tokens moyens, % cache lu, taux de repli | 0 $ direct ; permet de mesurer les pistes ci-dessous |

Prochaines pistes (à mesurer avec le rapport sur données réelles avant d'agir) :
1. Lire le taux de repli réel par fonction ; si > 40 %, Haiku coûte plus qu'il n'économise : relever le seuil ou passer la fonction en fort seul.
2. Cache de prompt (`aicache.messageParams`) pour inter-secteurs et classement : le préfixe (catégories) se répète par activité.
3. Raccourcir `SYSTEM_PROMPT` de inter-secteurs et hebdo (consignes redondantes) avec jeu d'évaluation du chantier 6 pour garantir zéro perte.
4. Passer les plans quotidien/hebdo générés la nuit en API Batch (-50 %), comme Drive.
5. Exclure du prompt les catégories archivées/vides et tronquer les descriptions longues dans le payload du classement.

## Précision des tâches (chantier permanent n°6, 19 oct. 2026)

**Cartographie.** Où l'IA classe/génère/filtre : `goalstaskclassify.js` (classement pôle/secteur, Haiku puis repli fort, seuil `NOESIS_CLASSIFY_MIN_CONFIDENCE` 80, mode strict = INCERTAIN -> l'utilisateur choisit) ; `goalscaptureplace.js` (placement calendrier, seuil `NOESIS_CAPTUREPLACE_MIN_CONFIDENCE` 50, désormais réglable) ; `documenttasks.js` + `docanalysis.js` (tâches issues de documents, seuil `NOESIS_DOC_MIN_CONFIDENCE` 80) ; `goalsweeklyauto.js` (`NOESIS_WEEKLY_MIN_CONFIDENCE` 80) ; `goalsauto.js`, `crosssectorinference.js`, `dailysuggestioncron.js`, `goalsrewrite.js`. La stratégie (6 champs : but, échéance, priorités 1-3, à ignorer ; `strategy.js`, route `/strategy`) n'est injectée QUE dans le prompt de `documenttasks` (bloc `<strategie>`) et dans les modifications proposées (`changeproposals`) ; le classement et le placement des saisies manuelles ne la voient pas.

**Méthode.** Jeu fixe `test/fixtures/task-precision/cases.json` (42 cas FR : classement, rejet « à ignorer », doublon, incertitude). Harnais `node scripts/eval-task-precision.js` (`--fake` par défaut, déterministe, sans réseau ; `--live` = clé réelle, lancé par Émilien seulement ; `--json`, `--min-confidence=N`). Fournisseur injectable. Chaîne rejouée : titre nettoyé -> « à ignorer » (tâches proposées par l'IA seulement, jamais une saisie manuelle) -> doublon -> fournisseur -> seuil. Garde-fous dans `test/precision-taches-test.js` (inclus dans `run-tests.js`).

**Fait.** `server/lib/taskprecision.js` (règles pures) branché dans `documenttasks.parseDetailed` : titres IA nettoyés (puces, numérotation, ponctuation finale), « à ignorer » appliqué strictement AVANT affichage (compté `dropped.ignore`, jamais affiché), dédoublonnage insensible aux accents/casse/ordre des mots. Seuil de placement réglable par variable d'environnement (défaut inchangé).

**Métriques actuelles (fournisseur simulé, seuil 80).** précision 96,3 %, rappel 89,7 %, refus 21,4 % (100 % justes), incertitude 14,3 % (66,7 % justifiée), exactitude 92,9 %. Écarts connus : « Payer la facture du fournisseur de grains verts » (le sujet l'emporte sur l'action), deux cas incertains à tort. Ces chiffres mesurent les règles et la chaîne, PAS la qualité du vrai modèle.

**5 prochaines pistes.**
1. [Émilien, clé réelle] `node scripts/eval-task-precision.js --live` (~42 appels Haiku) pour mesurer le vrai modèle ; comparer aux chiffres simulés, ajuster `NOESIS_CLASSIFY_MIN_CONFIDENCE`.
2. [Émilien, clé réelle] Même jeu avec `NOESIS_CLASSIFY_FAST_MODEL=off` (modèle fort seul) : le repli Haiku -> fort vaut-il son coût ?
3. Injecter le bloc stratégie (priorités, but) dans le prompt de classement `goalstaskclassify.buildPrompt` pour départager les cas ambigus (test avant/après avec `--live`).
4. Étendre le jeu à 100+ cas tirés de corrections réelles (`goalsclassifyexamples`, anonymisées) ; ajouter les cas « action vs sujet ».
5. Utiliser `priorityRank` (déjà écrit, informatif) pour ordonner les tâches proposées par l'IA selon les priorités de la stratégie, après validation d'Émilien (changement d'affichage).

**Proposition : processus d'analyse de clientèle** (détail : `docs/processus-analyse-clientele.md`, NON codé, en attente de décision). Besoin -> zone -> secteur -> recherche de facteurs propres au secteur à chaque lancement -> impact marché -> facteurs internes/externes de variation d'utilité -> typologie de clientèles -> segments cibles et critères de repérage -> tâches proposées. Aucune interface nouvelle : entrée = consigne de « Ajouter des tâches » + stratégie existante ; sortie = tâches proposées que l'utilisateur valide, analyse en notes. Prompt paramétré (besoin, zone, secteur) à sortie JSON ; évaluation hors ligne par cas fictifs par secteur (restauration, mines, services pro) avec contrôles de schéma. Coût estimé ~0,01 $ (Haiku) à ~0,03 $ par lancement, mémoïsé via `aicache`. Questions à trancher : sources web ou non, cache ou recalcul, offre payante ou gratuite, lieu d'affichage, langue.

## Pilotage (chantier 7 ; règles PROPOSÉES à Émilien, à valider)
**Message court (fin de lot, 2-3 lignes : fait / à valider / bloqué)** : un lot livré sur `staging`, avec capture seulement si l'interface change ; regroupé si plusieurs lots finissent à moins de ~30 min d'écart.
**Notification push (outil `notifier`)** : seulement ce qui exige Émilien MAINTENANT : (1) décision bloquant un chantier (règle produit verrouillée, légal/Loi 25, paiement/Stripe, fusion `main`, suppression de données) ; (2) incident de sécurité (surtout Trade Tracker/compte de Nick) ; (3) régression en `staging` qui casse le démarrage ou la perte de données ; (4) quota Claude proche de l'épuisement avant la réinitialisation. Jamais pour un lot réussi, une question de design résoluble, ni un test échoué corrigé.
**Ne doit PAS l'interrompre** : correctifs, fonctionnalités cohérentes avec la demande, conflits de merge résolus, choix techniques (signalés en une ligne dans le compte rendu).
**Cadence cible** : lots courts (≤ 1 h de travail par agent), chantiers permanents toujours relancés (jamais de créneau vide), agents en parallèle sur segments disjoints, un seul agent à la fois sur un fichier très partagé ; push direct sur `staging` dès que testé ; point de situation (`scripts/chantiers-status.js`) à chaque relance ; au plus un message à Émilien par heure hors alerte, un récapitulatif par jour.

