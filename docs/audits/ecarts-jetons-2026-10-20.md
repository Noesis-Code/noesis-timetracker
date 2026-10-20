# Écarts aux jetons de DESIGN.md — mesure par script (20 oct. 2026, chantier 5)

Relevé : `python3 scripts/ecarts-jetons.py` sur `public/styles.css` + `public/css/*.css`, hors `:root` et commentaires. Compte les déclarations (une valeur = un compte). Jetons existants : rayons `--radius-sm/md/lg/xl/2xl` (8/10/14/20/24), `--transition-fast` (0.15s ease), ombres `--shadow-*`, verre `--glass-*`. Aucun jeton de taille de police ni d'espacement.

## Appliqué (même valeur, jeton existant, aucun changement visuel)
32 remplacements dans 9 fichiers CSS : `border-radius` 8/10/14/20 px littéraux (24) -> `--radius-sm/md/lg/xl` ; `transition: transform 0.15s/0.16s ease` (8) -> `--transition-fast`.
Contrôle au pixel : 15 captures 390 px (Chrono repos/actif, Stats, Objectifs, Communauté, Activité, Profil, Réglages x5, code Expansion), serveur relancé sur la même base avant/après : 0 pixel de différence (`scripts/visual-check.py` étendu à la main, scripts hors dépôt).

## Valeurs hors jeton, avec fréquence (après remplacement)
**Rayons** : `50%` 44 (points/avatars, légitime) · `999px` 37 (pastille ; proposition `--radius-pill`) · `0` 18 · `12px` 15 (boutons de verre ; proposition `--radius-btn`) · `3px` 8 · `2px` 5 · `18px` 5 · `22px` 6 (ni jeton ni mention ; 2 px de `--radius-xl`) · `6px` 4 · `16px` 2 · `4px` 2 · `36px` 1 · `17px` 1 · `15px` 1 · `5px` 1 · `1px` 1.
**Tailles de police** (sans jeton) : 12 px 70 · 14 px 67 · 13 px 66 · 15 px 27 · 16 px 23 · 11 px 23 · 18 px 12 · 17 px 7 · 12.5 px 7 · 20 px 6 · 10 px 5 · 22 px 5 · 9/13.5/11.5 px 3 chacun · rem divers 8 · autres isolés. Demi-pixels (12.5, 13.5, 11.5 : 13 usages) = candidats au retrait si Émilien veut une échelle 11/12/13/14/15/16/18/20/22.
**Espacements** (valeurs `px` de padding/margin/gap) : 8 px 251 · 10 px 190 · 6 px 139 · 4 px 111 · 12 px 93 · 16 px 87 · 14 px 76 · 2 px 67 · 18 px 17 · 5 px 16 · 20 px 16 · 3 px 14 · 7 px 13 · 24 px 10 · 1 px 10 · 26 px 9 · 9 px 7 · 22 px 6 · 11 px 4 ; reste ≤ 3 chacun. Hors échelle 2/4/6/8/10/12/14/16/20/24 : 5, 7, 9, 11, 18, 22, 26 = 72 usages.
**Transitions** : `.2s` 8 · `0.12s ease` 1 · `0.3s ease` 1 (aucune autre durée ; `--transition-fast` n'est pas le jeton des durées 0.2 s).
**Ombres** : ~25 ombres littérales différentes ; récurrentes : liseré interne `inset 0 1px 0 rgba(255,255,255,.24)` 14 · `inset 0 0 0 1px var(--glass-calm-line)` 14 · halo focus `0 0 0 3px rgba(var(--purple-rgb), .18)` 3. Aucune ne duplique exactement `--shadow-card/elevated`.

## Ce qui reste (cases pour décision, rien n'est fait)
- [ ] `.tabIcon` 15 px (styles.css, bloc `@media (max-width: 360px)`) -> `--radius-lg` (14 px) : non vérifié en capture (écran 360 px non couvert), laissé tel quel.
- [ ] `0.16s` -> `--transition-fast` (3 règles de glisser-déposer : 10 ms de moins, états `.dragging` non capturés) : appliqué, à confirmer à l'usage.
- [ ] Remplacements exacts appliqués dans des états non capturés (sélecteur de durée, calendrier externe, Document -> tâches, Stratégie, badges Stats avancées) : valeur identique par construction, à valider à l'oeil par Émilien si doute.
- [ ] `22px` (6) -> `--radius-xl` (20) : écart de 2 px, visible, non fait.
- [ ] Créer `--radius-pill: 999px` et `--radius-btn: 12px` : 52 usages sans jeton (nouveau jeton = décision d'Émilien).
- [ ] Échelle d'espacement/police en variables : gain faible, risque visuel élevé (voir `ecarts-design-2026-10-20.md`) : non recommandé.

## Cibles tactiles (>= 44 px) — Chrono et barre d'onglets (390 px)
Mesure sur Chrono (repos et chrono actif) : tout >= 44 px (cartes d'activité 58 px, STOP, Historique 44 px, onglets 54x91). Seules sous 44 px : `#whoami` et `#profileSettingsBtn` (36x36, barre du haut) ; la zone de clic invisible `::after` de 44 px existe déjà (styles.css, section « Accessibilité ») : vérifié par `elementFromPoint`, zone atteinte à +-21 px du centre. Rien à corriger.
Hors périmètre, constaté : `.menuBtn` (✕) mesure 32 px de dessin, zone de 44 px déjà ajoutée dans les en-têtes listés.
