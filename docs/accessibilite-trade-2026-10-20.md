# Accessibilité de Trade Tracker à 390 px (20 oct. 2026, repli 16)

Mesure : Playwright/Chromium, 390 x 844, écrans Accueil, Positions, Répartition, Historique, Expert, Synchro, Sécurité, Connecter mon courtier ; serveur Trade en mémoire, données de démo, port éphémère. Fenêtres (menu `⋮` ouvert, modales) non mesurées. Captures avant/après : `docs/img/trade-a11y-positions-*.png`, `trade-a11y-history-*.png`.

## 1. Zones tactiles < 44 px (avant)
| Élément | Taille avant | Écrans |
|---|---|---|
| Pastille de synchro `#syncPill` | 89 x 28 | tous |
| Réglages `#settingsLink`, retour TMT `#tmtLink` | 36 x 36 | tous |
| Puces `.chip` (comptes, tris, filtres, périodes, regroupements) | hauteur 32 | Accueil, Positions, Répartition, Historique, Expert |
| `⋮` options d'affichage `.kebabBtn` | 36 x 36 | Positions, Répartition |
| Choix du secteur `#sectorSel` | hauteur 38 | Positions |
| ✕ des pages plein écran `#closePage` | 32 x 32 (36 sur Courtier) | Sécurité, Courtier, Invitation, Réglages |
| Boutons « Connecter mon courtier », « Inviter », « Nouveaux codes de secours », « Changer d'appareil », « Fermer toutes mes sessions » | hauteur 42 | Synchro, Sécurité |
| Champ du jeton / du code (`.sendField input`) | hauteur 36 | Courtier, Sécurité, Invitation |
| Bouton d'envoi rond `.sendBtn` | 40 x 40 | Courtier, Sécurité, Invitation |

Faux positif écarté : l'étiquette « Jeton d'accès » (14 px) est le libellé du champ juste dessous, qui est la vraie cible.

## 2. Textes coupés / débordements
Aucun : pas de défilement horizontal de la page, aucun texte tronqué ni hors écran sur les 8 écrans. (Les rangées de puces défilent horizontalement par conception, « Symbole » est volontairement coupé pour signaler le défilement.)

## 3. Contrastes < 4,5:1 (3:1 pour grand texte)
Aucun sur les 8 écrans (couleur effective sur fond composé, tous les éléments texte visibles).

## Corrections (CSS minimal, `trade-tracker/public/styles.css`, aucune apparence, bouton, option ou couleur ajoutée)
- Zone tactile étendue de façon invisible (`::after`, `inset` négatif) pour `.topIconBtn` (36 -> 44, ✕ de page 32 -> 44, `.modalClose` 32 -> 44), `.syncPill` (28 -> 44), `.chip` (32 -> 44 ; le conteneur `.chipRow` reçoit un `padding` compensé par une `margin` négative : mise en page identique), `.sendBtn` (40 -> 44).
- Champ de saisie `.sendField input` : hauteur 36 -> 44 avec `margin: -2px 0` (la capsule garde sa hauteur).
- Changements visibles, de quelques pixels : `.selectCapsule` (secteur) 38 -> 44 de hauteur ; `.btnGhost/.btnDanger/.btnDangerOutline` 42 -> 44.
- Réserve : les zones étendues de deux rangées de puces voisines (écart 8 px) se chevauchent d'environ 6 px ; la rangée du bas, plus tard dans le DOM, reçoit le toucher dans la zone commune. Comportement du pouce inchangé pour tout toucher centré sur une puce.
- Après correction : 0 élément interactif réel < 44 px sur les 8 écrans (même mesure).

## Cycle 17 : vérification visuelle des corrections et fenêtres (20 oct. 2026)
Méthode : Playwright/Chromium, 390 x 844 et 360 x 640, 9 écrans + menu `⋮` + fiche de position (données de démo) et vraie session Trade (activation TOTP, fenêtres de Sécurité, Réglages, Invitation, Courtier). CSS d'avant (`24ce87d^`) injecté par interception réseau, comparaison pixel à pixel avec la version courante.
- **Décalages visibles trouvés** (comparaison avant/après) : (a) l'en-tête de carte `.cardHead .chipRow { margin: 0 }` annulait la marge négative : Rendement/Valeur et tout ce qui suit décalés de 5 px sur Historique, 14 px d'espace en plus ; corrigé (`margin: -5px 0`). (b) Secteur : 38 -> 44 visibles ; corrigé : capsule visible 38 px, bordure transparente 3 px (zone 44 px), trait en ombre interne, mise en page identique. (c) `.btnGhost/.btnDanger/.btnDangerOutline` : 42 visibles -> `::after` (inset -1 px), hauteur visible 42 px. Résultat : 0 pixel de différence sur 9 écrans x 2 tailles, sauf le chevron natif du secteur (11 x 7 px, décalé d'environ 3 px, non réglable par CSS).
- **Fenêtres mesurées** : menu `⋮`, fiche de position, « Fermer toutes les sessions », « Changer d'appareil ». Non atteignables sans actions réelles : « Confirme ton identité » (step-up, s'ouvre seulement après expiration de la vérification), « Retirer cette passkey », « Déconnecter le courtier » (mêmes classes `.modalCard`, `.btnRow`, `.btnGhost/.btnDanger`, `.sendField` que les fenêtres mesurées).
- **Trouvé et corrigé** : `.themeBtn` (Français/English, Réglages) 38 px -> zone 44 px par `::after` (apparence inchangée) ; texte blanc sur `.btnDanger` (`--brique` #C2694A) 3,88:1 -> fond `--brique-stop` (#C4483F, jeton existant) 4,83:1.
- **Non corrigé** : le titre « Fermer toutes les sessions ? » passe à la ligne à 360 px avec « ? » seul (rien de coupé). Les ✕ signalés « coupés » par la mesure sont un faux positif (glyphe plus large que la boîte, sans rognage visible).
- Texte coupé ou débordement horizontal : aucun dans les fenêtres. Contrastes : aucun autre < 4,5:1.
