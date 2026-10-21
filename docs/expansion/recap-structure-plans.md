# Récap de la structure des plans (algorithme pur)

Cadrage et décisions d'Émilien : `docs/expansion/lecture-organisation-ia-cadrage.md`.
Code : `server/lib/planstructurelists.js` (listes fermées, un seul endroit) et `server/lib/planstructurerecap.js` (fonctions pures). Test : `test/planstructurerecap-test.js`.

## Ce que c'est
Un calcul qui reçoit des « fiches de structure » anonymes (une par plan) et rend un récap par groupe : qui avance anormalement vite, et quelle structure ces plans ont en commun.

## La fiche (que des nombres et des étiquettes)
- `domaine` (15, liste fermée), `taille` (petite, moyenne, grande), `cleVille` (chaîne opaque en hexadécimal, jamais un nom).
- `hauteur` (1 à 3, issue de la structure de mots), `vitesse` (nombre > 0, plus grand = plus rapide), `vitessePassee` (optionnelle, pour se comparer à soi).
- `axes` : flouDicte, typeAction, phases (suite parmi définir, préparer, produire, optimiser, diffuser, réviser), testAvantEngagement, bouclesRevision, tourneVers.
- `formes` : nombreEtapes, precisionEstimation, presenceNoteEcheance, constance, ordreTaches, objectifChiffreDate, delaiPremiereAction, partPartagees, concentration, delaiDecision, stabiliteObjectif, tauxReports.
- `contrepartie` : clients, amelioration, efficacite (niveaux 1 à 3).
- `marche` : partVeille, regularite (part des semaines avec au moins une tâche de veille).

## Les étapes
1. **Validation stricte** : liste blanche. Clé inconnue, chaîne hors liste fermée ou texte libre = fiche REJETÉE. La fiche acceptée est reconstruite champ par champ ; le rejet ne garde qu'un code fixe (jamais un bout du texte).
2. **Groupe** : domaine > taille > ville. Si le groupe fin a moins de 5 fiches (`effectifRepli`), repli sur domaine > taille, puis sur domaine.
3. **Peu fiable** : effectif sous 5 (`seuilPeuFiable`) = mention `peu_fiable`. Aucune fiche n'est jamais exclue (décision d'Émilien).
4. **Rapides** : vitesse >= 1,5 x (`ratioRapide`) la médiane de référence. La référence est la médiane des fiches de même hauteur dans le groupe (au moins 2), sinon celle du groupe : on juge la hauteur avant la vitesse.
5. **Profil** : pour chaque axe, forme, contrepartie et mesure de marché, distribution (bas, moyen, haut, ou oui/non) chez les rapides contre les autres.
6. **Auto-comparaison** : vitesse actuelle contre vitesse passée de l'utilisateur (plus rapide, stable à 10 % près, plus lent), comptée par groupe.
7. **Couverture Hill** : chaque point de la grille d'étude est couvert par des mesures nommées, ou consigné « non mesurable » (foi, subconscient, cerveau, sixième sens, transmutation, contrepartie exacte).

## Ce qui n'est PAS fait
- Rien n'est branché : aucune route, interface, base ni lecture de vraies données.
- Aucun extracteur de fiches (la lecture des mots, la clé de ville et la hauteur viendront plus tard).
- Texte légal et consentement : réservés à Émilien.
