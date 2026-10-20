# Référence design unique (règles R1–R22 et F1–F5, obligatoires, décision d'Émilien du 20 oct. 2026)

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
- R10. Chaque changement visuel est livré avec une capture avant/après à 390 px et à 360 px, et la liste R1 à R9 et R11 à R22 vérifiée une par une (cochée, ou justifiée en une phrase).

- R11. Palette « Violet cendré », seule couleur de l'app, sombre uniquement : action #9C8CC8, texte #F3EEE8, gris sable #A59E96, lien #C4B9E6, texte sur bouton d'action #15111C, fond #0B0A0A, halo rgba(156,140,200,.28), bordures rgba(243,238,232,.12).
- R12. Trois couleurs sémantiques, rien d'autre : rouge #E0626B = danger de perte de données (supprimer une activité ou le compte) et croix de retrait d'un onglet (R18) ; vert #6FC9A0 / jaune #F0AD4E / rouge #E0626B = semaine atteinte / partielle / non atteinte. Aucun autre usage, aucune couleur nouvelle.
- R13. La croix ✕ de fermeture est toujours en haut à droite. Une seule technique par fonction : fermeture = ✕, réordonnancement = glisser-déposer, bouton d'envoi dans la zone d'écriture.
- R14. Verre : tout fond, carte, bouton ou barre reste en verre (translucide + flou + liseré clair, recette de DESIGN.md §2.3 et css/verre-calme.css) ; aucun fond plein nouveau.
- R15. Icônes : les icônes actuels de l'app sont conservés tels quels (modifier, réglages, avatar, les icônes de la barre d'onglets) ; on les réutilise partout, on n'en redessine ni n'en remplace aucun.
- R16. Couleurs d'activité : les activités (pôles) CONSERVENT leur propre couleur (couleur de donnée, ex. pastille, camembert) ; R11 (violet seul) s'applique à l'interface, pas aux couleurs d'activité ; les secteurs ne portent jamais de couleur.
- R17. Zones du verre liquide. VERRE LIQUIDE FORT (fond dégradé blanc .14 vers .06, liseré rgba(255,255,255,.16), backdrop-filter blur(24px) saturate(160%), recette DESIGN.md §2.3) UNIQUEMENT pour : (a) le bouton flottant qui ouvre la barre, (b) la bulle neutre (blanc chaud, sans violet ni halo) autour de l'icône de l'onglet actif dans la barre ouverte. VERRE CALME (blur 12px, fond .05, liseré .12 ; css/verre-calme.css) pour tout le reste : la barre elle-même, les boutons carrés du haut (avatar/réglages), cartes, lignes de liste, champs de saisie. Pop-ups et menus = fond sombre uni #16141A, liseré .14. JAMAIS de verre sur : le fond de l'app (noir pur #0B0A0A + halo violet), le texte, les boutons d'action violets (pleins).
- R18. Barre des volets (cible, « à venir », non implémentée) : masquée par défaut, ouverte par un bouton flottant en verre en bas à droite ; plus d'icône « Activité » (les activités vivent dans Réglages, R19) ; onglets par défaut : Chrono, Feuille de route, Communauté, + Trade Tracker ajoutable ; 4 onglets visibles au plus, le reste défile ; l'appui long réutilise EXACTEMENT la mécanique existante des activités/pôles/secteurs (500 ms, annulé au-delà de 10 px de déplacement, poignée ≡ glisser-déposer pour réordonner, ✕ ROUGE #E0626B pour retirer l'onglet, fenêtre de choix, jamais confirm()) ; le « + » pointillé violet cendré (#9C8CC8, même couleur pour tous les « + ») ajoute un onglet via un pop-up centré (pas une feuille du bas) avec ✕ en haut à droite ; à l'ouverture l'app arrive sur l'onglet le plus à gauche ; Chrono ne peut pas être retiré.
- R19. Activités dans Réglages, comme SECTION À PART : carte « Activités » au-dessus de la carte « Paramètres », liste avec la couleur de chaque activité et ✎, et dessous un bouton « Ajouter une activité » calqué sur .saAdd (pleine largeur, bordure pointillée, « + » violet cendré #9C8CC8).
- R20. Statistiques : celles du temps vivent à gauche du Chrono, celles des tâches/objectifs à gauche de la page 1 de Feuille de route, accessibles en glissant de gauche à droite ; il n'y a pas d'onglet Stats.
- R21. Flèches de déroulement : la flèche (▾/▸) qui déroule ou enroule un dossier, une section ou une ligne est TOUJOURS à droite de la cellule, au même emplacement que l'icône ✎ modifier (même colonne, même alignement vertical) ; jamais à gauche.
- R22. Lignes de séparation : dans une carte ou une section, la ligne qui sépare deux lignes/menus déroulants touche le bord gauche ET le bord droit de la cellule (pleine largeur, d'un bord à l'autre) ; jamais des segments plus courts ni des traits avec marges.

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
R1 [ ] R2 [ ] R3 [ ] R4 [ ] R5 [ ] R6 [ ] R7 [ ] R8 [ ] R9 [ ] R11 [ ] R12 [ ] R13 [ ] R14 [ ] R15 [ ] R16 [ ] R17 [ ] R18 [ ] R19 [ ] R20 [ ] R21 [ ] R22 [ ] F1-F5 [ ]  R10 : captures 390 px + 360 px jointes [ ]
(une règle non cochée = une phrase de justification)
```
