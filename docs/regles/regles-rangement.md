# Référence design unique (règles R1–R29 et F1–F5, obligatoires, décision d'Émilien du 20 oct. 2026)

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
- R10. Chaque changement visuel est livré avec une capture avant/après à 390 px et à 360 px, et la liste R1 à R9 et R11 à R29 vérifiée une par une (cochée, ou justifiée en une phrase).

- R11. Palette « Violet cendré », seule couleur de l'app, sombre uniquement : action #9C8CC8, texte #F3EEE8, gris sable #A59E96, lien #C4B9E6, texte sur bouton d'action #15111C, fond #0B0A0A, halo rgba(156,140,200,.28), bordures rgba(243,238,232,.12).
- R12. Trois couleurs sémantiques, rien d'autre : rouge #E0626B = danger de perte de données (supprimer une activité ou le compte) et croix de retrait d'un onglet (R18) ; vert #6FC9A0 / jaune #F0AD4E / rouge #E0626B = semaine atteinte / partielle / non atteinte. Aucun autre usage, aucune couleur nouvelle.
- R13. La croix ✕ de fermeture est toujours en haut à droite. Une seule technique par fonction : fermeture = ✕, réordonnancement = glisser-déposer, bouton d'envoi dans la zone d'écriture.
- R14. Verre : tout fond, carte, bouton ou barre reste en verre (translucide + flou + liseré clair, recette de DESIGN.md §2.3 et css/verre-calme.css) ; aucun fond plein nouveau.
- R15. Icônes : les icônes actuels de l'app sont conservés tels quels (modifier, réglages, avatar, les icônes de la barre d'onglets) ; on les réutilise partout, on n'en redessine ni n'en remplace aucun.
- R16. Couleurs d'activité : les activités (pôles) CONSERVENT leur propre couleur (couleur de donnée, ex. pastille, camembert) ; R11 (violet seul) s'applique à l'interface, pas aux couleurs d'activité ; les secteurs ne portent jamais de couleur.
- R17. Zones du verre liquide. VERRE LIQUIDE FORT (fond dégradé blanc .14 vers .06, liseré rgba(255,255,255,.16), backdrop-filter blur(24px) saturate(160%), recette DESIGN.md §2.3) UNIQUEMENT pour : (a) le bouton flottant qui ouvre la barre, (b) la bulle neutre (blanc chaud, sans violet ni halo) autour de l'icône de l'onglet actif dans la barre ouverte. VERRE CALME (blur 12px, fond .05, liseré .12 ; css/verre-calme.css) pour tout le reste : la barre elle-même, cartes, lignes de liste, champs de saisie. Pop-ups : voir R31 ; menus déroulants = fond sombre uni #16141A, liseré .14. JAMAIS de verre sur : le fond de l'app (noir pur #0B0A0A + halo violet), le texte, les boutons d'action violets (pleins).
- R17 bis (exception assumée par Émilien, 20 oct. 2026). Le « + » de la barre des volets prend le verre fort (même recette que l'icône sélectionnée) quand l'extension à ajouter est payée (Expansion) ; pointillé gris sinon. Un seul des deux à la fois, même place, 52×52.
- R18. Barre des volets (cible, « à venir », non implémentée) : masquée par défaut, ouverte par un bouton flottant en verre en bas à droite ; plus d'icône « Activité » (les activités vivent dans Réglages, R19) ; onglets par défaut : Chrono, Feuille de route, Communauté, + Trade Tracker ajoutable ; 4 onglets visibles au plus, le reste défile ; l'appui long réutilise EXACTEMENT la mécanique existante des activités/pôles/secteurs (500 ms, annulé au-delà de 10 px de déplacement, poignée ≡ glisser-déposer pour réordonner, ✕ ROUGE #E0626B pour retirer l'onglet, fenêtre de choix, jamais confirm()) ; le « + » (cercle en pointillé gris, signe + violet cendré #9C8CC8 comme tous les « + ») ajoute un onglet via un pop-up centré (pas une feuille du bas) avec ✕ en haut à droite ; à l'ouverture l'app arrive sur l'onglet le plus à gauche ; au moins un des trois volets Chrono, Feuille de route ou Trade Tracker doit rester dans la barre ; s'il ne reste qu'un volet au total, la barre ne montre que le « + » (perceptible) (décision d'Émilien, 21 oct. 2026, Q1).
- R19. Activités dans Réglages, comme SECTION À PART : carte « Activités » au-dessus de la carte « Paramètres », liste avec la couleur de chaque activité et ✎, et dessous un bouton « Ajouter une activité » calqué sur .cmpAdd (pleine largeur, bordure pointillée, « + » violet cendré #9C8CC8).
- R20. Statistiques : le Chrono est la page de gauche (ouverture) ; celles du temps vivent à sa droite (on glisse vers la gauche), puis Activités partagées (choix d'Émilien, 24 oct. 2026) ; celles de la Feuille de route sont à DROITE de sa page 1 (décision d'Émilien, 26 oct. 2026), accessibles en glissant vers la gauche : Tâches, puis Objectifs, puis Groupe (Tâches par membre, activités partagées) ; il n'y a pas d'onglet Stats.
- R21. Flèches de déroulement : la flèche (▾/▸) qui déroule ou enroule un dossier, une section ou une ligne est TOUJOURS à droite de la cellule, au même emplacement que l'icône ✎ modifier (même colonne, même alignement vertical) ; jamais à gauche.
- R22. Lignes de séparation : dans une carte ou une section, la ligne qui sépare deux lignes/menus déroulants touche le bord gauche ET le bord droit de la cellule (pleine largeur, d'un bord à l'autre) ; jamais des segments plus courts ni des traits avec marges.
- R23. Même contrôle, même style : tous les contrôles d'un même type (boutons « + », boutons « Ajouter », croix, flèches, pastilles) ont le même format et la même couleur partout. Le bouton d'ajout de référence est `.cmpAdd` de `public/css/composants.css` ; pointillé gris (`--cmp-dash`), signe « + » violet cendré #9C8CC8.
- R24. Un seul verre fort à la fois ; les éléments inactifs n'ont pas de fond.
- R25. Marques secondaires petites (croix de retrait : pastille ~13 px, ✕ ~7 px, rouge #E0626B, coin haut-droit) avec une zone de toucher invisible d'au moins 44 px.
- R26. Quand une fonction disparaît, l'élément qui la contrôlait disparaît aussi.
- R27. On réutilise une mécanique existante (ex. appui long 500 ms des activités) avant d'en inventer une.
- R28. Le rouge sert uniquement à retirer ou supprimer (Quitter, Exclure, Déconnexion restent violets, Q2 du 21 oct. 2026). Confirmations : une seule fenêtre maison `TMT.ui.confirm` (fond #16141A, ✕ en haut à droite, bouton principal violet, rouge seulement pour supprimer/retirer), jamais `confirm()` natif.
- R29. Un seul composant par contrôle : chaque type de contrôle récurrent (petite croix de retrait, bouton « + », flèche de déroulement, séparateur…) est défini UNE SEULE FOIS (jeton/classe CSS partagée, par ex. dans `css/composants.css`) ; on ne le recopie pas ; changer sa définition le change partout dans l'application (TimeTracker, Expansion, Trade Tracker).
- R30. Capture du plan avant toute modification visuelle (décision d'Émilien, 21 oct. 2026, citée dans `docs/regles/intentions.md`). Toute tâche qui change l'aspect de l'app (`public/`, `trade-tracker/public/`, CSS, textes visibles, composants) produit D'ABORD une capture 390 px (et 360 px) du résultat prévu, obtenue en appliquant la modification dans le worktree sans la pousser ; mode d'emploi dans `docs/fonctionnalites/chantiers-planifies.md`. Une modification visuelle NOUVELLE (non demandée par Émilien dans le chat) n'est pas poussée avant son Oui. Après exécution, la capture finale doit être conforme à la capture du plan : tout écart (couleur, taille, position, texte) est corrigé avant le push. Rien n'est ajouté au plan en cours de route.
- R31. Une seule opacité de verre pour toute l'app (décision d'Émilien, 24 oct. 2026) : la barre des volets, le fond des pop-ups et des fenêtres et la barre du haut des pop-ups prennent le même verre `.cmpGlass` (`css/composants.css`, jetons `--glass-*`) ; l'en-tête d'une pop-up n'a pas de fond propre. Cette règle remplace « Pop-ups et menus = fond sombre uni #16141A » de R17 pour les pop-ups ; les menus déroulants restent unis.
- R37. Icônes sans cadre (décision d'Émilien, 27 oct. 2026) : aucune icône (flèches ‹ › et ← →, chevrons ▾/▸, ⋮, trombone, crayon, réglages, croix de fermeture…) n'est entourée d'un carré, d'un cadre, d'un liseré ou d'un fond. L'icône s'affiche seule, avec une zone de toucher invisible d'au moins 44 px (R25). Seules exceptions : le verre fort de R17 (bouton flottant de la barre, bulle de l'onglet actif, « + » payé de R17 bis), les pastilles qui SONT le symbole (avatar rond, croix cerclée rouge de retrait) et les boutons d'action à libellé. Chaque écran est audité (règle « Nouvelle règle = application partout »).
- R38. Pas de titre de module (décision d'Émilien, 27 oct. 2026) : aucun volet n'affiche son propre nom en haut de page (pas de « Horaire », « Chrono », « Communauté »…). La barre des volets dit déjà où l'on est ; le contenu commence directement. Ne concerne pas les titres de fenêtres, de pop-up ni de sections.

## Nouvelle règle = application partout
Toute nouvelle règle écrite ici déclenche (par le coordinateur) un chantier ou, si les cinq chantiers permanents sont occupés, une tâche « à venir » dans le chantier « Simplification et design général » : auditer TOUTE l'application (`public/`, `trade-tracker/`, Expansion), lister les écarts, les corriger en réutilisant le composant unique de R29, puis cocher la checklist. Le relecteur refuse une branche qui recopie un composant au lieu de le réutiliser.

## Règles de structure
- F1. Quatre onglets maximum.
- F2. Une fonction vit à un seul endroit.
- F3. Un produit annexe (Trade Tracker) est une extension d'une activité, sans onglet.
- F4. Une fonction peu utilisée va sous « Avancé » ou est proposée à la suppression.
- F5. Une fusion déplace, ne retire aucune fonction.

## Barre d'onglets cible (à venir, NON implémentée)
Sans titres, mêmes icônes, plus petite ; statistiques de temps à droite du Chrono (on glisse vers la gauche), puis Activités partagées, statistiques de tâches/objectifs en glissant depuis la 1re page de Feuille de route ; onglet Stats supprimé.

## État actuel
Palette R11 migrée (20 oct. 2026) par jetons CSS dans `public/styles.css` (`--purple`, `--text`, `--on-action`, `--pop-bg`, `--halo`, `--glass-strong-*` pour le verre fort). Reste à faire : barre des volets R18 (agent B).

## Checklist à joindre au compte rendu
```
R1 [ ] R2 [ ] R3 [ ] R4 [ ] R5 [ ] R6 [ ] R7 [ ] R8 [ ] R9 [ ] R11 [ ] R12 [ ] R13 [ ] R14 [ ] R15 [ ] R16 [ ] R17 [ ] R18 [ ] R19 [ ] R20 [ ] R21 [ ] R22 [ ] R23 [ ] R24 [ ] R25 [ ] R26 [ ] R27 [ ] R28 [ ] R29 [ ] R30 [ ] F1-F5 [ ]  R10 : captures 390 px + 360 px jointes [ ]
(une règle non cochée = une phrase de justification)
```
