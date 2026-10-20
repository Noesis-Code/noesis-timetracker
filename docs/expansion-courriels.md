# Expansion — courriels d'abonnement (À VALIDER PAR ÉMILIEN)

Statut : **désactivé par défaut**. Un courriel aux clients est une communication légale/commerciale : réservé à Émilien. Le code est prêt, rien ne part tant qu'il n'a pas validé.

## Interrupteur
`EXPANSION_MAILS=1` requis (Railway > Variables). Absent ou autre valeur = aucun courriel (client ni alerte interne) ; le webhook Stripe est traité normalement. Test : `test/subscription-mails-refund-test.js`.

## Ce qui est envoyé (`server/lib/subscriptionmails.js`)
- Confirmation d'abonnement (`checkout.session.completed`) et fin d'abonnement (`customer.subscription.deleted`) à l'abonné : prénom, mention du renouvellement mensuel et de la résiliation dans Réglages. Aucun montant, identifiant Stripe, ni autre donnée.
- Alerte interne (`charge.refunded`, `charge.dispute.created`) à `confidentialite.noesis@gmail.com` : identifiants Stripe et statut seulement, aucune donnée personnelle.

## Vérifications (20 oct. 2026)
- **Déclenchement** : `notifyUser` / `alertTeam` ne sont appelés que depuis `server/routes/stripewebhook.js`, après `stripe.constructEvent` (signature HMAC obligatoire, sinon 400) et après le contrôle d'idempotence (un événement rejoué n'envoie rien). Aucune route, tâche planifiée ni script ne les appelle.
- **Staging** : interrupteur off par défaut ; de plus, sans `RESEND_API_KEY` rien ne part. Ne poser `EXPANSION_MAILS=1` sur staging qu'avec une clé Resend de test.
- **Données** : lecture de `name`, `email`, `lang` du seul abonné concerné ; adresse jamais journalisée (le journal indique seulement le type et le message d'erreur).
- **Langue** : `users.lang` (`fr` sinon anglais), textes FR/EN testés.
- **Panne** : un échec d'envoi ne fait jamais échouer le webhook (200 conservé).

## À faire avant d'activer (Émilien)
1. Valider les textes (`TEXTS` dans `subscriptionmails.js`) : légal/communication.
2. `RESEND_FROM` avec un domaine vérifié sur Resend : sans lui, `onboarding@resend.dev` n'écrit qu'au compte Resend, les abonnés ne recevraient rien.
3. Poser `EXPANSION_MAILS=1` en production seulement après (1) et (2).
