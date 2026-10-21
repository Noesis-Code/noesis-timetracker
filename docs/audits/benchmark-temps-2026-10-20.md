# Benchmark « 0 → 1 » — Chrono et Feuille de temps (20 oct. 2026)

**Limite : cette session n'avait aucun accès web** (pas de WebSearch/WebFetch ; le proxy refuse support.toggl.com, clockify.me, help.getharvest.com). Les chiffres ci-dessous viennent de la connaissance générale des produits, **non vérifiés en ligne le 20 oct. 2026** : ordres de grandeur seulement. À recouper aux pages d'aide officielles (Toggl « The Timer page », Clockify « Timesheet / Time tracker », Harvest « Timesheets ») lors d'une session avec accès web. Le benchmark sert à retirer, jamais à copier.

## Grille
| | Fonction unique de l'écran | Éléments à l'écran (approx.) | Ce qu'ils ne montrent pas |
|---|---|---|---|
| Toggl Track (mobile, onglet Timer) | démarrer un chrono sur « Sur quoi travailles-tu ? » | ~6 : champ de description, bouton start, projet, étiquettes, facturable, liste des entrées du jour | Statistiques, équipe, rapports : sur d'autres onglets/Web ; pas de fil social |
| Clockify (onglet Timer) | idem : description + projet + start | ~7 : description, projet, étiquette, facturable, start, bascule chrono/manuel, entrées groupées par jour | Rapports, équipe, tâches : autres écrans |
| Harvest (Timesheet) | une semaine, une ligne par projet/tâche, un bouton de chrono par ligne | ~8 : barre de jours, flèches de semaine, total, « + » entrée, lignes, chrono par ligne | Rapports, facturation : autres écrans |
| TimeTracker (cet état) | Chrono : lancer/arrêter sur une activité ; Stats : Feuille de temps + Répartition + Graphique + 2 pages | Chrono au repos : ~6 (boutons d'activités, Historique, barre du haut, barre du bas) ; Stats : ~25 | Bonne tenue du Chrono ; Stats concentre 3 visualisations + filtre + 2 pages sur le même onglet |

Ce qui rend leur écran principal minimal (observation, à confirmer) : **un seul geste (start) devant un seul champ**, et **toutes les analyses déportées dans un onglet « Rapports » distinct** de l'enregistrement. L'historique du jour est une liste, pas un graphique.

## 5 propositions (format `docs/regles/modele-tache.md`)
Aucune ne passe le contrôle « citation d'intention » : chacune est donc **à valider** (voir `questions-emilien.md`). Dans chaque cas, champs 1 (contexte), 2 (problème), 4 (fini quand), 5 (périmètre), 6 (on ne touche pas), 7 (preuve) sont remplis ; le champ 3 (citation) est vide = question à cocher.

### P1 — Retirer le libellé de période de la Répartition
1. Contexte : captures `audit-stats-2026-10-20.png` : le libellé « Semaine du 14/10 au 20/10 » apparaît dans la Feuille de temps et dans la Répartition.
2. Problème : même information deux fois à 1 écran d'écart.
3. Citation : aucune (voisine : 6 sept., « le temps total est marqué deux fois ... supprimer » pour #statsTotal, même logique).
4. Fini quand : `#statsLabel` n'existe plus ; la Répartition suit toujours la Feuille de temps ; capture 390 px.
5. Périmètre : `public/index.html`, `app.js`, `styles.css` (fichiers très partagés : un agent à la fois).
6. Ne pas toucher : le bouton « Aujourd'hui » (quand il est actif, la période diffère : il faut alors un libellé « Aujourd'hui »).
7. Preuve : capture avant/après.

### P2 — Fusionner les pages 2 et 3 de Stats (Tâches / Objectifs)
1. Contexte : `audit-stats-page2-2026-10-20.png` : deux pages à structure identique, moitié d'écran vide.
2. Problème : 2 pages pour un même graphique (benchmark : un seul écran « Rapports » chez Toggl/Clockify).
3. Citation : aucune.
4. Fini quand : une seule page avec la bascule Tâches/Objectifs ; 2 points de pagination au lieu de 3 ; capture.
5. Périmètre : `public/js/stats-avance.js`, `stats-avance.css`, points de `#statsPageDots` (index.html partagé).
6. Ne pas toucher : le graphique Prévu/En avance/En retard, la route serveur.
7. Preuve : capture 390 px.

### P3 — Retirer « Ajouter une information » (cartes ajoutables)
1. Contexte : bouton pointillé seul sur les pages 2-3 (demande du 9 oct. « cartes d'information ajoutables »).
2. Problème : un mécanisme de personnalisation sur un écran d'une seule fonction ; Toggl/Clockify n'en ont pas sur leur écran principal.
3. Citation : à fournir (la demande du 9 oct. l'a créé : Émilien décide).
4. Fini quand : cartes par défaut seulement ; plus de `saAdd`/`loadAdded` ; capture.
5. Périmètre : `stats-avance.js` et son CSS.
6. Ne pas toucher : cartes par défaut, profil visité (déjà en cartes fixes).
7. Preuve : capture + `node --check`.

### P4 — Fusionner le filtre Tous/Public/Confidentiel dans la Feuille de temps ou le retirer
1. Contexte : bouton « Tous ▾ » seul en haut de l'onglet Stats (ajout du 6 oct.).
2. Problème : un contrôle global flottant, isolé ; les trois concurrents n'ont pas de filtre de visibilité (concept absent chez eux).
3. Citation : à fournir (ajout du 6 oct. attribué à une demande ; texte exact absent de `docs/regles/intentions.md`).
4. Fini quand : le bouton n'est plus au-dessus de la carte (retiré, ou déplacé dans le menu ⋮ de la Feuille de temps) ; capture.
5. Périmètre : `index.html`, `app.js` (bloc `statsVis*`), `styles.css`.
6. Ne pas toucher : le paramètre serveur `visibility` ; la visibilité des activités.
7. Preuve : capture.

### P5 — Déporter Graphique + Répartition derrière la Feuille de temps (un écran de Stats = une visualisation)
1. Contexte : Stats empile Feuille de temps, Répartition, Graphique (~25 éléments) ; Toggl/Clockify/Harvest séparent saisie et rapports et montrent une visualisation à la fois.
2. Problème : trois visualisations qui répondent à des questions différentes sur un seul défilement.
3. Citation : aucune : proposition de fond, non lancée sans décision.
4. Fini quand : à définir avec Émilien (3 options : points de pagination comme pages 2-3, onglets, ou statu quo).
5. Périmètre : `public/app.js`, `index.html`, `styles.css` (très partagés).
6. Ne pas toucher : les données, la règle « les secteurs remontent au pôle ».
7. Preuve : maquette d'abord.
