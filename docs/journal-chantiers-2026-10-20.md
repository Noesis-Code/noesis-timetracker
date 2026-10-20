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
