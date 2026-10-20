# Contrastes sous 4,5:1 sur --hover-bg (#2a2d34) — 20 oct. 2026

Palette inchangée (rapport seulement). Ratios WCAG recalculés :

| Couleur | Valeur | Ratio | Écart |
|---|---|---|---|
| --violet-trail | #9583c1 | 4,13 | -0,37 |
| --violet-me | #9d84e0 | 4,47 | -0,03 |
| --bad | #e0626b | 4,02 | -0,48 |

Sur --bg/--card le ratio est suffisant ; seul le survol (--hover-bg) passe sous le seuil pour du texte normal. Pistes si Émilien le décide : éclaircir légèrement ces trois couleurs, ou ne pas les poser en texte sur un fond survolé.

Déjà en place (rien à faire) : `public/offline.html` (message clair, page autonome, servie par `sw.js`) ; anneau de focus clavier global `:focus-visible` en `var(--purple)` (`styles.css`), les `outline: none` restants ne concernent que des champs de saisie qui ont leur propre bordure violette au focus.
