# DESIGN.md — Lexique de design TimeTracker

Extrait du code réel (`public/styles.css`, `public/css/*.css`, `public/theme-palette.js`, `public/index.html`). Rien d'inventé : en cas de doute, le CSS fait foi. À relire avant toute modification d'interface ; signaler tout écart.

## 1. Principes

- **Sombre uniquement : aucun mode clair, ne jamais ajouter de variante claire** (règle ferme d'Émilien, 19 oct. 2026).
- **Violet = couleur principale** (`--purple`), halos compris. Une autre teinte n'est jamais introduite sans demande explicite d'Émilien.
- **Seuls les pôles portent une couleur** (palette `theme-palette.js`) ; jamais les secteurs.
- **Direction « verre »** : fonds translucides + flou + liseré clair (`--glass-*`, `--vc-*`), halo violet flou en bas de l'écran. Fond de l'app = noir pur ; la barre du haut est noire.
- **Barres sans séparation visible** : `.tabbar` = même fond que la page, sans bordure ni ombre (icônes « flottantes »). Pas de trait de séparation nouveau.
- **Une seule technique d'interaction par fonction** : fermeture d'un plein écran = croix ✕ ; réordonnancement = glisser-déposer ; bouton d'envoi DANS la zone d'écriture ; une LISTE de tâches, jamais un horaire à créneaux.
- Les actions destructrices/« rouges » sont des boutons orange brique (voir 2.1), les pastilles/états restent rouges.

## 2. Jetons

### 2.1 Couleurs (thème sombre, le seul)

| Variable | Valeur |
|---|---|
| `--purple` / `--purple-dark` / `--purple-rgb` | `#674EA7` / `#4a3980` / `103, 78, 167` |
| `--green` (états actifs, interrupteur ON) | `#4CAF50` |
| `--red` (pastilles, états) | `#E74C3C` |
| `--blue` / `--grey` | `#3498db` / `#CCCCCC` |
| `--bg` (fond page/fenêtres) | `#000000` |
| `--card` | `#1f2229` |
| `--bg-raised` (sans consommateur actif) | `#121214` |
| `--text` / `--text-light` | `#eef0f2` / `#9a9ea6` |
| `--border` | `#33363d` |
| `--track-bg` / `--hover-bg` | `#2b2e35` / `#2a2d34` |
| `--sheet-line` (liseré haut des feuilles) | `rgba(255,255,255,.3)` |
| `--mine-violet` / `--mine-violet-text` | `#B7AED3` / `#1E1833` |

Accent « orange brique » des boutons d'action/suppression : `#C2694A` (bordure), `#E08A69` (texte), `#C4483F` (stop du chrono, `.chronoBtn-stop`), `#f59a3c` (pastilles non lues). Définis en dur (voir §5).

**Couleurs de pôle** (`theme-palette.js`, source unique, 9 teintes, jumelles par index) :
- `#A04B52 #A0674B #A0864B #83A04B #4BA075 #4B98A0 #4B75A0 #594BA0 #914BA0` (texte blanc dessus).
- Anciennes palettes `LEGACY_*` : restent valides, jamais réécrites.

**Halos** : `--halo-n1-rgb: 80, 96, 210` (indigo, fenêtres niveau 1) et `--halo-n2-rgb: 158, 72, 168` (prune, niveau 2), opacité `--halo-n*-a` 0.54. Halo d'accueil `#app::before` : `rgba(var(--purple-rgb), .32)`, flou 60px.

### 2.2 Rayons

`--radius-sm 8px` · `--radius-md 10px` · `--radius-lg 14px` (cartes, `.btn`) · `--radius-xl 20px` (feuilles du bas, arrondi haut seulement) · `--radius-2xl 24px` · `999px` (pastilles, champs capsule, interrupteurs, ~39 usages) · `12px` (boutons carrés de verre) · `50%` (points/avatars).

### 2.3 Ombres, verre, transitions

- `--shadow-card` : `0 2px 10px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.04)`.
- `--shadow-elevated` : `0 16px 40px rgba(0,0,0,.5)`. Aussi `--shadow-topbar`, `--shadow-tabbar`, `--shadow-badge`.
- **Verre** : `--glass-bg` (`linear-gradient` blanc `.14 → .06`), `--glass-border` (`rgba(255,255,255,.16)`), `--glass-shadow` (liseré interne haut + ombre portée), toujours avec `backdrop-filter: blur(24px) saturate(160%)` (variante feuilles/menus : `blur(40px) saturate(160%)`).
- **Verre calme** (`css/verre-calme.css`, chargé en dernier) : `--vc-bg` (`rgba(255,255,255,.05)`), `--vc-line` (`rgba(255,255,255,.12)`), `--vc-blur: blur(12px) saturate(1.1)`. Remplace le fond gris `--card` des cartes/lignes/champs listés dans ce fichier.
- Transition : `--transition-fast: 0.15s ease`. `prefers-reduced-motion` coupe tout.
- Focus clavier : `outline: 2px solid var(--purple); offset 2px`. Focus champ : halo `0 0 0 3px rgba(var(--purple-rgb), .18)`.

### 2.4 Espacements et typographie

- Pas d'échelle de variables : valeurs courantes 6 / 8 / 10 / 12 / 14 / 16 px ; padding de carte 12-14 px ; marge entre cartes 8-14 px ; contenu des feuilles `max-width: 480px`.
- Police : `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`, `line-height: 1.5`. Les champs héritent (`font-family: inherit`).
- Tailles (fréquence) : 12 px (77) méta/étiquettes · 14 px (70) corps des contrôles · 13 px (67) texte secondaire/`.hint`/`.msg` · 11 px (31) badges/méta fine · 15 px titres de section (`.sectionTitle`, bold) · 16 px boutons `.btn` · 18 px titres de fenêtre/marque (`.brand`) · 20-22 px titres forts. Gras = `bold`/700.

### 2.5 z-index clés

`#communitySearchBar` 9 · `.topbar` 10 · `.tabbar` et `#app::before` 50 · plein écran (`#activityPage`, `#profilePage`, Objectifs) 90 · `.communityMembersModal` 100 (ouverts par-dessus un plein écran) · `.goalTaskEditModal` / `#goalsDetailPage` 101-110 · `.goalsCaptureConfirmModal` 140 · `.durPickerOverlay` 400. Halos de fenêtre : `::before` à -1 (sous le contenu).

## 3. Composants (sélecteurs réels)

- **Bouton principal** : `.btn.btn-primary` (fond `--purple`, texte blanc, padding 15, 16 px bold, rayon `--radius-lg`, pleine largeur, `margin-top: 12px`) ; `.btn-small` = padding 10, 14 px, largeur auto ; désactivé opacité .5 ; `:active` scale .98 ; survol `brightness(1.08)`.
- **Bouton secondaire / icône** : `.iconBtn` (bordure `--border`, fond `--card`, rayon `--radius-sm`, padding 6×10, 12 px). Carré compact : `.menuBtn` (32×32, 18 px). Ligne d'historique : `.historyRowIconBtn`. Variante vitreuse (Stats, Activité, Réglages, Objectifs) : mêmes classes habillées en `--glass-bg` + `--glass-border` par sélecteurs d'écran ; barre du haut : `.topbarDefault .topIconBtn` (36×36, rayon 12, verre sombre en dur).
- **Bouton danger** : `.iconBtn.danger` (texte `#E08A69`, bordure `#C2694A`), `.activityDeleteX`, `.subProjectDeleteX` ; stop chrono `.chronoBtn-stop` (`#C4483F`).
- **Interrupteur** : `.toggleSwitch > input + .toggleSwitchTrack` (40×22, piste `--border`, ON `--green`, pastille 18 px `--card`) ; ligne type : `.notifRow` / `.notifRowLabel`.
- **Fenêtre plein écran** : `#activityPage`, `#profilePage`, `#profileSettingsPanel`, `#goalsActivitySwitcher`, `#goalsDetailPage` (fond `--bg`, z 90+, halo `::before`, en-tête `.subpageHeader`, fermeture ✕ via `.menuBtn`).
- **Pop-up / feuille du bas** : `.communityMembersModal` (voile `rgba(0,0,0,.5)`, aligné en bas) + `.communityMembersModalCard` (fond `--bg`, max 480 px, 80vh, `--radius-xl` en haut, `--shadow-elevated`, liseré `--sheet-line`). Équivalents : `.goalTaskEditModal/.goalTaskEditCard`, `.goalsDiscSheet`, `.durPickerOverlay`.
- **Cartes** : `.entryCard` (fond `--card`, `--radius-lg`, padding 14, `--shadow-card`), `.goalCard`, `.activityRow`, `.historyEntry` (même recette) ; verre calme par-dessus (voir 2.3).
- **Listes de tâches** : `.dailyPriorityItem` (ligne 13 px, bordure `--border`, `--radius-sm`), `.goalsCalendarTaskRow`, `.historyDayHeader/.historyDayList/.historyEntryCompact/.historyRowTop/.historyRowLabel/.historyRowMeta` (gabarit compact partagé Chrono/Objectifs).
- **Onglets** : `.tabbar` (fixe en bas, z 50, verre en `::before`, sans bordure) + `.tabBtn` (`.tabIcon`, `.tabLabel`, `.active` = violet ; survol violet).
- **Barre du haut** : `.topbar` (fixe, `#000000`, padding 14×18) ; `.topbarDefault`.
- **Champs** : `input[type=text|password|tel|email|date|time]`, `select`, `textarea` (fond `--card`, texte `--text`, focus violet + halo). Variante capsule des fenêtres Objectifs : `border-radius: 999px`, fond `--vc-bg`, `min-height: 38px`, padding 8×14. Dans une carte : `.entryCard input` (bordure `--border`, `--radius-sm`, padding 10).
- **Badges / pastilles** : `.liveBadge` (11 px bold, rouge, contour, 999px) ; `.dot` (14 px rond de couleur de pôle) ; point non lu `.goalsCaptureUnreadDot` (8 px, `#f59a3c`).
- **Messages / vide / chargement** : `.msg` (centré, 13 px, `--text-light`, min-height 18), `.hint` (13 px, `--text-light`), `.msgLink` (violet souligné) ; état vide = texte `--text-light` (pas de composant dédié) ; chargement : écran de chargement de la coquille (`#app`), pas de spinner générique.

## 4. À faire / à ne pas faire

À faire :
- Utiliser les variables (`var(--card)`, `var(--border)`, `--radius-*`, `--shadow-*`, `--glass-*`, `rgba(var(--purple-rgb), a)`) ; réutiliser les classes existantes (§3) avant d'en créer.
- Écrire la règle de base directement avec les valeurs sombres ; aucune variante claire.
- Nouvelle couleur de pôle : uniquement dans `theme-palette.js`.
- Respecter la cartographie (un propriétaire par fichier CSS partagé ; styles d'un écran dans son `css/*.css`).
- Vérifier en mobile étroit (360 px), puis capture (`scripts/visual-check.py`) avant livraison.

À ne pas faire :
- Aucune couleur en dur (`#xxxxxx`, `rgb()`), sauf accent orange brique déjà défini ; aucune nouvelle teinte principale autre que le violet.
- Pas de couleur sur un secteur ; pas de nouveau trait de séparation sur `.tabbar`/barres.
- Pas de nouveau style de bouton/modale « maison » : étendre l'existant. Pas de `!important` ni de sélecteur doublé (`.x.x`) pour gagner la cascade.
- Pas de ✕ remplacé par « Retour »/flèche pour fermer un plein écran, pas de bouton d'envoi hors de la zone d'écriture, pas de réordonnancement par flèches.
- Ne pas appliquer un style demandé pour UN état aux autres.

## 5. Incohérences constatées (non corrigées)

1. **Couleurs en dur** : ~96 hex dans `styles.css` et ~80 dans `css/*.css` (surtout `objectifs-document-taches.css` 25, `objectifs-page1.css` 16). Récurrents : `#c2694a`/`#e08a69` (accent orange brique, 21 usages, sans variable), `#f59a3c` (pastilles), `#121214` (nuance `--bg-raised` écrite en littéral), `#eef0f2` (= `--text` sombre), `#2b2e35` (= `--track-bg`), `#7c5cff` (violet différent de `--purple`, `accent-color` des cases à cocher et `strategie.css`, avec repli en dur).
2. **Violet incertain** : `#7c5cff` ≠ `#674EA7` ; `objectifs-page1.css` écrit `#4a3980`/`#674EA7`/`rgba(103,78,167,…)` en dur au lieu de `--purple*`.
3. **Boutons multiples** : `.btn.btn-primary`, `.iconBtn`, `.menuBtn`, `.historyRowIconBtn`, `.chronoBtn`, `.activityChoiceBtn`, boutons capsule des fenêtres Objectifs : recettes proches mais distinctes (rayons 8/12/14/999, tailles 12/14/16). Le style « verre » est réappliqué bouton par bouton via de longues listes d'ID (`styles.css` l. 890-935) au lieu d'une classe unique.
4. **Rouge vs orange** : `--red` (`#E74C3C`) reste défini mais les boutons danger sont passés à l'orange brique par surcharges doublées (`.iconBtn.danger.danger`, `.chronoBtn-stop.chronoBtn-stop`, l. 6035-6043) ; `.iconBtn.danger` d'origine (l. 1341) est donc contredit plus bas.
5. **Pop-ups dupliquées** : `.communityMembersModal` (z 100) et `.goalTaskEditModal` (z 110) ont la même recette (voile, carte `--bg`, max 480, 80vh) en deux copies ; `.durPickerOverlay` (voile `.35`, z 400) diffère du voile `.5`.
6. **Verre à deux systèmes** : `--glass-*` (blur 24 px) et `--vc-*` (blur 12 px, `verre-calme.css`) coexistent ; flous 24/30/40 px et `saturate(160%)` vs `1.8` / `1.4` mélangés. `verre-calme.css` est un « test » chargé en dernier qui surcharge les fonds `--card`.
7. **Variable morte** : `--bg-raised` n'a plus de consommateur mais son littéral `#121214` est réutilisé 5 fois.
8. **`.topbarDefault .topIconBtn`** recopie le verre sombre en dur (pas de jetons) ; `!important` omniprésents dans `objectifs-page1.css` (champs capsule).
9. **Pas d'échelle d'espacement** ni de composant d'état vide/chargement dédié : chaque écran fixe ses marges et son message vide.
10. **Blocs de commentaires historiques** très longs (en tête de `styles.css`) décrivant des états abandonnés (`--bg-raised`, `.tabbar`) : risque de contresens ; ce fichier prime.
