# Questions pour Émilien — Expansion

- [ ] Le MCP TiMeTracker (`lister_taches`) n'était pas disponible dans cette session de repli : les nouvelles tâches du secteur « Expansion » n'ont pas été lues — à relancer depuis une session où l'outil est branché.
- [ ] Valides-tu les textes des courriels d'abonnement (`docs/expansion-courriels.md`) et l'activation de `EXPANSION_MAILS=1` en production ? — tâche bloquée : activer les courriels aux abonnés — champ manquant : 3 (cas légal/communication réservé).
- [ ] Autorises-tu de remplacer « Offre 1 / Offer 1 » par « Expansion » dans les CGU et la politique de confidentialité (FR `public/index.html`, EN `public/legal-en.js`) ? — tâche bloquée : Textes « Offre 1 » → Expansion — champ manquant : 3 (légal, réservé).

- [ ] Q1 (#576) « Retirer la phase de paiement dans TMT test » : staging utilise déjà des clés de test (aucun vrai paiement). Veux-tu quand même contourner Checkout sur staging, ou garder le parcours de test complet ?
- [ ] Q3 (#575, #577) Génération automatique de la FDR depuis le questionnaire : quel déclencheur (à l'envoi du questionnaire, ou à la demande) et quel livrable attendu ?
- [ ] Q4 (#906) « Développer l'abonnement FDR » : quel manque précis par rapport à l'abonnement Expansion actuel (20 $/mois par activité) ?
- [ ] Q5 (#578) Case à cocher de résiliation avec RDV : on passe par le portail Stripe (docs/expansion-resiliation.md) sans nouvel écran. Est-ce acceptable, ou veux-tu la case dans l'app ?
- [ ] Q6 (#530, #551) « Créer la formule 1 » : formule = nouvel abonnement/prix Stripe, ou contenu livré ? Quel prix et quels contenus ?
- [ ] Q7 (#849) Suivi post-achat : quels signaux suivre (utilisation, résiliation, courriels) et où les voir ?
- [ ] Q8 (#570) Espace publicitaire dans l'app : à créer ? Contraire à la simplification (SIMPLIFICATION.md), à confirmer.
- [ ] Q9 Rappel avant renouvellement (communication client, réservé) : l'envoies-tu, désactivé par défaut tant que tu n'as pas validé ? Texte proposé : « Objet : Votre abonnement Expansion se renouvelle bientôt. Bonjour, votre abonnement Expansion pour « {activité} » se renouvelle le {date} pour 20 $. Rien à faire pour le conserver. Pour le modifier ou le résilier, ouvrez la gestion de l'abonnement dans l'application. L'équipe Noèsis. »
