# Déployer Trade Tracker (Railway) — guide Émilien

Rien n'est déployé automatiquement. Le serveur **refuse de démarrer en production** (Railway ou `NODE_ENV=production`) si un secret obligatoire manque : il liste les noms manquants, jamais les valeurs.

## Générer un secret
`openssl rand -hex 32` (un secret différent par variable ; `TRADE_LINK_SECRET` et `TRADE_NOTIFY_SECRET` doivent être **identiques des deux côtés**).

## Variables côté TMT (service TimeTracker)
| Variable | Valeur |
|---|---|
| `TRADE_ALLOWED_USER_IDS` | id(s) TMT autorisés, séparés par des virgules |
| `TRADE_LINK_SECRET` | secret >= 16 car. (= celui de Trade) |
| `TRADE_BASE_URL` | URL publique de Trade (https://...) |
| `TRADE_NOTIFY_SECRET` | secret >= 16 car. (= celui de Trade) |

## Variables côté Trade (service Trade Tracker)
| Variable | Valeur |
|---|---|
| `TRADE_LINK_SECRET` | = celui de TMT (obligatoire) |
| `TRADE_NOTIFY_SECRET` | = celui de TMT (obligatoire) |
| `TRADE_TOKEN_KEY` | secret propre >= 16 car. ; chiffre les jetons courtier (le perdre = reconnecter) (obligatoire) |
| `TMT_BASE_URL` | URL publique de TMT (obligatoire ; autorise l'iframe) |
| `TRADE_EXPERT_TMT_IDS` | id(s) TMT de l'expert (obligatoire) |
| `TRADE_ADMIN_TOKEN` | facultatif, >= 16 car. ; active l'import admin |
| `TRADE_CONNECTOR` | `demo` (défaut) ou `questrade` (voir ci-dessous) |
| `TRADE_COOKIE_CROSS_SITE` | `1` si le cookie doit passer en iframe sans HTTPS détecté (inutile derrière Railway HTTPS) |
| `TRADE_DATA_DIR` | `/data` (le volume) ; `NOESIS_DATA_DIR` accepté en repli |

## Ordre des étapes
1. Railway : nouveau service depuis le dépôt, branche `staging`, **Root Directory = `trade-tracker`** (`railway.json`, `Procfile` : `node server/index.js`, santé `GET /health`).
2. Ajouter un volume monté sur `/data`, puis `TRADE_DATA_DIR=/data`. Un seul réplica.
3. Générer les secrets (`openssl`), renseigner les variables de Trade (sans `TMT_BASE_URL` si TMT n'a pas encore d'URL finale : le redéployer ensuite).
4. Déployer Trade, vérifier `https://<trade>/health` -> `{"ok":true}`. Un échec au démarrage affiche les variables manquantes dans les logs.
5. Côté TMT : ajouter `TRADE_ALLOWED_USER_IDS`, `TRADE_LINK_SECRET`, `TRADE_BASE_URL` (URL de Trade), `TRADE_NOTIFY_SECRET`, puis redéployer TMT.
6. Activer le module Trade pour ton compte dans TMT, ouvrir l'onglet, vérifier l'entrée par lien.
7. Données de départ (facultatif) : `node trade-tracker/import-sheet.js <dossier-csv> --user <idTMT>` ou endpoint admin ; sauvegarde : `npm run backup` planifié.

## Activer Questrade (lecture seule)
1. Portail API Questrade : créer une application personnelle (lecture seule) et générer un jeton d'API (refresh token).
2. Service Trade : `TRADE_CONNECTOR=questrade` (et `TRADE_TOKEN_KEY` déjà définie), redéployer.
3. Dans l'app, coller le jeton (`POST /api/broker/token`). La synchro suivante (15 min) renouvelle le jeton, qui est remplacé à chaque usage dans le stockage chiffré : ne pas réutiliser l'ancien.
4. Si `GET /api/broker/status` renvoie `renewToken: true`, Questrade a refusé le jeton (expiré, déjà consommé ailleurs) : en générer un nouveau et le coller.
5. Les données fictives de la démo ne sont pas effacées : les purger avec `DELETE /api/broker/token` avant le premier collage si besoin (supprime aussi le jeton), ou repartir d'un volume vide.
