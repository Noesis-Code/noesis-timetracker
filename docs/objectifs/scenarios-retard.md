# Scénarios de retard — Compte B (staging)

Ordre d'Émilien, 10 nov. 2026 : un compte de test avec des cas PRÉPARÉS, pour que Gaspard teste la règle de retard (`docs/objectifs/retard.md`) sans rien recréer.

## Connexion
Écran de connexion de **staging** (https://web-staging-6d1b.up.railway.app), Prénom « Compte », Nom « B », mot de passe : celui de la variable d'environnement `COMPTE_B_PASSWORD` (Railway, environnement staging ; jamais dans le dépôt). Variable absente ou vide : le compte n'est pas créé. Le compte n'existe jamais en production ni en local (`RAILWAY_ENVIRONMENT_NAME` défini et différent de `production`). Création au démarrage du serveur, une seule fois (idempotent) ; si la variable change, seul le mot de passe est mis à jour.

## Principe
Cinq activités, une par scénario (« S1 » à « S5 »). Chacune : un pôle « Production », un secteur « Opérations », 6 semaines de temps Chrono passées sur ce secteur (3 séances de 100 min), un temps maximum de 5 h par semaine pour le pôle (capacité 300 min ; le moteur place jusqu'à 120 % = 360 min par semaine), un objectif avec ses objectifs hebdomadaires, des tâches avec leur durée (médiane et maximum) et leur type.
**Toutes les dates sont calculées par rapport au jour de création du compte (jour 0).** L'objectif commence ce jour-là : ses semaines font 7 jours pleins (jour 0 à 6, 7 à 13, …) et ses périodes 4 semaines (période 1 : jours 0 à 27, période 2 : jours 28 à 55), quel que soit le jour de la semaine ou la place dans le calendrier de 4 semaines. Le « calendrier partagé » (première semaine au premier lundi de janvier) n'intervient pas : le moteur de retard juge les périodes de l'objectif.
Tout se déclenche à la première ouverture de la liste du jour ou du calendrier de l'activité (au plus une fois par 30 s). Les scénarios sont figés à leur création : quelques jours plus tard, les dates sont dépassées et le moteur les traite comme des retards ordinaires ; pour un cas neuf, créer un autre compte de test.
Le test automatique `test/compte-b-retard-test.js` vérifie chaque résultat ci-dessous.

## S1 Semaine pleine
- **Contenu (cette semaine)** : 2 maintenances (« Déclarer la TPS du trimestre », « Payer les factures fournisseurs », 2 h chacune) et 1 tâche moins importante (« Concevoir la nouvelle page d'accueil », 1 h) = 300 min, 100 % de la capacité. Plus une maintenance URGENTE (« Dépanner l'imprimante en panne », 1 h 30) datée d'il y a 5 jours, non faite.
- **Gaspard fait** : ouvre la liste du jour de l'activité.
- **Il doit voir** : l'urgente en premier (en retard), puis les 2 maintenances ; la tâche moins importante n'est plus cette semaine, elle est datée du jour 7 (semaine suivante). Aucun message.

## S2 Semaine entièrement urgente
- **Contenu** : cette semaine une tâche de 1 h ; la semaine suivante (jours 7 à 13) trois maintenances urgentes de 2 h 10 chacune (390 min, 130 % de la capacité) : « Renouveler le permis d'exploitation » (légal), « Rapprocher le compte bancaire » (finances), « Réparer le serveur en panne » (dépannage).
- **Gaspard fait** : ouvre la liste du jour, puis le calendrier de la semaine suivante.
- **Il doit voir** : la moins urgente (« Réparer le serveur en panne ») glisse à la fin de la semaine d'après (jour 14) ; les deux plus urgentes restent la semaine suivante. Aucun message.

## S3 Période qui déborde, la suivante absorbe
- **Contenu** : 4 semaines de la période 1 (3, 3, 3 puis 7 tâches de 1 h 30) : la dernière semaine reçoit 10 h 30 pour 6 h de place (120 % de 5 h) ; la période 2 est vide.
- **Gaspard fait** : ouvre la liste du jour ou le calendrier.
- **Il doit voir** : 3 tâches de la dernière semaine passent à la période 2 (dates à partir du jour 28). **Aucun pop-up** (report silencieux).

## S4 Période suivante trop pleine → pop-up A
- **Contenu** : la période 1 est pleine (4 tâches de 1 h 30 par semaine à 120 %, 7 dans la dernière : 3 débordent) ; la période 2 est déjà pleine de 24 maintenances courtes d'1 h (« Classer le dossier N »), moins importantes que les tâches reportées.
- **Gaspard fait** : ouvre la liste du jour.
- **Il doit voir** : le pop-up A (refusable) avec la liste des tâches « Classer le dossier N » retirées de la période 2 (5 environ), des heures manquantes et un pourcentage de dépassement. Ces tâches restent ouvertes, sans date. Une réouverture ne les replace pas (aucune place) ; si Gaspard refuse le message, il ne revient pas pour la période.

## S5 Plus de place avant l'échéance → pop-up B
- **Contenu** : l'objectif n'a qu'une période (jours 0 à 27) avec 20 tâches de 1 h 30 (30 h pour 24 h de place à 120 %).
- **Gaspard fait** : ouvre la liste du jour.
- **Il doit voir** : le pop-up B (obligatoire, non refusable) ; son bouton ouvre la fiche du pôle « Production » (temps prévu : 5 h par semaine, avec le temps nécessaire par semaine). Il revient à chaque ouverture tant que ce n'est pas réglé (augmenter le temps du pôle, supprimer des tâches).

## Limites
- Les objectifs sont créés sans pont vers l'arbre périodique (comme les objectifs de démonstration) : leurs semaines et périodes figurent dans la fiche de l'objectif.
- Chaque semaine contient les tâches nécessaires au cas : les listes de S4 (43 tâches) sont longues.
