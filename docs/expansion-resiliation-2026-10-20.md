# Résiliation Expansion : état et 2 options minimales (20 oct. 2026, repli 28)

Analyse de code, pas un conseil juridique. Rien n'est activé en production ; staging = clés de test. Le seul ajout dans `public/` est le bouton demandé par Émilien (section 6).

## 1. Côté serveur : vérifié par test (faux Stripe, aucun réseau)

`POST /offer/portal` (`server/routes/offercheckout.js`) :
- Propriété du compte : le client Stripe vient toujours de `users.stripeCustomerId` de la session ; un `customerId`/`userId` envoyé dans le corps est ignoré (test : D reçoit `cus_D` même s'il envoie `cus_C`). Sans session : 401. Sans client Stripe : 404.
- Retour local seulement : `return_url` = origine de la requête + `/`, jamais une valeur du client. Corrigé : un en-tête `Host` mal formé (espace, `@`, `/`) est refusé (400) sans appel Stripe.
- Erreurs claires FR/EN : portail non activé dans Stripe -> 503 « pas encore activée » ; autre échec -> 502 ; clé Stripe absente -> 503 ; aucun détail interne.
- Aucune fuite d'URL : seule `{ url }` de la session Stripe du client repart. Corrigé : une réponse Stripe sans URL https valide donne 502 (plus de `url` vide ou inattendue renvoyée).
- Tests : `test/expansion-securite-test.js` (isolation, hôte forgé, URL invalide), `test/expansion-parcours-test.js` (portail OK, non activé FR/EN, sans client), `test/expansion-repli-test.js` (reste ouvert à un abonné même variable retirée).
- Reste côté Émilien : activer le portail dans le tableau de bord Stripe (mode test d'abord), voir `expansion-resiliation.md`.

## 2. Éléments déjà visibles liés à l'abonnement (aucun bouton à créer)

Sur la page de capture des Objectifs (carte Expansion, `#offer1Section`, `public/js/objectifs-page1.js`) :
1. La ligne d'abonnement `<activité>` / `<activité> — résiliation programmée le <date>` (`#offer1SubscribedList`, `loadOffer1SubscribedSection` dans `public/app.js`), un `<p class="meta">` sans action.
2. Le sous-titre « 20 $/mois par activité · résiliable à tout moment » (`.offer1PromoSub`).
Aucun lien vers Réglages/Profil pour l'abonnement (la carte n'y est pas). Le courriel de confirmation promettait « depuis Réglages » : chemin inexistant (voir 4).

## 3. Deux options minimales (aucune exécutée)

Nombre de taps depuis l'accueil : onglet Objectifs (1, page de capture) puis action (2) = 2 taps, puis le portail Stripe hébergé (résiliation, ~2 taps de plus chez Stripe). À confirmer en capture avant toute implémentation.

**Option A (recommandée) : la ligne d'abonnement devient cliquable.**
- Avant : « Mon activité » (texte, rien ne se passe au toucher).
- Après : même ligne, même texte, soulignée comme un lien (style existant, couleur de texte inchangée) ; un toucher appelle `/offer/portal` et ouvre `url`. En cas d'erreur : le message serveur s'affiche dans la ligne. Résiliation programmée : « Mon activité — résiliation programmée le 14 nov. 2026 » reste cliquable (reprendre l'abonnement ou voir les factures).
- Coût : 1 écouteur sur une ligne existante, 0 élément, 0 couleur. Limite : la cliquabilité n'est pas devinable (soulignement seul).

**Option B : le sous-titre « résiliable à tout moment » devient le lien.**
- Avant : texte fixe.
- Après : pour un abonné seulement, « résiliable à tout moment » est souligné et ouvre le portail ; sans abonnement le texte reste inerte. Le portail Stripe étant par client et non par activité, B colle à la réalité (un seul portail), et le mot « résiliable » dit ce que le lien fait.
- Coût : 1 écouteur sur un texte existant, 0 élément, 0 couleur. Limite : visible seulement si la carte est dans l'écran ; ne sert pas la ligne « résiliation programmée ».

Maquette statique : `docs/maquettes/expansion-resiliation.html` (hors `public/`, ouvrir dans un navigateur).

## 4. Courriel de confirmation

Constat : il disait « vous pouvez le résilier à tout moment depuis Réglages », chemin qui n'existe pas. Corrigé sans nouvelle promesse : la phrase est retirée (FR/EN), il reste « Il se renouvelle chaque mois. » (`server/lib/subscriptionmails.js`). Le texte du rappel avant renouvellement (Q1, non envoyé) dit « ouvrez la gestion de l'abonnement dans l'application » : à valider/réécrire après la décision A/B. Que le client soit informé de la résiliation par courriel relève de la communication/légal : case pour Émilien.

## 5. CGU art. 4.2 (futur)

Constat : l'art. 4.2 dit toujours « non applicable au lancement… offre qui n'existe pas encore… prix envisagé 20 $ » (et l'art. 6 « non applicable tant que l'Expansion n'existe pas »). Vrai tant que l'achat est fermé, faux dès `OFFER_CHECKOUT_OPEN=1`. Texte légal non modifié : case pour Émilien (déjà Q2 pour le nom ; ajouter ici le temps verbal et l'avis de résiliation).

## 6. Décision d'Émilien (20 oct. 2026, 11:14) : implémenté

Bouton « Résilier mon abonnement » (EN : « Cancel my subscription »), dans la carte Expansion, dans la rangée d'actions existante (`.offer1PromoActions`), classe `offer1PromoBtn` existante (violet), masqué sans abonnement. Un toucher appelle `POST /api/offer/portal` puis ouvre le portail Stripe ; erreur = message serveur dans une alerte (technique existante). Les options A/B ci-dessus sont caduques. Test : `test/expansion-resilier-bouton-test.js`. Reste côté Émilien : activer le portail dans Stripe (mode test).
