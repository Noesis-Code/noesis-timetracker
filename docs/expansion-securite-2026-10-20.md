# Expansion — revue de sécurité du paiement (20 oct. 2026)

Clés Stripe de test seulement, aucun réseau. Tests : `test/expansion-securite-test.js` (nouveau), `test/stripe-webhook-idempotence-test.js`, `test/expansion-parcours-test.js`.

| Cas | Résultat | Test |
|---|---|---|
| Signature absente / mal formée / corps modifié | 400, rien enregistré | securite |
| Horodatage > 5 min (rejeu d'une capture) | 400 | securite |
| Signature d'un mauvais secret | 400 | idempotence |
| Même event.id rejoué | ignoré, un seul effet | idempotence, parcours |
| Échec transitoire puis relivraison | 500 puis retraité une fois | idempotence |
| Événement inconnu (ex. `invoice.payment_failed`) | 200, marqué traité, aucun effet | securite, idempotence |
| `subscription.updated` ou `invoice.paid` arrivé APRÈS `deleted` | **corrigé** : restait réouvert (statut réécrit en actif) ; `canceled` est maintenant final | securite |
| `checkout.session.completed` arrivé après la résiliation | **corrigé** : plus de livraison ni de courriel de confirmation | securite |
| `deleted` d'un abonnement jamais vu | 200, aucune ligne | securite |
| Accès : active | ouvert | securite |
| Accès : past_due, trialing, incomplete, incomplete_expired, unpaid, paused, canceled | fermé (seul `active` ouvre ; `/offer/subscriptions` liste aussi past_due/trialing/incomplete pour permettre de régulariser, sans donner l'accès) | securite |
| Résiliation programmée (`cancel_at_period_end`) | accès conservé jusqu'à `deleted` | parcours |
| Portail : un compte envoie l'id client d'un autre | ignoré, portail de son propre client | securite |
| Portail sans session / sans client Stripe | 401 / 404 | securite, parcours |
| `/offer/subscriptions` d'un autre compte | liste vide | securite |
| Achat sur l'activité d'un non-membre | 400 | securite |
| Cron : fin de période | activité due, régénérée une fois, cycle ré-ancré | securite |
| Cron : past_due / résilié | gelé, aucun appel IA | securite |
| Cron : second passage ou redémarrage | aucun doublon (l'état est en base) | securite |
| Cron : échec IA | cycle reste dû, retenté au passage suivant | securite |
| Cron : `startSubscriptionCron` rappelé | une seule planification | securite |

## Corrigé : `subscription.updated` hors ordre
Colonne `activity_subscriptions.lastEventAt` (INTEGER, `event.created` Stripe en secondes), ajoutée par migration additive idempotente (`server/db.js`, vérifiée sur base existante, deux démarrages). Un `customer.subscription.updated` plus ancien que le dernier appliqué est ignoré ; un événement sans horodatage est appliqué sans toucher au dernier ; un doublon reste filtré par `event.id`. Tests : `test/stripe-webhook-idempotence-test.js` (ordre inversé, doublon, sans horodatage). `invoice.paid` relit l'état réel chez Stripe et n'est pas concerné.

## Limites connues (non corrigées)
- **Pas de rappel avant renouvellement** : le cron n'envoie aucun courriel. Un rappel serait une communication client (légal, réservé à Émilien) ; Stripe peut envoyer les siens (réglage du tableau de bord).
