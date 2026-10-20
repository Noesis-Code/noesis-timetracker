# Fiabilité du cœur Basic — 20 oct. 2026

Test : `test/fiabilite-basic-test.js` (inscrit dans `node test/run-tests.js`, dossiers via `mkTmp`). Fuseau : America/Toronto = mêmes règles qu'America/Montreal. Aucun code serveur modifié : aucun cas ne cassait.

| Cas | Résultat | Test |
|---|---|---|
| Heure d'été (8 mars 2026) : 01:59 / 23:59 / minuit, lundi de la semaine | OK | DST mars (6 assertions) |
| Retour à l'heure normale (1er nov. 2026, jour de 25 h) : dates et totaux | OK : 23,5 h saisies comptées entières | DST nov., jour de 25 h |
| Jour de 23 h : 01:00 -> 04:00 = 2 h réelles, via historique 1 h réelle | OK | jour de 23 h, DST historique |
| Minuit exact (23:59:59 -> 00:00:00) | OK | minuit |
| Lundi début de semaine (dimanche vs lundi, semaines des changements d'heure) | OK | semaine (4 assertions) |
| Entrée du dimanche soir : reste dans la semaine précédente | OK | lundi |
| Fin de mois (31 janv., 30 avril) | OK | fin de mois |
| Année bissextile (29 fév. 2028, mardi, semaine à cheval, ajout et mois) | OK | bissextile |
| Nouvel an (semaine 28 déc. -> 3 janv.) | OK | nouvel an |
| Chrono à cheval sur minuit : daté du jour de départ, découpé par jour dans la grille | OK | minuit chrono |
| Chrono oublié 3 jours : démarrage, statut, arrêt avec fin corrigée | OK | oublié |
| Chrono oublié > 24 h arrêté sans correction : durée réelle gardée, corrigeable ensuite | OK | oublié >24 h |
| Départ de plus de 7 jours refusé | OK | oublié |
| Garde-fou manuel : 25 h refusées, 24 h acceptées | OK | garde-fou |
| Concurrence : 12 démarrages simultanés = 1 seul chrono (`running_timers.userId` clé primaire) | OK | concurrence |
| Concurrence : 2 arrêts simultanés = 1 seule entrée | OK | concurrence |

## Limites connues (non corrigées, règle existante)

- Une entrée du dimanche 23 h au lundi 1 h est rattachée au jour de départ (`isoDate`) : dans la grille/camembert, l'heure après minuit n'apparaît pas dans la semaine suivante (1 h manquante côté lundi). Même convention partout (stats, communauté, objectifs) ; la changer touche plusieurs requêtes : décision d'Émilien.
- Un jour de 25 h (1er nov.) : une entrée minuit à minuit dure 25 h réelles et est refusée par le garde-fou 24 h (cas très rare).
- Un chrono oublié arrêté sans correction enregistre sa durée réelle (> 24 h) : le récapitulatif d'arrêt permet de corriger la fin.

## Repli 19 : relecture de l'écart d'horloge, reprise, deux appareils (20 oct. 2026)

Test : `test/chrono-horloge-test.js`. Pièges trouvés et corrigés dans `public/app.js` :
- Écart calculé à l'arrivée de la réponse (latence comptée en entier) : mesuré maintenant au milieu de la requête (`clockSkewFrom`).
- `serverNow` NaN ou non fini donnait un écart NaN (chrono « NaN ») ; écart > 1 jour ou stockage corrompu : ignoré (ancien écart gardé / 0 au chargement).
- Hors ligne, la copie locale du statut servait un `serverNow` périmé (fausse dérive jusqu'à 1 jour) : retiré de la copie.
- Retour au premier plan pendant la saisie du récapitulatif d'arrêt : l'écran du chrono était refait et refermait le récapitulatif ; inchangé si le même chrono tourne.
- Arrêt tenté sur un chrono déjà arrêté sur l'autre appareil : message du serveur gardé, puis l'état est relu (écran repassé à l'attente).
Écart conservé après rechargement (`localStorage`), recalculé à chaque réponse sans dérive, durée jamais négative (`Math.max(0, …)`). Reprise : le départ vient toujours du serveur (testé 3 ouvertures).

## Repli 20 : changement d'heure / horloge du téléphone pendant une session
- Corrigé (`public/app.js`) : le récapitulatif d'arrêt renvoie l'instant exact tant qu'un champ n'est pas modifié (l'heure locale seule est ambiguë au retour à l'heure normale : 00:30 -> 01:10 pouvait donner 40 min au lieu de 1 h 40, ou un refus). Saut d'horloge (> 5 s entre l'horloge et le temps monotone) : l'heure du serveur est relue (nouvel écart d'horloge), la durée affichée reste >= 0.
- Déjà correct, testé : durée en instants UTC (heure d'été/hiver), fuseau changé (jour de l'entrée suit le fuseau envoyé à l'arrêt), fin avant départ refusée sans entrée ni perte du chrono, un seul arrêt possible (pas de doublon). Test : `test/chrono-horloge-test.js` (§4).
- Limite : chrono démarré HORS LIGNE puis horloge changée avant tout contact serveur : aucun repère fiable, la durée se corrige dans le récapitulatif.

## Chargement différé de `legal-en.js` et `qrcode.js` (tâche 10) : non appliqué
- Gain mesuré : 17,3 Ko + 12,2 Ko = 29,5 Ko gzip sur ~646 Ko (4,6 %), soit ~0,15 s en Fast 3G (1,6 Mb/s).
- Raison : `legal-en.js` remplace les textes légaux à l'exécution (différer = texte français visible un instant en anglais, nouvel état) ; `qrcode.js` est appelé de façon synchrone (`qrcode(0,'M')`) : différer = délai à l'affichage du QR. Les deux contredisent « aucun nouvel état visible ». Laissé.

## Code mort d'`app.js` (tâche 9)
Relu `docs/code-mort-2026-10-20.md` : rien de plus (aucune fonction/variable d'`app.js` à une seule occurrence hors IIFE nommée vivante `initFeedbackSection`).
