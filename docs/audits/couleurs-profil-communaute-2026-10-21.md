# Couleurs : Profil et Communauté (21 oct. 2026)

Demande d'Émilien (02 h 32) : « Il y a encore beaucoup trop de couleurs, notamment dans les profils et dans la page communauté. »
Périmètre : page Profil (propre profil, profil public d'un membre, fenêtres Abonnés et Invitations) et onglet Communauté. Rien d'autre.
Captures (compte de démo, 390 px et 360 px) : `docs/img/couleurs-profil-communaute-2026-10-21/{avant,apres}-{390,360}-{community,profil,profil-public,profil-abonnes}.png`. Contrôle « aucun autre écran ne change » : `{avant,apres}-{390,360}-{chrono,goals}.png` (Chrono identique au pixel près ; Feuille de route : seule l'animation de focus du champ de saisie diffère, la pastille « E » reste inchangée). L'onglet Statistiques n'est pas affiché dans le compte de démo (module masqué) : aucune règle `.bar*` n'est touchée.

## Règle appliquée
Violet cendré (`--purple`) = seule couleur d'interface ; neutres (`--text`, `--text-light`, `--card`, `--hover-bg`, `--border`) pour le reste ; rouge `#E0626B` seulement pour retirer. Aucune valeur codée en dur, aucune couleur nouvelle.

## Inventaire (avant) et décision

| # | Où | Couleur avant | Source | Décision |
|---|---|---|---|---|
| 1 | Avatars-initiales des membres : flux, rangée de découverte, résultats de recherche, listes Abonnés / Abonnements / Bloqués, Invitations | 5 à 12 teintes différentes (brique, sable, olive, vert, sarcelle…), une par membre (`users.color`) | style inline `buildSmallAvatar` | RETIRÉ : `--purple`, texte `--on-action` (CSS à portée, `:not(:has(img))` : les vraies photos restent) |
| 2 | Grand avatar de la page Profil (propre) | couleur du membre (brique) | inline `renderIdentityHeader` | RETIRÉ : `--purple` |
| 3 | Grand avatar du profil public | couleur du membre | inline `renderViewProfileIdentity` | RETIRÉ : `--purple` |
| 4 | Pastille de l'en-tête du haut (« E ») pendant l'onglet Communauté seulement | couleur du membre | inline | RETIRÉ dans Communauté seulement (Chrono et Feuille de route inchangés) |
| 5 | Pastilles `.dot` devant un nom (auteur de sondage, abonnés, abonnements, invitations, publications du profil) | couleur du membre | inline | RETIRÉ : `--purple` |
| 6 | Badges « Je cherche » (Partenaires bleu #3498db, Clients orange #F39C12, Financement vert #4CAF50) : liste des projets, profil public, filtres de découverte | 3 couleurs en dur | `SEEKING_TAGS` + styles inline | RETIRÉ : puce neutre (`--hover-bg`, `--border`), filtre actif en `--purple`. Les symboles 🤝 💼 💰 restent (ils portent le sens). |
| 7 | Pastilles live (`.memberLiveDot`, `.viewProfileLiveDot`) | déjà `--green`/`--live-green` = violet | jetons | rien à changer |
| 8 | Bouton actif « Statistiques », « Abonnés », « Rechercher », « Envoyer », cadre du champ | violet | jetons | gardé (couleur principale) |
| 9 | « Se désabonner », « Bloquer » (contour et texte rouge) | `#E0626B` | jeton danger | GARDÉ : retrait d'un lien, usage permis du rouge |
| 10 | Camembert, graphique, pastilles de légende du profil public (couleur de pôle) | couleur de chaque pôle | données | GARDÉ : couleur de donnée (R16), identique aux Statistiques qui gardent leurs couleurs de pôle |
| 11 | Pastille « non lu » (invitations) | violet clair `--unread` | jeton | gardé (violet) |

Aucune couleur verte/orange/bleue décorative ne subsiste dans ces deux écrans hors n° 10 (information : quel pôle est quoi).

## Couleurs retirées (liste)
Teintes individuelles des membres (avatars, grands avatars, pastilles de nom, pastille d'en-tête dans Communauté) ; bleu #3498db, orange #F39C12, vert #4CAF50 des badges « Je cherche ».

## Fichiers
`public/app.js` (3 couleurs en dur retirées de `SEEKING_TAGS`, 3 écritures inline retirées) ; `public/styles.css` (un bloc de fin de fichier à portée `#tab-community`, `#profilePage`, `#viewProfileModal`, `#profileFollowsPanel`, `#profileNotifPanel`).
Limite connue : l'écran de démo n'a pas de projet avec badges « Je cherche » ; leur rendu neutre n'est pas capturé.
