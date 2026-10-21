# Liens de notification : type -> écran -> test (20 oct. 2026)

Source : adresses `?notif=type&...` émises par `server/lib/*.js` ; branches de `openTabFromNotification` (`public/app.js`). Test : `test/notif-liens-test.js` (chaque type émis a une branche, les écrans visés existent, `activity` ne vise plus la Discussion). Un module désactivé (Réglages > Modules) ignore la notification sans erreur.

| Type | Émis par | Écran atteint | Repère |
|---|---|---|---|
| `activity` | `push.js` (message d'activité) | Feuille de route, Page 2 (Tâches) de l'activité | aucun (Discussion retirée le 15 oct.) |
| `post` | `push.js` | Profil de l'auteur, Publications (sinon flux Suivi) | publication surlignée |
| `invite` | `push.js` | Panneau Invitations du Profil | liste |
| `follow` | `push.js` | Panneau Demandes de suivi | demande surlignée |
| `announcement` | `push.js` | Annonce (rouverte) | – |
| `trade` | `push.js` | Page Trade Tracker | titre |
| `dailypriority` | `dailysuggestioncron.js` | Page 2 Tâches, groupe déplié | tâche surlignée |
| `drivesync` | `drivesync.js` | Page Ajouter, pop-up des tâches ajoutées | – |
| `taskassigned` | `taskassignnotif.js` | Page 2, période (ou Tâches) | semaine/tâche surlignée |
| `goalperiod` | `goalreminders.js` | Page 2, détail de la période | – |
| `subproject` | `duereminders.js` | Onglet Activité, activité ouverte, section Tâches | pas de sous-projet à surligner (UI retirée) |
| `community`, `profile` | anciennes notifications | Onglet Communauté / Profil | – |

## Constat `?notif=activity` (réglé)
Avant : l'utilisateur arrivait sur la Page 2 de l'activité sans rien surligner, après une attente de 8 s du bouton Discussion absent. Maintenant : même écran, sans attente. Aucun message n'est plus envoyé tant qu'aucun écran ne permet d'en écrire (la route POST reste active). Retirer la notification elle-même : case dans `questions-emilien.md`.

## Constat « Où » translucide (non corrigé : voulu)
La liste « Où » du pop-up de placement est un menu flottant en verre (`.goalsCaptureFloat`, `rgba(40,40,46,.28)` + flou 40 px). C'est une décision d'Émilien du 5 oct. (6f29fb7 « très peu opaque », « même opacité que le menu natif du Chrono »), et `DESIGN.md` §2.3 prévoit le verre (flou 40 px) pour les menus. Les cartes de pop-up, elles, sont opaques (`--bg`) : ce n'est pas un écart. Capture 390 px non refaite (aucune modification). Case à cocher pour opacifier (`--float-bg`, jeton existant).
