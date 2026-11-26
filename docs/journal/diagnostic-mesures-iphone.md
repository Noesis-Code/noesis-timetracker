# Mode diagnostic invisible : mesures de mise en page (17 nov. 2026)

Sert à vérifier en vrai ce que fait l'iPhone d'Émilien sur staging sans le brancher. Jamais de donnée personnelle : seulement des mesures de mise en page (liste blanche dans `server/lib/diagmesures.js`).

- **Activer** : ouvrir l'app avec l'adresse staging suivie de `?diag=1` (pose `localStorage.noesis_diag`), puis ouvrir l'onglet Objectifs (l'arbre, changement d'onglet, rotation : une mesure ; toutes les 5 s sur Objectifs, 20 envois max par session). `?diag=0` désactive. Aucun élément visible.
- **Garde-fous** : actif seulement si le serveur est en staging (`RAILWAY_ENVIRONMENT_NAME === 'staging'`, 404 sinon, jamais en production), session exigée, 30 envois par heure et par utilisateur, corps de 8 Ko au plus, champs hors liste blanche ignorés.
- **Lire** : `GET /api/diag/mesures` avec la session de l'utilisateur (ses 50 dernières mesures, table `diag_mesures`), ou les journaux Railway du service web, lignes préfixées `[diag-mesures]` (JSON compact, id du compte en tête).
- **Données** : table `diag_mesures` (userId, receivedAt, json), effacée avec le compte (classée dans `test/privacy-tables-test.js`).
- Code : `public/js/diag-mesures.js`, `server/routes/diag.js`, test `test/diag-mesures-test.js`.
