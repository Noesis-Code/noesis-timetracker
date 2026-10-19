# Taxes automatiques (TPS/TVQ) — Stripe Tax

Le code est prêt : à la création de la session Checkout Expansion, `automatic_tax` et la collecte d'adresse sont ajoutés seulement si `STRIPE_TAX_ENABLED=1` (`server/lib/stripe.js`). Le prix n'est pas modifié.

À faire par Émilien dans Stripe (Settings > Tax) :
1. Activer Stripe Tax et renseigner l'adresse de l'entreprise (origine).
2. Ajouter les enregistrements TPS (fédéral) et TVQ (Québec) avec les numéros.
3. Produit Expansion : code de taxe « SaaS » (logiciel en tant que service) ; régler le prix en « taxe exclue » si les taxes doivent s'ajouter aux 20 $.
4. Poser `STRIPE_TAX_ENABLED=1` dans Railway staging, tester un paiement test, puis dans main quand prêt.

Si Stripe refuse (Tax non configuré), le client voit « Calcul des taxes indisponible » ; le détail reste dans les journaux serveur.
