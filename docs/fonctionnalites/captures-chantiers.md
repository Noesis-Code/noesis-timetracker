# Captures des chantiers

## Principe (21 oct. 2026, demande d'Émilien) : une capture PAR PAGE de CHAQUE module

Pour chaque module (Chrono `chrono`, Objectifs `objectifs`, Communauté `communaute`, Réglages `reglages` y compris Profil, Trade Tracker `trade`), UNE capture 390 x 844 (sombre) de CHAQUE page ou écran, rangée dans `docs/img/chantiers/<code>/<nn>-<slug>.png`, avec `docs/img/chantiers/manifest.json` (`{"<code>": [{"nom": "...", "fichier": "<code>/<nn>-<slug>.png"}]}`) pour publier la liste. Images réduites : 390 px de large, PNG, < 250 Ko.

- **Chrono et Objectifs sont capturés « comme seul module installé »** : le compte de test reçoit l'état de modules `SOLO` (`scripts/capture_lib.py`, via `PUT /api/profile/:id/modules`), donc barre des volets à un seul icône, aucun onglet des autres modules, ni Communauté, ni Profil, et seulement les pages du module (le Chrono garde ses Statistiques de temps, Objectifs ses statistiques de tâches et d'objectifs). C'est le design réel de l'app dans cette configuration, aucun code de `public/` modifié.
- **Communauté et Réglages** : app normale (tous modules actifs).
- **Trade Tracker** : app autonome `trade-tracker/` (son propre en-tête et sa barre : Accueil, Positions, Répartition, Historique, Expert), TOTP activé par le script sur base jetable. Écrans : activation TOTP, codes de secours, 10 routes (`#/dashboard`, `positions`, `allocation`, `history`, `expert`, `settings`, `security`, `broker`, `invite`, `sync`).
- **Le chantier « Simplification et design général » refait TOUT** : à chaque règle ou refonte de design, il régénère l'ensemble (`--toutes`) et vérifie chaque page de chaque module.
- Les tâches à venir ne sont pas simulées : un écran qui n'existe pas encore n'a pas de capture.

### Commandes

- Tout : `python3 scripts/capture-chantier.py --toutes` (ou un module : `--toutes chrono`) ; équivalent direct `python3 scripts/capture-pages.py --toutes [codes]`. Le script fabrique ses bases temporaires et ses serveurs (ports 3999 et 3980) : rien à lancer avant. Compter 5 à 8 minutes pour tout. `--sortie <dossier>` pour ne pas écraser `docs/img/chantiers`.
- Données : `scripts/dev-seed.js` + `scripts/seed-scenarios.js` (activité « Scénarios Feuille de route (test) » : pôles, secteurs, tâches, objectifs ; staging seulement, fictives) ; `trade-tracker/seed-demo.js` pour Trade.
- La liste des pages de chaque module est en tête de `scripts/capture-pages.py` (`CHRONO`, `OBJECTIFS`, `COMMUNAUTE` ; les sections de Réglages et les routes de Trade sont énumérées à l'exécution). Nouvelle page dans l'app = une ligne `(slug, nom, étapes)` : étapes `{'clic': sélecteur}`, `{'eval': js}`, `{'attendre': ms}`, `{'remplir': [sélecteur, texte]}`.

### Capturer un élément précis (pop-up, menu, fenêtre de confirmation)

Un « élément » = on ouvre l'écran, on déclenche l'élément, on capture. Sortie : `docs/img/chantiers/elements/<identifiant>.png`.

- Connus : `python3 scripts/capture-chantier.py --element --liste` (aujourd'hui : `confirmation-suppression` = fenêtre `TMT.ui.confirm`, `menu-epingle` = menu de l'épingle de la discussion (pièce jointe / sondage), `popup-barre` = pop-up « Ajouter à la barre »). Capture : `python3 scripts/capture-chantier.py --element confirmation-suppression`.
- Sur mesure, sans rien modifier : `python3 scripts/capture-chantier.py --element "Nom lisible" --depuis chrono --etapes '[{"clic":"#chronoHistoryHeader"},{"attendre":800}]'` (`--depuis` = chrono, objectifs (modules seuls), communaute, reglages ou tous (app normale, écran d accueil) : écran de départ ; les étapes mènent à l'élément).
- **Pour en demander un** : écrire au coordinateur « capture de l'élément <description> (écran, geste pour l'ouvrir) » ; il l'ajoute à `ELEMENTS` dans `scripts/capture-pages.py` (ou le lance en sur mesure) et publie l'image.

### Manquant (non capturé)

- Chrono : liste des activités avec pôle/secteur de la fenêtre « Pôle ou secteur » du Chrono en marche (aucun pôle dans les données de test), feuille de temps détaillée, écran Activité d'un partage.
- Objectifs : Page 3 Calendrier de la période (créneau d'une tâche), panneau « gérer mes catégories », proposition IA / Modifications proposées, achat Expansion (compte réel Stripe), fenêtre Activité (Tâches/Discussion) : à ajouter dans `OBJECTIFS` dès qu'un parcours stable existe.
- Communauté : sondage (création, vote), fil d'une activité partagée. Réglages : chaque sous-écran légal (conditions, politique), connexion IA. Trade : données réelles du courtier, vérification TOTP d'un vrai compte.

### Limites connues

- Écrans qui exigent un compte réel (paiement Expansion, TOTP d'un vrai compte, réponses IA, notifications push) : non capturés, listés dans « Manquant » plus bas.
- Premier lancement (création de compte, « Crée tes activités ») : captures séparées `docs/img/premier-lancement-*.png` ; le script part d'un compte existant.
- Écart « module seul » : l'app n'a pas de mode « Trade seul » dans TMT (au moins Chrono ou Objectifs reste actif) ; Trade est donc capturé dans son app autonome.
- Anomalie vue en capturant « Objectifs seul » : à froid (rechargement avec modules en cache), l'erreur console `TMT.loadGoalsTab is not a function` (app.js `switchTab` appelé par `onModulesChange` avant le chargement de objectifs-page1.js) laisse l'écran Objectifs vide jusqu'à un nouveau changement d'onglet. Non corrigé ici (hors périmètre `public/`) : à traiter par le segment Objectifs / Design coquille.

---

# Captures des chantiers permanents (une page principale par chantier)

Principe : pour chacun des 5 chantiers permanents, UNE capture à 390 px de sa page principale. Elle montre ce qu'Émilien verra dans l'app : l'état de `origin/staging` (même ce qui n'est pas encore visible chez lui à cause d'une panne Railway) PLUS les améliorations visuelles à venir du chantier, appliquées dans un worktree jetable (`../wt-plan-<chantier>`), jamais poussé, supprimé ensuite.

## Page choisie par chantier

| Chantier | Code | Page capturée | Fichier |
|---|---|---|---|
| Basic | `basic` | écran Chrono | `docs/img/chantiers/basic.png` |
| Expansion | `expansion` | écran Objectifs (carte « Découvrir Expansion ») | `expansion.png` |
| Simplification et design général | `simpl` | Réglages | `simpl.png` |
| Précision des tâches | `precision` | Tâches du jour (Page 2, pôle Time Tracker, 3 tâches fictives) | `precision.png` |
| Trade Tracker | `trade` | accueil de Trade Tracker (données de démo) | `trade.png` |

Trade : l'écran exige un TOTP ; le script l'active lui-même sur une base jetable avec la clé affichée, donc c'est le vrai écran d'accueil, avec les données fictives de `seed-demo.js`.

## Refaire une capture

- État de staging : `python3 scripts/capture-chantier.py <code>` (sortie par défaut `docs/img/chantiers/<code>.png`, 390 x 844, sombre). Le script fabrique sa base et ses serveurs (ports 3999 et 3980), rien à lancer avant.
- Avec l'anticipé : `git worktree add ../wt-plan-<code> -b plan-<code> origin/staging`, lier `node_modules` (comme `scripts/new-worktree.sh`), appliquer les tâches visuelles à venir, lancer le script avec un dossier de sortie, enregistrer le PNG sous `<code>-plan.png`, puis supprimer le worktree et la branche. Ne jamais pousser.
- Si l'anticipé ne change pas la page, pas de `-plan.png` : on le dit.
- Les grosses fonctions (vues jour/semaine/mois/année, bouton « besoin » du Chrono) ne sont pas simulées : « plan à produire par le chantier quand il prend la tâche ».

## Quand la refaire

- À chaque tâche qui change l'apparence, créée ou modifiée par Émilien dans la page Prochaines tâches.
- À chaque relance d'un chantier qui a poussé du visuel.

## Où elle s'affiche

Dans le champ `page` du document `prochaines/<chantier>` de la page Prochaines tâches ; le coordinateur le met à jour (JPEG réduit, comme le champ `capture`, R30).

## État au 21 oct. 2026

Les 5 captures de staging sont faites. Anticipé testé : Simplification (S1 étape 2 jetons Trade, chevrons R21 restants, « + » R23 restants) : aucun effet visible sur Réglages, écart de 2/255 au plus sur Trade (imperceptible), donc pas de `-plan.png`. Basic « Premier lancement : retirer Modules et Crée tes activités » : écrans de création de compte, sans effet sur le Chrono d'un compte existant.
