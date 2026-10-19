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

Expert seulement (client : 403 `forbidden`) :
- `POST /api/invitations` `{ email, role: "client"|"expert" }` -> `{ id, code, email, role, expiresAt }` (le code n'est montré qu'une fois ; valide 7 jours).
- `GET /api/invitations` -> `{ invitations: [ { id, email, role, createdAt, expiresAt, used } ] }`.

`POST /api/logout` -> `{ ok: true }`.

Jeton courtier : chaque utilisateur (expert ou client) connecte son propre compte courtier ; le jeton est stocké chiffré par utilisateur (clé `TRADE_TOKEN_KEY`) et n'est jamais renvoyé par l'API. `GET /api/me` expose seulement `brokerConnected: boolean`.

## Hors v0
Connecteur courtier (Questrade), prix et taux automatiques, écriture de transactions : non inclus ; la synchro n'alimente pour l'instant que `sync_log` et les données de démo.
