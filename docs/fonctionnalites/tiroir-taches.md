# Tiroir des tâches (6 nov. 2026, piste T « rideau depuis le haut »)

Décidé par Émilien sur maquette. La page Tâches de la Feuille de route est FUSIONNÉE dans un rideau qu'on tire depuis le haut de l'écran (comme le centre de notifications d'un téléphone).

- Fichiers : `public/js/tiroir.js` (rideau, geste, calendrier), `public/css/tiroir.css`, composant `.cmpHandle` (`css/composants.css`, copie Trade synchronisée), contenu = `public/js/aujourdhui.js` (liste du jour, tri, édition, barre « Nouvelle tâche… », inchangés).
- Existence : seulement si le module « Feuille de route » (`roadmap`) est dans la barre (R26) ; sur tous les écrans où la barre du haut est visible ; clavier ouvert, la poignée est masquée.
- Geste : départ depuis la poignée (sous la barre du haut) ou une bande de 56 px juste sous la barre (jamais au bord de l'écran : centre de notifications iOS) ; verrou d'axe vertical (8 px, 1,2 fois plus vertical qu'horizontal), le rideau suit le doigt, seuil de 56 px (ou geste rapide) pour se verrouiller ouvert ou fermé. Le défilement vertical de la liste (un ancêtre déjà défilé, un champ, une fenêtre) et le balayage horizontal des pages ne déclenchent jamais le rideau. Fermer : ✕, poignée du bas, tirer vers le haut depuis le titre ou la poignée, toucher le fond, Échap.
- Contenu : titre « Aujourd'hui » (ou le jour choisi), ✕ (R13), bande d'une semaine (`.goalsCal*`, `.cmpNav` : flèches ET balayage, R45-R46) ; le libellé du mois la déploie en calendrier du mois ; compteur et tri ; liste ; barre d'ajout au bas (`TMT.ui.dockKeyboard`). Toucher un jour affiche les tâches de ce jour et y date les ajouts.
- Notifications : le rappel de 6 h (`focusGoalsTaskFromNotification`) ouvre le tiroir (`TMT.taskDrawer.open()`, `focusWhenReady('#taskDrawer [data-task-id=…]')`).
- Page 1 de la Feuille de route = directement l'arbre des Objectifs (plus de sélecteur Tâches | Objectifs) ; pagination : page 1 + Statistiques.
- Tests : `test/tiroir-test.js`, `test/feuille-balayage-test.js`.
