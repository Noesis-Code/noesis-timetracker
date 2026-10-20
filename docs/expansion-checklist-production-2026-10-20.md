# Expansion — liste de contrôle pour l'activer en production (20 oct. 2026)

Tout est à faire par Émilien. Aucune valeur secrète dans ce fichier : les valeurs se posent dans Railway > Variables (service de production) ou dans Stripe/Resend. Staging reste en clés de test.

Vérifié en staging avec faux Stripe : `test/expansion-bout-en-bout-test.js` (paiement, webhook signé, accès, courriel, portail, résiliation, fin de période).

## Avant
- [ ] Fusion `staging` vers `main` décidée et faite par Émilien (rien n'est ouvert tant que `OFFER_CHECKOUT_OPEN` n'est pas posée).
- [ ] Texte légal relu et validé : conditions d'utilisation et politique de confidentialité (mention de l'abonnement, du renouvellement mensuel, de la résiliation, du prestataire de paiement) ; textes des courriels (`TEXTS` dans `server/lib/subscriptionmails.js`).

## Stripe (mode live)
- [ ] Produit et prix mensuel Expansion créés en live ; poser `STRIPE_OFFER1_PRICE_ID` (identifiant du prix live).
- [ ] Poser `STRIPE_SECRET_KEY` (clé live) dans Railway production uniquement, jamais sur staging.
- [ ] Webhook live vers `<domaine de production>/stripe/webhook` avec les événements cochés : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`. (`invoice.payment_failed` n'est pas traité : le statut `past_due`, qui ferme l'accès, arrive par `customer.subscription.updated` ; s'il est coché, il est journalisé et reçoit 200.) Poser `STRIPE_WEBHOOK_SECRET` (secret de signature de CE webhook live).
- [ ] Portail client activé en mode live (Paramètres > Billing > Portail client) : résiliation en fin de période permise.
- [ ] Taxes : décider `STRIPE_TAX_ENABLED=1` (voir `docs/stripe-taxes.md`).

## Courriels (Resend)
- [ ] Domaine d'envoi vérifié sur Resend ; poser `RESEND_API_KEY` et `RESEND_FROM` (adresse du domaine vérifié, sinon les abonnés ne reçoivent rien).
- [ ] Poser `EXPANSION_MAILS=1` seulement après les deux points précédents et la validation des textes.

## Ouverture
- [ ] Poser `OFFER_CHECKOUT_OPEN=1` en dernier. Sans elle, l'achat reste refusé en production (403).

## Test réel puis retour arrière
- [ ] Prix de test à 1 $ (ou coupon) : achat réel avec sa propre carte.
- [ ] Contrôler : abonnement actif, accès Expansion ouvert, courriel de confirmation reçu, portail accessible, bon événement reçu dans le webhook Stripe.
- [ ] Rembourser le paiement dans Stripe et résilier l'abonnement ; contrôler l'accès fermé en fin de période et le courriel de fin.
- [ ] Remettre le prix définitif dans `STRIPE_OFFER1_PRICE_ID`.

## En cas de problème
Retirer `OFFER_CHECKOUT_OPEN` (achat refusé de nouveau, abonnés existants non touchés) puis `EXPANSION_MAILS`.
