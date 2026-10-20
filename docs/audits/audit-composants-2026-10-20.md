# Audit des composants partagés (R23, R29) — 20 oct. 2026

Lecture seule, aucun code d'interface modifié. Périmètre : `public/` (TimeTracker + Expansion), `trade-tracker/public/`. Méthode : grep des gabarits HTML, des créations DOM en JS et des feuilles CSS. Les numéros de ligne sont ceux de `origin/staging` au commit c9deeeb ; l'agent navigation touche encore `app.js`, `index.html`, `styles.css`, donc les lignes bougeront.

Constat global : il n'existe aucun `css/composants.css`. Chaque contrôle est redéfini par écran (souvent par identifiant `#xxxClose`), et Trade Tracker possède sa propre copie du jeu de jetons (`tokens.css`) qui a dérivé.

## 1. Contrôle par contrôle

### 1.1 Croix de fermeture ✕ (R13, R25, R28)
- **Variantes de classe** : `.menuBtn` (22 gabarits HTML + 8 créations JS : `app.js:7733`, `14574`, `8547` ; `objectifs-page1.js:752, 934, 1117, 1187, 1393` ; `objectifs-page3.js:392, 1787` ; `stats-avance.js:160`), `.profileSquareBtn` (`#profilePageClose`), `.imageViewerClose` (propre fond/position), `.pollFormCancel`, `.goalRewriteClose` (28 px, position absolue, 16 px de police), `.durPickerClose` (44 px rond, 18 px, `app.js:7852`), `.docTasksX` (4 occurrences dans `objectifs-document-taches.js:61-75, 294`), `.goalsAlertClose` (44x38, 14 px), `.modalClose` + `.topIconBtn` + `.topClose` (Trade Tracker), `.topIconBtn#closePage` (4 écrans Trade, une classe différente de la croix TimeTracker).
- **Zone de toucher 44 px** : posée à la main par une liste de sélecteurs (`styles.css:3535`, `::after` sur 11 classes), plus des `::after` isolés (`objectifs-offre1-code.css:19-20`, `trade styles.css:181, 42`). Toute nouvelle croix oublie la liste.
- **Écarts** : une croix `.menuBtn` change de taille, de fond et de position selon le conteneur (règles `#activityPage .activityPageHeader .menuBtn`, `#tab-stats .sectionTitleRow .menuBtn`, `.docTasksWin ... .menuBtn`, `#profileSettingsPanel ... #settingsCloseBtn`, `#categoryStatsModal ... #categoryStatsClose`). R13 (toujours en haut à droite) n'est tenu que par habitude, pas par composant. Le bouton « retour » de la page Tâches porte le même glyphe ✕ mais l'id `goalsBackToCaptureBtn`, et la page 3 `goalsDetailBack` (noms trompeurs, comportement R13 correct).
- **Fermeture par Échap** : `a11y-popups.js` retrouve la croix par son glyphe (`closeButton`, `x === '✕'`) et par trois listes de sélecteurs écrites à la main (`SEL`, `ESC_ONLY`, `DISCARD`). Un pop-up non listé ne se ferme pas à Échap.

### 1.2 Croix ROUGE de retrait (R12, R25, R28)
Aucun composant. Au moins neuf implémentations indépendantes :
- `.discussionMsgDelete` (`app.js:6402, 8635, 10253, 13681, 14016, 14315`, six créations JS identiques copiées-collées) ;
- `.iconBtn.danger.attachmentRemove` (`app.js:927`, glyphe `×` et non `✕`) ; `.avatarRemoveBtn` (HTML, glyphe `×`) ;
- `.activityDeleteX` (30 px, contour rouge), `.subProjectDeleteX` (réutilisé pour la corbeille et pour le crayon ✎ des tâches : `goalsTaskEditBtn`), `.goalsReportDel` (44 px, gris `.5`, pas rouge) ;
- les ✕ de pastille `.docTasksChip button` (`objectifs-document-taches.js:112, 300`, `objectifs-page1.js:1475`, sans classe) ;
- `catComposerTargetClear` en `.menuBtn` ;
- règle de couleur répartie dans `styles.css:3071` (`.iconBtn.danger.danger, .activityDeleteX.activityDeleteX, .subProjectDeleteX.subProjectDeleteX`) avec doublement de sélecteur pour gagner en spécificité.
- **Écart R25** : la pastille ~13 px / ✕ ~7 px / coin haut-droit n'existe nulle part ; les tailles vont de 16 à 44 px.
- **Écart R12/R28** : `.goalsReportDel` n'est pas rouge ; les `×` de retrait de pièce jointe/photo sont rouges via `.danger` (OK), mais `.btnBrique.btnDanger` et `--danger-armed`, `--bad`, `--red` sont trois noms pour le même #E0626B (Trade a même `--danger-armed: #e5484d`, autre rouge).

### 1.3 « + » pointillé (R19, R23)
Référence : `.saAdd` (`stats-avance.css:65-66`), utilisée UNE fois (`stats-avance.js:745`). Autres :
- `.extCalAddBtn` (`styles.css:3488-3489`) : copie quasi exacte de `.saAdd` plus `width:100%; margin-bottom:10px`. Doublon pur.
- `.projectMoreDetailsBtn` (bordure pointillée `--border`, gris, pas de « + » violet) ; `.pollAddOptionBtn` (`iconBtn`, texte « + » non coloré) ; `app.js:12752` « + Ajouter des détails » (bouton texte).
- `.goalsYearAdd` (`objectifs-page2-objectif.css:290`) : 2 px pointillés, 12 px de police, « + » dans le texte, non violet.
- `.goalsGridAddOutline` (2 px pointillés, couleur d'accent variable) et `.goalMainEmptyBar`/`.goalMainEmptyAdd` (« + » violet, mais barre pleine non pointillée).
- `#goalsNoPoleAddBtn` « + Ajouter un pôle » en `.menuBtn` ; `.catAddSecteurBtn` (texte violet mélangé 50 % de blanc, sans bordure) ; `.goalsCalendarAddTaskBtn` (« + » dessiné par `::before/::after`, 10 px).
- « + » seuls en carré verre `.menuBtn` : `#addActivityBtn`, `#catAddPoleBtn`, `#profilePollsAddBtn`, `.topbarProjectsAddBtn`, `app.js:15462` (créé en JS).
- Ce sont trois formes (bouton large pointillé / carré verre / lien texte) avec cinq couleurs de « + » (violet, violet 50 % blanc, texte, gris, héritée). R19/R23 imposent une seule.

### 1.4 Flèches de déroulement (R21)
Glyphe et position incohérents :
- **À gauche (viole R21)** : `.goalsTasksGroupChevron` (`objectifs-page2-taches.js:1094-1097`, chevron AVANT le nom) ; texte `▸ ` préfixé dans les bascules : `app.js:7923` « ▸ Gérer mon temps », `7936`, `10692`, `10766` ; `objectifs-page3.js:78, 676, 1115`.
- **À droite (conforme)** : `.catChevron` (`app.js:7519`, `›` qui pivote de 90°), `.goalWeeklyExpandBtn` (`objectifs-page3.js:889`, `›`), `.settingsSectionChevron` (`▾`, pivote de 180°), `.categoryDropdownArrow`, `.categoryPickerChevron` (`▾`), `.goalsAlertChevron` (SVG pivote de 180°).
- Trois conventions d'état : `›` qui tourne 90°, `▾` qui tourne 180°, glyphe qui change (`▾`/`▸` via `textContent`). Trois polices/tailles (11, 13, `muted`). Alignement avec le ✎ (même colonne) : non garanti, chacun place la flèche différemment.

### 1.5 Bouton principal (R1, R11)
- TimeTracker : `.btnBrique` (15 usages ; `.btnBrique.btnBrique` doublé pour la spécificité), `.btn`/`.btn-primary` (12 + 8 gabarits), `.iconBtn` (39) utilisé comme bouton d'action, `#settingsSaveBtn`, `#settingsPinSaveBtn` (listés dans verre-calme).
- Trade : `.btnPrimary`, `.btnGhost`, `.btnDanger`, `.btnDangerOutline`, `.sendBtn`, `.linkBtn`. Aucun partage avec TimeTracker : mêmes intentions, noms et hauteurs différents (15 px vs 42 px de min-height).
- À trancher : `.btn-primary` vs `.btnBrique` (deux « boutons d'action » dans le même fichier).

### 1.6 Séparateurs (R22)
- 41 règles `border-top/bottom: 1px solid` éparpillées (`styles.css` ≥ 20, plus `css/`). Quatre couleurs de trait : `var(--border)`, `var(--glass-border)`, `var(--glass-calm-line)`, et `rgba(255,255,255,0.05)` (`objectifs-page3.css:206`).
- Deux tracés : `border-top` sur `+` (`.catSecteurRow`, `.docTasksTile + .docTasksTile`, `.goalsReportBlock + ...`) ou `border-bottom` sur chaque ligne (`.docTasksPopRow`, `.docTasksFileRow`), avec des `padding` latéraux (`8px 4px`, `8px 2px`) qui n'empêchent pas le trait pleine largeur mais le raccourcissent quand la ligne est dans une carte avec marges.
- Risque R22 : `.activityGoalsCategoryAutoTaskOffline` et `margin: 6px 10px` (trait avec marges) ; `.catList .activityEditBar`. Les lignes `#aiNoticeModal ... padding: 4px 0 10px` sont sûres. À vérifier visuellement ligne par ligne au moment de l'implémentation.

### 1.7 Verre (R14, R17, R24)
- Jeu de jetons `--glass-*` (fort) et `--glass-calm-*` (calme) : défini dans `styles.css` `:root` ET dans `trade-tracker/public/tokens.css` (copie). Les VALEURS diffèrent déjà : dans `styles.css`, `--glass-bg: rgba(243,238,232,.05)`, `--glass-blur: blur(12px) saturate(1.1)`, `--glass-blur-sheet: none` ; dans `tokens.css` de Trade, `--glass-bg` est le dégradé fort `.14 → .06`, `--glass-blur: blur(24px) saturate(160%)` et `--glass-blur-sheet: blur(40px)`. Le même nom de jeton signifie « calme » dans TimeTracker et « fort » dans Trade.
- 80 `backdrop-filter` répartis dans 11 fichiers ; valeurs de flou en dur : 10, 12, 14, 18, 24, 40, 60 px (`blur(60px)` x3, `blur(40px)`, `blur(18px)`, `blur(14px)`, `blur(10px)` en dehors des jetons).
- `css/verre-calme.css` (251 lignes) applique le verre à ~100 sélecteurs par liste, avec `!important`, au lieu qu'un composant « carte/ligne/champ verre » porte sa classe. Un nouvel élément oublie d'y être listé.
- Voile derrière pop-up : `--veil` (5 usages), `rgba(0,0,0,.55)` en dur (`docTasksPop`), `rgba(0,0,0,0.93)` (visionneuse).
- `--card`/`--bg-raised` différent entre apps (`#16141A` vs `#1f2229`/`#121214`) : les pop-ups de Trade n'ont pas le fond #16141A de R17.

### 1.8 Fermeture de pop-up (R13)
- Au moins 6 familles de coque : `.communityMembersModal` (+Card+Header, 21 usages), `.goalTaskEditModal`, `.docTasksPop`, `.strategyPop`, `.reportOverlay`, `.durPickerOverlay` (z 400, feuille), `.goalsDiscSheet`, `.imageViewer`, `.modalVeil/.modalCard` (Trade). Chacune définit padding, rayon (18, 22, `--radius-xl`), z-index (103, 104, 110, 400, 420), voile.
- 20 déclarations `z-index` ≥ 100 en dur, sans échelle nommée.
- Fermeture : croix partout (conforme), mais 31 `confirm()` natifs persistent (`app.js` 28, `objectifs-page1.js` 1, `objectifs-page2-taches.js` 2) alors que R18 et la mécanique des activités bannissent `confirm()` ; les fenêtres de confirmation maison (`saConfirm`, `categoryRemoveModal`) existent déjà.
- `.durPickerSheet` : feuille basse (`z-index:400`, `align-items:center` malgré le nom) ; R18 demande des pop-up centrés, pas des feuilles du bas. À confirmer.

### 1.9 Modifier ✎ (R15, R21)
- Icône SVG recopiée 4 fois à l'identique : `CHRONO_HISTORY_EDIT_ICON` (`app.js:3248`), `HISTORY_EDIT_ICON` (`objectifs-page1.js:174`), `GOALS_TASK_EDIT_ICON` (`objectifs-page2-taches.js:1160`, exposée via `TMT.goalsTaskEditIcon`), `GOAL_DESC_EDIT_ICON` (`objectifs-page3.js:360`). Le SVG est strictement le même (13 px, trait 2).
- Classe : `.historyRowIconBtn` (majorité), mais `.subProjectDeleteX.goalsTaskTrashBtn.goalsTaskEditBtn` pour les tâches (le crayon hérite d'un style de suppression), `.activityEditPen`, `.goalDescEditBtn`, `.goalWeeklyEditBtn`.
- `catSmallButton('✎', ...)` (`app.js:7368`) fabrique le bouton selon le glyphe passé en paramètre : bon réflexe, mais local à l'onglet catégories.
- Trade Tracker : aucun ✎ (pas d'édition inline) ; rien à aligner.

## 2. Écarts à R1–R29 qui découlent de ces doublons

| Règle | Écart constaté |
|---|---|
| R13 | Croix : position décidée par ~10 règles contextuelles, pas par un composant. |
| R21 | Chevron à gauche : `.goalsTasksGroupChevron` et 7 bascules texte « ▸ ». |
| R22 | 4 couleurs de trait, 41 règles de bordure ; marges latérales possibles (`autoTaskOffline`). |
| R23 | « + » : 3 formes, 5 couleurs ; une seule `.saAdd` utilisée ; `.extCalAddBtn` doublon. |
| R24/R17 | Verre fort/calme défini deux fois avec des valeurs contradictoires (TimeTracker vs Trade). |
| R25 | Croix de retrait : aucune pastille 13 px ; tailles 16 à 44 px ; glyphes `×` et `✕` mélangés. |
| R12/R28 | Trois rouges (`#E0626B`, `--danger-armed #e5484d` Trade, `--brique-text #E0626B` Trade vs `#C4B9E6` TimeTracker). `.iconBtn.danger` sert aussi à « Annuler ». |
| R15 | Icône ✎ : 4 copies (pas de changement visuel, mais violation de R29). |
| R6/R7 | 108 déclarations de `font-size` ≤ 12,5 px (R7 exige 13 px) dans `styles.css` et `css/` ; à traiter à part. |
| R29 | Aucun fichier `composants.css`. |

## 3. Architecture proposée

Un seul fichier `public/css/composants.css`, chargé juste après `styles.css` et AVANT les feuilles de segments (donc avant `verre-calme.css`), et `trade-tracker/public/composants.css` ne doit pas être une copie mais le MÊME fichier servi aux deux apps (voir 3.3).

### 3.1 Composants (une classe = une définition)
| Composant | Classe | Remplace |
|---|---|---|
| Croix de fermeture | `.cmpClose` (+ `::after` 44 px inclus) | `.menuBtn` en rôle ✕, `.docTasksX`, `.imageViewerClose`, `.durPickerClose`, `.goalsAlertClose`, `.pollFormCancel`, `.goalRewriteClose`, `.modalClose`, `.topIconBtn#closePage` |
| Croix de retrait rouge | `.cmpRemove` (pastille ~13 px, ✕ ~7 px, coin haut-droit, zone 44 px) | `.discussionMsgDelete`, `.avatarRemoveBtn`, `.attachmentRemove`, `.activityDeleteX`, ✕ des `.docTasksChip` |
| « + » pointillé | `.cmpAdd` (étend `.saAdd`, `b` violet `--purple`) | `.saAdd`, `.extCalAddBtn`, `.projectMoreDetailsBtn`, `.pollAddOptionBtn`, `.goalsYearAdd`, `#goalsNoPoleAddBtn`, `.catAddSecteurBtn` |
| « + » carré verre | `.cmpAddSquare` | `#addActivityBtn`, `#catAddPoleBtn`, `.pollComposerAddBtn`, `.topbarProjectsAddBtn` |
| Flèche de déroulement | `.cmpChev` : toujours dernier enfant de la cellule, `›` ou SVG unique, `.open` pivote 90° | `.catChevron`, `.goalsTasksGroupChevron`, `.goalWeeklyExpandBtn`, `.settingsSectionChevron`, `.categoryDropdownArrow`, `.categoryPickerChevron`, `.goalsAlertChevron`, préfixes texte « ▸ » |
| Modifier ✎ | `.cmpEdit` + fonction JS `TMT.ui.editIcon()` | les 4 constantes SVG, `.historyRowIconBtn`, `.goalDescEditBtn`, `.goalsTaskEditBtn` |
| Séparateur | `.cmpSep` (liste : `> .cmpSep + .cmpSep` ou `.cmpList > * + *`) pleine largeur, un seul trait `var(--sep)` | les 41 `border-top/bottom` |
| Verre calme / fort | `.cmpGlass` (carte, ligne, champ), `.cmpGlassStrong` (bouton flottant, bulle) | liste de `verre-calme.css` |
| Bouton d'action | `.cmpBtn` (violet plein), `.cmpBtnGhost`, `.cmpBtnDanger` (rouge, rare) | `.btnBrique`, `.btn-primary`, `.btnPrimary`, `.btnGhost`, `.btnDanger` |
| Pop-up | `.cmpPop` (voile, carte `#16141A`, en-tête avec `.cmpClose` en haut à droite) | 8 familles de coque |

### 3.2 Jetons (dans `composants.css`, `:root`)
`--cmp-close-size`, `--cmp-hit: 44px`, `--sep` (un seul trait), `--danger` (un seul rouge #E0626B, alias `--red`, `--bad`, `--danger-armed`, `--brique-text` supprimés ou redirigés), `--veil`, échelle `--z-pop`, `--z-sheet`, `--z-viewer`, `--z-picker`. Les valeurs de verre restent dans `:root` à UN endroit.

### 3.3 Partage avec Trade Tracker
Trade a son propre `index.html` et `styles.css`. Proposition : servir `composants.css` et le bloc de jetons depuis le serveur à deux URL (`/css/composants.css` et `/trade/composants.css` pointant le même fichier), au lieu de copier `tokens.css`. Cela supprime la dérive actuelle (`--card`, `--bg-raised`, `--glass-*`, `--danger-armed`, `--brique-text`) en une opération. Le tokens.css de Trade garde seulement les surcharges volontaires (aucune aujourd'hui, à confirmer avec Émilien : fond de carte `#1f2229` voulu ou non ?).

### 3.4 Composants JS
Un mini-module `public/js/composants.js` (fonctions de fabrique, sans framework) : `cmp.closeBtn(onClick)`, `cmp.removeBtn(onClick)`, `cmp.addBtn(label, onClick)`, `cmp.chev(open)`, `cmp.editBtn(label, onClick)`. Il remplace les créations répétées (`del.textContent = '✕'` x6, `closeBtn.textContent = '✕'` x8, 4 SVG). `a11y-popups.js` cherche la croix par `.cmpClose` au lieu du glyphe.

## 4. Plan de migration (code APRÈS la fin de l'agent navigation)

Ordre, un chantier par composant, un composant à la fois, vérifié par capture 390 px et 360 px, un push par étape :
1. `composants.css` + `composants.js` créés, aucun écran changé (aucun risque).
2. Croix ✕ de fermeture (le plus de gabarits, `index.html` et créations JS). Supprimer la liste `styles.css:3534-3535`.
3. Croix rouge de retrait (R25) : remplace les neuf variantes ; décide du `×`/`✕` unique.
4. « + » pointillé : `.saAdd` devient `.cmpAdd` ; migrer `extCalAddBtn`, `projectMoreDetailsBtn`, `goalsYearAdd`, `pollAddOptionBtn`.
5. Flèches (R21) : déplacer les 8 chevrons à gauche ou en texte vers la droite ; une seule convention de rotation.
6. Modifier ✎ : supprimer 3 des 4 constantes SVG.
7. Séparateurs : un jeton `--sep`, une règle de liste ; écrans les plus visibles d'abord (Réglages, catégories, Tâches).
8. Verre : remplacer la liste de `verre-calme.css` par `.cmpGlass` écran par écran ; réconcilier les jetons Trade.
9. Pop-up : une coque, une échelle de z-index ; remplacer les 31 `confirm()` par la fenêtre maison.
10. Garde automatique : un test (`test/garde-sources-test.js`) qui échoue si `✕` apparaît dans un `textContent`/gabarit hors de `composants.js`/`composants.css`, ou si un fichier de segment définit `border-top: 1px solid` sur une liste (R29 tenue par la CI, pas par la relecture).

Dépendances : aucun fichier de segment ne doit être touché pendant que l'agent navigation modifie `app.js`, `index.html`, `styles.css`. Étapes 1 puis 10 sont possibles tout de suite (fichiers nouveaux uniquement). Les étapes 2 à 9 touchent des fichiers très partagés : une à la fois, un agent à la fois.

## 5. Questions pour Émilien (non bloquantes)
- Le carré « + » en verre (barre du haut, pôles, sondages) reste-t-il, ou tout passe-t-il au « + » pointillé large ?
- Croix de retrait : `✕` pour toutes (y compris photo de profil et pièce jointe) ?
- Trade Tracker : même fond de carte que TimeTracker (`#16141A`) ?
- Les 31 `confirm()` natifs sont-ils tous à remplacer par la fenêtre maison ?
