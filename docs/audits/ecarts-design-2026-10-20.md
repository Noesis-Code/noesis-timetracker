# Écarts DESIGN.md — valeurs en dur (20 oct. 2026) — PROPOSITION, rien n'est changé

Relevé sur `public/styles.css` et `public/css/*.css` (hors blocs `:root`). Chaque remplacement ci-dessous doit rendre exactement la même valeur : à valider en capture avant application.

## Couleurs hex
Aucune couleur hex en dur hors `:root` (conforme au §5 de DESIGN.md).

## Rayons : valeurs littérales qui existent déjà en variable
- `8px` = `--radius-sm` : styles.css:1428 (`.discussionMsgFiles img`), stats-avance.css:43 (`.saBadge`).
- `10px` = `--radius-md` : styles.css:3328 (`.durPickerBand`), connexion-ia.css:4 (`.aiConnectField`), strategie.css:10 (`.strategyInput`), objectifs-document-taches.css (2), objectifs-offre1-code.css:12 (`.accompCodeOk`) et :11.
- `14px` = `--radius-lg` : styles.css:3479 (`.extCalRuleBox`), objectifs-document-taches.css:27 et :37, objectifs-offre1-code.css:5 (`.accompBox`), objectifs-page3.css:389, stats-avance.css:65 et :72.
- `20px` = `--radius-xl` : styles.css:652, objectifs-page1.css:214 (`.offer1Promo`), :283 et :306 (`.goalsCaptureFloat`).
- `22px` (styles.css ×3, verre-calme.css ×2, objectifs-page2-taches.css) : ni variable ni mention dans DESIGN.md. Proposition : `--radius-xl` (20) ou nouvelle variable, selon intention.
- `12px` (16 usages), `999px` (37), `3px`/`2px` (13, stats-avance surtout) : pas de variable. Proposition : `--radius-pill: 999px` ; `12px` à décider (boutons de verre).

## Couleurs translucides qui dupliquent un jeton
- `rgba(255,255,255,.05)` = `--glass-calm-bg` : styles.css:433, 3479 ; stats-avance.css:73.
- `rgba(255,255,255,.12)` = `--glass-calm-line` et `.16` = `--glass-border`, `.10` = `--glass-calm-btn-line` : à vérifier ligne par ligne dans styles.css (3207, 2249, 434 à `.14` n'ont pas de jeton : proposition `--glass-line-soft: .14`).
- `rgba(255,255,255,0.14 → 0.06)` dégradé styles.css:3357 = `--glass-bg` (même dégradé recopié).
- `rgba(0,0,0,0.5)` = `--veil` : aucune occurrence en dur restante hors définitions.
- `rgba(24,24,30,0.35)` objectifs-page1.css:309 : proche de `--glass-calm-bg-strong` (`.74`) ; opacité différente, à décider.
- `rgba(139,92,246,…)` objectifs-page3.css:408 (`.goalRewriteHint`) : violet clair ≠ `--purple` (#674EA7). Écart de principe (violet principal) : proposition `rgba(var(--purple-rgb), …)`.
- Fallbacks `var(--border, rgba(127,127,127,.35))` / `rgba(255,255,255,.14)` (objectifs-offre1-code.css ×5, objectifs-page3.css:390) : `--border` est toujours défini, fallbacks inutiles.
- Récurrents sans jeton : blanc `.24` (15 usages), noir `.08` (6), blanc `.14` (6+4), noir `.25` (4), blanc `.18` (5). Proposition : jetons `--glass-hi` (.24) et `--shade-soft` (.08) seulement si Émilien veut poursuivre l'unification.

## Tailles
- Pas d'échelle typographique ni d'espacement en variables (DESIGN.md §2.4) : 12/13/14 px et 6/8/10/12/14 px répétés des centaines de fois. Proposition : ne rien faire (gain faible, risque visuel élevé).

## Autres écarts
- `!important` : verre-calme.css (33), objectifs-page3.css (20), objectifs-page2-taches.css (18), objectifs-page2-objectif.css (10), objectifs-page1.css (7) ; interdit par §4. Chantier à part (risque de cascade).
- Variable `--grey` : retirée du code (non lue) ; DESIGN.md §2.1 la liste encore (`--blue` / `--grey`) : mettre à jour le lexique.
