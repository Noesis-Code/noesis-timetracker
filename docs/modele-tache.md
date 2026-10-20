# Modèle d'une tâche auto-générée

Une tâche générée par la boucle (`boucle-veille.md`) doit être assez précise pour qu'un agent la comprenne sans poser de question. **Toute case vide = la tâche n'est pas lancée** : elle devient une question à cocher, regroupée dans le message de lot au chantier Principal (jamais une notification).

```
Titre : verbe + objet précis (« Retirer la case de suggestion sous le Chrono »)
Chantier / secteur : <un des 7>
1. Contexte observé : ce qu'on a vu (écran, capture, échec de test, mesure), avec date et source.
2. Problème : en une phrase, l'écart entre ce qu'on voit et ce qu'Émilien veut.
3. Résultat attendu, dans ses mots : citation de docs/intentions.md (date + chantier). Pas de citation = question à cocher.
4. C'est fini quand… : 1 à 3 critères vérifiables par un autre agent (« #x n'existe plus dans index.html », « test T passe », « capture 390 px sans la zone »).
5. Périmètre : fichiers et écrans autorisés (cartographie de CLAUDE.md). Fichier très partagé = le dire.
6. On ne touche pas : ce qui est voisin et reste intact (autres écrans, règles verrouillées, données).
7. Preuve attendue : capture (écran, 390 px) et/ou test (commande) à joindre au compte rendu.
```

## Contrôles avant lancement
- Les 7 champs sont remplis, aucun « à voir ».
- La tâche ne **ajoute** pas d'interface sans que l'intention le demande (test de `SIMPLIFICATION.md`). Les tâches de retrait sont prioritaires.
- Aucun cas réservé à Émilien (main, destruction, légal, paiement, règle verrouillée) : sinon, préparer seulement.
- Elle n'est pas dans le journal « Refusé par Émilien ».

## Question à cocher (forme)
`[ ] <question fermée oui/non ou à choix> — tâche bloquée : <titre> — champ manquant : <n°>`
