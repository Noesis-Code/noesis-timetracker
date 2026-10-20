# Résiliation Expansion via le portail client Stripe (proposition, sans code)

But : permettre de résilier sans nouvel écran, sans bouton ni réglage ajouté (SIMPLIFICATION.md). Rien n'est implémenté.

## Principe
Un lien « Gérer mon abonnement » dans l'écran existant des abonnements (liste `/offer/subscriptions`, `public/js/objectifs-page1.js`), sur la ligne d'un abonnement actif. Il ouvre le portail client hébergé par Stripe, où la personne résilie, met à jour sa carte et voit ses factures.

## Côté code (à faire plus tard)
1. `server/lib/stripe.js` : `createPortalSession({ customerId, returnUrl })` -> `POST /v1/billing_portal/sessions` (même `stripeRequest` que Checkout).
2. `server/routes/offercheckout.js` : `POST /offer/portal` (`requireAuth`) : lit `activity_subscriptions` de l'utilisateur (le `stripeCustomerId` doit lui appartenir), crée la session, renvoie `{ url }`.
3. Écran des abonnements : le lien ouvre `url`. Aucun autre élément d'interface.
4. Le webhook fait déjà le reste : `customer.subscription.updated` (annulation en fin de période) puis `customer.subscription.deleted` (`status = 'canceled'`, `canceledAt`). Aucun changement de webhook.
5. Test : session de portail simulée (`fetch` remplacé), refus si le client n'appartient pas à l'utilisateur.

## À faire par Émilien dans Stripe (mode test d'abord)
1. Settings > Billing > Customer portal : activer le portail.
2. Cocher « Customers can cancel subscriptions » ; choisir « à la fin de la période de facturation » (recommandé : l'accès reste jusqu'à la fin du mois payé).
3. Décocher ce qui ajoute de la complexité (changement de forfait, pause) ; garder mise à jour du moyen de paiement et historique des factures.
4. Renseigner les liens Conditions d'utilisation et Politique de confidentialité, et l'URL de retour.
5. Dans Developers > Webhooks, vérifier que l'endpoint écoute `customer.subscription.updated` et `customer.subscription.deleted` (déjà requis pour le reste).
6. Tester en mode test sur staging (carte 4242...), résilier, vérifier le statut en base ; répéter en mode live avant la mise en production.

## Droit de rétractation
Les CGU (art. 6) prévoient déjà la résolution ; le portail ne la remplace pas, elle reste par courriel.
