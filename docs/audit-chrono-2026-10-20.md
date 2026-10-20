# Audit de simplicité — Chrono (20 oct. 2026)

Capture 390 px : `docs/img/audit-chrono-2026-10-20.png` (après retrait ; compte de démo, aucun chrono en cours).
Fonction unique de l'écran : **lancer et arrêter le chrono sur une activité**.

## Retiré (non demandé par Émilien, 20 oct.)
- Case « Une amélioration à suggérer ? » + bouton Envoyer sous le chrono : `#chronoImproveBox` (index.html), `initChronoImprove` (app.js), 2 clés i18n. Aucun CSS, aucun test, aucun autre usage (grep). La route `/api/feedback` reste (utilisée par Réglages › Aide et suggestions).

## Éléments présents sur la capture
| Élément | Sert la fonction ? | Verdict |
|---|---|---|
| « Quelle activité ? » + boutons d'activités | oui, c'est la fonction | garder |
| Bouton « Historique » | corriger/supprimer une session : fonction voisine, pas lancer le chrono | PROPOSITION : le laisser (demandé le 31 août) ou le déplacer dans Stats ; décision d'Émilien |
| Pastille orange sur « Feuille de route » (barre du bas) | hors écran Chrono, indicateur de la coquille | PROPOSITION : vérifier qui la consulte ; orange = couleur d'interface proscrite hors suppression (SIMPLIFICATION.md, en cours) |
| Rond « E » (profil) et engrenage en haut | accès Profil / Réglages | garder (coquille) |

Non vérifié sur cette capture : l'état chrono en cours (boutons Pause/Stop, secondes) — à capturer à la prochaine passe.
Rien d'autre retiré : le Chrono ne change pas visuellement sans demande.
