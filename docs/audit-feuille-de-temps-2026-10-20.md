# Audit de simplicité — Feuille de temps (20 oct. 2026)

Propositions seulement, rien retiré. Capture 390 px : `docs/img/audit-feuille-de-temps-2026-10-20.png` (compte de démo, semaine en cours ; la grille n'a pas de cellule colorée dans la zone visible 0h-4h).
Fonction unique de l'écran : **voir quand j'ai travaillé, jour par heure, sur une période**. (Elle est aussi la période qui pilote la Répartition juste dessous : décision d'Émilien du 1er sept.)

| Élément | Sert la fonction ? | Qui l'utilise / origine | Verdict |
|---|---|---|---|
| Grille jours × heures (`#tsGrid`, colonne des jours figée) | oui, c'est la fonction | demandé (1er-2 sept.) | garder |
| Flèches ‹ › + libellé de période | oui | nécessaire pour changer de période | garder |
| Menu ⋮ Semaine / Mois / Année | oui, mais derrière un menu | demandé (30 août : mois/semaine ; l'année a été ajoutée ensuite) | garder ; PROPOSITION : le libellé de période pourrait ouvrir ce menu (un contrôle de moins) |
| Titre « Feuille de temps » sur 2 lignes à 390 px | non (le titre occupe la moitié de la ligne, le libellé est coupé sur 2 lignes) | aucune demande | PROPOSITION : retirer le titre ou le raccourcir (« Semaine ») |
| Filtre « Tous ▾ » (Public/Confidentiel) au-dessus de la carte | fonction voisine : il filtre tout l'onglet, pas seulement la grille | ajouté le 6 oct. (« Statistiques : filtre Public / Confidentiel / Tous », haut à gauche) ; usage : inconnu, aucune donnée | PROPOSITION : garder seulement s'il sert Émilien ; sinon le retirer (les comptes sans activité confidentielle ne l'utilisent jamais) |
| Texte « Rien d'enregistré sur cette période » | oui, état vide | normal | garder |
| Vue Mois (calendrier) et vue Année | oui, même fonction à une autre échelle | demandées | garder |
| Bouton Aujourd'hui (dans Répartition, mais lié à la période) | il désynchronise la Répartition de la Feuille de temps : deux états pour un même graphique | demandé le 3 sept. | garder (demande d'Émilien), mais noter la complexité |

## Doublons à signaler
- La même Feuille de temps existe dans la fenêtre « statistiques d'un secteur » (`#csTimesheetBlock`, IDs `csTs*`) et la fenêtre Activité : trois copies du même bloc. Aucune n'est retirée sans décision.
- Heatmap : à 390 px seules ~5 heures sur 24 sont visibles sans défilement horizontal ; l'essentiel de l'information (heures de travail) est donc hors écran. Ce n'est pas un retrait mais un point de lisibilité : à décider avec le Design.
