# Questions pour Émilien — Expansion

Une case par ligne, par urgence. Q1 à Q4 bloquent ou conditionnent l'activation en production (voir `expansion-checklist-production-2026-10-20.md`). Fusions du 20 oct. : anciennes Q3, Q4, Q6 deviennent Q7 ; anciens courriels, Q9 et Q12 deviennent Q1 ; ancienne Q10 devient Q3, Q11 devient Q4, Q5 devient Q5, Q1 devient Q6, Q7 devient Q8, Q8 devient Q9.

## Bloque l'activation en production
- [ ] Q1 Courriels clients (communication, réservé) : valides-tu les textes `docs/expansion-courriels.md` (confirmation, fin), le rappel avant renouvellement (texte dans ce fichier plus bas) et un courriel « paiement à régulariser » (échec de paiement) ? Effet : `EXPANSION_MAILS=1` ne se pose qu'après ton accord ; sans, aucun courriel ne part et les relances viennent de Stripe seulement (à activer dans son tableau de bord).
- [ ] Q2 Légal (réservé) : remplacer « Offre 1 / Offer 1 » par « Expansion » dans les CGU et la politique de confidentialité (FR `public/index.html`, EN `public/legal-en.js`) ? Effet : sans ton accord, les textes légaux parlent de « Offre 1 » alors que l'achat dit « Expansion ».
- [ ] Q3 Remboursement ou litige (règle financière, réservée) : [ ] garder tel quel / [ ] couper l'accès au remboursement total seulement / [ ] couper aussi au litige. Effet : « garder » = un client remboursé garde Expansion jusqu'à ta résiliation manuelle (alerte équipe avec « partiel » ou « total » et le montant en CAD) ; « couper » = accès fermé aussitôt, au risque de priver un client à tort (litige abusif). Un remboursement partiel ne coupe jamais. Inchangé en attendant.
- [ ] Q4 Code gratuit : valable pour tous les comptes, sans date d'expiration ni limite d'usage (révocation manuelle). [ ] garder / [ ] ajouter une expiration ou un nombre maximal d'utilisations (nouveau mécanisme). Effet : « garder » = un code diffusé reste utilisable jusqu'à retrait.

## Décisions de produit
- [ ] Q5 (#578) Résiliation avec RDV : on passe par le portail Stripe (`docs/expansion-resiliation.md`), sans nouvel écran. Acceptable, ou case dans l'app ? Effet : « acceptable » = rien à construire.
- [ ] Q6 (#576) Staging utilise déjà des clés de test (aucun vrai paiement). Contourner Checkout sur staging, ou garder le parcours complet ? Effet : « garder » = rien à changer.
- [ ] Q7 (#575, #577, #906, #530, #551) FDR et « formule 1 » : génération automatique depuis le questionnaire (déclencheur : à l'envoi ou à la demande ? livrable ?), manque de l'abonnement actuel (20 $/mois par activité), formule = nouveau prix Stripe ou contenu livré (prix, contenus) ? Effet : débloque 5 tâches ; rien n'est codé d'ici là.
- [ ] Q8 (#849) Suivi post-achat : quels signaux (utilisation, résiliation, courriels) et où les voir ? Effet : sans réponse, aucun tableau de suivi n'est ajouté.
- [ ] Q9 (#570) Espace publicitaire dans l'app : à créer ? Contraire à `SIMPLIFICATION.md`. Effet : sans accord, refusé par défaut.

## Accès
- [ ] Q10 Le MCP TiMeTracker (`lister_taches`) n'était pas branché dans les sessions de repli : relire les tâches du secteur « Expansion » depuis une session où il l'est.

## Texte du rappel avant renouvellement (Q1)
« Objet : Votre abonnement Expansion se renouvelle bientôt. Bonjour, votre abonnement Expansion pour « {activité} » se renouvelle le {date} pour 20 $. Rien à faire pour le conserver. Pour le modifier ou le résilier, ouvrez la gestion de l'abonnement dans l'application. L'équipe Noèsis. » (désactivé par défaut).
