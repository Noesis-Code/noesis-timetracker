# Vérification navigateur de l'arbre des objectifs (Chrome + CDP)

Scripts manuels (hors suite `node test/run-tests.js`, qui n'a pas de navigateur) pour mesurer ce que le code seul ne prouve pas : décalage de la page, nombre de lignes, position de défilement. Chrome est lancé en mode sans fenêtre, piloté par le protocole CDP (WebSocket intégré à Node 24, aucune dépendance).

Préparation (une fois) :
1. `D=$(mktemp -d); NOESIS_DATA_DIR=$D RAILWAY_ENVIRONMENT_NAME=staging node scripts/dev-seed.js` (affiche l'id d'Emilien) ;
2. `NOESIS_DATA_DIR=$D PORT=3998 node server/index.js &` ;
3. ajouter au profil des objectifs de pôle en 2026, 2031, 2032 et 2046 (avec un sous-objectif de secteur pour qu'ils soient « grands »), et un périodique du secteur dans la période courante.

Commandes (le dernier argument est un fichier d'étapes généré par le script de scénario) :
- Décalage de la page entre Tâches et Objectifs (zones de sécurité iPhone émulées : haut 47, bas 34, mode standalone) :
  `node scripts/verif-arbre-decalage.js etapes.json && SAFE=1 node scripts/verif-navigateur-cdp.js 3998 <id> sortie/dl 390 844 @etapes.json` — attendu : `topbar`, `sw` (bascule) et `pill` (barre des volets) identiques entre les deux onglets, même après un défilement préalable.
- Nombre de lignes à chaque point d'entrée (bloc 26/30, 31/35, 46/50 ; année ; retour par le fil d'Ariane ; retour par la barre des volets) :
  `node scripts/verif-arbre-entrees.js etapes.json && node scripts/verif-navigateur-cdp.js 3998 <id> sortie/en 390 844 @etapes.json` — attendu : 5 lignes pour un bloc (les bonnes années), 13 pour une année.
- Page des 4 semaines (semaine courante visible, ✕ ne décale rien) :
  `node scripts/verif-arbre-semaines.js etapes.json && node scripts/verif-navigateur-cdp.js 3998 <id> sortie/wk 390 844 @etapes.json`.

Étapes : `js` (évalué dans la page, sa valeur est affichée), `tap` (expression JS qui renvoie `[x, y]`, touché en vrai), `wait` (ms), `shot` (capture PNG). Variable `SAFE=1` : zones de sécurité et mode standalone émulés. Le chemin de Chrome est celui de Windows (`C:/Program Files/Google/Chrome/...`), à adapter ailleurs.
