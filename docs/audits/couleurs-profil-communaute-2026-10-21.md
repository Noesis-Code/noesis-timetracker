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

## Complexité : proposition à valider

Demande d'Émilien (02 h 33) : « et c'est trop complexe ». Rien n'est retiré dans le code poussé (R30 : retirer une fonction visible attend son Oui). Les captures du PLAN ont été obtenues en masquant les éléments dans le worktree (modification non commitée, annulée) : `docs/img/couleurs-profil-communaute-2026-10-21/plan-{390,360}-{community,profil,profil-public,profil-abonnes}.png`.
Fréquence d'usage : non mesurable (aucune télémétrie d'écran dans l'app) ; le classement ci-dessous est un jugement sur la fonction de l'écran.

### Ce que montre chaque écran (du plus au moins utile)

**Communauté** (fonction : voir ce que publient mes abonnements, trouver des membres)
1. Flux des publications (avatar, nom, date, texte)
2. Champ de recherche « Pseudo, projet, secteur »
3. Rangée d'avatars de découverte (ouvre un profil)
4. Bouton « Rechercher » (double la touche Entrée)
5. Filtres « Je cherche » (Partenaires, Clients, Financement ; visibles seulement si des membres en ont)

**Profil propre** (fonction : écrire aux membres, voir mes liens)
1. Zone « Écrire aux membres » + Envoyer (+ pièce jointe) et fil de mes messages
2. Bouton Abonnés / Abonnements (fenêtre à 3 onglets : Abonnés, Abonnements, Bloqués ; « Bloquer » par ligne)
3. Photo et nom ; croix de fermeture
4. Bande « Projets » et « + » Ajouter un projet
5. Bouton Invitations et demandes de suivi (avion en papier) : fenêtre presque toujours vide
6. Onglet « Bloqués » : usage rare

**Profil public d'un membre** (fonction : voir ce qu'il fait, le suivre)
1. Identité, Se désabonner
2. Projets partagés
3. Statistiques : carte Répartition (camembert, légende, menu de période ⋮)
4. Publications du membre
5. Carte Graphique (courbes par jour, menu de granularité ⋮)
6. Pages glissantes « Tâches réalisées » et « Objectifs » (trois points à glisser)

### Version simplifiée proposée : 6 retraits

| # | Retrait ou regroupement | Raison (une ligne) |
|---|---|---|
| 1 | Communauté : bouton « Rechercher » | La touche Entrée suffit (déjà proposé à l'audit du 20 oct.) ; le champ gagne la largeur. |
| 2 | Communauté : filtres « Je cherche » | Seconde façon de chercher, visible seulement par moments, usage inconnu. |
| 3 | Profil : bouton Invitations fusionné dans Abonnés (la demande de suivi apparaît en tête de la fenêtre Abonnés, point violet sur le bouton) | Deux boutons carrés pour une même idée (les gens) ; la fenêtre Invitations est presque toujours vide. |
| 4 | Profil : onglet « Bloqués » déplacé dans Réglages | Usage rare ; la fenêtre passe à deux onglets (Abonnés, Abonnements). |
| 5 | Profil public : carte « Graphique » (courbes) | Redit la Répartition au-dessus ; retire un menu ⋮ de plus. |
| 6 | Profil public : pages « Tâches réalisées » et « Objectifs » et leurs trois points | Un profil public = qui est cette personne et ce qu'elle publie ; le détail de ses tâches est du domaine privé et ajoute un geste caché (glisser). |

Gardés : flux, recherche + découverte, Écrire aux membres, Abonnés/Abonnements, projets, Répartition, Publications, Se désabonner et Bloquer (rouge, retrait de lien).
Mise en oeuvre si Oui : #1, #2, #5, #6 = retirer le bloc HTML et son code ; #3, #4 demandent de déplacer du code (Invitations dans la fenêtre Abonnés, Bloqués dans Réglages). Le plan capturé masque seulement les éléments.
