# Entrée du rapprochement tâche -> objectif (chantier 4, repli 24, 20 oct. 2026)

Mesure seulement, aucun changement de comportement (`buildMatchPrompt` exporté, test `test/ia-rapprochement-mesure-test.js`). Jetons = caractères / 4.

## Constat
`goalscaptureplace.matchObjective` envoie jusqu'à `MAX_AI_CANDIDATES` = 60 objectifs (texte coupé à 120, description à 160 caractères), au plus deux appels par tâche (hebdomadaire/périodique puis autre pôle), plafond 500 appels réels/compte/jour. Seule entrée IA encore longue non traitée par les cycles précédents.

## Mesure
Pire cas (60 candidats pleins) : 5236 jetons par appel. Cas courant (8 candidats, sans description) : 510 jetons. Haiku (1 $/M) : 0,0052 $ contre 0,0005 $ par appel ; au repli fort (3 $/M) : 0,016 $.

## Gain possible (NON exécuté : risque de qualité, voir case à cocher)
Ramener le plafond de 60 à 25 candidats (déjà triés par score lexical décroissant) : pire cas 5236 -> ~2200 jetons (-58 %), soit 0,0052 -> 0,0022 $ par appel Haiku. Risque : un objectif pertinent sans mot commun classé au-delà du 25e ne serait plus proposé (le repli lexical resterait). Mesure de qualité impossible hors ligne.

## Troncature inter-secteurs (cycle 23)
Aucun jeu de cas inter-secteurs avec décision attendue n'existe dans `test/fixtures` (seul `task-precision/` pour le classement) ; la décision du modèle ne se rejoue qu'en `--live`. Vérifié par test (500 cas aléatoires) : clés, libellés et texte source jamais touchés, coupe toujours à une frontière de mot, début exact conservé.
