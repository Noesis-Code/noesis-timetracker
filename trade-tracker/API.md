# Trade Tracker — contrat d'API (v0, figé le 19 oct. 2026)

Serveur autonome (`node trade-tracker/server/index.js`, port `PORT`, défaut 3980). Lecture seule côté interface : aucune route d'écriture de portefeuille. Données fictives en démo (`node trade-tracker/seed-demo.js`).

Conventions : JSON UTF-8 ; montants en nombres arrondis à 2 décimales ; pourcentages en points (`12.34` = 12,34 %) ; dates `YYYY-MM-DD` (fuseau America/Montreal) ; horodatages ISO 8601 UTC. Montants `…Cad` = convertis en CAD au taux USD/CAD courant ; `…Native` = devise du titre (`currency`). Erreur : statut HTTP + `{ "error": "code", "message": "…" }`.

## Entrée et session
- TMT émet un jeton court `<payload>.<signature>` (HMAC-SHA256, secret `TRADE_LINK_SECRET`, expiration 2 min, usage unique par `jti`, lié à l’utilisateur `sub`, à l’audience `aud=trade-tracker` et au navigateur `uah` = SHA-256 du user-agent) et ouvre `GET /link?token=<jeton>[&invite=<code>]`.
- Succès : cookie `tt_session` (HttpOnly, SameSite=Lax, 12 h) puis redirection 302 vers `/`. Échec : redirection 302 vers `/?linkError=<code>` avec code parmi `denied` (jeton invalide, rejoué, falsifié, autre navigateur ou non invité : réponse uniforme) `| expired | unavailable`.
- Toutes les routes `/api/*` (sauf `/api/health`) exigent ce cookie (ou `Authorization: Bearer <session>`). Sans session : 401 `{ "error": "unauthenticated" }`.
- Rôles : `expert` (la source, voit tout, invite) et `client` (voit son portefeuille + celui de l'expert en lecture). Accès sur invitation seulement.

## Routes
`GET /api/health` -> `{ ok: true }` (public).

`GET /api/me` -> `{ id, name, role: "expert"|"client", brokerConnected: boolean }`.

Portefeuille. Paramètre commun `scope=me` (défaut) `| expert` (portefeuille de l'expert, lisible par les clients). Un client sans compte ni donnée reçoit des tableaux vides, pas une erreur.

`GET /api/portfolio?scope=` ->
```
{ scope, asOf, usdCad, fxMissing: false,
  totalValueCad, cashCad, investedCad, costCad, pnlCad, pnlPct,
  dayChangeCad: null, // réservé, null en v0
  lastSync: { at, status } | null,
  accounts: [ { id, type: "CELI"|"REER"|"CELIAPP", label, valueCad, cashCad, pnlCad, pnlPct, weightPct } ] }
```

`GET /api/positions?scope=&accountId=&sector=` ->
```
{ positions: [ { id, accountId, accountType, symbol, name, sector, currency: "CAD"|"USD",
    quantity, avgCost, lastPrice, priceUpdatedAt,
    costNative, valueNative, pnlNative, pnlPct,
    costCad, valueCad, pnlCad, weightPct } ] }
```
Tri par défaut : `valueCad` décroissant (le tri fin est fait côté interface).

`GET /api/allocation?scope=&by=sector|account` (défaut `sector`) ->
```
{ by, totalValueCad, items: [ { key, label, valueCad, weightPct, positionsCount } ] }
```
`by=sector` inclut une ligne `key: "cash"`, label `Encaisse`. Somme des `weightPct` = 100 (±0.01).

`GET /api/history?scope=&from=&to=` -> série quotidienne, ordre croissant :
```
{ points: [ { date, valueCad, netFlowCad, returnPct, index } ], // index = rendement indexé base 100, flux nets exclus
  totalReturnPct }
```
`returnPct` = rendement du jour hors flux ; `index` commence à 100 au premier point.

`GET /api/sync-log?scope=&limit=50` (max 200, récent d'abord) ->
```
{ entries: [ { id, at, accountId|null, kind, status: "OK"|"PARTIEL"|"ECHEC", message, itemsCount } ] }
```

`GET /api/compare` (portefeuille de l'utilisateur connecté comparé à celui de l'expert EN DIRECT ; écarts = client - expert, en points de %) ->
```
{ expertSyncedAt, clientTotalValueCad, expertTotalValueCad, maxAbsGapPts,
  bySector:   [ { key, label, clientPct, expertPct, gapPts } ],   // inclut key "cash" (Encaisse), tri par |gapPts| décroissant
  byPosition: [ { symbol, label, sector, clientPct, expertPct, gapPts } ] }  // titres agrégés par symbole, tous comptes
```
Pas de paramètre `account` (décision du 19 oct. 2026) : filtrer par compte rendrait les pourcentages ambigus (poids dans le compte ou dans le portefeuille ? l'expert reste global) et obligerait l'écran « Moi et l'expert » à recharger `/api/compare` à chaque puce, alors que le chargement unique (mémo, ETag, copie hors ligne du service worker) sert tous les écrans. À reprendre seulement après décision produit sur la base de calcul des poids.
Pour l'expert lui-même, tous les écarts valent 0. Les poids sont en % de la valeur totale (encaisse incluse).

`GET /api/purchases?limit=10&offset=0` (limit 1-50, défaut 10) -> derniers achats de l'EXPERT (transactions `ACHAT`, récents d'abord, lisible par tout utilisateur connecté) :
```
{ purchases: [ { id, symbol, name, sector, accountType, quantity, price, currency, amountCad|null, at: "YYYY-MM-DD" } ], limit, offset, hasMore }
```

Expert seulement (client : 403 `forbidden`) :
- `POST /api/invitations` `{ email, role: "client"|"expert" }` -> `{ id, code, email, role, expiresAt }` (le code n'est montré qu'une fois ; valide 7 jours).
- `GET /api/invitations` -> `{ invitations: [ { id, email, role, createdAt, expiresAt, used } ] }`.

`POST /api/logout` -> `{ ok: true }`.

### Jeton courtier (session requise, jamais en cache)
- `POST /api/broker/token` `{ token }` -> `{ ok: true, brokerConnected: true }`. Format : une chaîne sans espace, 16 à 512 caractères `[A-Za-z0-9._~+/=-]`, sinon 422 `invalid_token`. Sans `TRADE_TOKEN_KEY` (>= 16 car.) sur le serveur : 503 `broker_unavailable` (message clair, rien n'est stocké). Le jeton est chiffré (AES-256-GCM), stocké PAR utilisateur, remplace l'ancien, et n'est jamais renvoyé, journalisé, ni repris dans une erreur (JSON mal formé : 400 générique).
- `DELETE /api/broker/token` -> `{ ok: true, brokerConnected: false }`. Suppression RÉELLE et définitive (la confirmation se fait côté client) : le jeton chiffré ET toutes les données de synchro de cet utilisateur (comptes, positions, soldes, transactions, historique, journal de synchro, événements d'achat). Taux de change et secteurs, partagés, restent. Idempotent.
- `GET /api/broker/status` -> `{ connected: boolean, lastSyncAt: ISO|null, error?: string, renewToken?: true }` ; `lastSyncAt` = dernière synchro non échouée, `error` = message de la dernière synchro si elle a échoué (sans secret), `renewToken: true` = Questrade a refusé le jeton enregistré (HTTP 400/401 au renouvellement) : l'utilisateur doit en coller un nouveau (`POST /api/broker/token`).
- Limites : écritures générales 30/min/IP, plus 10/min/IP propres aux POST/DELETE `/api/broker/token`.
- Synchro : un connecteur qui déclare `requiresToken` (Questrade) n'est exécuté que pour les utilisateurs ayant un jeton, lu à chaque synchro ; l'échec est journalisé (`ECHEC`) avec le jeton masqué. Le connecteur `demo` (défaut) ignore le jeton et synchronise tout le monde, donc après un DELETE ses données fictives reviennent à la synchro suivante.

Jeton courtier : chaque utilisateur (expert ou client) connecte son propre compte courtier ; le jeton est stocké chiffré par utilisateur (clé `TRADE_TOKEN_KEY`) et n'est jamais renvoyé par l'API. `GET /api/me` expose seulement `brokerConnected: boolean`.

## Import du Sheet (A9)
`POST /api/admin/import-sheet` (hors session ; en-tête `X-Admin-Token` = `TRADE_ADMIN_TOKEN`, >= 16 car. ; variable absente => 404) corps `{ tmtUserId, role?: "expert"|"client", name?, files: { comptes, positions, transactions, soldes } }` (textes CSV, tous facultatifs) -> `{ accounts, positions, balances, transactions, skipped: [..] }` (compteurs de lignes NOUVELLES). Idempotent, sans suppression, sans événement d'achat. Script équivalent : `node trade-tracker/import-sheet.js <dossier-csv> --user <idTMT>`. Colonnes (en-têtes insensibles à la casse/aux accents, séparateur `,` ou `;`) : Comptes `compte,type,libelle,courtier` ; Positions `compte,symbole,nom,secteur,devise,quantite,prix_moyen,prix_actuel` ; Transactions `compte,id,date,type,symbole,quantite,prix,montant,devise` ; Soldes `compte,devise,encaisse`. Exemples fictifs : `test/fixtures/`.

## Synchro et connecteurs
Chaque utilisateur est synchronisé périodiquement (`TRADE_SYNC_INTERVAL_MIN`, défaut 15 ; l'expert d'abord) par un connecteur `async fetchPortfolio(user)` (voir `server/lib/connectors/demo.js` pour la forme des données). Connecteurs enregistrés : `demo` (fictif, défaut) et `questrade` (lecture seule, actif seulement si `TRADE_CONNECTOR=questrade`). Chaque synchro écrit une ligne dans `sync-log` (`OK`/`ECHEC`). Un instantané quotidien alimente `/api/history`.

## Événement d'achat -> TMT
Chaque NOUVELLE transaction `ACHAT` de l'expert détectée par une synchro crée un événement `purchase` (table `events`, un seul par transaction ; la toute première synchro d'un utilisateur n'en crée pas). Le notificateur envoie :

`POST ${TMT_BASE_URL}/api/trade-events` — `Content-Type: application/json`, en-têtes `X-Trade-Timestamp` (secondes Unix), `X-Trade-Event-Id`, `X-Trade-Signature: sha256=<hex>` où hex = HMAC-SHA256 de la chaîne `"<X-Trade-Timestamp>.<corps brut>"` avec `TRADE_NOTIFY_SECRET` (même secret des deux côtés ; TMT doit refuser un horodatage de plus de 5 min et dédupliquer sur `X-Trade-Event-Id`).
```
{ "userId": "<id TMT de l'expert>", "symbol": "AAA.TO", "quantity": 50, "price": 20, "account": "CELI", "occurredAt": "2026-06-02" }
```
Réponse attendue : 2xx. Sinon l'événement reste `ECHEC` et est renvoyé à la synchro suivante (5 essais max). `TRADE_NOTIFY_DRYRUN=1` : requête construite et enregistrée `DRYRUN`, aucun appel réseau. Sans `TMT_BASE_URL`/`TRADE_NOTIFY_SECRET` : `SKIPPED`.

## Variables d'environnement
`TRADE_LINK_SECRET` (signature des liens, >= 16 car., partagé avec TMT), `TRADE_TOKEN_KEY` (chiffrement des jetons courtier), `TRADE_EXPERT_TMT_IDS` (ids TMT amorçant le rôle expert, séparés par des virgules), `TRADE_NOTIFY_SECRET`, `TRADE_ADMIN_TOKEN` (import admin), `TMT_BASE_URL`, `TRADE_CONNECTOR` (`demo` par défaut, ou `questrade`), `TRADE_QUESTRADE_LOOKBACK_DAYS` (365), `TRADE_SYNC_DISABLE`, `TRADE_SYNC_INTERVAL_MIN`, `TRADE_NOTIFY_DRYRUN`, `PORT` (3980), `NOESIS_DATA_DIR`. Aucun secret n'est stocké dans le code.

### Connecteur Questrade (`server/lib/connectors/questrade.js`, lecture seule)
Activation : `TRADE_CONNECTOR=questrade` + `TRADE_TOKEN_KEY` ; chaque utilisateur colle ensuite SON refresh_token (portail API Questrade > application personnelle > générer un jeton) via `POST /api/broker/token`. Tant qu'un utilisateur n'a pas de jeton, il est ignoré (aucune ligne d'échec).
- OAuth : `GET https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=…` -> `access_token` (30 min, en mémoire seulement, par utilisateur), `api_server` (https et domaine `questrade.com` exigés) et NOUVEAU `refresh_token`. Le jeton est à usage unique : le nouveau remplace l'ancien dans le stockage chiffré (`rotateBrokerToken`, transaction `BEGIN IMMEDIATE`) avant tout autre appel ; si l'utilisateur a collé un autre jeton entre-temps, le sien est conservé.
- Lecture : `v1/accounts`, puis par compte `positions`, `balances`, `activities`. Comptes retenus : TFSA -> CELI, RRSP -> REER, FHSA -> CELIAPP, statut Active (les autres types sont ignorés). Positions : quantité ouverte > 0, devise CAD pour `.TO/.V/.CN/.NE`, sinon USD, secteur repris d'une position déjà connue du même symbole. Soldes : CAD et USD (`perCurrencyBalances`). Activités : `Trades` Buy/Sell -> ACHAT/VENTE, `Dividends` -> DIVIDENDE, `Deposits` -> APPORT, `Withdrawals` -> RETRAIT, virements d'espèces `Transfers` -> APPORT/RETRAIT ; frais, intérêts, change et autres types sont ignorés. Montant = `|netAmount|` (commission incluse). `externalId` = empreinte SHA-1 des champs + rang parmi les lignes identiques (Questrade n'a pas d'identifiant) ; les doublons sont écartés à l'insertion.
- Historique : fenêtres de 30 jours (limite Questrade 31). Compte inconnu : `TRADE_QUESTRADE_LOOKBACK_DAYS` jours (défaut 365) ; ensuite seulement depuis 8 jours avant la dernière transaction connue. Pas de taux USD/CAD chez Questrade (`usdCad` absent : source de taux A6).
- Erreurs (toutes journalisées `ECHEC`, tout-ou-rien : une synchro en échec ne supprime rien) : 400/401 au renouvellement -> « Jeton Questrade à renouveler… » (+ `renewToken` dans `/api/broker/status`, pas de reprise, ancien jeton conservé) ; 401 sur un appel -> une reprise avec une nouvelle session ; 429 -> attend `Retry-After` (max 60 s) ; 5xx et pannes réseau -> recul 1, 2, 4 s (3 reprises) puis échec. Aucun jeton ni URL de jeton dans les messages ni les journaux.
- Tests : client HTTP injectable (`http({url, method, headers}) -> {status, headers, body}`), fixtures `test/fixtures/questrade/*.json` (formats de l'API documentée) ; `node trade-tracker/test/questrade-test.js`, sans réseau. Jamais testé contre Questrade en réel : vérifier au premier jeton d'Émilien.

## Hors v0
Prix et taux automatiques, écriture de transactions : non inclus. Le connecteur Questrade existe mais n'est pas validé en réel (démo par défaut).

## Sécurité (relecture du 19 oct. 2026)
Limites par IP (fenêtre 1 min, 429 + `Retry-After`) : `/link` 20, écritures `POST/PUT/DELETE` 30, import admin 10, lecture 300. Cookie `SameSite=None; Secure; HttpOnly` en HTTPS ou si `TRADE_COOKIE_CROSS_SITE=1` (iframe TMT), `Lax` en HTTP local ; `Content-Security-Policy: frame-ancestors <origine de TMT_BASE_URL>` (sinon `'none'` + `X-Frame-Options: DENY`). En-têtes `nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Signature de lien comparée à temps constant, expiration 5 min (plafonnée), nonce à usage unique, sessions expirées purgées, jeton courtier chiffré AES-256-GCM, aucun secret journalisé ni en dur (test `security-test.js`).

## Demandes à la piste serveur
Faites le 19 oct. 2026 (branche `claude/trade-broker-token`) : les routes courtier ci-dessous existent (voir « Jeton courtier »).
- [fait] `POST /api/broker/token`, `DELETE /api/broker/token`, `GET /api/broker/status`.
- `GET /api/purchases` -> `{ purchases: [ { id, at, symbol, name, sector, accountType, quantity, price, currency, amountCad } ] }` (derniers achats de l'expert, pour « Moi et l'expert » ; liste vide tant que l'endpoint est absent).
