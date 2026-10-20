# Relecture croisée staging 31f28fc..84ba162 (chantier 7, repli 5)

Relecture seule des 4 nouveaux commits : i18n (9 clés retirées, 3 traductions ajoutées, `i18n-unused` multi-clés : 0 clé inutilisée sur 779), rayon du bouton d'activité (`var(--radius-lg)` = 14 px), CHANTIERS, bump sw. Rien à signaler.

## Défauts de la relecture 4 : état
Les 5 défauts (health Trade, cache silentspellfix, MutationObserver a11y, dédoublonnage hors ligne, pricewatch) relèvent de chantiers propriétaires et ne sont pas triviaux : laissés tels quels.

## Corrigé ici (tests uniquement)
- `test/glisse-coherence-test.js` : test orphelin, branché dans `run-tests.js`.
- `test/fonctionnel-secteurs.js` : échec déterministe entre minuit et 2 h (heure locale) et dès que le graphique inclut aujourd'hui à 0 s. L'entrée d'historique est maintenant hier 10 h-11 h et l'assertion ne compte que les jours non vides.
- `test/trade-events-test.js` : échec intermittent (~1 sur 6). Le premier événement (e0) et le second (e1) pouvaient avoir le même horodatage si la seconde changeait entre les deux : même signature, donc doublon. e0 est reculé de 10 s (12 exécutions sur 12 passent).

## Résultat
`node test/run-tests.js` : 97/97 en worktree neuf (un échec Trade vu pendant une saturation disque du poste, ENOSPC, non reproductible disque libéré).

## Piège d'environnement
`trade-tracker/node_modules` n'est lié que par la version récente de `new-worktree.sh` (le clone de référence peut en avoir une ancienne : le mettre à jour). Sans lui, les tests Trade échouent.
