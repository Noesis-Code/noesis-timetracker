# Précision par longueur de titre (20 oct. 2026)

Mesure simulée (aucun appel IA), 311 cas de `test/fixtures/task-precision/cases.json`, seuil 80, titre nettoyé (`taskprecision.cleanTitle`) puis mots séparés par espaces.

| Mots | Cas | Exactitude | Précision (placées) | Rappel | Incertain rendu | Écarts |
|---|---|---|---|---|---|---|
| 1 | 11 | 100 % | 100 % (3) | 100 % | 72,7 % | aucun |
| 2-3 | 39 | 100 % | 100 % (16) | 100 % | 56,4 % | aucun |
| 4-8 | 217 | 99,1 % | 99,4 % (170) | 99,4 % | 5,5 % | e28, ng07 |
| 9+ | 44 | 100 % | 100 % (44) | 100 % | 0 % | aucun |

Lecture : les titres courts (1-3 mots) ne sont presque jamais placés (73 % et 56 % d'incertain), ce qui est voulu : le jeu y attend « incertain » faute d'information ; aucun n'est mal placé. Le palier faible est 4-8 mots (2 écarts sur 217), simple effet de volume, déjà suivis (e28 ex æquo de vocabulaire, ng07 négation). Aucun palier ne justifie une règle : aucune règle changée.

Limite : jeu simulé (recouvrement de mots) ; la mesure réelle par palier se fera avec `--live`, par Émilien seulement.
