# Brief chantier (gabarit à coller à chaque agent)

Chantier : <sujet> · Branche : `claude/<sujet>` · Demande : <1-3 lignes>

1. **Périmètre** : fichiers autorisés : <liste>. Tout autre fichier (surtout `public/app.js`, `index.html`, `styles.css`, `sw.js`, `i18n.js`, `server/db.js`, `server/index.js`) = s'arrêter et signaler. Ne rien élargir.
2. **Charte** : lire `CLAUDE.md`, `SIMPLIFICATION.md`, `DESIGN.md`. Violet #674EA7, sombre seulement, pop-up centrés avec ✕, pas de fenêtre du bas. Règles produit verrouillées intouchables.
3. **Démarrage** : `scripts/new-worktree.sh <sujet>` puis `set -a; . ./.chantier.env; set +a` (PORT et NOESIS_DATA_DIR propres). Sinon : worktree depuis `git fetch origin staging` + FETCH_HEAD.
4. **Tests** : `node --check` sur chaque `.js` touché ; `node test/run-tests.js` (inclut le garde d'intégrité) ; serveur : `PORT`/`NOESIS_DATA_DIR` du `.chantier.env`, jamais ceux d'un autre chantier ; UI : une capture de l'écran touché.
5. **Livraison** : `git fetch origin && git rebase origin/staging` (terminé) → si `public/` change : `node scripts/bump-sw.js` → `git diff origin/staging` limité à la demande (aucun fichier vide/tronqué) → commit en français → `git push origin HEAD:staging`.
6. **Interdits** : `git stash` (utiliser un commit WIP) ; `--force` ; travailler dans le dépôt principal ; fusion vers `main` ; paiement/Stripe, légal/Loi 25, suppression de données (préparer, ne pas exécuter) ; ajouter une dépendance sans le dire.
7. **Compte rendu** : 2-3 lignes : fait / à valider visuellement / bloqué. Pas de fichier de rapport.
