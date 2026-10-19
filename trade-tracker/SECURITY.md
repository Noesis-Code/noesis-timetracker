# Trade Tracker — sécurité (mis à jour le 19 oct. 2026)

Objectif d'Émilien : une sécurité « comme un compte en banque » pour tous les utilisateurs, et surtout pour l'expert (comptes de plusieurs milliers de $). La section « Sécurité bancaire » ci-dessous est la référence ; l'audit initial suit.

Périmètre : `trade-tracker/` et l'intégration TMT (`server/lib/tradelink.js`, `routes/trade.js`, `routes/tradeevents.js`, `public/js/trade.js`). Aucune règle produit modifiée, aucune dépendance ajoutée.

## Sécurité bancaire (branche `claude/trade-securite-bancaire`)
Aucune dépendance ajoutée (`node:crypto` seulement), aucun appel réseau externe nouveau. Chaque ligne est couverte par un test (`trade-tracker/test/`).

| # | Exigence | Mise en œuvre | Test |
|---|---|---|---|
| 1 | Authentification forte | TOTP RFC 6238 (SHA-1, 6 chiffres, 30 s, fenêtre ±1 pas, vecteurs RFC vérifiés), **obligatoire** pour l'expert, pour tout compte qui connecte un courtier et pour tout compte l'ayant activé. Secret chiffré au repos (AES-256-GCM, clé versionnée, lié à l'utilisateur). 10 codes de secours à usage unique, hachés (scrypt + sel). Enrôlement : QR généré localement (SVG, `lib/qr.js`, décodé par OpenCV dans les tests) + clé affichée. Anti-rejeu : un pas de 30 s ne sert qu'une fois (compteur atomique). Sans vérification, **aucune donnée** ne répond (403 `mfa_required` / `mfa_enroll_required`) | `mfa-test.js` |
| 2 | Ré-authentification | Code TOTP (ou de secours) revalidé pour : connecter/remplacer/supprimer le jeton courtier, inviter (dont « changer l'expert » = inviter un expert), nouveaux codes de secours, changement d'appareil, tout `/api/export*` (garde d'office). Valable 5 min, sinon 403 `stepup_required` et l'interface redemande le code | `stepup-test.js` |
| 3 | Sessions | Inactivité 15 min (le rafraîchissement automatique ne compte pas), durée absolue 12 h, nouvel identifiant à chaque élévation (ancien mort), liée à l'empreinte du user-agent (changement = session détruite + journal), « fermer toutes mes sessions », cookie `__Host-` en HTTPS | `session-test.js`, `headers-test.js` |
| 4 | Anti-force brute | Verrouillage progressif persistant, par compte (5 échecs) et par IP (10) : 30 s, 60 s, 120 s… plafonné à 1 h ; pendant le verrou le code n'est pas examiné (un bon code ne passe pas non plus). S'applique au TOTP, à l'activation et aux liens. Réponses uniformes : lien refusé = toujours `linkError=denied` (invalide, rejoué, falsifié, autre navigateur, non invité, verrouillé) ; code faux = même réponse pour TOTP, secours, rejeu | `stepup-test.js` |
| 5 | Lien TMT→Trade | HMAC-SHA256, 2 min, `jti` mémorisé (usage unique), `aud=trade-tracker`, `sub` = utilisateur, `uah` = SHA-256 du user-agent du demandeur (un lien volé ne s'ouvre pas ailleurs) ; jeton non lié refusé en production | `auth-test.js`, `test/trade-link-test.js` (racine) |
| 6 | Journal d'audit inaltérable | Table `audit_log` en ajout seul (déclencheurs `RAISE(ABORT)` sur UPDATE/DELETE) + chaîne SHA-256 (chaque ligne couvre la précédente, `verifyChain`). Consultable par le compte (`GET /api/security/audit`, ses lignes seulement). Jamais de secret : les clés suspectes (token, code, secret, key…) sont retirées à l'écriture, valeurs tronquées, user-agent résumé (« Chrome · Windows ») | `audit-test.js` |
| 7 | Alertes | Push TMT (`?notif=trade&secu=<type>`, canal HMAC déjà en place, aucune donnée financière dans le texte) à chaque connexion, nouvel appareil, jeton courtier connecté/remplacé/supprimé, échecs répétés (3e échec puis tous les 5), code de secours utilisé | `alerts-test.js`, `test/trade-events-test.js` (racine) |
| 8 | Jeton courtier en lecture seule | Liste blanche de chemins GET Questrade (`lib/readonlyguard.js`) appliquée dans le connecteur ET dans le client réseau (dernier garde-fou avant `fetch`) ; le test analyse aussi le code source (aucun `fetch` hors connecteur/notificateur, aucun chemin d'ordre). AES-256-GCM, clé versionnée (`TRADE_TOKEN_KEY_VERSION`, `TRADE_TOKEN_KEY_V<n>`), contexte lié à la ligne, **rotation** par `node rotate-key.js` (transactionnelle, essai `--dry-run`) | `readonly-guard-test.js`, `ops-scripts-test.js` |
| 9 | En-têtes et stockage | Cookie `__Host-tt_session; HttpOnly; Secure; SameSite=None; Partitioned` (iframe TMT) en HTTPS, `Lax` en HTTP local ; `Cache-Control: no-store, max-age=0` + `Pragma: no-cache` sur TOUTES les réponses ; `Clear-Site-Data: "cache"` à la déconnexion ; `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` fermée. **Le service worker de Trade ne met plus l'API en cache** (changement de comportement : hors ligne, plus de chiffres gardés ; anciens caches supprimés). Aucune donnée financière dans `localStorage` (langue et préférences d'affichage seulement, test d'analyse du code). Le service worker de TMT n'intercepte déjà ni `/api` ni l'origine de Trade | `headers-test.js`, `sw-cache-test.js` |

## Passkeys (WebAuthn) — branche `claude/trade-passkeys`
AJOUT au TOTP, jamais un remplacement. Dépendance : `@simplewebauthn/server` 14.0.3 (version figée, maintenue, 0 vulnérabilité connue à l'installation). Tests : `test/passkey-test.js` (authentificateur virtuel écrit à la main) + essai réel dans Chromium (authentificateur virtuel CDP).
- **Inscription / suppression** (Sécurité > Passkey) : TOTP déjà actif, ré-authentification récente (5 min), journal chaîné (`passkey_added`, `passkey_removed`) + push TMT. 10 passkeys max.
- **Facteur normal** : dès qu'une passkey existe, la porte d'entrée et la ré-authentification proposent la passkey en premier ; le code reste en dessous (récupération).
- **Vérifications** : défi 32 octets aléatoires, haché, usage unique, 2 min, lié à l'utilisateur, à la SESSION et à l'usage, consommé avant vérification ; origin et rpId figés (`TRADE_ORIGIN`, `TRADE_RP_ID`) ; iframe : `topOrigin` doit être TMT ; `userVerification: required` ; attestation `none` (autre format refusé) ; compteur de signatures : régression ou égalité (si non nul) = refus + `passkey_clone_suspected` + alerte ; stockage : identifiant public + clé publique seulement.
- **Verrouillage** : mêmes seuils que les codes (compte 5, IP 10) ; réponse d'échec unique `invalid_passkey`.
- **Configuration** : sans `TRADE_RP_ID` en production, passkeys indisponibles (503), jamais déduit de l'en-tête Host. `mfa-reset.js` retire aussi les passkeys.
- **Iframe TMT** : `allow="publickey-credentials-get *; publickey-credentials-create *"` ajouté à l'iframe de TMT ; si le navigateur refuse (ex. Safari), « Ouvrir à part ».
- Limite : l'ajout d'une passkey n'est possible qu'avec un step-up (passkey ou TOTP) : quiconque détient le TOTP peut en ajouter ; l'alerte push le signale.

Cas d'exploitation : téléphone perdu = un code de secours puis « Changer d'appareil » ; téléphone ET codes perdus = `node mfa-reset.js <idTMT>` (opérateur, journalisé). Voir `DEPLOY.md` (« Checklist de mise en service sécurisée »).

### Limites connues et risques résiduels (à lire)
- **La racine de confiance reste le compte TMT** : le premier enrôlement TOTP n'est protégé que par le lien signé de TMT. L'expert doit activer son TOTP dès la première entrée, avant d'inviter qui que ce soit. Quiconque contrôle la session TMT de l'expert avant cela peut enrôler son propre appareil.
- La clé de chiffrement (`TRADE_TOKEN_KEY`) et la base vivent chez le même hébergeur : une compromission de Railway donne les deux. Protéger l'accès Railway (2FA, peu de membres) et faire pivoter la clé. Les sauvegardes ne contiennent pas la clé.
- Le jeton Questrade est en lecture seule **de notre côté** (le code ne peut appeler aucun chemin d'écriture) ; côté Questrade, vérifier que l'application API créée n'a que la portée « lecture des données de compte » (à contrôler dans le portail, non vérifiable depuis le code).
- TOTP n'est pas résistant à l'hameçonnage en temps réel (un faux site peut relayer un code dans sa fenêtre de 90 s). Les passkeys (ci-dessous) y répondent, mais le TOTP et les codes de secours restent acceptés comme récupération : un attaquant qui obtient un code peut donc encore se connecter ; chaque usage est noté au journal (`fallback`) et alerté. Durcissement possible plus tard : refuser le TOTP à la connexion quand une passkey existe (récupération alors par l'opérateur seulement).
- Le verrou par IP peut bloquer des utilisateurs derrière une même adresse (réseau partagé) ; le verrou par compte de lien peut être déclenché par quiconque détient un lien signé pour ce compte (donc par le titulaire lui-même seulement).
- Le journal prouve les modifications et suppressions en milieu de chaîne ; une troncature de la toute fin ne se voit qu'en notant l'empreinte de tête affichée dans l'écran Sécurité.
- Sauvegarde : `backup.js` (copie en droits 600, contrôlée) et `restore.js` (contrôle d'intégrité et de la chaîne d'audit, jamais d'écrasement sans `--force`) ; testés dans `test/backup-test.js`. Prix en retard : alerte `prices_stale` (voir `DEPLOY.md`).
- Un seul réplica (SQLite, limiteur de débit par IP en mémoire ; les verrouillages, eux, sont en base). Safari/ITP peut refuser le cookie d'un iframe tiers : utiliser « Ouvrir à part ».
- Limites non traitées ici : `TRADE_ADMIN_TOKEN` (import) reste un secret statique : ne le définir que le temps d'un import ; rapport de pénétration externe jamais fait.

## Audit initial (19 oct. 2026)
### Constats corrigés
| Gravité | Constat | Correctif |
|---|---|---|
| Moyenne | Rejeu de `/api/trade-events` : `X-Trade-Event-Id` n'est pas couvert par la signature, un message capturé pouvait être rejoué (< 5 min) avec un autre id et renotifier. | La signature est elle-même dédupliquée (`trade_events_seen`). Deux événements au corps identique dans la même seconde sont donc fusionnés (négligeable). |
| Moyenne | CSRF : cookie `SameSite=None` (iframe TMT), `POST /api/logout`, `DELETE`/`POST /api/broker/token` sans contrôle d'origine. | Toute écriture avec un `Origin` autre que l'app ou `TMT_BASE_URL` : 403 `bad_origin`. |
| Basse | CSP limitée à `frame-ancestors`. | CSP complète (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`) + HSTS en HTTPS. |
| Basse | Un client lisait le détail des échecs de synchro de l'expert (`/api/sync-log?scope=expert`). | Message générique « Échec de synchro » pour les clients. |
| Basse | PWA : cache de données du service worker non lié à l'utilisateur. | Remplacé depuis par la suppression complète du cache de données (voir tableau « Sécurité bancaire », ligne 9). |
| Basse | Iframe `#tradeFrame` sans `sandbox`. | `sandbox="allow-scripts allow-same-origin"` (rien d'autre : Trade n'utilise ni formulaire, ni fenêtre, ni modale, ni téléchargement). Vérifié dans Chromium : écran chargé, `tt_session` posé, service worker enregistré, stockage local OK. `SameSite=None; Secure` non testable en HTTP local ; `allow-same-origin` garde l'origine réelle, donc le cookie n'est pas affecté. |
| Basse | Pas de limite de débit sur `POST /api/trade-events`. | Limite par IP, 600/min (`TRADE_EVENTS_PER_MIN`), 429 + `Retry-After`. |
| Basse | `trade_events_seen` sans purge. | Purge au démarrage puis chaque heure des entrées de plus de 30 jours. |


### Vérifié, conforme
Lien signé HMAC-SHA256 (algorithme fixe, comparaison `timingSafeEqual`, expiration 2 min plafonnée, `jti` à usage unique, rôle pris en base) ; session : 256 bits aléatoires, stockée hachée, HttpOnly, 15 min d'inactivité / 12 h, nouvelle à chaque lien et à chaque élévation (pas de fixation), purge des expirées ; accès : chaque requête filtrée par `req.user.id`, `scope=expert` limité à la lecture de l'expert, invitations réservées à l'expert, aucun accès croisé aux jetons ; SQL toujours paramétré ; en-têtes `nosniff`, `Referrer-Policy: no-referrer`, `no-store` ; corps limités (50 ko, 5 Mo admin, 64 ko événements), limites de débit par IP (`/link` 20/min, écritures 30/min, `/api/auth/*` 20/min en plus des verrouillages par compte et IP, import admin 10/min, courtier 10/min, lecture 300/min ; testées dans `test/ratelimit-test.js`) ; jeton courtier AES-256-GCM, IV aléatoire de 12 octets, refus sans clé, jamais renvoyé ni journalisé ; événements TMT : signature `timingSafeEqual`, horodatage ±5 min, idempotence par id ; TMT ne met jamais l'API Trade en cache (`public/sw.js`) ; échappement HTML des champs affichés.

### Restants
- Info : session non révoquée côté serveur si l'expert retire un client (pas d'action de retrait dans l'API v0). Sans `TRADE_ADMIN_TOKEN`, l'import admin n'existe pas (404).
- Info : les tests du service worker simulent le navigateur (module `vm`), pas un vrai navigateur.
