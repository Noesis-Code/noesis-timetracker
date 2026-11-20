# Appartenance par catégorie (serveur, 19 nov. 2026)

Code : `server/lib/portee.js` (source unique), `server/routes/membres.js`. Modèle validé par Émilien le 19 nov. 2026.

## Modèle
- Table `member_scopes(activityId, userId, categoryKey, addedBy, addedAt)`. `categoryKey` : `_` = activité entière, clé de pôle ou de secteur, `-` = « aucune catégorie » (dernier retrait : le membre reste dans l'activité, ne voit plus rien, rien n'est supprimé).
- Un membre appartient à une catégorie et à tout ce qui est dessous (pôle = ses secteurs). Plusieurs lignes possibles.
- Sans aucune ligne = portée activité (profils existants, anciens chemins d'ajout). Migration idempotente au démarrage : une ligne `_` par membre existant, aucune suppression.
- Propriétaire et responsables d'activité = portée activité. Un responsable de pôle/secteur (`category_managers`) est implicitement membre de sa catégorie et dessous.
- Deux notions : `scope()` = où je travaille (arbre, Chrono, tâches) ; `managed()` = ce que je vois des données DES AUTRES (propriétaire/resp. d'activité = tout ; resp. de pôle = pôle + secteurs ; resp. de secteur = secteur ; simple membre = rien).
- `invites` : colonne `scopeKey` (facultative). L'acceptation pose la ligne de portée (aucune = activité entière).
- Exclure un membre efface ses lignes. Suppression du compte : lignes effacées.

## Routes (toutes sous `/api`, session obligatoire)
- `GET /activities/:id/membres` -> `{ activityId, canManage, members: [{ id, name, owner, manager, all, scopes: [{ key, label, niveau }] }] }`. Un simple membre ne voit que lui ; un responsable, les membres dont la portée croise la sienne.
- `GET /activities/:id/categories/:key/membres` (`key` = `_` pour l'activité) -> `{ activityId, key, niveau, name, canOpen, canAdd, members: [{ id, name, owner, manager, via: 'proprietaire'|'categorie'|'activite'|'dessus', removable }], candidates: [{ id, name }] }`. `canOpen:false` (listes vides) si l'appelant n'est pas responsable de cette catégorie ou au-dessus. `candidates` = membres de l'activité de niveau égal ou inférieur qui n'appartiennent pas déjà à la catégorie (pop-up « suggestions »).
- `PUT /activities/:id/categories/:key/membres` `{ userId }` -> même forme que ci-dessus. 403 si l'appelant ne gère pas la catégorie (ou au-dessus), 400 si la personne n'est pas dans l'activité (utiliser l'invitation), 409 si déjà membre.
- `DELETE /activities/:id/categories/:key/membres/:userId` -> même forme. Hiérarchie des responsables : seul un rang strictement supérieur retire un responsable ; un simple membre est retiré par tout responsable de la catégorie ou au-dessus ; jamais le propriétaire ; `via` 'activite'/'dessus' non retirable ici (400) ; `key = _` refusé (utiliser l'exclusion de l'activité).
- `POST /activities/:id/invite` `{ pseudo, scopeKey? }` : `scopeKey` = pôle ou secteur ; l'appelant doit gérer cette catégorie ou être au-dessus. Sans `scopeKey`, seuls les membres de portée activité invitent (403 `INVITATION_RESERVEE_RESPONSABLES`).
- `GET /activities/:id/goals/categories` : ajoute `inScope` par pôle (false = pôle renvoyé seulement comme conteneur du secteur du membre, non sélectionnable) et `scope: { all, roots }` ; ne renvoie que la portée (pôles, secteurs, frozenCategories, tasksByCategory).
- Erreurs : `{ error, code? }`. Codes : `TACHE_RESERVEE_RESPONSABLES`, `TACHE_NON_ATTRIBUEE`, `OBJECTIF_RESERVE_RESPONSABLES`, `DONNEES_RESERVEES_RESPONSABLES`, `INVITATION_RESERVEE_RESPONSABLES`.

## Portée par endpoint
| Endpoint | Règle |
|---|---|
| `POST /timer/category`, `/timer/stop`, `POST/PUT /history`, `/timer/start` | catégorie choisie dans la portée de travail (403 sinon) ; à l'arrêt et en saisie manuelle une catégorie est exigée : posée d'office s'il n'y a qu'un pôle/secteur, sinon 400 ; portée vide = 403 |
| `GET /activities/:id/goals/categories` (+ `/secteurs`) | filtré par portée de travail |
| `/category-stats`, `/category-timesheet`, `/category-chart` (avec `memberId` ≠ soi) | 403 pour un simple membre ; un responsable voit l'autre membre limité à sa portée gérée (répartition, grille, graphique) ; ses propres données : inchangées |
| `/stats/activity-members` | activité partagée : simple membre = lui seul ; responsable = tâches, heures et pôles de sa portée gérée |
| `/bilan/moyenne-taches`, `/bilan/proportion` | idem (simple membre = lui seul ; responsable = sa portée) |
| Objectifs : `liste`, `get` et toute écriture (`rowOf`), `creer`, `structure` | activité partagée : réservés aux responsables, limités à leur portée (pôle : son pôle et ses secteurs ; secteur : son secteur ; niveau activité : responsables d'activité) ; simple membre : rien (403 `OBJECTIF_RESERVE_RESPONSABLES`) |
| Tâches : `tasksByCategory`, `overview`, `archives`, liste du jour, « Aujourd'hui » | activité partagée : chaque membre ne reçoit que les tâches qui lui sont attribuées (ou faites par lui) ; responsable : celles de sa portée gérée en plus |
| Tâches : création (`addCategoryTask` : toutes les voies : route, capture, IA, Drive, MCP, objectifs), déplacement, modification du contenu, suppression | activité partagée : propriétaire et responsables, dans les catégories où ils sont responsables seulement (jamais là où ils ne sont que membres) ; un membre ne fait que cocher ses tâches attribuées (`PUT /sub-project-items/:id` avec `done` seul) ; activité à un seul membre : libre |

## Pour le client (à faire par les autres agents)
Endroits qui créent des tâches, à masquer pour un simple membre d'une activité partagée (sur `canManage`/`inScope`) : bouton « + » des tâches par pôle/secteur (`POST /activities/:id/goals/categories/:key/tasks`), barre d'ajout / capture (`POST /goals/capture`, `/goals/capture/propose`, `POST .../categories/auto-task`), ajout de tâches par document ou Drive (`documenttasks`, `drivesync`), propositions de tâches de la semaine (`weeklytaskproposals`), « Modifications proposées » (`changeproposals`), déplacement d'une tâche (`PUT .../tasks/:itemId/category`, `PUT /goals/tasks/:itemId/reassign`), édition/suppression (`PUT|DELETE /sub-project-items/:id`), création d'objectif (qui crée des tâches), connecteur IA (MCP `ajouter_tache`). Le Chrono doit lire `inScope`/`scope` de `GET .../goals/categories`.

## Comportements par rôle (intégration du 20 nov. 2026)
Valable pour une activité PARTAGÉE (2 membres ou plus) ; une activité à un seul membre n'a aucune restriction.

| | Propriétaire | Responsable d'activité | Responsable de pôle / de secteur | Simple membre |
|---|---|---|---|---|
| Portée de travail (Chrono, arbre, tâches) | toute l'activité | toute l'activité | sa catégorie et dessous (un pôle hors portée n'est proposé que comme conteneur de ses secteurs) | sa catégorie et dessous |
| Données des autres (temps, Bilan, Statistiques, `/member-times`, `/category-*` avec `memberId`) | tout | tout | membres et temps de sa portée gérée seulement | lui seul ; 403 `DONNEES_RESERVEES_RESPONSABLES` sur les données d'un autre |
| Objectifs | tous | tous | ceux de sa portée gérée | rien (403 `OBJECTIF_RESERVE_RESPONSABLES`) ; onglet Objectifs masqué |
| Tâches | crée, modifie, déplace, supprime partout | idem | idem dans sa portée gérée seulement | voit et coche ses tâches attribuées ; aucun bouton de création (403 `TACHE_RESERVEE_RESPONSABLES` / `TACHE_NON_ATTRIBUEE` sinon) |
| Membres d'une catégorie (Réglages > Activités > Catégories > Membres) | ajoute et retire | idem | ajoute et retire dans sa catégorie ; ne retire un responsable que d'un rang inférieur | bloc absent |
| Inviter par pseudo | oui, avec ou sans portée | oui | seulement vers une catégorie qu'il gère (`scopeKey`) | non (403 `INVITATION_RESERVEE_RESPONSABLES`) |
| Quitter / supprimer l'activité | refusé tant qu'aucun successeur : 409 `PROPRIETAIRE_SANS_SUCCESSEUR` (« nomme d'abord un responsable d'activité »), message affiché tel quel par le client | peut quitter | peut quitter | peut quitter |

- Erreurs : le client affiche le message du serveur (`error`), jamais le code ; `code` sert aux tests et à masquer proprement (le Bilan affiche « — » sur un 403).
- Candidats du pop-up « Ajouter un membre » : `{ id, name, avatar, color }` (bulles rondes comme Communauté).
- `/api/member-times` est restreint côté serveur (`tempsmembres.tableFor` + `portee.membresVisibles`) : un simple membre ne reçoit que ses propres lignes, ses propres historiques et pas les temps des autres ; test `test/membres-portee-endpoints-test.js`.
- Non joué de bout en bout : invitation par pseudo avec portée sur deux vrais comptes.
