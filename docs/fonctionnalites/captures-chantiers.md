# Captures des chantiers

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
