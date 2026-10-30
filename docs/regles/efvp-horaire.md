# EFVP — module Horaire (PROJET à valider)

Évaluation des facteurs relatifs à la vie privée, Loi 25 du Québec.
Objet : communication de renseignements personnels hors du Québec (art. 17, Loi sur la protection des renseignements personnels dans le secteur privé).
Rédigé le 30 oct. 2026 à partir du code et des docs du dépôt (`server/lib/horaire*.js`, `server/db.js`, `docs/basic/module-horaire.md`).
Statut : projet. À valider et signer par Émilien pour Noèsis Inc.

## 1. Le traitement

- **Finalité** : produire l'horaire hebdomadaire du personnel d'un restaurant (pilote : le maître d'hôtel du restaurant de Jacopo).
- **Responsable** : le restaurant. Il décide quoi saisir et pourquoi.
- **Sous-traitant** : Noèsis Inc., qui fournit et héberge l'outil.
- **Utilisateur** : un seul compte, le gestionnaire (propriétaire). Aucun compte employé, aucun gestionnaire secondaire.

## 2. Renseignements traités

| Donnée | Contenu | Conservation |
|---|---|---|
| Employés | nom, matricule Dayforce (facultatif), catégorie (rang par poste), heures min, cible et max | jusqu'au retrait de l'employé ou du compte |
| Règles par employé | liste fermée ou texte libre (200 car.) | idem |
| Notes du gestionnaire | texte libre (`horaire_notes`) | jusqu'à suppression |
| Disponibilités et congés | plages par jour ; congé (vacances, maladie, absence) | par semaine (voir 2.1) |
| Horaire | quarts par employé, alertes | par semaine (voir 2.1) |
| Événements | date, heure, couverts, type, prix ; aucun nom de client | supprimés le lendemain de leur date |
| Courriels transférés | corps lu en mémoire puis jeté ; on garde les champs extraits, des identifiants et un sujet hachés | fil gardé avec le compte |
| Code de confirmation Gmail | un seul code | 1 heure |

**Sensibilité.** Le motif d'un congé (maladie) touche la santé. Les notes et règles en texte libre peuvent en contenir aussi. Le reste est modéré (nom, heures de travail).

### 2.1 Éphémère et purges
- Événements : purge automatique au démarrage, toutes les 6 h et à chaque lecture, dès le lendemain de leur date (jour de Montréal).
- Courriels : aucun nom, courriel ni téléphone de client gardé.
- Horaire et disponibilités : **sur staging aujourd'hui, ils sont enregistrés en base** (`horaire_availabilities`, `horaire_timeoff`, `horaire_schedules`, `horaire_assignments`). Un changement est en cours sur staging pour les garder **en mémoire seulement**. À confirmer une fois livré ; ce tableau sera alors mis à jour.

## 3. Lieu d'hébergement (communication hors Québec)

- Serveur et base : Railway, région Amsterdam (Pays-Bas, Union européenne).
- Sauvegardes : copie quotidienne chiffrée avant de quitter le serveur, envoyée vers Cloudflare R2 (compte de Gaspard). **Région du compartiment R2 : à confirmer.**
- Élément d'adéquation : les Pays-Bas appliquent le RGPD, régime de protection jugé comparable à la Loi 25 (droits d'accès, de rectification et d'effacement ; sécurité ; avis d'incident).
- Le gestionnaire peut copier un prompt (noms et quarts) dans SA propre IA. Ce transfert est fait par le restaurant, hors de Noèsis ; le serveur ne l'envoie à aucune IA.
- Le réglage « Hébergement des données » (`dataInCanada` : oui, non, je ne sais pas) note le souhait du restaurant ; il ne change rien à l'hébergement.

## 4. Mesures en place (vérifiées dans le code)

1. Chiffrement en transit (HTTPS fourni par Railway ; **à confirmer** : certificat et redirection forcée).
2. Accès au propriétaire seul : chaque requête est filtrée par l'identifiant de session ; module `horaire` actif requis.
3. Réception des courriels : sans session, mais par jeton secret de 64 caractères, révocable, avec limite de débit.
4. Données jamais envoyées à l'IA de Noèsis, à la Communauté, au partage ni aux journaux. Les en-têtes d'export ne donnent que des nombres, aucun nom.
5. Purges : événements passés, corps des courriels, code Gmail (voir 2.1).
6. Export Dayforce : revérifié avant export (horaire enregistré requis, trous exclus, codes manquants signalés) ; rien n'est journalisé.
7. Droits : données incluses dans l'export du compte ; effacées à la suppression du compte (cascade).
8. Sauvegardes chiffrées avant envoi.

## 5. Risques résiduels

| Risque | Niveau | Réponse |
|---|---|---|
| Accès non autorisé au compte du gestionnaire | moyen | sécurité de connexion du compte (à confirmer) |
| Santé révélée par un congé maladie ou un texte libre | moyen | conseiller au restaurant de saisir « absence » et de ne pas écrire de motif |
| Fuite du jeton de réception | faible | révocation en un geste ; aucune donnée personnelle reçue gardée |
| Prompt copié dans une IA tierce par le gestionnaire | moyen | hors du contrôle de Noèsis ; à couvrir dans l'entente |
| Sauvegarde hors UE si R2 hors UE | à évaluer | confirmer la région R2 |
| Horaire et disponibilités encore en base | faible | changement en cours (2.1) |

## 6. Conclusion (à signer)

Les renseignements restent protégés de façon adéquate hors du Québec : hébergement dans l'UE sous le RGPD, accès réservé au gestionnaire, conservation minimale, aucune donnée envoyée à l'IA de Noèsis. La communication peut avoir lieu, sous réserve des points « à confirmer » et d'une entente écrite avec le restaurant.

Signé : ____________________ Émilien, pour Noèsis Inc.    Date : ____________

## 7. Actions pour Émilien

1. Signer une entente écrite avec le restaurant : responsable et sous-traitant, finalité, hébergement à Amsterdam, sous-traitants (Railway, Cloudflare), purges, avis d'incident, usage d'une IA par le gestionnaire.
2. Confirmer la région du compartiment R2 et le HTTPS forcé.
3. Mettre à jour cette EFVP quand le passage « en mémoire seulement » est livré.
4. Signer cette EFVP.
5. La réviser chaque année, et à chaque nouveau sous-traitant (ex. fournisseur de réception des courriels, non choisi).
