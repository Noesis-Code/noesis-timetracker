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
