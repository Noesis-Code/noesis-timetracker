# Trade Tracker — contrat d'API (v0, figé le 19 oct. 2026)

Serveur autonome (`node trade-tracker/server/index.js`, port `PORT`, défaut 3980). Lecture seule côté interface : aucune route d'écriture de portefeuille. Données fictives en démo (`node trade-tracker/seed-demo.js`).

Conventions : JSON UTF-8 ; montants en nombres arrondis à 2 décimales ; pourcentages en points (`12.34` = 12,34 %) ; dates `YYYY-MM-DD` (fuseau America/Montreal) ; horodatages ISO 8601 UTC. Montants `…Cad` = convertis en CAD au taux USD/CAD courant ; `…Native` = devise du titre (`currency`). Erreur : statut HTTP + `{ "error": "code", "message": "…" }`.

## Entrée et session
- TMT émet un jeton court `<payload>.<signature>` (HMAC-SHA256, secret `TRADE_LINK_SECRET`, expiration 5 min, usage unique) et ouvre `GET /link?token=<jeton>[&invite=<code>]`.
- Succès : cookie `tt_session` (HttpOnly, SameSite=Lax, 12 h) puis redirection 302 vers `/`. Échec : redirection 302 vers `/?linkError=<code>` avec code parmi `invalid | expired | replayed | not_invited | server_misconfigured`.
- Toutes les routes `/api/*` (sauf `/api/health`) exigent ce cookie (ou `Authorization: Bearer <session>`). Sans session : 401 `{ "error": "unauthenticated" }`.
- Rôles : `expert` (la source, voit tout, invite) et `client` (voit son portefeuille + celui de l'expert en lecture). Accès sur invitation seulement.

## Routes
`GET /api/health` -> `{ ok: true }` (public).

`GET /api/me` -> `{ id, name, role: "expert"|"client", brokerConnected: false }`.

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
Pour l'expert lui-même, tous les écarts valent 0. Les poids sont en % de la valeur totale (encaisse incluse).

Expert seulement (client : 403 `forbidden`) :
- `POST /api/invitations` `{ email, role: "client"|"expert" }` -> `{ id, code, email, role, expiresAt }` (le code n'est montré qu'une fois ; valide 7 jours).
- `GET /api/invitations` -> `{ invitations: [ { id, email, role, createdAt, expiresAt, used } ] }`.

`POST /api/logout` -> `{ ok: true }`.

Jeton courtier : chaque utilisateur (expert ou client) connecte son propre compte courtier ; le jeton est stocké chiffré par utilisateur (clé `TRADE_TOKEN_KEY`) et n'est jamais renvoyé par l'API. `GET /api/me` expose seulement `brokerConnected: boolean`.

## Synchro et connecteurs
Chaque utilisateur est synchronisé périodiquement (`TRADE_SYNC_INTERVAL_MIN`, défaut 15 ; l'expert d'abord) par un connecteur `async fetchPortfolio(user)` (voir `server/lib/connectors/demo.js` pour la forme des données). Seul le connecteur `demo` (fictif) existe ; Questrade viendra avec la même interface. Chaque synchro écrit une ligne dans `sync-log` (`OK`/`ECHEC`). Un instantané quotidien alimente `/api/history`.

## Événement d'achat -> TMT
Chaque NOUVELLE transaction `ACHAT` de l'expert détectée par une synchro crée un événement `purchase` (table `events`, un seul par transaction ; la toute première synchro d'un utilisateur n'en crée pas). Le notificateur envoie :

`POST ${TMT_BASE_URL}/api/trade-events` — `Content-Type: application/json`, en-têtes `X-Trade-Timestamp` (secondes Unix), `X-Trade-Event-Id`, `X-Trade-Signature: sha256=<hex>` où hex = HMAC-SHA256 de la chaîne `"<X-Trade-Timestamp>.<corps brut>"` avec `TRADE_NOTIFY_SECRET` (même secret des deux côtés ; TMT doit refuser un horodatage de plus de 5 min et dédupliquer sur `X-Trade-Event-Id`).
```
{ "userId": "<id TMT de l'expert>", "symbol": "AAA.TO", "quantity": 50, "price": 20, "account": "CELI", "occurredAt": "2026-06-02" }
```
Réponse attendue : 2xx. Sinon l'événement reste `ECHEC` et est renvoyé à la synchro suivante (5 essais max). `TRADE_NOTIFY_DRYRUN=1` : requête construite et enregistrée `DRYRUN`, aucun appel réseau. Sans `TMT_BASE_URL`/`TRADE_NOTIFY_SECRET` : `SKIPPED`.

## Variables d'environnement
`TRADE_LINK_SECRET` (signature des liens, >= 16 car., partagé avec TMT), `TRADE_TOKEN_KEY` (chiffrement des jetons courtier), `TRADE_EXPERT_TMT_IDS` (ids TMT amorçant le rôle expert, séparés par des virgules), `TRADE_NOTIFY_SECRET`, `TMT_BASE_URL`, `TRADE_CONNECTOR` (défaut `demo`), `TRADE_SYNC_DISABLE`, `TRADE_SYNC_INTERVAL_MIN`, `TRADE_NOTIFY_DRYRUN`, `PORT` (3980), `NOESIS_DATA_DIR`. Aucun secret n'est stocké dans le code.

## Hors v0
Connecteur courtier (Questrade), prix et taux automatiques, écriture de transactions : non inclus ; la synchro n'utilise que le connecteur de démonstration.
