# Charte de simplification (19 oct. 2026)

Décision d'Émilien : **l'application doit rester simple. On simplifie, on ne complexifie pas.** Un chantier permanent (« Simplificateur ») applique cette charte en continu ; tout autre chantier la respecte avant de pousser.

## Principes (dans l'ordre de priorité)
1. **Retirer avant d'ajouter.** Aucune option, bouton, réglage, bascule, écran, pop-up ou couleur nouveau sans demande explicite d'Émilien dans le message du jour. Une tâche de son pôle qui ajoute de l'interface n'est faite que dans sa forme **minimale** (pas d'option annexe, pas de réglage « désactivé par défaut », pas de deuxième entrée vers la même fonction).
2. **Une fonction = une entrée = une technique d'interaction** (croix ✕ pour fermer, glisser-déposer pour réordonner, bouton d'envoi dans la zone d'écriture). Jamais deux chemins vers la même chose.
3. **Ne jamais élargir la demande** : ne changer que ce qui est demandé, ne rien « interpréter » en plus. En cas de doute sur une interprétation qui ajoute de l'interface, ne pas l'ajouter et le dire.
4. **Design** : DESIGN.md. Sombre seulement, **violet #674EA7 = couleur principale**, pop-up centrés avec ✕, aucune fenêtre montant du bas, composants existants réutilisés. Le Chrono et l'arbre périodique ne changent pas visuellement sans demande.
5. **Moins de texte, moins d'étapes, moins de réglages.** Un libellé court, une action directe, un état par défaut qui convient.
6. **Rien de destructeur** : retirer une fonction = retirer l'interface et le code, jamais les données (tables inertes notées dans BACKLOG.md « à supprimer par Émilien »).

## Test de simplicité (à passer avant tout push d'un chantier UI)
- Ai-je ajouté un bouton, une option, un écran, une couleur, une section de Réglages ? Émilien l'a-t-il demandé mot pour mot ?
- Existe-t-il déjà une entrée pour cette fonction ? Alors je n'en crée pas une deuxième.
- Puis-je obtenir le même résultat avec moins ? (retirer, fusionner, rendre automatique)
- Le diff touche-t-il autre chose que la demande ?
Un « oui » sur la première ligne sans demande explicite, ou sur la deuxième, bloque le push : retirer l'ajout.

## Chantier permanent « Simplificateur »
Boucle (une passe par lot de livraisons, ou à la demande) :
1. Lister les commits de `staging` depuis la dernière passe (`git log`) et relever tout ce qui ajoute de l'interface (boutons, options, sections, bascules, écrans, pop-up, couleurs).
2. Confronter chaque ajout à cette charte et au journal « Refusé par Émilien » ci-dessous.
3. Pour chaque ajout superflu : le retirer ou le fusionner avec l'existant (petit commit, capture avant/après, bump `sw.js`), sauf cas **réservé à Émilien** (règle produit verrouillée, légal, paiement, suppression de données) : le lister en une ligne pour décision.
4. Proposer (liste courte, sans exécuter) les simplifications plus profondes (écrans à fusionner, réglages à supprimer, textes à raccourcir) pour validation d'Émilien.
5. Mettre à jour le journal ci-dessous et rendre un compte rendu de 2 lignes (retiré / à décider).
Le Simplificateur ne crée jamais de fonction, ne change pas de règle produit, ne touche pas au Chrono ni à l'arbre périodique sans demande.

## Journal « Refusé par Émilien » (ne jamais réintroduire)
- Conversations de groupe/par projet, tâches éphémères, notes de projet, bulle flottante, bouton « Message » du profil, bouton « Communauté » de la fenêtre Activité, bloc « Projets communs » (19 oct.). Écrire à un membre = **uniquement** dans l'onglet Communauté.
- Horloge défilante / centièmes de seconde dans le Chrono, et sa section Réglages (19 oct.). Le Chrono affiche les secondes.
- Bouton « Stratégie » mal rangé dans la fenêtre Activité : remplacé par une icône simple en Page 2 de la Feuille de route, à gauche de la croix (19 oct.).
- Orange comme couleur d'interface hors messages de suppression (19 oct., en cours).
- Fenêtres qui montent du bas : remplacées par des pop-up centrés (19 oct., en cours).
