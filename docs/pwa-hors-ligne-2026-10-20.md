# PWA hors ligne, clavier et zones sûres — 20 oct. 2026

Méthode : Playwright/Chromium (mobile, standalone simulé), serveur local seedé, `context.set_offline()`. Seul changement de code : la détection du clavier Android (voir plus bas).

## Hors ligne

| Scénario | Résultat | Preuve |
|---|---|---|
| Installation du service worker | OK : contrôleur actif, cache `noesis-vN` rempli (41 entrées) | `caches.keys()` |
| Rechargement de l'app sans réseau | OK : page et barre d'onglets (6 boutons) servies depuis le cache | titre « Noèsis — TimeTracker », 6 `.tabBtn` |
| Démarrer un chrono hors ligne | OK : chrono affiché, message « Hors ligne — le chrono sera synchronisé… » | `docs/img/pwa-chrono-hors-ligne-2026-10-20.png` |
| Retour du réseau (chrono démarré hors ligne) | OK : un seul chrono côté serveur, même heure de départ | `/api/timer/status` : running, 1 seul |
| Arrêter le chrono hors ligne | OK : écran repasse au repos, « Session enregistrée hors ligne… » | enregistrement local `stop` rempli |
| Retour du réseau (arrêt hors ligne) | OK : 1 session ajoutée (7 → 8), enregistrement local vidé, message « Arrêt hors ligne synchronisé » | `/api/history` avant/après |
| Ajouter une tâche (Feuille de route) hors ligne | Pas de file (limite assumée, voir `objectifs-page1.js` ; mise en file proposée dans `docs/questions-emilien-basic.md`) : message « Connexion impossible. Réessaie. », texte conservé, rien créé | `docs/img/pwa-capture-hors-ligne-2026-10-20.png` |
| Même tâche, réseau revenu, nouvel appui | OK : une seule tâche créée (aucun doublon) | `/api/activities/8/goals/categories` : 1 occurrence |
| File hors ligne (`NoesisAutoTaskQueue`) : envoi sans réseau | OK : reste en file (`remaining:1, stopped:true`) | retour de `flush()` |
| File : envoi au retour du réseau | OK : vidée, tâche classée (« Pôle test ») | `list()` = 0 |
| File : deux `flush()` simultanés | OK : une seule tâche (clé d'idempotence) | 1 occurrence côté serveur |
| Mise à jour du service worker (nouveau `sw.js`) | OK : nouveau cache créé, ancien supprimé, contrôleur actif | `caches.keys()` v491 → v9991 |
| File et chrono local pendant la mise à jour | OK : élément de file toujours présent après l'activation, enregistrement de chrono intact | `list()` = 1, clé `…:chrono` présente |
| Rechargement hors ligne avec le nouveau service worker | OK (6 boutons, chrono en cours affiché) si on attend la fin du rechargement automatique de mise à jour (~7 s dans le test) | 5 essais sur 5 |

Limite : l'envoi de la file par Background Sync (Chrome/Android) n'est pas testable en Chromium sans tête ; l'envoi par la page au retour du réseau l'est (OK).

## Clavier virtuel et zones sûres (390×844 et 375×667)

| Écran | Résultat | Preuve |
|---|---|---|
| Chrono | Rien de caché : contenu à 16 px au-dessus de la barre | mesure DOM + capture |
| Stats / Feuille de temps | Rien de caché : le bas du défilement s'arrête au-dessus de la barre (points de pagination collés à la barre, voulu) | `docs/img/pwa-stats-bas-2026-10-20.png` |
| Feuille de route (champ d'ajout) | Rien de caché hors clavier | captures `s_*` |
| Champ d'ajout focalisé, clavier simulé (`visualViewport.height` réduit, cas iOS) | OK : classe `kbOpen`, barre d'onglets masquée, champ (bas à 216 px) bien au-dessus du clavier (haut à 367 px en 375×667) | `docs/img/pwa-clavier-375x667-2026-10-20.png` |
| Champ focalisé, viewport redimensionné (cas Android, `interactive-widget=resizes-content`) | Corrigé le 20 oct. : avant, `clientHeight` rétrécissait avec le clavier, l'écart restait à 0, `kbOpen` n'était pas posé et la barre d'onglets recouvrait les puces d'activité. Maintenant l'écart est mesuré par rapport à la hauteur relevée au focus : barre masquée (`display:none`), `kbOpen` posé, barre revenue au blur | `docs/img/clavier-android-avant-390-2026-10-20.png`, `docs/img/clavier-android-apres-390-2026-10-20.png` (viewport 844 → 500 px) |

Non vérifiable ici : `env(safe-area-inset-*)` (toujours 0 dans Chromium) et le vrai clavier iOS. Le CSS lit déjà ces valeurs (`.tabbar`, `.topbar`, `viewport-fit=cover`). À valider sur iPhone à encoche : barre du bas et en-tête.
