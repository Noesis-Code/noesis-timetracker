# Trade Tracker (serveur)

Extension Noèsis : suivi du portefeuille d'un expert et de ses clients. Autonome : même pile que TMT (Node 22, Express, `node:sqlite`) ; dépendances propres (`express`, `@simplewebauthn/server`, versions figées par `package-lock.json`) ; déplaçable telle quelle vers son propre dépôt/service.

- Installer (une fois par clone ou worktree, obligatoire avant démarrage et tests) : `cd trade-tracker && npm ci` (Railway le fait au déploiement, Root Directory = `trade-tracker`).
- Démarrer : `NOESIS_DATA_DIR=<dossier> TRADE_LINK_SECRET=<16+ car.> PORT=3980 node trade-tracker/server/index.js`
- Démo fictive : `node trade-tracker/seed-demo.js` (affiche des liens d'entrée).
- Tests : `cd trade-tracker && npm ci && node test/run.js` (inclus dans `node test/run-tests.js`).
- Contrat d'API, variables d'environnement, événements vers TMT : voir `API.md`.
- Sécurité (TOTP obligatoire, sessions, audit, alertes, lecture seule) : `SECURITY.md` ; mise en service : « Checklist de mise en service sécurisée » dans `DEPLOY.md`. Scripts d'exploitation : `node rotate-key.js [--dry-run]` (rotation de `TRADE_TOKEN_KEY`), `node mfa-reset.js <idTMT>` (urgence).

## Déployer comme service Railway séparé
Rien n'est déployé automatiquement. Marche à suivre (Émilien) :
1. Railway > nouveau service depuis le dépôt `noesis-timetracker`, branche `staging`, **Root Directory = `trade-tracker`** (utilise `trade-tracker/package.json`, `railway.json`, `Procfile`; health-check `/health`; détail dans `DEPLOY.md`).
2. Volume monté sur `/data` (la base SQLite y vit) et `NOESIS_DATA_DIR=/data`.
3. Variables (valeurs jamais dans le dépôt) :
   - `TRADE_LINK_SECRET` : >= 16 car., **identique** à celui de TMT (signature des liens).
   - `TRADE_TOKEN_KEY` : >= 16 car., chiffre les jetons courtier (le perdre = jetons à reconnecter).
   - `TRADE_NOTIFY_SECRET` : identique côté TMT (événements d'achat) ; `TMT_BASE_URL` : URL de TMT (aussi le lien « Retour à TimeTracker » de l'écran ; absent ou invalide = staging `https://web-staging-6d1b.up.railway.app`, valeur écrite dans `public/index.html`).
   - `TRADE_EXPERT_TMT_IDS` : id(s) TMT de l'expert, séparés par des virgules.
   - `TRADE_ADMIN_TOKEN` (facultatif, >= 16 car.) : active l'import admin ; `TRADE_CONNECTOR` (`demo` par défaut ; `questrade` = lecture seule, voir `DEPLOY.md`), `TRADE_SYNC_INTERVAL_MIN`.
   - Générer un secret : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Un seul réplica (SQLite, planificateurs en processus).
5. Sauvegarde : `npm run backup` (`node backup.js`, `VACUUM INTO` daté dans `/data/backups`, 14 conservées) en tâche planifiée Railway, plus les sauvegardes de volume Railway ; copier périodiquement hors du volume (R2, voir `GUIDE-SAUVEGARDE-R2.md` à la racine). Restauration (service arrêté) : `node restore.js <sauvegarde.db> [--force]` : contrôle d'intégrité et de la chaîne d'audit, refuse d'écraser sans `--force`, conserve l'ancienne base.
6. Données de départ : `node trade-tracker/import-sheet.js <dossier-csv> --user <idTMT>` (ou endpoint admin).
