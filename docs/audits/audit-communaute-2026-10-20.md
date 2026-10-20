# Audit de simplicité — Communauté (20 oct. 2026)

Propositions seulement, rien retiré. Capture 390 px : `docs/img/audit-communaute-2026-10-20.png` (compte de démo).
Fonction unique de l'écran : **voir ce que publient les gens que je suis, et trouver des membres**. (Écrire à un membre = uniquement ici ; journal « Refusé par Émilien » : pas de conversation de groupe, pas de bulle, pas de bouton Message du profil.)

| Élément | Sert la fonction ? | Qui l'utilise / origine | Verdict |
|---|---|---|---|
| Champ de recherche « Pseudo, projet, secteur » | oui (trouver des membres) | demandé (30 août : « juste la recherche en haut ») | garder |
| Bouton « Rechercher » (contour violet) | doublon d'une touche Entrée ; le champ suffirait | aucune demande explicite ; trouvé dans le code | PROPOSITION : le remplacer par la touche Entrée / recherche à la frappe, ou une loupe dans le champ |
| Filtres « je cherche… » (`#communitySeekingFilters`, étiquettes) | filtrent la découverte ; vides sur la capture, visibles seulement quand des membres en ont | ajoutés le 2 sept. (« découverte de membres ») ; usage : inconnu | PROPOSITION : retirer si Émilien ne s'en sert pas |
| Rangée d'avatars de découverte (L A S J L) | sert à trouver des membres, mais sans nom ni explication ; la phrase d'accompagnement a été retirée le 30 sept. | demandé le 2 sept. | PROPOSITION : la fusionner avec la recherche (suggestions seulement quand le champ est ouvert) ou la retirer |
| Flux « Suivi » : cartes (avatar, nom, date, texte) | oui, c'est la fonction | demandé | garder |
| Posts « Journée productive aujourd'hui — historique à jour. » (3 cartes sur 6) | texte de démo, généré par `server/lib/seed-staging.js` uniquement | données de test, pas l'app | rien à retirer |
| Recherche collante (position sticky, 4 poses en 2 jours en septembre) | confort, mais complexité de code importante | demandé 3 fois | garder (décision d'Émilien), noter le coût |
| Pastille orange sur « Feuille de route » (barre du bas) | hors écran | orange proscrit | voir audit Stats |
| Composeur « Publier » | **absent** de l'écran depuis le 29 sept. (commentaire index.html) : le texte d'état vide parle encore de « personne n'a encore écrit » | retiré | garder retiré ; PROPOSITION : vérifier que le texte de l'état vide reste cohérent |
| `liveFeed` « En ce moment » | route serveur déjà retirée le 1er sept. ; ne restent que des commentaires périmés dans `index.html` (l.1014) et `app.js` (l.10137) qui disent que la route « reste en place » | aucune utilisation | PROPOSITION : corriger/retirer ces commentaires (aucun effet visible) |
