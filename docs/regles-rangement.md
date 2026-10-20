# Référence design unique (règles R1–R16 et F1–F5, obligatoires, décision d'Émilien du 20 oct. 2026)

Tout agent lit ce fichier avant de toucher à l'interface (`public/`). Le relecteur refuse toute branche qui les viole sans justification écrite.

## Modèles retenus et ce qu'on en copie
- Linear : peu d'éléments, une action claire, tout le reste discret.
- Apple (Rappels, Santé, Horloge) : listes simples, grands gestes, un mot par chose.
- Things 3 : espace généreux, regroupement par l'espace plutôt que par des traits.
- Bear : écran d'écriture dépouillé, rien qui distrait de la saisie.
- Oura : les chiffres sont grands, lisibles, sans décor autour.

## Les règles
- R1. Un écran = une action principale, en violet. Le reste est discret.
- R2. Montre au plus 7 éléments par écran ou fenêtre. Au-delà, regroupe ou cache derrière un affichage progressif (« Avancé », fermé par défaut).
- R3. Regroupe les champs liés et sépare les groupes par de l'espace, pas par des traits. Ordre = ordre d'usage, le plus fréquent en haut.
- R4. Mets les actions rares ou destructrices tout en bas, séparées, en ROUGE (#E0626B, voir R12). Jamais à côté de l'action principale.
- R5. Un mot court (1 à 3 mots) par chose, et le même mot partout dans l'app.
- R6. Espacement : uniquement 8, 12, 16 ou 24 px. Aligne sur une grille, marges égales, jamais de carte dans une carte.
- R7. Cibles tactiles de 44 px au moins, texte de 13 px au moins.
- R8. Une option qui a une valeur par défaut raisonnable n'est pas affichée (elle va dans « Avancé »).
- R9. N'ajoute aucun élément sans en retirer un équivalent. Ne retire aucune fonction sans l'accord d'Émilien.
- R10. Chaque changement visuel est livré avec une capture avant/après à 390 px et à 360 px, et la liste R1 à R9 et R11 à R16 vérifiée une par une (cochée, ou justifiée en une phrase).

- R11. Palette « Violet cendré », seule couleur de l'app, sombre uniquement : action #9C8CC8, texte #F3EEE8, gris sable #A59E96, lien #C4B9E6, texte sur bouton d'action #15111C, fond #0B0A0A, halo rgba(156,140,200,.28), bordures rgba(243,238,232,.12).
- R12. Trois couleurs sémantiques, rien d'autre : rouge #E0626B = danger de perte de données (supprimer une activité ou le compte) ; vert #6FC9A0 / jaune #F0AD4E / rouge #E0626B = semaine atteinte / partielle / non atteinte. Aucun autre usage, aucune couleur nouvelle.
- R13. La croix ✕ de fermeture est toujours en haut à droite. Une seule technique par fonction : fermeture = ✕, réordonnancement = glisser-déposer, bouton d'envoi dans la zone d'écriture.
- R14. Verre : tout fond, carte, bouton ou barre reste en verre (translucide + flou + liseré clair, recette de DESIGN.md §2.3 et css/verre-calme.css) ; aucun fond plein nouveau.
- R15. Icônes : les icônes actuels de l'app sont conservés tels quels (modifier, réglages, avatar, les icônes de la barre d'onglets) ; on les réutilise partout, on n'en redessine ni n'en remplace aucun.
- R16. Couleurs d'activité : les activités (pôles) CONSERVENT leur propre couleur (couleur de donnée, ex. pastille, camembert) ; R11 (violet seul) s'applique à l'interface, pas aux couleurs d'activité ; les secteurs ne portent jamais de couleur.

## Règles de structure
- F1. Quatre onglets maximum.
- F2. Une fonction vit à un seul endroit.
- F3. Un produit annexe (Trade Tracker) est une extension d'une activité, sans onglet.
- F4. Une fonction peu utilisée va sous « Avancé » ou est proposée à la suppression.
- F5. Une fusion déplace, ne retire aucune fonction.

## Barre d'onglets cible (à venir, NON implémentée)
Sans titres, mêmes icônes, plus petite ; statistiques de temps accessibles en glissant depuis le Chrono, statistiques de tâches/objectifs en glissant depuis la 1re page de Feuille de route ; onglet Stats supprimé.

## État actuel
Le code utilise encore l'ancienne palette (violet #674EA7 etc.). La migration vers R11 se fera sur demande d'Émilien, pas avant.

## Checklist à joindre au compte rendu
```
R1 [ ] R2 [ ] R3 [ ] R4 [ ] R5 [ ] R6 [ ] R7 [ ] R8 [ ] R9 [ ] R11 [ ] R12 [ ] R13 [ ] R14 [ ] R15 [ ] R16 [ ] F1-F5 [ ]  R10 : captures 390 px + 360 px jointes [ ]
(une règle non cochée = une phrase de justification)
```
