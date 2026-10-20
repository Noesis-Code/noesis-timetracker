# Questions pour Émilien — Simplification (audits Stats, Communauté, Feuille de temps, Écrans, 20 oct. 2026)

Pour chaque ligne : cocher **retirer**, **garder** ou **déplacer**. Détails : `audit-stats-…`, `audit-feuille-de-temps-…`, `audit-communaute-…`, `benchmark-temps-…` (tous du 20 oct.).

## Feuille de temps
- [ ] Titre « Feuille de temps » (2 lignes à 390 px) : retirer / garder / raccourcir (« Semaine »)
- [ ] Libellé de période : en faire le bouton qui ouvre le menu Semaine/Mois/Année (supprime le ⋮) : retirer le ⋮ / garder
- [ ] Filtre « Tous ▾ » Public/Confidentiel (ajout du 6 oct.) : retirer / garder / déplacer dans le ⋮ de la Feuille de temps
- [ ] Trois copies du bloc Feuille de temps (Stats, fenêtre d'un secteur, Activité) : garder / retirer la copie du secteur

## Stats
- [ ] Libellé de période sous « Répartition » (doublon de la Feuille de temps) : retirer / garder
- [ ] Légende du Graphique (doublon de celle de la Répartition) : retirer / garder
- [ ] Graphique : courbes par activité en plus du Total : garder / ne garder que Total
- [ ] Pages 2 et 3 (Tâches / Objectifs) : fusionner en une page avec bascule / garder deux pages
- [ ] Bouton « Ajouter une information » (pages 2-3) : retirer / garder
- [ ] Une seule visualisation par écran Stats (Feuille de temps, Répartition, Graphique en pages) : garder le défilement actuel / déplacer en pages

## Communauté
- [ ] Bouton « Rechercher » : retirer (touche Entrée) / garder
- [ ] Filtres « je cherche… » de la découverte : retirer / garder
- [ ] Rangée d'avatars de découverte sous la recherche : retirer / garder / déplacer (visible seulement pendant la recherche)
- [ ] Commentaires périmés sur `liveFeed` dans `index.html`/`app.js` : retirer (sans effet visible) / garder

## Coquille (déjà signalée à l'audit Chrono)
- [ ] Pastille orange sur « Feuille de route » : passer en violet / retirer / garder

## Benchmark
- [ ] Le benchmark n'a pas pu consulter le web (accès refusé) : relancer depuis une session avec accès web pour vérifier les chiffres de Toggl, Clockify, Harvest ? oui / non

## Réglages, Profil, Objectifs, Activité (audit `audit-ecrans-…`, 20 oct.)
- [ ] Orange hors suppression (bouton « Déconnexion », bandeaux « Plafond atteint / Non réalisées », pastilles d'activité) : passer en violet / retirer / garder
- [ ] Carte Expansion (« À VENIR… Découvrir Expansion · J'ai un code ») au-dessus de la zone de capture : déplacer sous « Historique » / déplacer en Réglages / garder
- [ ] Page 2 Tâches : deux bandeaux d'alerte + carte « Avancement quotidien » avant les tâches : garder tout / un seul bandeau / retirer la carte « Avancement quotidien »
- [ ] Fenêtre Activité : bascule « Catégories / Statistiques » (doublon de l'onglet Stats) : retirer / garder
- [ ] Profil : zone « Écrire aux membres » (écrire, sondage, pièce jointe) : retirer (écrire = Communauté) / garder
- [ ] Réglages › Partage : « Partager l'app » + « Partager mon profil » + QR : un seul bouton sans QR / garder
- [ ] Réglages › Mon IA : bouton « Détails » de « Connecter mon IA » : retirer / garder
- [ ] Réglages › Sécurité : « Se déconnecter de tous les appareils » (en plus de « Déconnexion ») : retirer / garder


## Routes dormantes (4e passage code mort)
- [ ] `routes/offerforms.js` (`/activities/:id/forms`, `/profile-form`) : aucun appelant client, flux Offre 1 « formulaires » dormant ; l'Offre 1 lit pourtant ces données : retirer les routes / garder

## 6e passage : traduction EN du module « Ajouter des tâches > document »
`objectifs-document-taches.js` n'a aucune traduction EN (~60 phrases restent en français). Le corriger ajoute un mécanisme de traduction au module. Veux-tu qu'on le traduise (oui/non) ? Voir aussi les 4 clés EN en conflit (`Valider`, `Atteint`, `En cours`, `En retard`) dans `code-mort-2026-10-20.md`.
