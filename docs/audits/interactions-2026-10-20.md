# Interactions : une seule technique par fonction (20 oct. 2026)

Relevé de `public/` (app.js, js/*.js, index.html). Règles : fermeture d'un plein écran = croix ✕ ; réordonnancement = glisser-déposer ; bouton d'envoi DANS la zone d'écriture.

## 1. Fermetures (croix, Échap, clic hors fenêtre)
| Écran | Technique | Conforme ? |
|---|---|---|
| Pop-up `.communityMembersModal` (Activité, Profil, Abonnés, Projets, Notifications, légal, Page 3 Calendrier, Page 2 Tâches, Stats...) | ✕ + clic hors fenêtre + Échap (`a11y-popups.js`) | oui |
| Visionneuse d'image, Stratégie, tâches ajoutées (`.docTasksPop`) | ✕ + Échap | oui |
| Réglages (`#profileSettingsPanel`) | ✕ seule (décision 19 oct. : pas de clic hors fenêtre) ; Échap ajouté | oui (corrigé) |
| Trade Tracker, Ajouter des tâches (Expansion), « J'ai un code » | ✕ ; Échap ajouté | oui (corrigé) |
| Fenêtres créées à la volée (`.goalTaskEditModal` : confirmations de capture, placement, édition ; Signaler ; Discussion d'objectif) | ✕ + clic hors fenêtre ; Échap ajouté | oui (corrigé) |
| Roue de durée | ✕ + clic hors + Échap (propre) | oui |
| Retrait pôle/secteur, confirmation générique de suppression, Déplacer vers... | ✕ ; clic hors fenêtre ajouté | oui (corrigé) |
| Consentement marketing | choix « J'accepte / Non merci » (pas de ✕, voulu : légal) | oui (exception) |
| Avis IA | ✕ = « J'ai compris » | oui |
| Saisie nouveau pôle/secteur | Échap propre ; ne ferme plus la page derrière (`defaultPrevented`) | oui (corrigé) |

Aucune fermeture par « Retour » ou « ‹ » restante (retirés les 14 et 26 sept.). « Annuler » existe à côté de ✕ dans les confirmations (action explicite, pas une 2e technique de fermeture).

## 2. Confirmations de suppression
| Technique | Où | Conforme ? |
|---|---|---|
| Fenêtre propre (`TMT.confirmDelete`, pôle/secteur) | historique entrée (app.js 3374), 10714, Page 3 (718, 1073), Stats avancées (681), Connexion IA | oui |
| `confirm()` natif | pièce jointe, enregistrement d'historique, tâche (Activité, Page 1 sous-tâche, Page 2 x2), message (Discussion x4), sondage (clore / supprimer / vote définitif), projet, photo de profil, adresse calendrier (régénérer / désactiver), déconnexion (cet appareil / tous), suppression du compte (x2), exclure / quitter / fusionner une activité, bloquer un membre : 26 sites | NON, changement visible |

## 3. `alert()` natif
~40 sites `alert(err.message)` (échec réseau/serveur après une action) et 6 messages : signalement envoyé, exclure/quitter/fusionner (`res.message`), retour d'achat Expansion. Écart visible (fenêtre du navigateur, hors thème).

## 4. Réordonnancement
Glisser-déposer uniquement (aucun bouton monter/descendre trouvé). Pas de réordonnancement manuel des tâches du jour (règle). Conforme.

## 5. Bouton d'envoi
Dans la zone d'écriture (Discussion, Signaler, consigne d'Ajouter des tâches). Conforme.

## 6. Accessibilité des croix
- aria-label : toutes les ✕ créées en JS ou en HTML en ont un (test `test/interactions-test.js`).
- Zone tactile : `.menuBtn` 32 px, `.profileSquareBtn` 36, `.imageViewerClose` 40, `.pollFormCancel` 26, `.goalRewriteClose` 28 : zone portée à 44 px par pseudo-élément invisible (technique de `#statsVisBtn`), apparence inchangée. Restent sous 44 px : `.discussionMsgDelete` (22 px, ✕ de suppression en ligne de message, serré contre la date : agrandir la zone empiéterait sur le texte) et `.docTasksX` (petite croix de pop de liste).

## 7. Perte de saisie à l'expiration de session
Aucun mécanisme de brouillon n'existe (aucun `localStorage` de brouillon). `handleSessionLost()` recharge la page : le texte en cours est perdu. Sauvegarder les champs avant rechargement puis les restituer exigerait un nouveau mécanisme (clé par champ, restitution dans des écrans créés à la volée), non fait.

## Cases à cocher (changement visible, rien fait)
- [ ] Remplacer les 26 `confirm()` natifs par la fenêtre propre existante (`TMT.confirmDelete`, même gabarit que les autres suppressions) : changer / garder. Capture avant/après à produire à la validation.
- [ ] Remplacer les `alert()` natifs par le message intégré de l'écran (`xxxMsg`) : changer / garder.
- [ ] Session expirée : redemander le code PIN par-dessus la page SANS recharger (chemin déjà utilisé par l'anti-boucle) pour conserver la saisie : oui / non. Recommandé, aucun nouvel élément visible, mais à valider après un test de reprise (les écrans en cours doivent continuer sans rechargement).
- [ ] Zone 44 px des ✕ de suppression en ligne (`.discussionMsgDelete`) : agrandir (léger recul de la date) / garder.
