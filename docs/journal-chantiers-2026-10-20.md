Résumé de la journée (source : historique `staging`, depuis a85aacb).

## Livré
- Barre du bas à 6 onglets (Trade connecté) : libellés 9 px, marges réduites.
- Écran de chargement : le N de chargement de la PRODUCTION est rétabli (bc5befd) à la demande d'Émilien ; la version « 1,35 s » est abandonnée.
- Trade Tracker : connexion depuis « Modifier l'activité » (+ / interrupteur) ; retrait de l'appui long et du pop-up « Ma barre du bas ». `DEPLOY.md` Trade complété (variables, sauvegarde, retour arrière).
- Capture hors ligne : clé d'idempotence (`Idempotency-Key`, table `idempotency_keys`), pas de doublon au renvoi.
- Serveur : compression HTTP gzip/brotli (JS+CSS : -71 %), SSE et webhook Stripe exclus.
- Crédits IA : plafonds quotidiens pour `recurrence-tache` et `rapprochement-objectif`, appels IA documentés (`docs/ia-appels.md`) et testés.
- Expansion : erreurs checkout/portail FR/EN sans détail interne, variables Stripe documentées (`DEPLOIEMENT.md` §6), message clair si le portail n'est pas activé.
- Précision des tâches : cas d'évaluation (ids x01-x12), consigne pour les tâches avec « et ».
- Pilotage : tests avec `test/lib/tmpdir.js` (aucun dossier temporaire laissé, contrôle en fin de suite), `new-worktree.sh` vérifie les dépendances Trade, correctifs de tests instables. Relecture : `docs/relecture-croisee-2026-10-20-repli7.md`.

## À valider par Émilien sur téléphone
- Barre à 6 onglets (Trade connecté) : « Feuille de route » et « Communauté » ne se touchent pas.
- Écran de chargement : le N d'origine (production) est bien revenu.
- « + Trade » dans Modifier l'activité : ajout et retrait de l'onglet.
- Stripe test : activer le portail client (Paramètres > Billing > Portail client, mode test), puis tester « Gérer l'abonnement ».
- Trade : renseigner `TRADE_RP_ID` (domaine de Trade, sans https://) avant d'essayer les passkeys.
- Stripe test : cocher les événements `charge.refunded` et `charge.dispute.created` sur le webhook.
- Courriels : renseigner `RESEND_FROM` et `EXPANSION_MAILS` pour les courriels d'Expansion.
- Contrastes : 3 couleurs sous 4,5:1 sur `--hover-bg` (`docs/contrastes-basic.md`), à trancher.
- Loi 25 : ajouter au registre des traitements « Apprentissage du classement des tâches » (profil d'apprentissage) ; les exemples de correction ne sont pas partagés entre membres.

## Contrôle de staging (24 h, 284 commits)
- Script : marqueurs de conflit dans les lignes ajoutées, `node --check`/JSON des .js/.json modifiés, `CACHE_VERSION` monotone (final v487).
- CACHE_VERSION : monotone, aucun recul. Aucun fichier tronqué (la réduction de `styles.css`, 6376 à 3536 lignes, est voulue : c701f0c).
- Marqueurs de conflit commités puis corrigés : `public/sw.js` (bb95267, corrigé par d5c8117) et `CHANTIERS.md` (b7a0433, corrigé par 8391f78). Aucun marqueur sur `staging` actuel.

## Serveur
- Clés d'idempotence : purge des clés de plus de 7 jours au démarrage puis chaque jour (`server/lib/idempotencypurge.js`, test `test/idempotency-purge-test.js`).

## État par chantier (mise à jour : dernières 4 h, jusqu'à 7589bac)
- Trade Tracker : dernier = effacement/export Loi 25 d'un compte (`privacy.js`), index de lecture, gain par position cohérent, doublons d'import, test de volume 5 000 transactions, preuves d'intégration TMT-Trade (captures 390 px) ; prochain = Q4 à Q6 (déploiement, validation, production), affichage du gain réalisé (Q9), cases L1 à L5.
- TT Basic : dernier = clavier Android (barre d'onglets masquée si le viewport rétrécit), docs PWA hors ligne, N de chargement mesuré en 3G simulée (aucune correction), bump sw v497 + garde-fou `test/sw-bump-test.js` ; prochain = minuit dimanche->lundi, 26 bugs staging, file hors ligne.
- TT Expansion : dernier = test de bout en bout et garde `OFFER_CHECKOUT_OPEN`, checklist de mise en production, achat refusé hors staging, traductions EN du code gratuit, `invoice.payment_failed` documenté (Q12) ; prochain = courriels, CGU, Q9 à Q12.
- Crédits Claude et API : dernier = identifiants de modèle centralisés (`aimodels.js`), test d'apprentissage de bout en bout, coût par utilisateur actif, masquage Loi 25 avant envoi à l'IA ; prochain = `--live`, seuil 5 $, mémo persistant.
- Simplification et design : dernier = 46 clés i18n mortes retirées, route `weekly-capacity` et 4 fonctions orphelines retirées, 18 `!important` sans effet retirés (captures identiques), DESIGN.md aligné sur le CSS ; prochain = cases retirer/garder d'Émilien.
- Précision des tâches : dernier = validateur assoupli (0 faux rejet sur 315 titres), compteur journalier générées/rejetées, lot aveugle h61-h90, consignes resserrées ; prochain = évaluation `--live`, horaire fixe A/B/C.
- Principal et pilotage : dernier = suite de tests parallèle bornée à 3 (472 s -> 257 s), garde TMPDIR/racine du dépôt, `mcp-test` déterministe, bump sw ; prochain = vérification de stabilité (`docs/performance-tests-2026-10-20.md`), relecture des livraisons suivantes.

## Pilotage : audit dépendances, variables, espace disque (repli 11)
- `npm audit --omit=dev` : racine = 1 critique (`proxy-addr` <= 2.0.7, usurpation d'IP), corrigée par `npm audit fix` (mise à jour de correctif, lockfile seul) ; Trade Tracker = 0 vulnérabilité. Aucune majeure en attente.
- Variables d'environnement : 114 lues par le code, ~100 absentes de `DEPLOIEMENT.md` ; ajoutées en §7 (noms seulement). `railway.json` cohérent.
- Espace `/tmp/noesis-*` (comptage, rien supprimé) : 1431 entrées, 68 Mo au total ; 1384 sont des `noesis-verify-*.db-shm/-wal` (fichiers orphelins de vérification, quelques Ko chacun), 7 `noesis-backup-test`, 7 `noesis-backup-empty`, le reste = dossiers de chantiers `noesis-<sujet>-*`. Nettoyage à décider par Émilien/coordinateur.

## Pilotage (repli 16) : durée des tests et contrôle de staging
- `node test/run-tests.js` : 7 min 39 s (119 passées, 0 échouée) mais 1 min 48 s de CPU : la machine était chargée (load 7-9). Les plus lents mesurés seuls : `trade-tracker/test/run.js` ~118 s (enchaîne les autres tests Trade), `member-series-test.js` 32 s, `sync-charge-test.js` 19 s, `broker-e2e-test.js` 13 s, `stepup-test.js` 12 s. Accélération possible (non appliquée, risque de masquer une régression) : exécuter les tests Trade indépendants en parallèle ; réduire les séries de `member-series-test.js`.
- Instabilité : `task-lock-test.js` (seuil de durée sous charge) déjà stabilisé ; passe en 5 s seul. Rien d'autre à corriger.
- Staging : aucun marqueur de conflit, CACHE_VERSION monotone (v467 à v491), `/healthz` ok.

## Pilotage (repli 19) : contrôle de staging, relecture, friction
- Staging (bc365cd) : `/healthz` ok, CACHE_VERSION v498 (monotone), aucun marqueur de conflit, `node --check` des .js modifiés ok. Écart `main..staging` = chantiers du jour (540 fichiers), rien d'imprévu.
- Relecture des pushs 06af14a, 86ea01b, 561afc7, 327c34e, 5a12f13, 24ce87d : serveur + tests + docs seulement, aucun bouton/option/couleur, aucun fichier hors périmètre ; titres des jeux d'essai = exemples inventés (pas de tâche personnelle).
- Friction corrigée (Feuille de temps, vue Semaine) : la grille s'ouvrait sur 0 h alors que ~5 h sur 24 sont visibles à 390 px, donc souvent vide. Elle s'ouvre maintenant 1 h avant la première case remplie (aucun contrôle ajouté, seulement si l'utilisateur n'a pas défilé). Capture 390 px : grille démarre à 7 h. À valider sur téléphone.
- Index des questions : inchangé, les lignes restent ouvertes (aucune résolue par un commit ; `/healthz` toujours absent de `railway.json`).

## Pilotage (repli 20) : suite complète, grille Semaine, healthcheck
- Aucun push d'autre chantier depuis 4a8dd8a : rien à relire pour régression, bouton/option/couleur ou titre personnel recopié.
- Grille Semaine (4a8dd8a), cas limites relus dans le code : semaine vide = aucun défilement (0 h) ; entrée à 0 h = `max(0, h-1)` donc 0 h ; entrée à cheval sur minuit = cases 23 h (jour N) et 0 h (jour N+1), la plus petite case est 0 h donc 0 h ; fuseau = les cases viennent déjà du serveur dans le fuseau du téléphone (09bfaa0), aucune conversion côté grille. Seule la position initiale change, toutes les heures restent atteignables en défilant ; rien n'est réappliqué si la grille est déjà défilée. Case ajoutée à l'index (garder / revenir à 0 h).
- `/healthz` toujours absent de `railway.json` : case d'index précisée (`healthcheckPath`), fichier non modifié.
- Suite complète sur staging 4a8dd8a : 142 passées, 0 échouée.

## Pilotage (repli 21) : relecture, grille Semaine testée en navigateur
- Relecture de 672ac64 à e33015b : retraits de code mort seulement (7 symboles, grep : aucune référence restante), aucun bouton/option/couleur, aucun titre personnel, aucun fichier hors périmètre.
- Grille Semaine testée (Playwright, 390 px, fuseau UTC) : semaine vide = 0 h (message « Rien d'enregistré ») ; entrée 0 h = 0 h ; entrée 21 h = grille sur 19-20 h, 23 h visible ; entrées 9 h 30 = 8 h ; défilement manuel conservé (0 h et 150 px) ; captures `late.png`, `prevweek.png` vues.
- Défaut trouvé et corrigé : en changeant de semaine, la grille gardait la position de la semaine précédente (14 h au lieu de 6 h, entrées hors de vue). La position posée par programme est maintenant mémorisée : elle est recalée à chaque changement de semaine, un défilement de l'utilisateur reste respecté. Aucun contrôle ajouté.
- Arrêt oublié du chrono : déjà couvert (le dialogue d'arrêt affiche la durée et laisse corriger début/fin) ; rien à faire.

## Pilotage (repli 22) : relecture, index des questions, friction
- Relecture de 6643526 et d6a5a2c : Trade = un test seul + ligne CHANTIERS.md ; d6a5a2c = 58 déclarations CSS retirées (échantillon relu : `.goalsCaptureFloat`, `.goalsPlacementModal`, `.goalsGridScroll` toujours redéfinies plus bas, aucun bouton/option/couleur, aucun titre personnel, périmètre = CSS + docs). Seul défaut : `public/` touché sans bump de `sw.js` (v504) : `test/sw-bump-test.js` échouait ; bump posé entre-temps par un autre push (v505).
- Index des questions réécrit pour téléphone : 5 décisions en tête, puis A bloque une mise en ligne, B retirer, C décisions produit/IA, D ajouts (refus par défaut), E accès/infra ; 1 case par ligne, détail dans le fichier source. Aucune case tranchée par un commit (railway.json sans healthcheck, « Offre 1 » encore dans `index.html` et `legal-en.js`). Doublon fusionné : benchmark web (Trade Q8 = benchmark Toggl/Clockify/Harvest de Simplification) ; trois `--live` et deux mentions Loi 25 regroupés sur une ligne.
- Liste de contrôle (question source -> ligne d'index) : Basic B1, B3, B5, B6, B7 -> D ; B2, B8 -> A ; B4 -> B ; B9, B10 -> C ; Premier lancement : modules, activités, confirmation du code -> décision 5 ; récupération de profil, courriel+code, activité sans pôle, bouton grisé, nom/téléphone -> B. Crédits : `--live` (2) -> décision 3 ; seuil 5 $, canal d'alerte, seuils, tarifs, mémo, signal, troncature, 60->25 -> C ; Loi 25 (2) -> A. Expansion : Q1-Q4 -> décision 1 ; Q5-Q9, Q11 -> C ; Q10 -> E. Précision : 5 cas, horaire fixe, récurrence -> C ; `--live` h01-h60 -> décision 3. Simplification : Feuille de temps/Stats/Communauté/pastille/audit écrans -> décision 4 et B ; routes dormantes, scripts, docs -> B ; EN du module document et 4 clés -> C ; benchmark -> E. Trade : Q4-Q6 -> décision 2 ; Q7, Q3 -> décision 4 et B ; Q1, Q2, Q9-Q12 -> C ; Q8 -> E ; L1-L5 -> A. Autres : contrastes -> C ; healthcheck -> A ; grille Semaine -> B ; `/tmp` et racine -> E ; vues/responsable/RDV -> D.
- 17b21b6 (Précision) a aussi touché `public/` sans bump : bump v506 posé ici.
- Friction (retour après plusieurs jours d'absence) : carte « Non réalisées » relue (Page 2 Tâches) : chaque tâche proposée avec son retard en jours et « Tout reporter » dès 2 tâches reportables, rien ne bouge sans clic ; aucun défaut trouvé, rien changé. Lien tâche du jour -> chrono : n'existe pas (le pôle se choisit après le démarrage) ; en ajouter un serait un nouveau bouton, donc non fait.

## Pilotage (repli 23) : suite, CSS de d6a5a2c relu en entier, garde-fou titres personnels
- Suite complète en tête de staging (dec498e) sans processus parallèle : 146 passées, 0 échouée. Aucun commit après dec498e ; 17b21b6, ece77be, 5682e0c, f2c4ccc relus (code et tests cohérents, aucun bouton/option/couleur).
- d6a5a2c relu déclaration par déclaration par script (cascade simulée sur les 14 feuilles dans l'ordre de `index.html`, clé = contexte @media + sélecteur exact + propriété, !important compris) : 0 différence de valeur finale entre avant et après (le script détecte bien 309 écarts sur un commit plus ancien). Aucun cas douteux : chaque déclaration retirée est redéfinie, à valeur et priorité égales, par le même sélecteur plus bas ; aucun raccourci/détail croisé ; rien n'a été retiré d'un `@supports`/repli de navigateur.
- CACHE_VERSION : strictement croissant sur les 30 derniers commits touchant `sw.js` (v477 à v506, sans trou ni doublon) ; `sw-bump-test` vert.
- Nouveau test `test/pas-de-titre-perso-test.js` : échoue si `docs/` ou `test/` recopie un titre (>= 4 mots) des listes `/home/claude/taches-secteurs/*.json` (lues à l'exécution ; absentes -> ignoré). Deux titres retirés de `ia-amelioration-2026-10-20.md`. Tolérés (dette) : les deux rapports `tri-taches-*` qui citent ~65 titres par construction.
- Index des questions : 44 lignes (< 80), chaque fichier cité existe.

## Pilotage (repli 24) : titres personnels retirés des rapports de tri, relecture, friction
- Les deux rapports `tri-taches-*` ne citent plus aucun titre : 65 titres remplacés par un résumé neutre (catégorie + nature, sans mot ni nom d'origine), classes, preuves et questions intactes. La liste de tolérance de `test/pas-de-titre-perso-test.js` est supprimée : le test est strict (281 titres, 0 recopie).
- Relecture de 34c564d : écart d'horloge (cas NaN, > 1 jour, copie locale), resynchro au retour au premier plan sans refermer le récapitulatif ; aucun bouton/option/couleur, bump sw posé (c0610a4).
- Friction (retour d'un autre onglet) : une annonce en attente s'affichait par-dessus une saisie en cours. Elle attend maintenant le prochain retour si un champ de texte a le focus. Aucun contrôle ajouté.

## Pilotage (repli 25) : suite sérialisée, règle de rebase tardif
- Suite complète en tête de staging (a723dfd), lancée par le nouveau `scripts/suite-verrouillee.sh` : 149 passées, 0 échouée. Aucun commit après a723dfd ; 81aec93, 3f0f51e relus (requêtes préparées en cache, garde de focus avant l'annonce) : aucune régression, aucun bouton/option/couleur.
- `scripts/suite-verrouillee.sh` : verrou `flock` sur `/tmp/tmt-suite.lock` (hors dépôt), attente max 25 min (code 75 + message clair), suite limitée à 25 min, le fils n'hérite pas du verrou (libéré même sur `kill -9` du script). Testé avec un faux `run-tests.js` : deux lancements simultanés = séquentiels, délai dépassé = code 75, verrou repris après kill.
- `docs/brief-chantier.md` : points 10 (suite sérialisée) et 11 (règle de rebase tardif : diff entrant limité à `docs/` ou bump sw = `sw-bump-test` + tests du périmètre ; sinon suite complète).

## Pilotage (repli 26) : suite sur la tête de staging, relecture, bilan
- Suite complète via `scripts/suite-verrouillee.sh` sur 461721f (code entré après le dernier test : stats.js, history.js, dates.js, volume-coherence-test) : 149 passées, 1 échouée. Échec : `sw-bump-test` (2b6076c modifie `public/` sans bump ultérieur de CACHE_VERSION). Corrigé : bump sw v512.
- Relecture 461721f~12..461721f : formateurs de fuseau en cache (borné à 500), bornes de jour calculées une fois, pièces jointes en une requête (même filtre `userId` + `isoDate`, même ordre) : équivalents, aucune régression. Récapitulatif d'arrêt en instants exacts et détection de saut d'horloge : bornés, rien de visible ajouté. `attachmentsFor` reste défini (appelants éventuels ailleurs).
- Brief : seul `.claude/agents/testeur.md` (point 3) citait encore `node test/run-tests.js` sans le script ; remplacé par `scripts/suite-verrouillee.sh`. Les autres mentions (brief point 4, 10) renvoient déjà au script ; `CHANTIERS.md` l.122 et `docs/ia-modeles.md` l.26 gardent la commande brute (à aligner).
- Friction vérifiée : écran vide d'un profil sans activité (Chrono : « ajoutes-en une dans Activité », libellé de l'onglet exact, traduit EN) et historique vide : textes corrects, rien à corriger. Reste à vérifier sur téléphone (case) : retour à l'app après notification et ajout d'une tâche depuis la Feuille de route.
- `docs/bilan-chantiers-2026-10-20.md` : une page pour Émilien. Index des questions : 44 lignes (< 80).

## Pilotage (repli 27) : suite sur la tête, bumps sw, deux parcours vérifiés
- Suite complète via `scripts/suite-verrouillee.sh` sur la tête de staging (4f1b9e8, après 5d3d6f8 : `envcheck`, `stripewebhook`, `server/index.js`) : 151 passées, 0 échouée. Relecture de 5d3d6f8 : `envcheck` ne journalise que des noms de variables et ne bloque jamais le démarrage ; webhook : corps limité à 512 ko (au-delà, rejet par Express : Stripe réessaie), événement sans id/type refusé avant tout enregistrement, `compte=` ajouté au journal de remboursement ; rien de visible.
- Bumps sw sur les 30 derniers commits touchant `public/` : 5 sans bump ni bump du commit suivant (2b6076c, 17b21b6, d6a5a2c, 49a0209, 88c0de6) ; tous rattrapés plus tard par un bump groupé (b59d29f, a723dfd...). Nouveau `scripts/pre-push-sw.sh` : hook git local optionnel (refuse un push dont les commits touchent `public/` sans changer `CACHE_VERSION`), testé sur 2b6076c (refus) et sur la tête (accepté) ; 2 lignes au brief (point 12), non imposé.
- Parcours en Playwright 390 px (profil seed, port 4102, hors suite). Ajout d'une tâche depuis la Feuille de route : texte + puce d'activité + Ajouter -> fenêtre « Sélection du pôle & secteur » (pas de clé IA en test) -> Enregistrer -> ligne ✓ avec activité, pôle et date, compteur 0/1 sur la puce ; la tâche est dans l'écran Tâches : OK. Retour après notification (ouverture à froid) : `post` (profil de l'auteur, publication surlignée), `invite`, `follow` (panneau + liste surlignée), `dailypriority` : OK ; cible absente (tâche 999) : repli sur la liste, sans erreur.
- Défaut corrigé (`public/app.js`, `focusGoalsTaskFromNotification`) : seuls les secteurs étaient dépliés avant de surligner la tâche, or les pôles sans secteur sont aussi repliés depuis le changement d'Émilien : la tâche n'était trouvée qu'après ~4 s (repli sur le groupe). Le pôle est maintenant déplié aussi : surlignage en 0,7 s. Aucun contrôle ajouté ; bump sw posé.
- Constat non corrigé : `?notif=activity&...messageId=` n'arrive plus à la Discussion (le bouton `#goalsPage2ModeDiscBtn` a été retiré de l'UI le 15 oct., f36bb25) : on atterrit sur la Page 2 sans surlignage. Les messages ne s'envoyant plus depuis l'app, aucune notification de ce type ne part ; branche morte, question ajoutée à l'index (B).
- Léger défaut visuel noté (non corrigé, détail) : la liste « Où » de la fenêtre de placement est translucide, « Quand » transparaît derrière.
- Suite finale après rebase (29ca0f0 + ce commit) : 152 passées, 0 échouée. Index des questions : 45 lignes (< 80).

## Pilotage (repli 28) : liens de notification
- Aucun commit sur `staging` depuis ebf2a4e ; relu en plus le code Précision entré après le dernier test (608dbb1 : `temporalvocab.js`, `capturedatehint.js`, `taskprecision.js`) : cohérent. Réserve mineure, non corrigée : « 3 mar. » devient « 3 mardi » (abréviation de jour prioritaire sur celle du mois), cas rare.
- `?notif=activity` : la branche attendait pendant 8 s un bouton Discussion qui n'existe plus, puis laissait l'utilisateur sur la Page 2 sans repère. Elle ouvre maintenant directement la Page 2 de l'activité (écran existant le plus proche). Retrait de la notification : case dans l'index des questions.
- Table type -> écran de tous les liens `?notif=` (11 types) : `docs/notifications-liens-2026-10-20.md`. Test `test/notif-liens-test.js` (branche par type, écrans visés, plus de Discussion).
- Liste « Où » translucide : voulu (Émilien, 5 oct., 6f29fb7) et conforme à `DESIGN.md` (verre, flou 40 px pour les menus ; les cartes de pop-up sont opaques). Pas de modification ; case dans l'index. Capture 390 px non refaite.

## Pilotage (repli 29) : fuseaux côté serveur, suite sur la tête
- Relecture b7bfe31 (rejeu hors ligne : erreurs passagères gardées en file, sessions arrêtées mises de côté, anti-doublon par départ à 2 s près) et d1be389 (bump) : aucune régression, rien de visible ajouté. Réserve : la détection de doublon lit la semaine de la date UTC du départ ; sans conséquence (fenêtre d'une semaine).
- Inventaire des fonctions qui décident d'un jour : `docs/fuseaux-serveur-2026-10-20.md` (serveur = Toronto, pas UTC). Les modules d'objectifs (priorité du jour, non réalisées, surcharge, capture, planning) lisaient le jour de Toronto alors que la Feuille de temps suivait le téléphone : Vancouver à 23 h 30 capturait une tâche pour le lendemain ; Paris à 00 h 30 pour la veille (puis « en retard » déplacée).
- Corrigé sans écran ni option : `dates.runWithTimezone/userToday` (même technique que `aibudget.runAs`, posé dans `session.js`) lu par les `todayLocal()` ; `goalstasks.js` comparait la clôture d'un sous-projet à la date UTC ; `db.js` : première ouverture d'une base neuve sans colonnes de report (liste « Non réalisées » en erreur jusqu'au redémarrage).
- Suite complète (script) sur la tête + correctif : 159 passées, 0 échouée. `test/fuseaux-invariance-test.js` : 3 fuseaux x 23 h 30 / 00 h 30 / changements d'heure (16 cas), 96 vérifications ; 13 échecs avant correctif, 0 après. Reste (index) : rappel de 6 h à l'heure de Toronto, plafonds de jour IA à trois définitions du jour.
