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
