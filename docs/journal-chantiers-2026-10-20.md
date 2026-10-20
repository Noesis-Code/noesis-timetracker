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
