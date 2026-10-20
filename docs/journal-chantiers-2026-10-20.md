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

## État par chantier (mise à jour : dernières 3 h)
- Trade Tracker : dernier = calculs fiabilisés (ventes à découvert, dernier prix conservé, gain réalisé pur, non affiché), synchro courtier refuse les réponses vides ; prochain = Q1 à Q8 et affichage du gain réalisé.
- TT Basic : dernier = fiabilité (dates, concurrence du chrono), zones tactiles 44 px, tests des tâches légales ; prochain = minuit dimanche→lundi, 26 bugs staging.
- TT Expansion : dernier = revue de sécurité du paiement, `subscription.updated` ancien ignoré (`lastEventAt`), résiliation finale ; prochain = Q9 (rappel de renouvellement), courriels et CGU.
- Crédits Claude et API : dernier = prompt de classement -24 %, projection mensuelle du coût, délais IA manquants, tests de robustesse ; prochain = `--live`, seuil 5 $, registre Loi 25 de l'apprentissage.
- Simplification et design : dernier = retrait de la capacité (route, JS/CSS, 9 clés i18n), audit Réglages/Profil/Objectifs ; prochain = cases retirer/garder.
- Précision des tâches : dernier = 30 cas à l'aveugle (83,3 % avant correction), règles généralisées, bilan ; prochain = évaluation `--live`.
- Principal et pilotage : dernier = relecture indépendante des 12 livraisons, cache long des ressources versionnées, titres personnels remplacés par des résumés neutres, index des questions à cases ; prochain = relecture des livraisons suivantes.

## Pilotage : audit dépendances, variables, espace disque (repli 11)
- `npm audit --omit=dev` : racine = 1 critique (`proxy-addr` <= 2.0.7, usurpation d'IP), corrigée par `npm audit fix` (mise à jour de correctif, lockfile seul) ; Trade Tracker = 0 vulnérabilité. Aucune majeure en attente.
- Variables d'environnement : 114 lues par le code, ~100 absentes de `DEPLOIEMENT.md` ; ajoutées en §7 (noms seulement). `railway.json` cohérent.
- Espace `/tmp/noesis-*` (comptage, rien supprimé) : 1431 entrées, 68 Mo au total ; 1384 sont des `noesis-verify-*.db-shm/-wal` (fichiers orphelins de vérification, quelques Ko chacun), 7 `noesis-backup-test`, 7 `noesis-backup-empty`, le reste = dossiers de chantiers `noesis-<sujet>-*`. Nettoyage à décider par Émilien/coordinateur.

## Pilotage (repli 16) : durée des tests et contrôle de staging
- `node test/run-tests.js` : 7 min 39 s (119 passées, 0 échouée) mais 1 min 48 s de CPU : la machine était chargée (load 7-9). Les plus lents mesurés seuls : `trade-tracker/test/run.js` ~118 s (enchaîne les autres tests Trade), `member-series-test.js` 32 s, `sync-charge-test.js` 19 s, `broker-e2e-test.js` 13 s, `stepup-test.js` 12 s. Accélération possible (non appliquée, risque de masquer une régression) : exécuter les tests Trade indépendants en parallèle ; réduire les séries de `member-series-test.js`.
- Instabilité : `task-lock-test.js` (seuil de durée sous charge) déjà stabilisé ; passe en 5 s seul. Rien d'autre à corriger.
- Staging : aucun marqueur de conflit, CACHE_VERSION monotone (v467 à v491), `/healthz` ok.
