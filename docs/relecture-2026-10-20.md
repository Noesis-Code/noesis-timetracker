# Relecture indépendante des 12 dernières livraisons (20 oct. 2026, repli 13)

Portée : `HEAD~12..HEAD` sur staging (48 fichiers). Fichiers partagés touchés : `public/styles.css` (+6, ajout seul), `public/sw.js` (v487 -> v489), `server/index.js` (+3 : `/healthz`), `server/routes/goals.js` (verrou en vol de la clé d'idempotence). `app.js`, `index.html`, `i18n.js`, `db.js`, `goals.js` non touchés.

- Régression silencieuse : aucune. Diffs de fichiers partagés = ajouts ciblés, rien de retiré.
- Fins de ligne : aucun CRLF dans les fichiers touchés (LF préservé).
- Secrets : aucun `sk_live/pk_live/whsec_`, jeton ni clé. Seules valeurs trouvées : `sk_test_factice` et courriels `@exemple.test` dans les tests (factices).
- Données personnelles : l'adresse de contact publique de l'entreprise apparaissait dans `docs/expansion-courriels.md` : remplacée par `<COURRIEL_CONFIDENTIALITE>`. Aucun téléphone ni lien Drive/Docs dans `docs/`.
- À noter (non corrigé, décision d'Émilien) : `docs/tri-taches-basic-2026-10-20.md` recopie les titres de ~268 tâches personnelles d'Émilien (prénom « Nic » dans quelques lignes) ; `docs/etat-taches-trade-2026-10-20.md` cite Nic. Aucun lien ni donnée sensible, mais à réduire si le dépôt devient visible hors équipe.
- Observation mineure : `idemInFlight` (routes/goals.js) est une Map en mémoire, valable pour une instance Railway unique ; entrée effacée aussi en échec (ok).
- Index des questions : `docs/questions-emilien-precision.md` n'existe pas encore, aucune ligne ajoutée.
