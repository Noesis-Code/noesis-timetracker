# Durée de la suite de tests — 20 oct. 2026

Mesure (machine partagée, 2 cœurs, charge ~10-13), `node test/run-tests.js`, 3 passes alternées avant/après :

| | Avant (staging) | Après |
|---|---|---|
| Passes | 411 s, 447 s, 557 s (moy. 472 s) | 240 s, 287 s, 243 s (moy. 257 s) |
| Gain | | -45 % |
| Assertions | 121 passées | 121 + 1 nouvelle (contrôle de la racine du dépôt) |

La liste des scripts exécutés est identique (mêmes libellés, mêmes comptes) : les scripts indépendants sont lancés d'avance dans `test/lib/parallel.js` (3 au plus, `TMT_TEST_JOBS` pour changer) et leurs résultats consommés dans l'ordre d'origine. `trade-tracker/test/run.js` utilise le même mécanisme.

## Garanties
- Ports : les 5 tests qui tiraient un port au hasard dans une plage (`asset-version`, `compression`, `healthz`, `fonctionnel-lib`, `broker-e2e`) demandent maintenant un port éphémère au système (`test/lib/freeport.js`). Les autres utilisaient déjà le port 0.
- Dossiers : chaque script crée ses dossiers par `mkTmp`, sous le `TMPDIR` privé de la suite (vérifié vide à la fin).
- `trade-tracker/test/sync-charge-test.js` reste en série (exécuté seul après tous les autres) : il affirme une durée (< 20 s) et échouait en parallèle sur machine chargée (21,1 s).
- Les 3 scripts de l'étape 9 (restauration en ligne de commande) et la partie en processus de `run-tests.js` restent séquentiels.

## Écriture hors dossiers temporaires
`test/run-tests.js` refuse de démarrer si `TMPDIR` est défini mais vide, si le dossier temporaire est la racine du système ou situé dans le dépôt, ou s'il n'est pas inscriptible. En fin de suite : aucun dossier temporaire résiduel (existant) et aucun nouveau fichier à la racine du dépôt. La racine du système n'est pas surveillée : sur une machine partagée, d'autres processus y écrivent (faux positif observé avec `/o3.txt`).
