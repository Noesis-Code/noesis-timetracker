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
| `TRADE_TOKEN_KEY` | secret propre >= 16 car. (idéal : `openssl rand -hex 32`) ; chiffre les jetons courtier ET les secrets TOTP (le perdre = reconnecter les courtiers et ré-enrôler le TOTP) (obligatoire) |
| `TRADE_TOKEN_KEY_VERSION` | facultatif, entier (défaut 1) : version de `TRADE_TOKEN_KEY` ; à incrémenter à chaque rotation |
| `TRADE_TOKEN_KEY_V<n>` | facultatif : ancienne clé de version n, gardée le temps de la rotation (voir ci-dessous) |
| `TMT_BASE_URL` | URL publique de TMT (obligatoire ; autorise l'iframe) |
| `TRADE_EXPERT_TMT_IDS` | id(s) TMT de l'expert (obligatoire) |
| `TRADE_RP_ID` | domaine de Trade sans `https://` (ex. `web-trade-xxxx.up.railway.app`) ; active les passkeys (sans lui : indisponibles). Changer le domaine invalide les passkeys existantes |
| `TRADE_ORIGIN` | facultatif, défaut `https://<TRADE_RP_ID>` |
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

## Checklist de mise en service sécurisée (Émilien, Nick)
À suivre dans l'ordre. Rien n'est actif tant que ces étapes ne sont pas faites.

**Avant la première entrée**
1. Secrets distincts, générés avec `openssl rand -hex 32` : `TRADE_LINK_SECRET` (identique TMT/Trade), `TRADE_NOTIFY_SECRET` (identique TMT/Trade), `TRADE_TOKEN_KEY` (propre à Trade). Ne jamais les écrire dans le dépôt, un message ou un document ; les garder dans un gestionnaire de mots de passe.
2. **Limiter `TRADE_ALLOWED_USER_IDS`** (TMT) aux seuls ids qui doivent voir Trade (Émilien, Nick, clients invités). `TRADE_EXPERT_TMT_IDS` (Trade) = l'id de Nick seulement (ajouter Émilien seulement s'il doit aussi être expert). Un id absent de ces listes ne peut pas entrer.
3. Ne pas définir `TRADE_ADMIN_TOKEN` (import) sauf pendant un import ponctuel, puis le retirer.
4. Railway : activer l'authentification à deux facteurs sur les comptes qui ont accès au projet et limiter le nombre de membres. Un seul réplica.
5. Questrade : créer l'application API personnelle avec la portée « lecture des données de compte » seulement (aucune portée de transaction/négociation) et vérifier dans le portail qu'aucune autre n'est cochée.

**À la première entrée de chaque personne (expert d'abord)**
6. **Activer le TOTP tout de suite** (écran « Sécurise ton compte ») : scanner le QR avec une application d'authentification (Google Authenticator, Authy, 1Password…), entrer le premier code. L'expert le fait avant d'inviter qui que ce soit.
7. **Conserver les 10 codes de secours** hors de l'appareil (gestionnaire de mots de passe ou papier rangé). Ils ne sont affichés qu'une fois. Vérifier la page Sécurité : « Codes de secours restants : 10 ».
8. Chaque client qui connecte un courtier active aussi son TOTP (l'application le demande avant le jeton). Aucun jeton ne se colle sans code récent (5 min).
9. Vérifier que les notifications TMT sont autorisées sur le téléphone, puis tester : se connecter et confirmer qu'une alerte « Trade Tracker » arrive. Une alerte inattendue (connexion, nouvel appareil, jeton modifié) = ouvrir Trade > Sécurité > « Fermer toutes mes sessions », puis changer le jeton courtier chez Questrade.
10. Ne pas ouvrir Trade sur un appareil partagé. Les sessions se ferment seules (15 min d'inactivité, 12 h au plus).

**Exploitation**
11. Rotation des secrets (au moins tous les 6 mois, tout de suite en cas de doute) :
    - `TRADE_LINK_SECRET` et `TRADE_NOTIFY_SECRET` : nouvelle valeur dans TMT **et** Trade au même moment, redéployer les deux (les liens durent 2 min : aucune conséquence durable).
    - `TRADE_TOKEN_KEY` : (a) générer la nouvelle clé ; (b) dans un terminal avec accès au volume : `TRADE_TOKEN_KEY=<nouvelle> TRADE_TOKEN_KEY_VERSION=<n+1> TRADE_TOKEN_KEY_V<n>=<ancienne> node rotate-key.js --dry-run`, puis sans `--dry-run` (rechiffre jetons courtier et secrets TOTP en une transaction, tout ou rien) ; (c) mettre les mêmes variables dans le service Railway et redéployer ; (d) garder l'ancienne clé quelques jours (sauvegardes), puis la détruire. Première version : `TRADE_TOKEN_KEY_VERSION` absent = 1, les données existantes sont migrées par le script.
    - Jeton Questrade : le régénérer au portail si un doute existe ; `DELETE /api/broker/token` (page courtier) retire jeton et données.
12. Téléphone perdu : un code de secours, puis Sécurité > « Changer d'appareil ». Téléphone et codes perdus : après avoir vérifié l'identité par un autre canal, `node mfa-reset.js <idTMT>` (journalisé) ; la personne se ré-enrôle à sa prochaine entrée.
13. Consulter régulièrement Sécurité > « Journal d'activité » (la ligne « Chaîne intacte » doit s'afficher). Noter de temps en temps l'empreinte affichée.
14. Sauvegardes : `npm run backup` planifié + copie hors volume (R2). Ne jamais ranger `TRADE_TOKEN_KEY` avec les sauvegardes.
