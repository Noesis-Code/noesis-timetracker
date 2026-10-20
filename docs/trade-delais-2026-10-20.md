# Trade Tracker : « temps réel », délais mesurés (20 oct. 2026)

Chantier 1, repli 16. Rien n'est modifié dans le code. Mesure : vrai serveur Trade en mémoire, connecteur factice, ports éphémères (aucun réseau externe).

## Schéma : du changement chez le fournisseur à l'écran

| Étape | Qui | Délai | Ce que voit l'utilisateur |
|---|---|---|---|
| 0. Le prix change chez Questrade | fournisseur | — | rien |
| 1. Attente de la prochaine synchro | serveur Trade (`startSyncScheduler`, `TRADE_SYNC_INTERVAL_MIN`) | 0 à 15 min (moyenne 7,5 min) | ancien prix ; « Dernière synchro : il y a X min » |
| 2. Synchro (appel Questrade, écriture en base) | serveur Trade | quelques secondes en réel (2 à 11 ms mesurés avec connecteur factice : le coût est le temps réseau Questrade) | rien encore |
| 3. Attente du prochain rafraîchissement de l'écran | navigateur (`app.js`, 30 s) | 0 à 30 s (moyenne 15 s) | ancien prix |
| 4. Lecture de l'API (requête conditionnelle ETag) | navigateur + serveur | < 10 ms mesurés | le nouveau prix s'affiche ; pastille « à l'instant » |

Mesure du traitement serveur (20 essais, synchro puis lecture de `/api/positions`, l'ETag change à chaque fois) : min 2,3 ms, médiane 4,3 ms, max 10,8 ms.

Délai total changement -> affichage (simulation de 200 000 changements à instant aléatoire, onglet visible) : moyen 7 min 45 s, médian 7 min 46 s, 95e centile 14 min 30 s, maximum 15 min 29 s. En pratique : « jusqu'à environ 15 minutes, 8 en moyenne ». Le rafraîchissement de 30 s n'ajoute que 0 à 30 s ; la synchro de 15 min domine tout.

## Cas où c'est plus long
- Onglet caché ou application en arrière-plan : le rafraîchissement est en pause ; au retour, une lecture immédiate (donc au plus 15 min de retard serveur, plus rien côté écran).
- Erreurs réseau côté écran : recul 30 s, 1 min, 2 min... plafonné à 5 min ; message « connexion instable, nouvel essai plus tard ».
- Échec de synchro (429, 5xx, jeton) : recul serveur 15 min, 30 min, 1 h... plafonné à 6 h ; le dernier prix reste affiché avec son horodatage ; alerte « prix en retard » vers TMT après 120 min (`TRADE_PRICE_STALE_MIN`), au plus une par 24 h.
- Marché fermé, ou symbole sans prix reçu : le dernier prix connu est gardé (« Prix mis à jour » reste exact).
- Fraîcheur du prix chez Questrade lui-même : le champ lu est `currentPrice` des positions ; s'il est en temps réel ou différé selon l'abonnement de données de marché du compte reste à vérifier avec l'expert (non mesurable sans compte réel).

## Ce qu'« en temps réel » pourrait vouloir dire (aucune décision prise)
- Plus vite que 15 min = interroger Questrade plus souvent (limites de débit Questrade à vérifier, un risque de 429 donc de reculs plus longs) : simple réglage `TRADE_SYNC_INTERVAL_MIN`, mais l'écran n'y gagne rien tant que la synchro reste le goulot.
- Flux continu (streaming Questrade, portée supplémentaire) : nouveau mécanisme, à ne pas lancer sans réponse.

## Question à Émilien
Voir `questions-emilien-trade.md`, Q1 (reformulée) : « quel délai attend-il ? »
