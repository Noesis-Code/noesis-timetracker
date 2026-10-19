# Trade Tracker (serveur)

Extension Noèsis : suivi du portefeuille d'un expert et de ses clients. Autonome : même pile que TMT (Node 22, Express, `node:sqlite`), aucune dépendance propre ; déplaçable telle quelle vers son propre dépôt/service (ajouter alors un `package.json` avec `express`).

- Démarrer : `NOESIS_DATA_DIR=<dossier> TRADE_LINK_SECRET=<16+ car.> PORT=3980 node trade-tracker/server/index.js`
- Démo fictive : `node trade-tracker/seed-demo.js` (affiche des liens d'entrée).
- Tests : `node trade-tracker/test/run.js` (inclus dans `node test/run-tests.js`).
- Contrat d'API, variables d'environnement, événements vers TMT : voir `API.md`.
