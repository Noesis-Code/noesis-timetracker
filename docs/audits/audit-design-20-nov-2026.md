# Audit design du 20 nov. 2026

Écarts trouvés (aucun corrigé par ce document ; les corrections sont dans les branches de design).

| Écart | Détail | Règle |
|---|---|---|
| Heures modifiables non violettes | Les heures qu'on peut modifier n'ont pas la couleur d'action | R11, R1 |
| 4 formats d'heures | Quatre façons d'écrire une durée selon l'écran | R5 |
| Composants recopiés | `objSemPlus`/`objSemDel` ; `.objStepBtn`/`.goalsYearSave`/`.tasksSaveBtn` (Enregistrer) ; 5 choix de responsable ; 4-5 `closeXxxModal` copiés | R29, R35 |
| Textes sous 13 px | Plusieurs libellés et marques | R7 |
| Zones de toucher sous 44 px | Petites marques et boutons | R7, R25 |
| Espacements hors grille | Valeurs autres que 8/12/16/24 px | R6 |
| `!important` | Présent dans plusieurs feuilles | Pas de `!important` |
| Libellés | Mots différents pour la même chose | R5 |
| Doublons heures et description/résumé | Même information à deux endroits | F2 |

## En suspens

- Fusionner les 5 choix de responsable en un composant.
- `TMT.popup.close` unique à la place des `closeXxxModal` copiés.
- Bulle auto-task : décision produit d'Émilien.
- `.goalTaskEditCard` redéfini 7 fois sur 3 fichiers : à fusionner en un pop-up unique.
- `.cmpClose` surchargé 4 fois : le remplacer par `.cmpClose--corner`.
- `TMT.libelles` : un registre de libellés pour R5.
