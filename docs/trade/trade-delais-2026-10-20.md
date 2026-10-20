# Trade Tracker : « temps réel », délais mesurés (20 oct. 2026)

Chantier 1, repli 16. Rien n'est modifié dans le code. Mesure : vrai serveur Trade en mémoire, connecteur factice, ports éphémères (aucun réseau externe).

## Schéma : du changement chez le fournisseur à l'écran

| Étape | Qui | Délai | Ce que voit l'utilisateur |
|---|---|---|---|
| 0. Le prix change chez Questrade | fournisseur | — | rien |
| 1. Attente de la prochaine synchro | serveur Trade (`startSyncScheduler`, `TRADE_SYNC_INTERVAL_MIN`) | EN SÉANCE (lun-ven 9 h 30-16 h, heure de l'Est) : 0 à 15 min (moyenne 7,5 min). HORS SÉANCE : une synchro par heure (voir ci-dessous) | ancien prix ; « Dernière synchro : il y a X min » |
| 2. Synchro (appel Questrade, écriture en base) | serveur Trade | quelques secondes en réel (2 à 11 ms mesurés avec connecteur factice : le coût est le temps réseau Questrade) | rien encore |
| 3. Attente du prochain rafraîchissement de l'écran | navigateur (`app.js`, 30 s) | 0 à 30 s (moyenne 15 s) | ancien prix |
| 4. Lecture de l'API (requête conditionnelle ETag) | navigateur + serveur | < 10 ms mesurés | le nouveau prix s'affiche ; pastille « à l'instant » |

Mesure du traitement serveur (20 essais, synchro puis lecture de `/api/positions`, l'ETag change à chaque fois) : min 2,3 ms, médiane 4,3 ms, max 10,8 ms.

Délai total changement -> affichage EN SÉANCE (simulation de 200 000 changements à instant aléatoire, onglet visible) : moyen 7 min 45 s, médian 7 min 46 s, 95e centile 14 min 30 s, maximum 15 min 29 s. En pratique : « jusqu'à environ 15 minutes, 8 en moyenne ». Le rafraîchissement de 30 s n'ajoute que 0 à 30 s ; la synchro de 15 min domine tout.

## Comportement réel depuis le repli 24 : séance et hors séance (`server/lib/marche.js`, relu au repli 25)
- Séance = lundi-vendredi 9 h 30 (inclus) à 16 h (exclu), heure de Toronto/New York (TSX et NYSE ont la même séance), quel que soit le fuseau du serveur ou de la personne ; heure d'été suivie sans table.
- En séance : une synchro à chaque tick (`TRADE_SYNC_INTERVAL_MIN`, 15 min par défaut). Hors séance : au plus une par heure, SAUF si le tick suivant tomberait après l'ouverture : on synchronise alors juste avant, et le premier tick de la séance synchronise aussi (prix frais à l'ouverture, au plus un intervalle de retard après elle). Le planificateur tourne sur le SERVEUR, application ouverte ou non : ouvrir l'app pendant l'ouverture du marché ne change rien, la synchro n'attend pas l'heure suivante.
- Premier démarrage du processus : le premier tick (un intervalle après le démarrage) synchronise toujours, séance ou non. Entre-temps, et le week-end, l'écran affiche le DERNIER prix connu avec son âge (« Prix mis à jour : il y a X »), jamais vide ; une position jamais cotée est valorisée au coût et affiche « Jamais » (corrigé au repli 25 : l'écran affichait « il y a 20 000 j »).
- Jour férié boursier (marché fermé un jour de semaine) : NON géré, la journée compte comme séance. La synchro tourne donc au rythme séance : travail inutile (même prix), jamais une ouverture ratée. Consigne : correct, coût inutile ; tâche Trade n°21 (jours fériés) pour l'éviter.
- Actif coté 24/7 (crypto) : Trade n'en gère aucun (connecteur Questrade seul, ni crypto ni autre courtier). Le rythme est GLOBAL par tournée, pas par symbole : si un actif 24/7 était un jour branché, il faudrait le sortir du ralentissement (consigne dans `marche.js`). Actions cotées ailleurs qu'à TSX/NYSE/NASDAQ : suivent la même séance (approximation, le prix reçu est de toute façon le dernier connu).
- Une tournée n'en chevauche plus une autre (repli 25) : si la précédente n'est pas finie, le tick est sauté. Sans cela, un intervalle court doublait les appels.

## Coût réseau / API Questrade de chaque option (1 utilisateur, 3 comptes)
Une synchro = 1 appel comptes + 3 par compte (positions, soldes, activités) = 10 appels, +1 renouvellement de session Questrade environ toutes les 30 min. Simulation d'une semaine avec la vraie règle (`shouldSync`) :

| Intervalle en séance | Synchros / semaine (séance + hors séance) | Appels Questrade / semaine | Pointe en séance |
|---|---|---|---|
| 15 min (actuel) | 269 (130 + 139) | ~2 700 | 40 appels / heure |
| 5 min | 529 (390 + 139) | ~5 300 | 120 / heure |
| 1 min | 2 089 (1 950 + 139) | ~20 900 | 600 / heure |
| 30 s | 4 039 (3 900 + 139) | ~40 400 | 1 200 / heure |

Sans la réduction hors séance : 672 synchros / semaine à 15 min (le ralentissement économise ~60 %). Hors séance : toujours 139 synchros / semaine, quel que soit l'intervalle. Multiplier par le nombre d'utilisateurs (la tournée passe chaque utilisateur à tour de rôle ; 150 utilisateurs à 1 min = 1 500 appels / min soit 25 / s en pointe si Questrade répond vite). Limites publiées par Questrade (de mémoire, À VÉRIFIER dans leur documentation, non vérifiable ici faute d'accès web) : de l'ordre de 30 requêtes / s et 30 000 / heure pour les appels de compte. Le plafond par seconde se tient (la tournée est séquentielle), le plafond horaire se tient pour 1 min avec peu d'utilisateurs (600 / h par utilisateur : ~50 utilisateurs maximum) et JAMAIS pour 30 s sans flux continu. En cas de 429, recul 15 min, 30 min... (voir plus bas) : l'écran reste exact mais plus en retard qu'avant.

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
