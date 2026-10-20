# Expansion — liste de contrôle pour l'activer en production (20 oct. 2026)

Tout est à faire par Émilien. Suivre aussi, dans les journaux Railway après l'ouverture, les lignes « reprise de livraison suspendue » (plafond de tentatives atteint : plan à relancer à la main ou attendre demain). Aucune valeur secrète dans ce fichier : les valeurs se posent dans Railway > Variables (service de production) ou dans Stripe/Resend. Staging reste en clés de test.

Vérifié en staging avec faux Stripe (aucun réseau, aucun paiement) : `test/expansion-bout-en-bout-test.js` (paiement, webhook signé, accès, courriel, portail, résiliation, fin de période), `test/expansion-cycle-complet-test.js` (cycle FR et EN : paiement refusé, rétabli, résiliation programmée, remboursement, fin, réabonnement ; accès réel et texte affiché à chaque étape), `test/expansion-checkout-securite-test.js` (chemins de retour hostiles, session jamais partagée entre comptes), `test/expansion-achat-staging-test.js` (ouverture de l'achat).

Règles en vigueur au 20 oct. (ce qui a changé) :
- Trois variables d'ouverture, toutes absentes par défaut en production : `OFFER_CHECKOUT_OPEN=1` (achat), `EXPANSION_MAILS=1` (courriels aux abonnés et alertes internes), `RESEND_FROM` (expéditeur). Sans `OFFER_CHECKOUT_OPEN`, `GET /offer/available` répond faux et `POST /offer/checkout` répond 403, même si les clés Stripe sont posées. L'achat exige aussi `STRIPE_SECRET_KEY` et `STRIPE_OFFER1_PRICE_ID`.
- Staging est ouvert d'office (`RAILWAY_ENVIRONMENT_NAME=staging`) mais une clé `sk_live`/`rk_live` y est traitée comme absente : aucun vrai paiement possible.
- Retour de Stripe : seul un chemin local est accepté (`//`, `\`, `@`, espace, caractère de contrôle, schéma, URL absolue refusés), toujours collé à l'origine de la requête. Un double clic (10 s) reçoit la même session, par compte ET par activité ET par déclaration d'âge.
- Remboursement ou litige : alerte à l'équipe seulement (si `EXPANSION_MAILS=1`), accès inchangé tant que l'abonnement n'est pas résilié (question Q3). Paiement refusé (`past_due`) : accès fermé, « paiement à régulariser » affiché ; rétabli par `invoice.paid`. Fin d'abonnement : accès retiré, courriel de fin, activité retirée de la liste.
- Livraison du plan (webhook puis reprise) : le webhook répond 200 avant la génération ; le plan part en arrière-plan. Un seul plan par activité est garanti par la base (index unique `(activityId, slot)`, posé au démarrage même sur une base neuve) et par une vérification sous transaction. Reprise horaire bornée : au plus `EXPANSION_PLAN_MAX_ATTEMPTS` essais par activité et par jour (défaut 3, compte en base, survit à un redémarrage) ; un budget IA atteint ne compte pas. Un processus tué en pleine génération laisse l'activation « en attente » (aucun plan partiel) et le balayage la reprend. Le balayage n'envoie aucun courriel : voir Q14 de `docs/questions-emilien-expansion.md`. Tests : `test/expansion-plan-course-test.js`, `test/migration-cancelatperiodend-test.js` (colonne `cancelAtPeriodEnd` ajoutée sur une base ancienne, 3 démarrages, aucune ligne perdue).
- Capturé en 390 px (FR/EN, 20 oct.) : ligne « résiliation programmée le <date> » (1 novembre 2026 à Paris, 31 octobre à Vancouver pour la même échéance) lisible sur deux lignes sans coupure ; champ texte de la fenêtre d'achat avec focus : anneau violet 6,8:1 sur le vrai fond noir de la fenêtre (seuil 3:1).
- Au retour de Stripe, l'app affiche encore un `alert` natif (question Q11).

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
- [ ] Domaine d'envoi vérifié sur Resend ; poser `RESEND_API_KEY` et `RESEND_FROM` (adresse du domaine vérifié). Sans `RESEND_FROM`, l'expéditeur par défaut est `onboarding@resend.dev`, qui n'envoie qu'à l'adresse du compte Resend : les abonnés ne reçoivent rien (l'échec est journalisé, le webhook réussit quand même).
- [ ] Poser `EXPANSION_MAILS=1` seulement après les deux points précédents et la validation des textes (Q1). Défaut : aucun courriel, ni client ni alerte interne.

## Ouverture
- [ ] Poser `OFFER_CHECKOUT_OPEN=1` en dernier, une fois les points précédents faits. Sans elle, l'achat reste refusé en production (403) et le bouton reste « À venir ».

## Test réel puis retour arrière
- [ ] Prix de test à 1 $ (ou coupon) : achat réel avec sa propre carte.
- [ ] Contrôler : abonnement actif, accès Expansion ouvert, courriel de confirmation reçu, portail accessible, bon événement reçu dans le webhook Stripe.
- [ ] Rembourser le paiement dans Stripe et résilier l'abonnement ; contrôler l'accès fermé en fin de période et le courriel de fin.
- [ ] Remettre le prix définitif dans `STRIPE_OFFER1_PRICE_ID`.

## Décision : abonnement impayé (à cocher, non implémenté)
Aujourd'hui : Stripe relance la carte seul (Smart Retries). Dès que l'abonnement passe `past_due` (événement `customer.subscription.updated`), l'accès Expansion se ferme et l'app affiche « paiement à régulariser » ; `invoice.payment_failed` est seulement journalisé. Le client ne reçoit aucun courriel de notre part (Stripe peut envoyer le sien si activé dans Billing). S'il paie, `invoice.paid` rouvre l'accès ; si Stripe abandonne, `subscription.deleted` ferme et envoie le courriel de fin.
Choisir une seule option :
- [ ] Rien (comportement actuel)
- [ ] Courriel d'échec de paiement envoyé par nous (texte à valider, une fois par échec)
- [ ] Accès gardé en pause N jours avant fermeture (N à fixer) au lieu de fermé tout de suite

## Variables au démarrage
Le serveur journalise `[config Expansion] …` (noms de variables seulement, jamais de valeur) si : clé `sk_live` sur staging, clé sans `STRIPE_WEBHOOK_SECRET` ou `STRIPE_OFFER1_PRICE_ID`, `OFFER_CHECKOUT_OPEN=1` sans Stripe complet, valeur autre que `1`, `EXPANSION_MAILS=1` sans `RESEND_API_KEY`/`RESEND_FROM`. Lire ces lignes dans les journaux Railway après chaque changement de variable.

## Webhook : réponse rapide, livraison en arrière-plan (20 oct. 2026)
Le webhook répond 200 dès l'abonnement enregistré ; la génération du plan Expansion (IA, jusqu'à ~180 s) part en arrière-plan, une seule fois par activité (rejeu = aucun doublon ni second courriel, revérification sous transaction). Si la génération échoue : l'équipe est alertée par courriel et le balayage horaire (`subscriptioncron.runPendingActivations`) réessaie jusqu'au succès. Test : `test/expansion-webhook-livraison-lente-test.js`. À contrôler après le premier achat réel : plan livré dans les minutes qui suivent, pas dans la réponse du webhook.

## En cas de problème
Retirer `OFFER_CHECKOUT_OPEN` (achat refusé de nouveau, abonnés existants non touchés) puis `EXPANSION_MAILS`.
