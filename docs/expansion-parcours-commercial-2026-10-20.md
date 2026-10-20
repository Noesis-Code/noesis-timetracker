# Expansion : parcours commercial vu par le client (20 oct. 2026)

Analyse de code, pas un conseil juridique. Tout point légal est une case pour Émilien, qui consultera un professionnel. Staging = clés de test, rien n'est activé en production. Aucun bouton, option ni couleur ajouté.

## 1. Ce que voit et reçoit le client (avec preuve)

| Étape | Ce que fait le code | Preuve |
|---|---|---|
| Prix affiché dans l'app | « 20 $/mois, par activité, résiliable à tout moment. » (fenêtre d'achat) et « 20 $/mois par activité · résiliable à tout moment » (carte). Devise non écrite (« $ »), pas de mention de taxes, périodicité = mensuelle. EN : « $20/month ». | `public/index.html` (fenêtre `offer1CheckoutModal`), `public/js/objectifs-page1.js` (`offer1PromoSub`), `public/i18n.js` |
| Prix réellement facturé | Celui du Price Stripe (`STRIPE_OFFER1_PRICE_ID`), pas celui du texte : rien ne relie les deux. Seul garde-fou ajouté : une session non CAD est refusée. | `server/lib/stripe.js` (`createCheckoutSession`), `server/lib/offerprice.js` |
| Checkout Stripe | Mode `subscription`, un article, `customer` ou `customer_email`. Devise = celle du Price (CAD à créer dans Stripe). Taxes automatiques et collecte d'adresse de facturation : SEULEMENT si `STRIPE_TAX_ENABLED=1` (absent par défaut). Langue de la page Stripe : non fixée (`locale` absent, Stripe suit le navigateur). | `buildCheckoutParams` |
| Taxes | Par défaut aucune. CGU art. 6 : la Société n'est pas inscrite à la TPS/TVQ (petit fournisseur, seuil 30 000 $). | `public/index.html` art. 6, `docs/stripe-taxes.md` |
| Date de renouvellement | Jamais affichée pour un abonnement actif. Affichée seulement après résiliation programmée (« résiliation programmée le <date> »). Le rappel avant renouvellement existe en texte (Q1) mais n'est pas envoyé : aucun code ne l'émet. | `public/app.js` `loadOffer1SubscribedSection` ; recherche « renouvel » dans `server/lib/subscriptioncron.js` : rien |
| Résiliation | Le serveur sait créer une session du portail Stripe (`POST /offer/portal`), mais AUCUN écran ne l'appelle (aucune occurrence de `offer/portal` ni « portail » dans `public/`). Le client ne peut donc pas résilier depuis l'app : 0 chemin. Le courriel de confirmation dit pourtant « vous pouvez le résilier à tout moment depuis Réglages » et le rappel (Q1) dit « ouvrez la gestion de l'abonnement dans l'application ». | `server/routes/offercheckout.js`, `server/lib/subscriptionmails.js` (`confirmed`), `docs/expansion-resiliation.md` (« rien n'est implémenté ») |
| Reçu / facture | Aucun envoyé par l'app. Les reçus et factures viennent de Stripe, seulement si activés dans son tableau de bord (courriels de reçu pour les paiements réussis, historique dans le portail). Le courriel de confirmation de l'app n'indique ni montant, ni date, ni numéro. | `docs/expansion-courriels.md` (« aucun montant »), `server/lib/subscriptionmails.js` |
| Courriel de fin d'abonnement | Envoyé par l'app (FR/EN), si `EXPANSION_MAILS=1`, à `customer.subscription.deleted`. Contenu : abonnement terminé, données et Basic intacts, réabonnement possible. Ne dit pas la date de fin ni s'il y a un remboursement. | `handleSubscriptionDeleted`, `TEXTS.ended` |
| Remboursement | Aucune procédure visible. Ni les CGU (art. 6 et 7) ni les courriels ne disent comment en demander un ni à qui écrire. Le seul contact public est `compagnie.noesis@gmail.com` (section confidentialité) ; les pieds de courriel donnent `confidentialite.noesis@gmail.com`, pour la Loi 25 seulement. Côté équipe : un remboursement déclenche une alerte, l'accès reste (Q3). | `public/index.html` art. 6-7 et contact, `server/lib/subscriptionmails.js` (`FOOT`), `handleChargeIssue` |
| Échec de paiement | Stripe relance (Smart Retries). Dès `past_due`, accès fermé, ligne « paiement à régulariser » dans l'app. Aucun courriel de notre part (Q1, checklist « abonnement impayé »). `invoice.paid` rouvre l'accès. CGU art. 6 : « l'accès pourrait être suspendu jusqu'à régularisation ». | `handleSubscriptionUpdated`, checklist de production |
| Écran après paiement | `alert` natif « Abonnement à Expansion activé. Merci ! », lu une fois, URL nettoyée (Q11). Le message est affiché au retour de Stripe, avant l'arrivée du webhook : l'accès réel suit l'abonnement enregistré (quelques secondes). | `handleOffer1ReturnParams` |
| Textes légaux | CGU art. 4.2 : « non applicable… prix envisagé 20 $ », encore écrits au futur et sous le nom « Offre 1 / Expansion » (Q2). | `public/index.html` art. 4.2, 6, 7 |

## 2. Trous apparents : constat / pourquoi ça compte / option (cases pour Émilien)

Rien n'est implémenté. Le premier est le plus important : un client qui paie ne peut pas se désabonner seul.

- [ ] P1 Résiliation introuvable. Constat : le portail existe côté serveur, aucun écran n'y mène ; le courriel de confirmation promet « depuis Réglages ». Compte : un abonnement qu'on ne peut pas arrêter seul est le risque n°1 (plaintes, litiges, règles de consommation sur la résiliation facile). Option : (a) lier la ligne d'abonnement existante au portail (un lien dans une ligne déjà là, selon `docs/expansion-resiliation.md`, Q5) ; (b) en attendant, corriger le texte du courriel pour indiquer un courriel de contact. Décision : [ ] a / [ ] b / [ ] autre.
- [ ] P2 Taxes. Constat : taxes désactivées par défaut ; CGU : petit fournisseur non inscrit. Pourquoi : si le seuil de 30 000 $ est dépassé ou si le statut change, la facturation sans taxes devient une erreur. Option : [ ] garder tel quel tant que sous le seuil (à confirmer avec un comptable) / [ ] activer `STRIPE_TAX_ENABLED=1` après inscription.
- [ ] P3 Prix « taxes incluses ou non » non dit. Constat : « 20 $/mois » sans devise ni mention de taxes. Pourquoi : un client hors Québec ou hors Canada peut croire à un autre dollar ; clair seulement si on précise « CAD ». Option : [ ] ajouter « CAD » au libellé (3 textes + EN, un seul mot) / [ ] garder.
- [ ] P4 Avis de renouvellement absent. Constat : aucune date de renouvellement affichée ni courriel avant débit. Pourquoi : certaines règles encadrent les renouvellements automatiques (avis préalable) ; à vérifier par un professionnel. Option : [ ] envoyer le rappel (texte Q1, nouveau mécanisme, `EXPANSION_MAILS=1`) / [ ] afficher la date de renouvellement dans la ligne d'abonnement existante / [ ] rien.
- [ ] P5 Contact de remboursement absent. Constat : ni CGU ni courriels n'indiquent à qui écrire ; deux adresses différentes existent. Pourquoi : sans point de contact, le client passe par sa banque (litige, frais). Option : [ ] ajouter une phrase et une adresse dans CGU art. 6-7 et dans le pied des courriels / [ ] garder.
- [ ] P6 Reçu. Constat : l'app n'envoie aucun reçu ; Stripe n'en envoie que si le réglage est activé. Pourquoi : un client facturé sans reçu écrit au support ou conteste. Option : [ ] activer dans Stripe (Paramètres > Courriels aux clients : paiements réussis) et l'inscrire dans la checklist / [ ] reçu de l'app (nouveau mécanisme, non recommandé).
- [ ] P7 CGU au futur. Constat : art. 4.2 « n'existe pas encore… prix envisagé ». Pourquoi : à l'ouverture, le contrat affiché ne décrit pas l'offre vendue (Q2). Option : [ ] mettre à jour avant `OFFER_CHECKOUT_OPEN=1` (déjà Q2).
- [ ] P8 Message de succès optimiste. Constat : « Abonnement activé » s'affiche au retour de Stripe, avant le webhook. Pourquoi : quelques secondes sans accès après le message. Option : [ ] garder / [ ] adapter le texte (Q11).
- [ ] P9 Langue de la page Stripe. Constat : `locale` non fixé. Pourquoi : suit le navigateur, pas la langue choisie dans l'app. Option : [ ] garder / [ ] passer la langue du profil (ajout d'un paramètre, sans interface).

## 3. Corrigé (technique, sûr)

- Prix : une source serveur (`server/lib/offerprice.js` : 2000 centimes entiers, `cad`). Les deux libellés codés en dur (`offercheckout.js`, `parentalconsent.js`) en dérivent. Les textes de l'interface restent dans `public/` (affichage) mais un test les compare à la source : toute divergence échoue.
- Montants : l'alerte de remboursement n'utilise plus de flottant (`toFixed`), seulement des entiers de centimes.
- Devise : une session Checkout dont la devise n'est pas CAD est refusée (502, aucun lien envoyé). La devise reste celle du Price Stripe (envoyer `currency` en plus n'a pas été vérifié contre un vrai Stripe, donc non fait).
- Métadonnées de session : contrôlées par test, seulement `activityId` et `userId` (identifiants internes), plus la date et la méthode du consentement parental pour un mineur ; ni courriel ni téléphone.
- Idempotence : voir section 4.

## 4. Idempotence côté client

| Scénario | Résultat | Garde |
|---|---|---|
| Double clic sur « Continuer vers le paiement » | Une seule session (le bouton est désactivé pendant l'appel ; le serveur donne la même session 10 s). | `submitOffer1Checkout`, `recentCheckouts` |
| Retour arrière depuis Stripe, nouveau clic (même achat), même après redémarrage du serveur | Stripe rend la MÊME session (clé `Idempotency-Key` calculée sur compte + activité + contenu exact de la requête, valable 24 h chez Stripe) : jamais deux sessions ouvertes pour un achat. | `checkoutIdempotencyKey` (nouveau) |
| Même achat refait quand la session précédente est terminée ou expirée | Stripe la rend sans lien : une seconde tentative part avec une clé neuve. | `createCheckoutSession` |
| Achat différent (autre activité, client Stripe maintenant connu, autre adresse de retour) | Clé différente : pas d'erreur « clé réutilisée avec d'autres paramètres ». | contenu dans la clé |
| Page de succès rafraîchie | Message affiché une fois, URL nettoyée ; un second chargement ne rejoue rien. L'état « abonné » vient de la base (webhook), pas de l'URL. | `handleOffer1ReturnParams` |
| Paiement déjà fait puis nouvelle demande pour la même activité | 409 « déjà abonné ». | `alreadySubscribed` |
| Webhook rejoué | Sans effet (table des événements traités + un seul plan par activité). | `stripe_webhook_events` |

Reste non couvert (limite connue) : deux sessions ouvertes pour deux activités différentes sont deux achats voulus. Test : `test/expansion-prix-idempotence-test.js` (faux Stripe qui imite l'idempotence, aucun réseau).
