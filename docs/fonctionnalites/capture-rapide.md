# Capture rapide (outil de dev, `scripts/shot.py`)

Un démon garde allumés le serveur de test (seed + scénarios) et un Chromium déjà connecté en Emilien. Une capture = 1 à 2 s (cible < 3 s ; seule la toute première, qui démarre le démon, prend ~25 s).

```
python3 scripts/shot.py <écran> [--css f.css] [--js f.js] [--w 390|360] [--out f.png] [--hd]
python3 scripts/shot.py --liste | --start | --stop | --status
python3 scripts/shot.py --depuis communaute --etapes '[{"clic":"#whoami"}]'   # écran sur mesure
```

- Sortie par défaut : `$TMPDIR/tmt-shot/<écran>-<largeur>.png` (chemin affiché). 390 px de large ; `--hd` = x2.
- Écrans : voir `--liste` (chrono, chrono-historique, chrono-stats, chrono-partagees, chrono-en-cours, confirmer-arret, feuille-mois, feuille-annee, communaute-fil/recherche/profil/mon-profil/abonnements/notifications, objectifs, objectifs-poles/avancement/periode/annee, reglages).
- Ajouter un écran : une ligne dans `ECRANS` de `shot.py` : `'nom': ('onglet de départ', [étapes], 'description')`.
- Plan visuel : `--css plan.css` injecte le CSS sur le vrai DOM (avant et après les étapes) ; `--js` exécute du JS.
- Rechargement à chaud : si un fichier de `public/` change (mtime), le cache du navigateur est vidé et le code est relu du disque, sans redémarrer.
- Le démon démarre seul à la 1re capture et redémarre s'il est mort. Il montre le code du dossier où il a été lancé ; `--stop` avant de changer de worktree. Ports : démon 3990 (`SHOT_PORT`), serveur TMT 3997 (`PORT`).
- `SHOT_DEBUG=1` affiche le détail des temps par phase.
- Rapidité : l'écran de démarrage (ident ~2,5 s) est masqué et remplacé par l'attente du signal « app prête » ; les clics passent par événement (sans les contrôles d'actionnabilité) ; pauses plafonnées. Animations non figées : à la différence de `capture-pages.py` (plus lent, plus fidèle aux transitions), l'image est prise ~250 ms après le dernier geste.
