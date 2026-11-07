# Objectifs de la Feuille de route : dossier des cas de figure

État du code : `origin/staging` au 6 nov. 2026 (commit `b8b95024`). Dossier d'audit, aucun code modifié. Les correctifs sont des propositions à valider.

Fichiers lus : `server/lib/objectifs.js` (692 l.), `server/routes/objectifs.js`, `server/lib/objectifs-durees.js`, `server/lib/seed-staging.js` (l. 360-440), `server/lib/accountdeletion.js`, `public/js/objectifs-arbre.js`, `objectifs-creer.js`, `public/css/objectifs-arbre.css`, `test/objectifs-creation-test.js`.

Constat d'ensemble : l'arbre actuel est un **module à part** (`user_objectives`, une table, un propriétaire = `userId`). Il est relié à l'arbre périodique par un « pont » (`bridge`, `objectifs.js:465`). Plusieurs décisions des 5-6 nov. ne sont **pas encore dans le code** : périodes globales (Réglages), niveau de l'objectif (activité/pôle/secteur), responsables, zoom par niveau, pincer, abandon, suppression. Les cas correspondants sont donc ❌ ; ce sont des fonctions à construire, pas des bogues.

Légende : ✅ géré, ⚠️ partiel, ❌ non géré. Priorité : P1 (bloquant ou légal), P2 (important), P3 (mineur). Références : `o.js:N` = `server/lib/objectifs.js` ; `ar.js:N` = `public/js/objectifs-arbre.js` ; `cr.js:N` = `public/js/objectifs-creer.js`. Les numéros de ligne marqués `~` sont approximatifs.

## Sommaire

1. Création (C01-C16)
2. Rattachement et détachement (L01-L14)
3. États (E01-E10)
4. Temps (T01-T14)
5. Affichage (A01-A15)
6. Responsables (P01-P07)
7. Hors ligne et synchronisation (H01-H04)
8. Données (D01-D06)
9. Liens avec les tâches (K01-K06)
10. IA (I01-I06)
11. Comptes (S01-S04)
12. Liste priorisée des cas à corriger

## Tableau récapitulatif

| Cas | Attendu | Actuel | Priorité |
|---|---|---|---|
| C01 Premier objectif, périodes | Pop-up de création règle les périodes globales | ⚠️ périodes choisies par objectif | P2 |
| C02 Doublon de titre | Avertir, ne pas bloquer | ❌ | P3 |
| C03 Titre vide | Refus clair | ✅ | - |
| C04 Titre trop long | Refus clair (140) | ✅ | - |
| C05 Échéance / début dans le passé | Refus ou confirmation | ⚠️ | P2 |
| C06 Échéance absente | IMPOSSIBLE par règle (6 nov.) | ✅ règle appliquée | - |
| C07 Échéance très lointaine | Message clair ou plafond | ⚠️ | P2 |
| C08 Activité inconnue, inactive, non membre | Refus | ✅ | - |
| C09 Activité sans pôle | Pôle créé automatiquement | ✅ | - |
| C10 Pôle sans secteur | Pas de secteur parasite | ⚠️ | P3 |
| C11 Niveau (activité/pôle/secteur) | L'objectif porte son niveau | ❌ | P2 |
| C12 11e objectif d'une activité | Pas de perte silencieuse | ✅ corrigé (6 nov.) : autre pôle si place, sinon message dans le détail + pont réessayé à l'ouverture | P1 |
| C13 Activité créée puis échec | Pas d'activité orpheline | ⚠️ | P2 |
| C14 Double soumission | Un seul objectif | ⚠️ | P3 |
| C15 Description trop longue | Refus, pas de troncature | ⚠️ | P3 |
| C16 Nouvel objectif après un atteint | Possible | ✅ | - |
| L01 Cycle | Refusé | ✅ | - |
| L02 Rattaché à soi-même | Refusé | ✅ | - |
| L03 Parent d'une autre activité | Refusé, SAUF sous un macro (section 13) | ✅ corrigé (6 nov.), revu pour le macro | P1 |
| L04 Parent supprimé | Enfants remontent, pas d'erreur | ❌ | P2 |
| L05 Parent archivé (atteint) | Cohérent | ⚠️ | P2 |
| L06 Parent abandonné | Non proposé par l'IA | ⚠️ | P3 |
| L07 Déplacer une branche | Descendants suivent | ✅ | - |
| L08 Refus mémorisé | Jamais reproposé | ⚠️ | P3 |
| L09 Plusieurs sommets | Permis | ✅ | - |
| L10 Délier | Redevient sommet | ✅ | - |
| L11 Dates parent/enfant incohérentes | Signaler | ⚠️ | P2 |
| L12 Carte « N objectifs » cible | Choix de l'objectif | ✅ | - |
| L13 Rattacher au parent actuel | Sans effet | ✅ | - |
| L14 Objectif d'un autre compte | Refusé | ✅ | - |
| E01 Atteint avec enfants non atteints | Règle à trancher | ⚠️ | P2 |
| E02 Comment marquer atteint | Action directe | ⚠️ | P2 |
| E03 Abandonner un objectif | Action + état atténué | ✅ corrigé (6 nov.) : routes abandon/réactiver/suppression + détail | P1 |
| E04 Abandon d'un parent avec enfants | Choix explicite | ❌ | P2 |
| E05 Réactivation | Possible | ❌ | P2 |
| E06 Atteint puis décoché | Retour en cours | ⚠️ | P3 |
| E07 Futur, présent, passé | Transition automatique | ✅ | - |
| E08 Échéance dépassée non atteint | Reste visible, signalé | ⚠️ | P3 |
| E09 Semaines futures cochées | Interdit ou signalé | ⚠️ | P3 |
| E10 Archives | Racine atteinte archivée | ✅ | - |
| T01 Périodes globales (Réglages) | SUPPRIMÉ : périodes fixes 13 × 4 (section 14) | ✅ remplacé (6 nov.) | P1 |
| T02 Changer le réglage avec objectifs existants | Sans objet : plus de réglage | ✅ sans objet (6 nov.) | P1 |
| T03 Objectif sur plusieurs périodes | Étalé sur ses périodes | ❌ | P2 |
| T04 Plusieurs années | Lignes par année | ✅ | - |
| T05 Bissextile, 53 semaines | Aucun décalage | ✅ | - |
| T06 Fuseau, changement d'heure | Jour de la personne | ✅ | - |
| T07 Échéance au bord de période | Bonne case | ✅ | - |
| T08 Plusieurs objectifs, même case | Une carte, compteur | ✅ | - |
| T09 Ligne illisible (JSON corrompu) | Ignorée, pas de 500 | ⚠️ | P2 |
| T10 « Régler la durée » | Aucune perte | ⚠️ | P2 |
| T11 Prolonger (bilan) | Cohérent avec le parent | ⚠️ | P3 |
| T12 Reste de moins d'une semaine | Fusionné | ✅ | - |
| T13 Début dans le futur | Possible | ✅ | - |
| T14 Échéance à 50 ans | Grille bornée | ⚠️ | P2 |
| A01 Activité sans objectif | Pas de colonne vide | ✅ | - |
| A02 Aucun objectif | Message | ✅ | - |
| A03 Un seul objectif | Affichage normal | ✅ | - |
| A04 100+ objectifs | Fluide | ⚠️ | P2 |
| A05 Très long titre | Retour à la ligne | ✅ | - |
| A06 Activité supprimée ou quittée | Objectifs masqués ou archivés | ⚠️ | P2 |
| A07 Renommée, couleur changée | Suit en direct | ✅ | - |
| A08 Secteur déplacé ou supprimé | Pont cohérent | ⚠️ | P3 |
| A09 Plus de 2 colonnes | Défilement | ✅ | - |
| A10 360 px | Lisible | ✅ | - |
| A11 Bureau 1024 px+ | Colonnes côte à côte | ✅ | - |
| A12 Zoom par niveau, pincer | Activité, pôle, secteur | ❌ | P2 |
| A13 Zoom Période, Année, Tout | Trois échelles | ✅ | - |
| A14 Passé caché par défaut | Visible en « Tout » | ✅ | - |
| A15 Grille alignée, « Aujourd'hui » unique | Une seule ligne | ✅ | - |
| P01 Responsable (concept) | Un par élément | ❌ | P1 |
| P02 Membre qui quitte l'activité | Réattribution | ❌ | P2 |
| P03 Responsable supprimé (compte) | Retour au propriétaire | ❌ | P2 |
| P04 Héritage conflictuel | Le plus proche gagne | ❌ | P2 |
| P05 Propriétaire = responsable | Permis | ❌ | P3 |
| P06 Droit de suppression | Propriétaire seul | ❌ | P2 |
| P07 Visibilité entre membres | Objectifs de l'activité partagée visibles | ❌ | P1 |
| H01 Création hors ligne | File d'attente | ❌ | P2 |
| H02 Conflit d'édition, 2 appareils | Aucune perte | ⚠️ | P3 |
| H03 Suppression concurrente | Message clair | ⚠️ | P3 |
| H04 Données périmées | Rafraîchies | ⚠️ | P3 |
| D01 Anciens objectifs « étapes » | Tout en « objectifs » | ⚠️ | P3 |
| D02 Objectifs orphelins | Sommets | ✅ | - |
| D03 Plans annuel/périodique/hebdo existants | Visibles dans l'arbre | ⚠️ | P2 |
| D04 Seed de démo | Idempotent, staging seulement | ⚠️ | P3 |
| D05 Suppression de compte | Objectifs effacés | ✅ corrigé (6 nov.) | P1 |
| D06 Export des données | Objectifs inclus | ✅ corrigé (6 nov.) | P1 |
| K01 Tâche d'un objectif supprimé | Tâche conservée | ✅ | - |
| K02 Objectif archivé, tâches ouvertes | Cohérent | ⚠️ | P3 |
| K03 Tâche sans objectif | Permise | ✅ | - |
| K04 Objectif sans tâche | Permis | ✅ | - |
| K05 Lien tâche vers objectif | Toutes les tâches liées | ⚠️ | P3 |
| K06 Tâche supprimée ou terminée | Compteur à jour | ✅ | - |
| I01 Rattachement IA en échec | Repli sur règles | ✅ | - |
| I02 Rattachement IA lent | Attente bornée, informée | ⚠️ | P3 |
| I03 Réponse IA incohérente | Ignorée | ✅ | - |
| I04 Budget IA atteint | Repli sans IA | ✅ | - |
| I05 Quota gratuit partagé | Pas de gaspillage | ⚠️ | P2 |
| I06 Pas de clé IA | Repli sur règles | ✅ | - |
| S01 Compte gratuit | Arbre complet, sans tâches générées | ✅ | - |
| S02 Expansion expirée | Acquis conservés | ✅ | - |
| S03 Activité partagée | Voir P01-P07 | ❌ | P1 |
| S04 Profil fictif | Objectifs de démo | ✅ | - |

## 1. Création

**C01 Premier objectif et périodes.** Attendu : le pop-up du premier objectif règle les périodes globales (défaut 13 de 4 semaines). Actuel ⚠️ : aucun réglage global ; chaque objectif choisit ses périodes (`cr.js:285`, `periodWeeks`), et l'arbre fixe 13 x 28 jours en dur (`ar.js:151`). Correctif : voir T01 ; d'ici là, ne pas annoncer le réglage global dans le pop-up.

**C02 Doublon de titre.** Attendu : avertir, jamais bloquer. Actuel ❌ : aucune vérification (`creer`, `o.js:479`). Correctif : à l'étape « Rattachement », mentionner « objectif identique déjà présent » quand un objectif non atteint de la même activité a le même titre normalisé.

**C03 Titre vide.** ✅ `cleanTitle` : « Écris ton objectif. » (`o.js:96`).

**C04 Titre très long.** ✅ refus au-delà de 140 caractères, jamais de troncature (`o.js:54,94`). Affichage : voir A05.

**C05 Échéance ou début dans le passé.** Attendu : confirmation explicite. Actuel ⚠️ : `startDate` est accepté tel quel et seule `endDate > startDate` est vérifiée (`o.js:483-484`) ; un objectif entièrement passé peut être créé. Le sélecteur de date a `min = startDate` (`cr.js:239`), pas la route. Correctif : refuser `endDate < aujourd'hui` côté serveur.

**C06 Échéance absente : impossible par règle (Émilien, 6 nov. 2026).** Un objectif a TOUJOURS une échéance, une date précise. Serveur : `checkEcheance` (400, « Indique l’échéance de l’objectif… », date ISO valide, jamais dans le passé à la création par la route ; `save` refuse une date invalide en édition). Interface : Suivant/Terminer grisé tant qu’aucune date valide n’est choisie, message court pour une date passée, l’échéance proposée par la base de durées reste modifiable. Migration idempotente `migrateEcheances` : tout objectif existant sans échéance valide reçoit une échéance par défaut (dernière date connue de ses périodes, sinon début + durée typique de la catégorie, sinon début + 1 an), marqué `meta.echeanceDefaut`, rien supprimé. Historique : ✅ `contexte` propose toujours une date (écrite, durée, base de durées ou 3 mois, `o.js:229-234`) ; `creer` refuse « Dates invalides » si absente (`o.js:484`).

**C07 Échéance très lointaine.** Attendu : plafond clair. Actuel ⚠️ : durée de période « mois » au-delà d'un an (`defaultPeriodWeeks`, `o.js:276`) et `MAX_PERIODS = 80` (`o.js:52,119`) : un objectif de 10 ans (permis par `MAX_AMOUNT`, `o.js:51`) échoue avec « Trop de périodes : choisis une période plus longue », alors que la période par défaut est déjà « mois ». `endDate` n'a aucun plafond. Correctif : au-delà de 80 mois, proposer 13 semaines ou 1 an ; plafonner `endDate` à début + 10 ans.

**C08 Activité inconnue, inactive ou non membre.** ✅ `userActivities` filtre `active = 1` et l'appartenance (`o.js:140-143,481-482`) : « Choisis une de tes activités. »

**C09 Activité sans pôle.** ✅ `ensureObjectiveSector` crée le pôle au nom de l'activité (`o.js:431-434`).

**C10 Pôle sans secteur.** Attendu : aucun secteur parasite. Actuel ⚠️ : si le pôle porte des données directes, un secteur « Général » est créé en plus (`o.js:435-440`), puis un secteur PAR OBJECTIF (`o.js:441-443`) : l'arbre périodique se remplit d'un secteur au titre de chaque objectif. Correctif : à arbitrer avec C11.

**C11 Niveau de l'objectif.** Attendu : l'objectif porte le niveau où il est créé (activité, pôle ou secteur). Actuel ❌ : rien n'est stocké ; chaque objectif est lié à l'activité (`activityId`) et posé sous le PREMIER pôle (`poles[0]`, `o.js:433`). Correctif : colonnes `level` ('activite' | 'pole' | 'secteur') et `categoryKey` dans `user_objectives`, lues par `shape`, par le zoom (A12) et par le pont.

**C12 11e objectif d'une même activité.** Attendu : aucune perte silencieuse. Actuel ⚠️ : chaque objectif crée un secteur ; limite `MAX_SECTEURS_PER_POLE = 10` (`categories.js:74,318`). Le 11e échoue dans `addCategory`, l'erreur est avalée par `bridge` (`o.js:465-477`, simple `console.warn`) : l'objectif existe dans l'arbre de la page 1 mais pas dans l'arbre périodique ni au calendrier, sans message. Correctif : un seul secteur partagé, ou message explicite à la création ; à arbitrer avec C11.

**C13 Activité créée puis objectif en échec.** Actuel ⚠️ : le client crée l'activité (`POST /api/activities`) PUIS l'objectif (`cr.js:372,465`) ; si le second appel échoue, l'activité reste, vide. Correctif : créer l'activité côté serveur dans `creer`, dans la même opération.

**C14 Double soumission.** Actuel ⚠️ : le bouton est désactivé pendant l'envoi (`cr.js:376`) mais le serveur n'a pas de clé d'idempotence ; un renvoi réseau crée deux objectifs identiques. Correctif : en-tête `Idempotency-Key` (la table `idempotency_keys` existe déjà) sur `POST /objectifs`.

**C15 Description trop longue.** Actuel ⚠️ : `slice(0, 500)` silencieux (`o.js:519`), contraire à la règle « jamais tronqué ». Correctif : `textlimits.clean` avec refus.

**C16 Nouvel objectif après un objectif atteint.** ✅ une racine atteinte est `archived` (`liste`, `o.js:629`) ; l'utilisateur peut en créer un autre.

## 2. Rattachement et détachement

**L01 Cycle.** ✅ `lier` remonte la chaîne des parents (`o.js:609-611`) ; le glisser-déposer grise les descendants (`isInvalid`, `ar.js:74`) et affiche le message (`ar.js:48,86`). Testé (`objectifs-creation-test.js:167`).

**L02 Rattaché à soi-même.** ✅ même boucle (le premier maillon est l'objectif lui-même) ; côté client `id === o.id` est invalide.

**L03 Parent d'une autre activité.** Attendu : refusé (un objectif est lié à UNE activité). Actuel ❌ : ni `lier` (`o.js:602-615`) ni `creer` (`o.js:490-494`) ne comparent `activityId`. Côté client, le dépôt est permis sur n'importe quelle carte de n'importe quelle colonne ; l'arbre construit les enfants PAR colonne (`ar.js:~215`) : l'enfant devient un sommet de sa colonne, le `parentId` pointe vers une autre activité. Correctif : `if (p.activityId !== r.activityId) throw err('Même activité obligatoire.')` dans `lier` et `creer` ; `isInvalid` côté client pour les autres colonnes.

**L04 Parent supprimé.** Attendu : les enfants remontent ou deviennent sommets, sans erreur. Actuel ❌ pour la suppression elle-même : aucune route de suppression d'objectif (`routes/objectifs.js`). Si une ligne disparaissait, un parent inconnu se comporte comme un sommet (`o.js:628-629`, `ar.js:~216`). Correctif : `DELETE /objectifs/:id` (propriétaire seul), enfants remontés d'un niveau, confirmation `TMT.ui.confirm`, tâches conservées (K01).

**L05 Parent archivé (atteint).** Attendu : cohérent. Actuel ⚠️ : l'IA ne propose pas un parent atteint (`o.js:411`) mais le glisser-déposer le permet : un parent « atteint » reçoit un enfant ouvert (E01) ; le parent reste affiché, `visibleSet` garde les ancêtres (`ar.js:128-135`). Correctif : trancher E01.

**L06 Parent abandonné.** Actuel ⚠️ : `rattachement` n'exclut que les atteints (`o.js:411`) : un objectif abandonné peut être proposé comme parent. Correctif : ajouter `!meta.abandoned` au filtre.

**L07 Déplacer une branche entière.** ✅ seul `parentId` du déplacé change ; ses descendants le suivent (`o.js:612`). Angle mort : les dates (L11).

**L08 Refus mémorisé.** Actuel ⚠️ : le refus est stocké (`objectifs_refus`, `o.js:42,513,617`) mais seulement à la création, depuis la liste `refused` du client (`cr.js:329,339`) ; `rattachement` ne lit jamais la table (`refusDe`, `o.js:622`, jamais appelée à cet endroit). Un refus donné puis perdu (pop-up annulé) n'est pas mémorisé. Correctif : lire `objectifs_refus` dans `rattachement`.

**L09 Plusieurs sommets.** ✅ `parentId = null` autorisé, `nextPosition` (`o.js:595`) ; les racines sont triées par position (`ar.js:~217`).

**L10 Délier.** ✅ `lier(…, null)` (`o.js:604-607`) ; zone « Délier » (`ar.js:76,86`), active seulement si l'objectif a un parent.

**L11 Dates parent/enfant incohérentes.** Attendu : signaler (enfant qui finit après le parent, parent plus court que ses enfants). Actuel ⚠️ : aucune vérification ; « Prolonger » décale un objectif sans toucher au parent (`o.js:657-669`). Correctif : indicateur discret sur la carte parent, sans modifier les dates en silence.

**L12 Carte « N objectifs » comme cible.** ✅ `openGroup` demande quel objectif reçoit (`ar.js:83`) ; en appui long, elle propose l'objectif à déplacer (`ar.js:100-103`).

**L13 Rattacher au parent actuel.** ✅ `link` sort si `pid === o.parentId` (`ar.js:41`).

**L14 Objectif d'un autre compte.** ✅ `rowOf` filtre toujours par `userId` (`o.js:533-537`). Partage : voir P07.

## 3. États

**E01 Atteint avec enfants non atteints.** Règle à trancher par Émilien (proposition : un objectif n'est atteint que si ses enfants le sont, sinon « atteint avec reste » signalé). Actuel ⚠️ : `status` ne dépend que de ses propres semaines (`o.js:568`) ; un sommet atteint est archivé (`o.js:629`) alors que ses enfants sont ouverts ; ils restent visibles.

**E02 Comment marquer atteint.** Actuel ⚠️ : le seul moyen est de cocher TOUTES les semaines une à une (`semaine`, `o.js:637-649` ; `cr.js:529`) : 100 semaines, 100 touchers. Correctif : « Marquer atteint » qui coche les semaines restantes après confirmation.

**E03 Abandonner.** Attendu : action + état atténué. Actuel ❌ : le rendu connaît `abandoned` (`o.js:567`, `ar.js:27`, CSS `.ar-dropped`) mais aucune route ni bouton ne le pose (seule la démo l'écrit, `seed-staging.js:420`). Correctif : `PUT /objectifs/:id/abandon` (bascule) + entrée dans le détail.

**E04 Abandon d'un parent avec enfants.** Actuel ❌ (dépend de E03). Correctif : demander « abandonner aussi ses N objectifs ? » ; défaut non (les enfants deviennent sommets), jamais d'abandon en cascade silencieux.

**E05 Réactivation.** Actuel ❌ (dépend de E03). Correctif : même bascule.

**E06 Atteint puis décoché.** Actuel ⚠️ : `attainedAt` est retiré (`o.js:645`) mais la ligne `objectifs_signaux` déjà écrite reste ; une nouvelle atteinte réécrit un signal (doublon dans l'apprentissage anonyme). Correctif : marquer `meta.signalSent`.

**E07 Futur, présent, passé.** ✅ l'état est recalculé à chaque rendu (`stateOf`, `ar.js:27`). Limite : pas de rendu à minuit ; mise à jour au prochain `refresh` ou redimensionnement.

**E08 Échéance dépassée, non atteint.** Actuel ⚠️ : placé dans la case d'aujourd'hui (`bucketOf`, `ar.js:157`), état « En cours » ; aucun signe de retard. Correctif : libellé « En retard » dans `arCardMeta`.

**E09 Semaines futures cochées.** Actuel ⚠️ : `semaine` ne vérifie pas la date : un objectif futur peut être atteint avant son début. Correctif : refuser les semaines dont `startDate > aujourd'hui`.

**E10 Archives.** ✅ racine atteinte `archived` ; un enfant atteint d'une racine non atteinte reste visible (`o.js:629`).

## 4. Temps

**T01 Périodes globales.** Attendu : réglage unique Réglages > Préférences > « Périodes ». Actuel ❌ : n'existe pas ; constantes `PER_YEAR = 13`, `PER_DAYS = 28` (`ar.js:151`) et `periodWeeks` par objectif (`o.js:26`). Correctif : réglage utilisateur lu par l'arbre et par le pont.

**T02 Changer le réglage avec objectifs existants.** Attendu : tout se restructure, avec confirmation. Actuel ❌ (dépend de T01). Points d'attention : `stepsJson` (périodes + semaines cochées) est stocké par objectif ; les semaines faites doivent survivre ; aucun texte perdu (T10). Correctif : traiter les périodes globales comme une grille de LECTURE (cases recalculées à l'affichage), `stepsJson` intact.

**T03 Objectif sur plusieurs périodes.** Attendu : un objectif court occupe des périodes entières, un long s'étale. Actuel ❌ : une carte occupe UNE case, celle de l'échéance (`ar.js:157`) ; un objectif de 6 mois n'apparaît pas sur ses 7 périodes. Correctif : bande continue sur les cases couvertes, entre début et échéance.

**T04 Plusieurs années.** ✅ `rowKey` par année (`ar.js:154-155`), lignes de l'objectif le plus ancien (zoom Tout) au plus lointain + 1 an.

**T05 Année bissextile, 53 semaines.** ✅ la période 13 absorbe les jours 365-366 (`Math.min(PER_YEAR, …)`, `ar.js:153`) ; les semaines d'un objectif partent de sa date de début, pas des semaines ISO (`splitPeriods`, `o.js:107-133`).

**T06 Fuseau et changement d'heure.** ✅ calculs en UTC pur (`addDays`, `daysBetween`) ; « aujourd'hui » serveur = fuseau envoyé par le client (`dates.userToday`, `dates.js:146`) ; client en local (`dayIso`, `ar.js:26`). Écart possible seulement sans l'en-tête de fuseau.

**T07 Échéance au bord de période.** ✅ jours 0-27 = P1, 28-55 = P2… (`periodOf`, `ar.js:152-155`) ; le 31 déc. tombe en P13.

**T08 Plusieurs objectifs, même case.** ✅ une carte « N objectifs » (`mergedCard`, `ar.js:105-117`), état = le plus proche d'aujourd'hui (`mergedState`, `ar.js:94`) ; dépliée, ils s'empilent (`arStack`).

**T09 Ligne illisible.** Actuel ⚠️ : `shape` fait `JSON.parse(r.stepsJson)` sans garde et lit `periods[0]` (`o.js:555-558`) : une seule ligne corrompue fait échouer `liste` entière (500) et vide l'écran. Correctif : `try/catch` par ligne dans `liste`, ligne ignorée avec `console.warn`.

**T10 « Régler la durée ».** Actuel ⚠️ : les périodes futures sont redécoupées et leurs textes d'étape remis à vide (`o.js:685`) sans le dire ; les semaines cochées futures sont perdues. Contraire à « jamais de modification silencieuse ». Correctif : confirmation « les textes des périodes à venir seront effacés », ou reprise par rang.

**T11 Prolonger (bilan).** Actuel ⚠️ : décale les périodes suivantes et l'échéance (`o.js:657-669`) ; le parent n'est pas prolongé (L11).

**T12 Reste de moins d'une semaine.** ✅ fusionné dans la période précédente (`o.js:121-124`).

**T13 Début dans le futur.** ✅ permis ; état « À venir » (pointillé) ; tâches de semaine 1 datées d'après `startDate` (`o.js:525`).

**T14 Échéance à 50 ans.** Actuel ⚠️ : `endDate` n'a pas de plafond ; 52 semaines x 80 périodes passe `splitPeriods`. L'arbre génère une rangée par période jusqu'à l'objectif + 1 an (`ar.js:~263`) : environ 650 rangées par colonne, écran très lent. Correctif : plafond à 10 ans (C07), rangées vides regroupées au-delà d'un horizon.

## 5. Affichage

**A01 Activité sans objectif.** ✅ pas de colonne (`ar.js:~198`) ; le premier objectif se crée par la barre « Nouvel objectif… ».

**A02 Aucun objectif.** ✅ « Aucun objectif pour l'instant. » (`ar.js:205`) ; à une échelle vide : « Aucun objectif à cette échelle. »

**A03 Un seul objectif.** ✅ une colonne, une carte, la ligne « Aujourd'hui » et ses cases vides.

**A04 100+ objectifs.** Actuel ⚠️ : `liste` fait des requêtes par ligne (activité, parent, tâches : `shape`, `o.js:560-563`) et le client reconstruit tout le DOM à chaque rendu (`render`, `ar.js:195`) ; pas de pagination. Correctif : une requête pour les activités, cache des parents ; rendu différé des rangées hors écran au-delà de 300 cartes.

**A05 Très long titre.** ✅ 140 caractères max, `overflow-wrap: anywhere` (`objectifs-arbre.css:20`) ; la carte grandit en hauteur.

**A06 Activité supprimée ou quittée.** Actuel ⚠️ : `liste` ne filtre ni `active` ni l'appartenance (`o.js:626-627`) ; l'activité supprimée (`active = 0`, `routes/activities.js:524,591`) garde sa colonne ; si l'utilisateur l'a quittée, `color` vaut null (repli `#674EA7`, `ar.js:30`) et la bulle ouvre une page 2 vide. Correctif : exclure les objectifs d'activités inactives (conservés en base) ; activité quittée : à décider (archive).

**A07 Renommée, couleur changée.** ✅ lus en direct à chaque `shape` (`o.js:560`).

**A08 Secteur déplacé de pôle ou supprimé.** Actuel ⚠️ (non vérifié par test) : l'objectif garde `meta.category` ; `duree` et `bilan` rappellent `bridge` (`o.js:672,688`) avec cette clé ; si le secteur a été supprimé, `ensurePlan` peut recréer un plan fantôme. Correctif : tester, et vérifier l'existence du secteur avant `writeBridge`.

**A09 Plus de 2 colonnes.** ✅ défilement horizontal, bulles déplacées en phase (`ar.js:~278`), deux colonnes visibles de même largeur.

**A10 Très petit écran 360 px.** ✅ largeurs calculées d'après `innerWidth` (`ar.js:~207-210`) ; à confirmer en capture (non faite ici : dossier sans code).

**A11 Bureau 1024 px et plus.** ✅ `arWide`, jusqu'à 1400 px (`ar.js:196,207`).

**A12 Zoom par niveau et pincer.** Attendu : activité, pôle, secteur ; toucher/pincer. Actuel ❌ : seul le zoom de temps existe (`zoomBar`, `ar.js:136-145`) ; l'arbre ne montre que des activités ; pas de geste de pincer ; la profondeur passe par « + / − » de dépliage. Correctif : après C11, regrouper par pôle/secteur et ajouter le pincer via un composant commun.

**A13 Zoom Période / Année / Tout.** ✅ trois échelles, une case par période ou par année (`rowKey`, `ar.js:154`) ; changer d'échelle remet le dépliage à zéro.

**A14 Passé caché par défaut.** ✅ seuls présent et futur, ancêtres conservés (`visibleSet`, `ar.js:128-135`) ; « Tout » montre le passé.

**A15 Grille alignée, une ligne « Aujourd'hui ».** ✅ rangées communes à toutes les colonnes, cases grises vides (`goalsGridCell--empty`), `todayPut` garantit une seule ligne (`ar.js:~270-277`).

## 6. Responsables

Aucun de ces cas n'existe : `user_objectives` n'a ni responsable ni partage, et chaque lecture est filtrée par `userId` (`rowOf`, `o.js:533` ; `liste`, `o.js:627`). Un mécanisme voisin existe pour les objectifs hebdomadaires de l'arbre périodique (`goal_weekly.assignedUserId`, `routes/goals.js:492`) ; il peut servir de modèle.

**P01 Responsable (concept).** Attendu : un membre de l'activité partagée, un par élément, hérité. Actuel ❌. Correctif : colonne `assigneeId` (nullable), droits calculés dans `rowOf`.

**P02 Membre qui quitte l'activité.** Attendu : ses objectifs retournent au propriétaire de l'activité, jamais perdus. Actuel ❌ (ils restent liés à son compte, invisibles pour les autres).

**P03 Responsable supprimé (compte).** Attendu : retour au propriétaire. Actuel ❌ ; voir D05 : aujourd'hui les objectifs ne sont même pas effacés.

**P04 Héritage conflictuel.** Attendu : le responsable le plus proche gagne ; un enfant sans responsable hérite du parent. Actuel ❌.

**P05 Propriétaire = responsable.** Attendu : permis, sans doublon d'affichage. Actuel ❌.

**P06 Droit de suppression.** Attendu : le propriétaire garde la suppression ; le responsable crée et modifie sa branche. Actuel ❌ (aucune suppression, L04).

**P07 Visibilité entre membres.** Attendu : les membres d'une activité partagée voient les objectifs de l'activité. Actuel ❌ : chacun ne voit que les siens ; deux membres ont deux arbres distincts pour la même activité. Cas le plus lourd de la catégorie (modèle de données).

## 7. Hors ligne et synchronisation

**H01 Création hors ligne.** Attendu : file d'attente comme la capture hors ligne. Actuel ❌ : `public/offline-queue.js` ne couvre pas les objectifs ; sans réseau le pop-up affiche une erreur générique (`cr.js:376`) et le texte saisi est perdu à la fermeture.

**H02 Conflits d'édition, deux appareils.** Actuel ⚠️ : les modifications fines (une semaine, un lien) sont atomiques côté serveur (SQLite synchrone), donc sans perte ; mais `duree` et `bilan` réécrivent tout `stepsJson` (`o.js:687`) : le dernier appareil gagne.

**H03 Suppression concurrente.** Actuel ⚠️ : la suppression n'existe pas (L04) ; une action sur un objectif disparu donne 404 (« Objectif introuvable. ») mais le client avale l'erreur sans message (`cr.js:529`, `.catch(function () {})`).

**H04 Données périmées.** Actuel ⚠️ : l'arbre se recharge à l'ouverture et après une action (`refresh`, `ar.js:286`) ; pas de rechargement au retour dans l'application ni périodique.

## 8. Données

**D01 Anciens objectifs « étapes ».** Actuel ⚠️ : renommage « Étape N » vers « Objectif N » fait seulement pour la démo (`renameDemoSteps`, `seed-staging.js:433`) ; les objectifs réels créés avant le 5 nov. gardent « Étape N » dans leurs titres de période ; le code garde le vocabulaire interne (`parentRel`, commentaires, `o.js:35,377`). Correctif : migration idempotente sur toutes les lignes ; le champ interne peut rester.

**D02 Objectifs orphelins.** ✅ un `parentId` inconnu se comporte comme un sommet (`o.js:628-629`, `ar.js:~216`).

**D03 Plans annuel, périodique, hebdomadaire existants.** Actuel ⚠️ : l'arbre de la page 1 ne lit que `user_objectives` ; une activité qui n'a que des plans hérités (`goal_periods`) n'y a pas de colonne ; seul l'arbre périodique (page 2) les montre. Le pont écrit dans l'autre sens (objectif vers `goal_periods`, `o.js:445-464`). Correctif : décider si les plans hérités apparaissent comme objectifs dans l'arbre.

**D04 Seed de démonstration.** Actuel ⚠️ : idempotent (`meta.demo`) et réservé à staging (`shouldSeed`) ; couvre le compte d'Émilien et les deux premiers profils fictifs (`slice(0, 2)`, `seed-staging.js:405`) ; les objectifs de démo n'ont pas de pont (`noBridge` : l'arbre périodique reste vide). Aucun compte nommé « demo » n'est ciblé. Correctif : documenter, ou ajouter ce profil à la liste.

**D05 Suppression de compte.** Attendu : tout effacer (Loi 25). Actuel ❌ : `user_objectives` et `objectifs_refus` ne figurent pas dans `PERSONAL_NO_FK` (`accountdeletion.js:11-17`) et n'ont pas de clé étrangère : les objectifs et leurs titres survivent à la suppression du compte. Correctif : ajouter `['user_objectives','userId']` et `['objectifs_refus','userId']` ; vérifier `test/privacy-tables-test.js`.

**D06 Export des données.** Attendu : les objectifs figurent dans l'export personnel. Actuel ❌ : `user_objectives` est absent de `server/lib/dataexport.js`. Correctif : les ajouter (titres, dates, état, parent).

## 9. Liens avec les tâches

**K01 Tâche d'un objectif supprimé.** ✅ pas de suppression d'objectif aujourd'hui ; les tâches sont de vraies tâches de l'activité et `tasksOf` ignore les identifiants disparus (`o.js:549-553`). À conserver quand L04 sera construit.

**K02 Objectif archivé, tâches ouvertes.** Actuel ⚠️ : rien ne ferme ni ne signale les tâches ouvertes d'un objectif atteint ou abandonné. Correctif : signaler, ne pas fermer en silence.

**K03 Tâche sans objectif.** ✅ les tâches sont indépendantes (`goalstasks`) ; le lien n'est qu'une liste d'identifiants dans l'objectif (`taskIdsJson`).

**K04 Objectif sans tâche.** ✅ gratuit : aucune tâche générée (`tasksAllowed`, `o.js:504`) ; la carte montre 0 tâche.

**K05 Lien tâche vers objectif.** Actuel ⚠️ : seules les tâches de la semaine 1 créées à la validation sont liées (`o.js:524-528`) ; une tâche ajoutée plus tard n'est jamais rattachée à l'objectif. Correctif : champ d'objectif sur la tâche, sans nouvelle interface par défaut.

**K06 Tâche supprimée ou terminée.** ✅ compteur calculé en direct (`weekTasks`, `o.js:562,571`).

## 10. IA

**I01 Rattachement en échec.** ✅ `rattAi` renvoie `undefined` sur toute erreur et `rattachement` retombe sur les règles (`o.js:400-405,413-414`).

**I02 Rattachement lent.** Actuel ⚠️ : délai coupé à 15 s (`aimodels.js:11`, `rapprochement`) ; le pop-up attend sans indicateur vérifié. Correctif : indicateur « Recherche d'un rattachement… » et délai ramené à 6 s pour cette fonction.

**I03 Réponse incohérente.** ✅ identifiant inconnu ou JSON illisible : ignoré, repli sur les règles (`o.js:403-405`) ; un id d'une autre activité est impossible (liste de candidats déjà filtrée).

**I04 Budget atteint.** ✅ `aiAllowed` (plafond mensuel global et 1 appel gratuit par mois, `o.js:268-274`) ; `proposer` retombe sur un découpage fixe ; `lire` répond 403 « disponible avec Expansion ».

**I05 Quota gratuit partagé.** Actuel ⚠️ : l'unique appel IA gratuit du mois est partagé entre découpage, lecture et rattachement (`o.js:269`) ; le rattachement, appelé en premier, consomme l'appel (`o.js:392`) : le découpage en étapes retombe alors sur le repli. Correctif : réserver le rattachement aux règles pour le gratuit.

**I06 Pas de clé IA.** ✅ `rattAi` renvoie `undefined` sans clé ; `lire` répond 503 (`o.js:320`).

## 11. Comptes

**S01 Compte gratuit.** ✅ arbre, création, rattachement par règles ; ni tâches générées ni lecture de photos (`o.js:213,321`).

**S02 Expansion expirée.** ✅ `tasksAllowed` est réévalué à chaque appel ; objectifs et tâches existants conservés.

**S03 Activité partagée.** ❌ voir P01-P07.

**S04 Profil fictif.** ✅ les profils fictifs reçoivent des objectifs de démonstration sur staging (`seed-staging.js:405`).

## 12. Cas à corriger, par priorité

Proposition, rien n'a été codé.

**P1**
1. **D05 + D06** : suppression de compte et export oublient les objectifs (obligation légale Loi 25). Correctif court, risque faible.
2. **L03** : refuser un parent d'une autre activité (serveur et client). Correctif de quelques lignes.
3. **C12** : le 11e objectif d'une activité perd silencieusement son pont ; à arbitrer avec C11 (un secteur par objectif contredit la règle de niveau).
4. **E03** : abandon impossible (aucune route ni bouton) alors que le rendu l'attend.
5. **T01 + T02** : périodes globales absentes ; l'arbre les fixe en dur à 13 x 28 jours.
6. **P01 + P07 (S03)** : responsables et visibilité des activités partagées ; changement de modèle de données.

**P2**
7. **T09** : une ligne corrompue fait tomber toute la liste (500).
8. **T10** : « Régler la durée » efface des textes sans le dire.
9. **C11 + A12** : niveau de l'objectif et zoom par niveau.
10. **L04 + K01** : route de suppression d'objectif (propriétaire seul, enfants remontés).
11. **E01, E02, E04, E05** : atteint avec enfants, marquer atteint, abandon avec enfants, réactivation.
12. **T03, T14, C07** : objectifs sur plusieurs périodes, plafond des échéances lointaines.
13. **A04, A06, D03** : performance 100+ objectifs, activités supprimées, plans hérités sans colonne.
14. **C01, C05, C13, H01, I05, L05, L11, P02-P04, P06** : périodes à la création, échéance passée, activité orpheline, file hors ligne, quota IA, parent atteint, dates parent/enfant, règles de responsables.

**P3** : C02, C10, C14, C15, E06, E08, E09, L06, L08, T11, A08, H02-H04, D01, D04, K02, K05, I02, P05.

## 13. Objectifs macro (décision d'Émilien, 6 nov. 2026)

Un objectif MACRO englobe plusieurs sous-objectifs plus précis (micro) qui peuvent appartenir à DIFFÉRENTES activités (zones différentes, objectif commun). Le macro est commun au-dessus des activités ; chaque micro reste dans UNE seule activité. Ce modèle REVOIT la règle L03 : le parent d'une autre activité n'est autorisé que si ce parent est un macro. Tout est dans `server/lib/objectifs.js` (colonne `isMacro`, migration sans perte) ; l'affichage (carte large neutre qui chevauche les colonnes) est fait par l'agent de l'arbre à partir des champs de `liste()` : `isMacro`, `macroActivities[]` (id, name), `macroEmpty`, `macroAllAbandoned`, `macroChildren`, `status`, `progress`.

Modèle : le macro garde l'`activityId` de sa création (activité d'attache, colonne NOT NULL) ; ses activités affichées sont celles de ses enfants dont l'activité est active (un enfant d'une activité supprimée est archivé : ignoré). Un macro n'a pas de pont vers l'arbre périodique (ses enfants portent les plans).

Règles (toutes testées dans `test/objectifs-graves-test.js`, section 6) :
- **M01 L03 revu** : parent d'une autre activité accepté seulement si le parent est un macro (serveur 400 sinon ; arbre : cibles d'une autre activité encore non valides côté glisser-déposer, à ouvrir aux macros par l'agent de l'arbre). ✅ serveur.
- **M02 Garde** : un macro est un sommet ou l'étape d'un autre macro, jamais l'étape d'un objectif ordinaire ; un objectif étape d'un objectif ordinaire ne peut pas devenir macro (`PUT /objectifs/:id/macro`). ✅
- **M03 Macro sans enfant** : reste visible, signalé (`macroEmpty`). ✅
- **M04 Enfant déplacé vers une autre activité** (`PUT /objectifs/:id/activite`) : autorisé seulement s'il garde un parent macro (ou n'a pas de parent) et n'a pas d'enfants ordinaires ; son pont suit la nouvelle activité. ✅
- **M05 Activité supprimée avec macro** : ses enfants sortent du macro (archivés), le macro reste avec ses autres enfants ; sans aucun enfant actif il reste visible et signalé. ✅
- **M06 Macro à cheval sur des colonnes non adjacentes** : accepté (enfants des activités A1 et A3 sans A2). ✅ (affichage : agent de l'arbre)
- **M07 Achèvement** : atteint quand tous ses enfants non abandonnés le sont ; calcul à l'affichage (`liste`, `get`) et route `GET /objectifs/:id/macro`. ✅
- **M08 Tous les enfants abandonnés** : jamais « atteint », signalé (`macroAllAbandoned`). ✅
- **M09 Retour en objectif ordinaire** : refusé tant que le macro englobe des objectifs d'autres activités. ✅
- **M10 Création** : à la création, si des objectifs RESSEMBLANTS existent dans d'autres activités (règles de ressemblance gratuites), `POST /objectifs/rattachement` renvoie `macro.candidates` (avant/après, modifiable) ; rien n'est écrit sans validation : `POST /objectifs/macro { title, childIds }` crée le macro et rattache les objectifs choisis. ✅ serveur ; interface de la proposition (étape du panneau de création) : à brancher.
- **M11 Macro dans un macro** : par la fusion, interdit (un macro ne se range pas dans un autre par cette voie) ; par `lier`, permis.

## Réglage des périodes : portée actuelle (6 nov. 2026, décision d'Émilien) : ANNULÉ, voir section 14

Le réglage global « Périodes » (Réglages > Préférences : 4 × 13, 13 × 4 par défaut, 26 × 2 ou 52 × 1) ne s'applique pour l'instant qu'à l'ARBRE DES OBJECTIFS et aux OBJECTIFS de l'utilisateur (`user_objectives` : création, restructuration de tous les objectifs sans rien supprimer, anciennes périodes gardées dans `meta.prevPeriods`). L'arbre périodique de la page 2, le calendrier de la page 3 et les statistiques (axes P1 à P13) restent à 13 périodes de 4 semaines : ils viennent du moteur de plans d'activité (`server/lib/goals.js`, `PERIODS_PER_CYCLE = 13`, `goal_periods`), PARTAGÉ entre les membres d'une activité, alors que le réglage est personnel. Ne pas modifier ce moteur tant qu'Émilien n'a pas décidé comment un réglage personnel cohabite avec un plan d'activité commun.
### 13 bis. Macros à chaque niveau, enchaînés, échéance (envoi 7, 6 nov. 2026)

Un macro relie plusieurs colonnes à CHAQUE niveau : activités, pôles d'une activité ou secteurs d'un pôle. Son `level` est celui des colonnes reliées ; ses enfants sont du même niveau (sinon 400). Plusieurs macros par arbre, facultatifs (0..n). Ils s'ENCHAÎNENT : un macro peut avoir un macro pour enfant. `liste()` et `get()` exposent `macroLevel`, `macroColumns[]` (niveau, activité, pôle, secteur reliés, à travers les macros enchaînés), `childMacroIds[]`, `macroActivities[]`.

- **M12 Macro d'un macro** : un macro (A+B) devient l'étape d'un macro (A+B)+C ; colonnes = union des enfants à travers la chaîne. ✅ testé.
- **M13 Macro sur colonnes non adjacentes** : A et C sans B reliés ; l'affichage chevauche la colonne intermédiaire (agent de l'arbre). ✅ serveur.
- **M14 Cycle macro <-> macro** : refusé (même garde que tout cycle parent/enfant, 400), y compris un macro son propre parent. ✅ testé.
- **M15 Niveau commun** : macro de niveau pôle = pôles d'une activité ; un enfant d'un autre niveau est refusé. Un macro n'a pas de colonne propre (pas de pôle ni de secteur exigé à sa création). ✅
- **M16 Échéance du macro** : au moins aussi lointaine que celle de chacun de ses enfants. Le serveur refuse (400, message court avec les deux dates) : création d'un enfant plus lointain, rattachement (`lier`), prolongation d'un enfant (bilan « prolonger »), modification de l'échéance d'un enfant au-delà du macro, modification de l'échéance d'un macro en deçà de son enfant le plus lointain (`PUT /objectifs/:id/echeance`). L'interface propose de repousser l'échéance du macro (à brancher par l'agent de l'arbre). Un macro enfant d'un macro respecte la même règle vis-à-vis de son parent. ✅
- **M17 Suppression d'un enfant ou d'un macro intermédiaire** : décision documentée : RIEN en cascade ; la suppression confirmée détache les enfants, qui deviennent des SOMMETS (jamais remontés au grand-parent, car la règle d'activité ou de niveau pourrait ne pas tenir sous lui) ; sans confirmation : 409 avec la liste. Le macro parent reste, sans l'enfant supprimé ; l'échéance du parent n'est pas réduite. ✅
- **M18 Changement du réglage des périodes** : les échéances (macros comprises) ne changent pas ; les cases (périodes et semaines) sont recalculées, textes et états conservés (`restructure`). ✅
- **M19 Activité unique** : aucun macro d'activités proposé (il faut au moins 2 colonnes reliables). ✅

### 13 ter. Macros : extension sur colonnes et titre commun (6 nov. 2026)

- **M20 Extension sur colonnes** : un macro s'étend sur les colonnes de ses enfants (`macroColumns`, par niveau activité / pôle / secteur) ; relier un objectif d'une autre colonne étend le macro. ✅
- **M21 Délier = retirer l'extension** : délier un enfant (`PUT /objectifs/:id/parent` sans parent) le retire du macro ; la colonne n'est plus reliée si c'était son dernier objectif ; rien n'est supprimé. ✅ testé.
- **M22 Échéance du macro** : toujours au moins celle de ses enfants (création, rattachement, prolongation, modification) ; délier un enfant ne raccourcit pas le macro. ✅
- **M23 Titre commun** (`POST /api/objectifs/macro/titre` { childIds[] ou columns[] } -> { title, source: 'ia' | 'titres' }) : UNE ligne de 140 caractères au plus, à partir des deux objectifs les plus récents par colonne reliée ; ne crée rien (le client enregistre ensuite par `POST /objectifs/macro` avec le titre modifiable) ; repli sans IA = titres joints par « · » ; cache par hash des titres ; crédit gratuit et plafond global appliqués (crédit épuisé : aucun appel). ✅

- **M24 Grands objectifs et IA : trois voies** (décision d'Émilien, 6 nov. 2026) : résumé annuel et titre du macro. (1) Compte gratuit (par défaut) : le grand objectif est l'ACCUMULATION des titres reliés (liste ou « · »), aucun appel IA, le crédit gratuit n'est jamais consommé par ces fonctions, `source: 'titres'`. (2) Expansion payante : IA intégrée (modèle léger), cache agressif (jeu de titres inchangé = aucun appel, 7 jours), `source: 'ia'`. (3) IA personnelle branchée par « Connecter mon IA » : Noèsis ne rappelle pas Anthropic, `iaPersonnelle: true` ; l'IA lit l'arbre avec l'outil `arbre_objectifs` du connecteur (lecture seule, compte du jeton seulement : id, titre, activité, début, échéance, `parent_id`, `grand_objectif`, `macro`, `abandonne`, `atteint`) ; aucune écriture nouvelle (les outils d'écriture gratuits existants ne touchent que les objectifs de période et les tâches). ✅ testé.

- **M25 Ordre des colonnes : base mémorisée, présentation dérivée** : l'ORDRE DE BASE de l'utilisateur est mémorisé (`objectifs_ordre` : userId, level, scopeKey, orderJson ; scope '' pour les activités, activityId pour les pôles, activityId:poleKey pour les secteurs), jamais modifié par un macro ; `PUT /objectifs/ordre` ne sert qu'à le changer plus tard (colonnes validées : elles doivent appartenir à l'utilisateur ; colonnes absentes de la liste = en fin, dans l'ordre existant). `GET /objectifs/ordre?level=&scope=&anchor=` renvoie `base` et `order` : l'ordre de PRÉSENTATION, DÉRIVÉ à chaque lecture des macros existants (colonnes reliées voisines ; le groupe se place à la colonne ancre, sinon à la première du groupe ; l'ordre relatif des autres est conservé). `POST /objectifs/macro` et `PUT /objectifs/:id/macro` (corps `anchor`) renvoient aussi cet ordre dérivé (`order`, `orderLevel`, `orderScope`) sans rien écrire. Effacé avec le compte, présent dans l'export (`objectiveColumnOrder`). ✅
- **M26 Délier = retrouver l'ordre d'origine ; refusion possible** : délier un enfant ou supprimer le macro rend aux colonnes leur ordre de base (rien n'était écrit) ; fusionner, délier puis refusionner dans un autre ordre fonctionne. ✅ testé.
- **M27 Colonne déjà reliée** : une colonne déjà reliée à un macro ne peut pas être reliée à un AUTRE macro séparé : 400 « Délie d'abord ce macro » (fusion, `lier`, création d'un enfant), contrôlé avant toute création ; déplacer le seul objectif d'une colonne vers un autre macro reste permis (la colonne quitte le premier macro). ✅
- **M28 Chaînage de groupes** : relier un macro à un macro existant fait entrer le groupe entier (colonnes du macro enfant comprises) ; les trois colonnes se suivent dans l'ordre dérivé ; une colonne du groupe ne rejoint pas un macro séparé. ✅

- **M29 Supprimer un macro (croix du mode édition)** : le macro disparaît, ses enfants redeviennent des objectifs NORMAUX de leurs activités (colonnes séparées de nouveau), jamais supprimés en cascade, jamais orphelins, leurs propres sous-objectifs intacts ; sans confirmation : 409 avec la liste ; macros chaînés : supprimer l'enfant détache ses objectifs, le parent reste. Un macro PASSÉ (fusion définitive) se supprime aussi ; seul « délier » un enfant d'un macro passé reste refusé (« Fusion passée : impossible de délier. »). Une échéance illisible ne donne jamais d'erreur serveur (aucun état de fusion). Les erreurs inattendues des routes d'objectifs affichent « Impossible pour le moment : réessaie dans un instant. » (journal serveur : route et cause). ✅

## 14. Modèle simplifié du temps et de la hiérarchie (validé par Émilien, 6 nov. 2026, envoi C)

REMPLACE les anciennes sections 14 (niveaux de temps choisis) et 14 bis (rattachement entre niveaux). Pas de réglage de périodes, pas de niveau de temps choisi : le NIVEAU se déduit de l'échéance (case = année puis période 13 × 4) et le TYPE d'un objectif de sa STRUCTURE (a au moins un sous-objectif = « grand objectif »).

- **N01 Périodes fixes** : 13 périodes de 4 semaines par an, constante unique (`server/lib/objectifs-temps.js`) ; routes `/objectifs/periodes` et `/objectifs/:id/niveau-temps` supprimées ; colonnes `users.objPerYear / objPeriodWeeks / objPeriodsAsked` et `user_objectives.timeLevel` conservées en base, inutilisées. ✅
- **N02 Niveau déduit** : `timeLevel` exposé par `get()` / `liste()` est calculé depuis l'échéance (<= 13 semaines : période ; <= 3 ans : année ; au-delà : pluriannuel), pour l'affichage seulement ; un `timeLevel` envoyé est ignoré ; aucun refus de cohérence niveau / échéance. ✅
- **N03 Type = structure** : `isBig` (a au moins un sous-objectif) exposé par `get()` / `liste()`. ✅
- **N04 Seule règle de hiérarchie** : l'échéance du parent est au moins celle de l'enfant (macros comprises) ; refus 400 à la création d'un enfant, au rattachement (`lier`), à la prolongation (bilan « prolonger »), à la modification de l'échéance de l'enfant (au-delà du parent) et du parent (en deçà de son enfant le plus lointain). Messages courts : « dépasse celle du macro / de son parent ». Aucune notion de niveau : un enfant de longue durée sous un parent qui finit plus tard est accepté. ✅
- **N05 Proposition de rattachement** (règles de ressemblance et IA) : candidats = objectifs de la même activité dont l'échéance est au moins celle du nouvel objectif ; la restriction « même activité » (L03) reste, sauf macro. ✅
- **N06 Parent supprimé** : l'enfant est détaché (sommet), rien en cascade. ✅
- **N07 Données existantes** : aucun contrôle rétroactif ; un ancien rattachement dont le parent finit avant l'enfant reste tel quel jusqu'à la prochaine modification de l'un des deux.

## Arbre des objectifs : niveaux de temps et ouverture (6 nov. 2026)

Trois arbres, du plus large au plus court, un par niveau de temps (`timeLevel`, déduit de l'échéance par le serveur, aucun réglage) : PLURIANNUEL (colonnes = activités, une rangée = un bloc de 5 ans « 2026-2030 », horizon 5 à 10 ans, passé compris), ANNUEL (colonnes = pôles d'une activité, une rangée = une année, rien d'autre que les objectifs annuels), PÉRIODE (colonnes = secteurs d'un pôle, une rangée = une période, 13 × 4 semaines comme l'arbre périodique). Un arbre ne montre QUE les objectifs de son niveau de temps, sauf les macros qui relient des colonnes (carte large neutre). Le pincer (ou Ctrl + molette) descend ou remonte d'un niveau ; la bulle d'une colonne descend aussi. Repères : ovale pour un bloc ou une année, rond pour une période (l'année s'affiche en ovale à son premier rang). Un objectif de niveau annuel ou période est placé dans le pôle (secteur) où il a été créé ; sans pôle (secteur), dans le premier.
OUVERTURE : au niveau le plus macro qui existe pour l'utilisateur (pluriannuel s'il y en a au moins un, sinon annuel, sinon période ; l'activité qui porte le plus d'objectifs de ce niveau, puis son pôle le plus chargé). Aucun objectif : état vide. Recalculée à chaque ouverture de l'onglet et à chaque retour sur la page (statistiques, activité, calendrier) ; ni le zoom ni le défilement ne sont mémorisés.

## Arbre : calendrier, appui long = Étendre, compaction, macros chaînés (6 nov. 2026)

- **Dernier niveau (secteurs)** : toucher une case OCCUPÉE (ou le repère rond) d'une période ouvre le calendrier (page 3) de cette période (ouverture existante) ; case vide = ajouter un objectif pré-rempli. Le détail complet d'un objectif de secteur s'ouvre depuis le calendrier : lien « Détail de l'objectif » dans le panneau de l'objectif périodique (description, rattachement, Avancé, abandonner, supprimer).
- **Appui long relâché sur place = mode ÉTENDRE, à tous les niveaux** : la carte devient large, toucher une colonne du même niveau (activités, pôles d'une activité, secteurs d'un pôle) l'inclut ou l'exclut ; la barre « Nouvel objectif… » devient « Enregistrer » pleine largeur (grisée tant que rien n'a changé) ; ✕ annule. À l'enregistrement : un macro (objectif commun, une ligne) dont le titre vient de `POST /api/objectifs/macro/titre` (modèle léger si IA, sinon titres joints par « · »), modifiable avant d'enregistrer ; ses enfants sont la carte de base et, par colonne ajoutée, ses deux objectifs libres les plus récents ; l'échéance du macro est la plus lointaine des enfants. Appui long sur un macro : mode Étendre en édition ; décocher une colonne la DÉLIE (ses objectifs quittent le macro). Une colonne sans objectif libre (non rattaché) ne peut pas être reliée : message visible, jamais de blocage muet. Le glisser reste le geste de maintien puis déplacement ; la carte « N objectifs » garde « Déplacer quel objectif ? ».
- **Rangées d'années et de blocs de 5 ans compactes** (gouttière 14 px, cases 40 px) : les cinq années d'un bloc tiennent à l'écran.
- **Macros chaînés** : un macro peut avoir un macro pour enfant ; les cartes larges s'empilent (le plus lointain en haut). « Repousser l'échéance du macro » : si l'enfant dépasse le macro, confirmation puis `PUT /echeance` ; refusé si le macro a lui-même un parent macro d'échéance plus proche (message du serveur affiché).

## Vue Tâches par journée (6 nov. 2026, modèle B ; tiroir abandonné)

Page 1 de la Feuille de route = sélecteur « Tâches | Objectifs » (Objectifs = l'arbre, ouvert au niveau macro réel). Vue Tâches = bande de la SEMAINE en haut (jours cliquables, `.goalsCal*` et `.cmpNav` de la page 3 : flèches ET balayage, R45-R46 ; le libellé du mois la déploie en calendrier du mois) puis la liste de la JOURNÉE choisie seulement (`GET /api/goals/today?today=<aujourd'hui>&day=<jour>`, `server/lib/goalstoday.js`). Code : `public/js/aujourdhui.js`.
- **J01 Aujourd'hui** : ce qui a été fait + le reste à faire (retards et sans date compris), compteur « faites / à faire ». ✅
- **J02 Jour passé** : lecture seule, ce qui a été fait ce jour-là (rien à cocher ni à modifier, boutons de modification masqués) ; la barre « Nouvelle tâche… » refuse l'ajout avec « Pas d'ajout dans un jour passé. ». ✅
- **J03 Jour futur** : les tâches prévues ce jour-là, modifiables (panneau d'édition de la ligne, qui change aussi la date, donc déplace) ; un ajout depuis la barre est daté de ce jour. ✅
- **J04 Journée sans tâche** : « Aucune tâche ce jour-là. » (« Rien pour aujourd'hui. » pour aujourd'hui) ; la bande reste affichée. ✅
- **J05 Semaine à cheval sur deux mois** : la bande affiche les sept jours ; le libellé du mois est celui du jeudi de la semaine (norme ISO) ; en mode mois, les jours des mois voisins sont grisés mais choisissables. ✅
- **J06 Changement de jour ou de fuseau** : « aujourd'hui » est le jour LOCAL de l'appareil (`localIso`) ; passé minuit, `today` envoyé au serveur change, la liste se recharge à la prochaine actualisation (6 s) ; un jour choisi garde sa date, et sa nature (passé / futur) est recalculée à chaque rendu. À SURVEILLER : la bande n'est repeinte qu'à une action (le cercle « aujourd'hui » peut rester sur la veille jusqu'au prochain toucher).
- **J07 Tâche déplacée vers un jour passé** : un ajout daté du passé est refusé (message J02) ; l'édition d'une ligne existante n'est pas bloquée par ce garde (À SURVEILLER : déplacer une tâche vers un jour passé la rend « en retard ») ; une tâche déjà datée dans le passé non faite reste « en retard » dans la liste d'AUJOURD'HUI, jamais dans la lecture seule du jour passé (qui ne montre que le fait).
- **J08 Tri « Objectif »** : les tâches de la journée choisie sont groupées par objectif hebdomadaire ; les objectifs dont l'échéance est la plus proche à partir de ce jour d'abord, puis les objectifs déjà échus (le plus récemment échu d'abord) ; les tâches SANS objectif restent visibles, en tête, sans groupe. ✅
- **J09 Tâche sans objectif** : visible dans tous les tris (en tête dans le tri « Objectif »). ✅

## Calendrier depuis l'arbre (7 nov. 2026)

- Niveau secteurs : toucher une case, VIDE ou occupée, ouvre le calendrier (page 3) au mois de la période (ouverture existante `openGoalsPeriodFromNotification`) ; « Ajouter un objectif périodique » s'y trouve. Case vide = calendrier (v994 « ajouter » remplacé à ce niveau ; la création reste possible aux autres niveaux et par la barre « Nouvel objectif… »).
- Arrivé de l'arbre, le calendrier ne propose plus ni changement de pôle ni de secteur (cadre du pôle : seule la flèche ‹ reste, elle est le retour) ; seul le MOIS change (flèches et balayage). Une seule flèche de retour ramène à l'arbre au même niveau, à la même colonne et au même défilement.
- Cas : mois sans objectif (la case ouvre le calendrier du mois, vide) ; secteur sans période dans le plan à ces dates : message « Aucune période du calendrier à ces dates », l'arbre reste ; retour d'arbre : niveau et défilement identiques.
- Non fait : depuis la vue macro, un toucher direct sur une case d'année ou de période vers son détail puis le calendrier en deux touchers (le parcours reste : bloc, années, secteurs, période).

## Couleurs de l'arbre (7 nov. 2026)

- Activité sans pôle : une seule colonne, couleur de l'activité ; étiquette non remplie (contour de la couleur, pastille, nom en blanc), cartes de la couleur pleine ; toutes les cartes à la couleur telle quelle.
- Plus de 5 pôles : `TMT.subProjectShade` ne fournit que 5 nuances ; à partir du 6e pôle les nuances se répètent (rang modulo 5). Les bulles gardent leur nom pour les distinguer.
- Pôle réordonné : la nuance suit le NOUVEAU rang (la nuance est fixée par le rang, pas par le pôle) ; cartes et bulles se recolorent ensemble.
- Pôle supprimé : les rangs se resserrent, les pôles restants reprennent les nuances 1 à n.
- Secteurs : jamais de couleur propre ; toutes les colonnes du niveau secteurs ont la nuance de leur pôle.

## Toucher une carte et mode édition (7 nov. 2026)

- Toucher une carte (pluriannuelle, annuelle, période) ne rouvre plus de panneau : on descend d'un niveau dans la branche de la carte (pluriannuel, années/pôles, secteurs, arbre périodique, calendrier).
- Crayon ✎ en haut à droite, sous « Objectifs » : mode édition. Les cartes tremblent (keyframes `tabJiggle` des volets) ; chaque carte d'un seul objectif et chaque macro porte la croix rouge ; les cartes regroupées (« N objectifs », résumé annuel) tremblent sans croix et ouvrent la liste pour choisir l'objectif.
- Toucher une carte en mode édition ouvre ses paramètres (détail existant : échéance, rattachement sous Avancé, abandon/réactivation). Les champs à ajouter sont dans `parametres-objectif.md`, en attente d'Émilien.
- Croix rouge : confirmation `TMT.ui.confirm` (« Supprimer », rouge) ; les objectifs rattachés sont listés puis détachés, jamais supprimés.
- Le mode édition coupe l'appui long « Étendre » et le glisser-lier (le plus simple) ; le crayon retouché le quitte ; quitter l'écran le quitte aussi.

## Mode édition : croix et repères (7 nov. 2026)

- Le mode est une classe sur l'arbre ENTIER : toutes les colonnes, visibles ou défilées hors écran, tremblent et portent la croix rouge. Test : nombre de croix = nombre de cartes d'objectif rendues (résumé annuel exclu). Une carte « N objectifs » porte aussi la croix : elle demande LEQUEL supprimer, puis la confirmation rouge. Mesuré avec 4 colonnes et défilement horizontal : 10 cartes, 10 croix.
- Repères du temps : colonne de 46 px à tous les niveaux (avant : 88 px pour les blocs, 56 px pour les années, 52 px pour les périodes). Bloc de 5 ans = les deux derniers chiffres de chaque année séparés par un slash (« 26/30 », « 31/35 », 13 px) dans une pastille cerclée (décision d'Émilien, la superposition est retirée) ; année = pastille de 4 chiffres ; bloc courant en pastille pleine claire.

## Titres d'activité / pôle / secteur = dernière rangée de l'arbre (7 nov. 2026)

- Les titres sont des cases de la DERNIÈRE rangée, dans le même conteneur défilant que les colonnes (flux normal : ni sticky, ni fixes, ni flottants). Quand l'arbre défile, ils montent et sortent de l'écran avec leur colonne ; au repos (tout en bas) ils sont juste au-dessus de la barre « Nouvel objectif… » et on ne peut pas défiler plus bas (overscroll none).
- Mesuré à 390 et 360 px (activités) : repos titre 624-678 px, barre à 694 px ; après 300 px de défilement le titre bouge avec la colonne (même décalage). Secteurs : défilement max 6539 px, après 300 px de défilement le titre descend de 300 px comme les cartes. Pôles : tout tient à l'écran, rien à défiler (le titre reste avec la grille).

## Tâches : toutes par défaut et filtre activité / pôle / secteur (7 nov. 2026)

Par défaut aucun jour n'est choisi dans la bande : la vue montre TOUTES les tâches à faire (toutes échéances, GET /api/goals/today?day=all ; les faites sont dans l'Archive), compteur = nombre à faire. Toucher un jour montre sa journée (J01 à J09 ci-dessus) ; retoucher le même jour revient à toutes. AU-DESSUS de la bande (sous « Tâches | Objectifs »), une ligne nue « Toutes les activités ⌄ » ; un toucher déroule un panneau sur place : page 1 = les activités, toucher une activité glisse vers la page 2 = ses pôles avec leurs secteurs dessous (choix direct, pas de 3e page) ; balayage vers la droite = retour à la page 1. Le filtre s'applique à la vue en cours (toutes ou journée). Les tâches sans objectif restent dans la liste de leur activité, jamais cachées.
- **T01 Défaut** : toutes les tâches à faire, aucun jour en surbrillance (le cercle d'aujourd'hui reste). ✅
- **T02 Toucher aujourd'hui** : les tâches du jour (J01) ; retoucher = retour à toutes. ✅
- **T03 Journée sans tâche** : « Aucune tâche ce jour-là. » ; « Aucune tâche. » si la vue entière est vide ; le filtre reste affiché. ✅
- **T04 Activité sans objectif** : choisie, elle liste ses tâches (avec ou sans objectif) ; si elle n'a aucune tâche, « Aucune tâche. » et le second menu n'offre que « Tous les pôles ». ✅
- **T05 Tâche sans objectif** : visible dans toutes les vues et sous son activité, pôle ou secteur. ✅
- **T06 Semaine à cheval sur deux mois** : inchangé (J05) ; le filtre ne dépend pas de la bande. ✅
- **T07 Pôle ou secteur sans tâche** : absent de la page 2 (elle est construite des tâches chargées) — À SURVEILLER si Émilien veut voir les pôles vides. ⚠️
- **T08 Changer d'activité** : le pôle/secteur choisi est remis à « Toute l’activité ». ✅
- **T07 Pôle ou secteur sans tâche** : absent du second menu (il est construit des tâches chargées) — À SURVEILLER si Émilien veut voir les pôles vides. ⚠️
- **T08 Changer d'activité** : le pôle/secteur choisi est remis à « Tous les pôles ». ✅

## Mode Étendre, ordre et couleurs réelles (7 nov. 2026)

- Mode Étendre : tout l'arbre s'assombrit ; seules les colonnes qui ont des objectifs libres (non rattachés) restent allumées, les colonnes choisies ont un contour violet, les autres sont éteintes. Toucher une colonne éteinte : message court (« Délie d'abord ce macro. » si elle est déjà reliée, sinon « Aucun objectif libre à relier dans cette colonne. »). Colonnes hors écran : la première colonne reliable est amenée à l'écran à l'entrée du mode.
- On peut sauter une colonne. L'ordre de présentation vient du serveur (GET /api/objectifs/ordre, dérivé des macros, colonnes reliées voisines tant que le macro existe) ; le client l'utilise tel quel et le relit à chaque rafraîchissement et à chaque changement de niveau. Délier ou supprimer le macro : l'ordre d'origine revient.
- Délier : appui long puis glisser hors du macro (zone « Délier »), ou croix du mode édition sur la carte large du macro (confirmation : « Les objectifs reliés sont conservés »). Non fait : refus « Fusion passée : impossible de délier. » après la période de fusion, et la carte macro dans la période de l'échéance (rangée unique) réduite à une colonne une fois la période passée ; à faire avec le serveur.
- Couleurs : activité = sa couleur (membre) ; pôle = couleur réelle donnée par le serveur (`shadeRank`, `shadeCount` de /api/objectifs/structure, même règle que Chrono et statistiques : le premier pôle est le plus clair) ; secteur = couleur de son pôle. Mesuré sur le compte d'Émilien : couleur affichée = couleur de donnée pour chaque activité, pôle et secteur.

## Calendrier des tâches depuis l'arbre (7 nov. 2026)

- Niveau secteurs : toucher le NOM d'un secteur ouvre son calendrier (page 3) au mois d'aujourd'hui ; toucher une PÉRIODE (case ou repère) l'ouvre au mois de son premier jour. Les deux passent par `TMT.ouvrirCalendrierTaches`. Niveaux activités et pôles : toucher le nom descend d'un niveau, comme avant.
- Le niveau, la colonne et le défilement sont mémorisés AVANT l'appel (`savedView`, `calFromTree`) : la flèche de retour revient au même endroit. Si la fonction répond « non » (aucune période) : message court, rien n'est mémorisé.

## Fusion dans le temps, serveur (7 nov. 2026)

- Règle d'affichage dérivée à chaque lecture (`server/lib/objectifs-fusion.js`), jamais de suppression : la période de fusion est la période de l'arbre (13 par an, 28 jours, la 13e va au 31 décembre) qui contient l'échéance du macro. Un macro porte `mergeStart`, `mergeEnd`, `mergeReached` (aujourd'hui >= début), `mergePast` (aujourd'hui > fin).
- Avant la période : colonnes séparées et voisines. Délier défait tout. Chaînage (A+B puis +C) : autorisé avant la date, comme avant.
- Période passée : `mergePast`. Délier un enfant, le ranger ailleurs, supprimer le macro ou le refaire objectif ordinaire sont refusés avec « Fusion passée : impossible de délier. » ; rien n'est supprimé ni détaché. Supprimer un enfant seul reste possible.
- Changement de jour à minuit : l'état suit `userToday()` (fuseau de la personne) ; le dernier jour de la période n'est pas encore « passée », le lendemain oui.
- Échéance modifiée : la période de fusion suit la nouvelle échéance (un macro dont l'échéance est repoussée dans le futur redevient défaisable).

## Fusion dans le temps, affichage (7 nov. 2026)

- Avant la période de fusion : colonnes séparées et voisines ; la carte large du macro est dans la période de son échéance (une rangée, sur les colonnes fusionnées) ; AU-DESSUS (périodes plus tardives) les colonnes absorbées n'ont plus de cases (vides) et leurs objectifs vont dans la colonne de l'entité touchée (la première du groupe).
- Dès que le présent atteint la période (et une fois passée) : UNE seule colonne à largeur standard, au nom et à la couleur de l'entité touchée ; les autres colonnes et leurs étiquettes sont absorbées ; la carte du macro est à largeur standard. Calculé à chaque lecture (`mergeReached`, `mergePast` du serveur), donc le changement de jour à minuit suffit.
- Macros chaînés (A+B puis +C) : un seul groupe, une seule colonne ; pôles d'une activité et secteurs d'un pôle : même règle au niveau affiché. Plusieurs objectifs futurs de l'entité fusionnée : tous dans la colonne unique. Colonne future vide : case grise, comme ailleurs.
- Délier une fusion passée : refus « Fusion passée : impossible de délier. » affiché en message court (glisser vers « Délier » ou croix du macro). Limite : l'entité « touchée » n'est pas mémorisée côté serveur ; on prend la première colonne du groupe.

## Couleur des cartes par état et espace sous le sélecteur (7 nov. 2026)

- TOUTES les cartes (en cours, à venir, réalisé, abandonné) sont à la couleur de donnée de l'activité telle quelle (`o.activity.color`, la même que Chrono) : aucun mélange, aucune variation ; plus de repli violet (une couleur absente doit se voir). Aucune marque ni variation visible par état (retiré : non demandé par Émilien). Mesuré : en cours, à venir, réalisé, abandonné = couleur de donnée pour chacune des 4 activités de test.
- Onglet Objectifs : l'écart de 16 px sous le sélecteur « Tâches | Objectifs » est retiré (seulement quand l'arbre est affiché) ; la ligne de retour et le crayon montent de 16 px, l'arbre les récupère.

## Macro existant : modifier, ajouter une colonne, défusionner (7 nov. 2026)

- Appui long sur la carte large d'un macro : panneau MACRO. Les colonnes déjà fusionnées sont cochées (contour violet) et allumées ; les autres colonnes reliables sont allumées, le reste est éteint. Toucher une colonne l'ajoute ou la retire ; Enregistrer applique (ajout : ses objectifs libres les plus récents entrent dans le macro ; retrait : ils sont détachés). Le relâchement de l'appui long ne coche ni ne décoche rien.
- « Défusionner » (texte rouge, sous le texte du panneau) : confirmation « Les objectifs reliés sont conservés » ; le macro disparaît, les colonnes retrouvent leur ordre d'origine. Après la période de fusion : refus « Fusion passée : impossible de délier. » (message court).
- Un macro est TOUJOURS dans sa période : sa rangée porte le repère de la période (alignée dessus) et est collée (8 px) à la rangée des cases de cette période, jamais entre deux périodes ; largeur = exactement les colonnes fusionnées. En modification, la carte est amenée à l'écran et les colonnes se resserrent pour qu'elle tienne (jamais coupée au bord) ; l'arbre grisé redevient normal à la sortie.
- Repères du temps : fixes à gauche au défilement horizontal (sticky natif : un seul conteneur défile, sans script), toujours alignés sur leur rangée au défilement vertical (mesuré : écart vertical repère-carte 0 px, repère à 20 px de gauche avant et après un défilement de 120 px).
- Vérifié au toucher réel à 390 px (2 puis 3 colonnes fusionnées : ajout, enregistrement, nouvelle modification, défusion avec retour à l'ordre d'origine) et à 360 px (2 colonnes).

## Fusionner / Séparer / Annuler (7 nov. 2026, remplace le panneau MACRO)

- Plus de panneau MACRO, de texte d'aide, de titre commun ni de bouton rouge « Défusionner ». Seule la barre « Nouvel objectif… » change : elle devient le bouton du bas (grise tant que rien n'a changé, R35).
- A, FUSIONNER : appui long sur une carte : elle tremble, tout l'arbre se grise, seules les cases de SA LIGNE (période de la carte) dans les colonnes éligibles restent éclairées. Toucher une de ces cases la choisit (contour violet) ; le bouton « Enregistrer » se dégrise ; Enregistrer fusionne (titre du macro = titre de la carte touchée).
- B, SÉPARER : toucher une carte déjà fusionnée ouvre le même mode (cases des colonnes fusionnées choisies) ; le bouton dit « Séparer » ; le toucher sépare : le macro disparaît, les objectifs reliés restent normaux (couleur de leur activité, leur période). Toucher une autre case de la ligne fait passer le bouton à « Enregistrer » (ajouter/retirer) ; remettre la sélection d'origine le fait repasser à « Séparer ». Après la période de fusion : refus « Fusion passée : impossible de délier. ».
- C, ANNULER : toucher n'importe où ailleurs (autre ligne, case grisée, titre, fond, hors de l'arbre) ou re-toucher la case d'origine quitte le mode sans rien changer (tremblement et grisé retirés, la barre revient).
- Macro orphelin : un macro sans objectif relié disparaît (au détachement du dernier enfant, à la suppression du dernier enfant, et au chargement pour les macros vides existants) ; jamais un objectif de l'utilisateur.
- La barre devenue bouton borne la hauteur de l'arbre (avant, l'arbre était recadré à 240 px) ; le relâchement de l'appui long ne coche rien.
- Testé au toucher réel à 390 px et 1435 px : appui long, choix d'une case, Enregistrer, toucher le macro, Séparer, ajout d'une case, annuler en touchant dehors, en retouchant la case d'origine et en touchant un titre.

## Largeur des colonnes : règle de l'arbre périodique (page 2) (7 nov. 2026)

- Règles lues dans `objectifs-page2-objectif.js/.css` : gouttière de colonnes 10 px, écart entre rangées 34 px ; UNE colonne = toute la largeur (flex 1 1 0) ; DEUX = moitié chacune ; TROIS ou plus = deux visibles à la fois (`calc(50% - 5px)`) avec défilement horizontal ; repères à gauche (26 px), traits verticaux de 2 px entre cases ; titre de colonne de la largeur de sa colonne.
- Arbre des objectifs, avant : une colonne seule avait la largeur de DEUX moitiés et les titres élargissaient les colonnes au-delà de la moitié (la deuxième colonne dépassait de l'écran). Après : 1 colonne = toute la largeur (291 px contre 140 px pour chacune de deux colonnes à 390 px) ; 2 colonnes = moitié chacune (140 px) ; 3+ = moitié, défilement ; les titres passent à la ligne. Grand écran : même règle (1 colonne = toute la largeur, 2 ou plus = deux visibles à la fois, défilement) ; mesuré à 1280 px : colonnes de 413 px, zone de 840 px, deux visibles, repères fixes (x identique avant et après un défilement de 300 px).

## Vue des périodes : une année, 13 périodes (7 nov. 2026, décision d'Émilien)

- La vue des secteurs montre l'année de l'ÉCHÉANCE de l'objectif touché : 13 périodes, pas une de plus (une autre année = un autre objectif/une autre entrée). Entrée par un titre ou en pinçant, sans objectif touché : l'année courante (ou la première année du bloc si l'année courante n'en fait pas partie). Mesuré à 390 px : 13 périodes, année 2031 pour l'objectif touché de 2031.
- La vue des années (niveau pôles) reste limitée à 5 années (un bloc) ; au-delà, c'est un autre bloc pluriannuel.

## Repères fixes et cycles à fin fixe (7 nov. 2026)

- Les repères du temps ont leur PROPRE colonne fixe à gauche (`.arRail`, hors du défilement horizontal) ; les colonnes d'activités et les titres défilent horizontalement dans `.arHScroll`, à côté, jamais dessous ; le défilement vertical est commun (repères et rangées ensemble, sans script). Mesuré à 390 et 360 px : x du repère 20 px (18 px à 360) avant et après un défilement horizontal de 120 px, bord de la colonne à 76 px (74 px), aucune carte ne dépasse dans cette colonne ; écart vertical repère/rangée 0 à 1 px.
- Cycle à fin FIXE : pluriannuel = fin du bloc de 5 ans, annuel = fin de l'année, périodique = fin des 13 périodes. La vue va du présent à cette fin, jamais au-delà, sans remplissage vers l'année ou le bloc suivant ; une échéance au-delà de la fin du cycle appartient à un autre cycle. Mesuré (aujourd'hui = 7 nov. 2026 = période 12) : la vue des périodes de 2026 n'affiche que les périodes 12 et 13 ; une année future affiche ses 13 périodes ; un bloc de 5 ans futur affiche ses 5 années.

## Page 3 retirée : le calendrier est dans la vue Tâches (7 nov. 2026, décision d'Émilien)

- Retirés (code, HTML, CSS, jamais les données) : la page 3 de l'activité (mode « month » et #goalsMonthView), son point de pagination (la pagination de l'activité n'a plus que 2 points : Feuille de route, Objectifs), `openGoalsDetail`, `closeGoalsDetail`, `prepareGoalsMonth`, `isGoalsMonthOpen`, les bulles de secteurs de la page mensuelle (`#goalsMonthSectors`, `.gmChip`), le bouton ✕ de l'ancienne page, et tous leurs appelants (page 1, page 2, app.js). Gardés : `TMT.showGoalsCalendar`, `goalsCalMount/Unmount`, le bloc « Calendrier intégré » (renderActivityGoals, renderGoalsMonthCal, openGoalEdit, dock de l'éditeur).
- Toucher une période ou un secteur (arbre, arbre périodique de la page 2, rappel de fin de période) ouvre le calendrier de la vue Tâches, filtre posé sur ce pôle/secteur (`TMT.ouvrirCalendrierTaches`). Le retour à l'arbre se fait par le segment « Objectifs » : le niveau d'arbre est conservé (vérifié au clic réel : arbre des secteurs, toucher le nom, calendrier Tâches, segment Objectifs : même niveau et mêmes colonnes).
- Balayer à gauche dans la page de l'activité ne mène plus nulle part (une seule page à droite de la Feuille de route).

## Fusion avec 3 et 5 colonnes (7 nov. 2026)

- Vérifié au toucher réel à 390 px : appui long, choix de 2 cases (3 colonnes fusionnées, carte de 3 colonnes), re-toucher la carte (bouton « Séparer », 3 colonnes choisies), ajout de 2 cases (5 colonnes), Enregistrer, nouvelle ouverture (« Séparer », 5 colonnes choisies), Séparer : le macro disparaît, il ne reste que les macros d'origine.
- Une colonne ajoutée dont l'objectif a une échéance plus lointaine que celle du macro : confirmation « Repousser l'échéance du macro au … ? » (jamais en silence) ; refuser ne change rien. Avant ce correctif, le serveur refusait l'ajout et le message restait seul.
- En modification, les colonnes se resserrent (jusqu'à 44 px) pour que la carte large du macro tienne toujours à l'écran, même à 5 colonnes.

## Règles de mise en page de la page 2 (arbre périodique), avant / après dans l'arbre des objectifs (7 nov. 2026)

| Règle de la page 2 (hors largeur) | Avant | Après |
|---|---|---|
| Gouttière entre colonnes 10 px | appliquée | appliquée (même constante) |
| Écart entre rangées 34 px (`--goalsGridGap`) | appliquée (classes partagées) | appliquée |
| Trait vertical 2 px entre cases, couleur de l'activité si liées | appliquée | appliquée |
| Séparateur horizontal pointillé entre rangées (très pâle) | appliquée (classes partagées) | appliquée |
| Case vide grise (`.goalsGridCell--empty`) | appliquée | appliquée |
| Hauteur de case : 64 px minimum | remplacée par une hauteur adaptative (40 à 120 px) pour remplir l'écran | inchangée, volontaire (demande d'Émilien : la grille remplit l'écran) |
| Marge basse de 220 px sous la grille | non appliquée (butée en bas) | inchangée, volontaire (demande d'Émilien : butée en bas) |
| Repères à gauche | colonne fixe de 56 px | inchangée, volontaire (colonne fixe, demande d'Émilien) |
| Une ou deux colonnes : défilement horizontal verrouillé (`goalsGridScroll--locked`) | non appliquée | appliquée (le balayage part vers la page voisine) |
| Texte de carte 12 px, relief 600 | 13 px | inchangée (13 px, lisibilité demandée) |

## Rappel de fin de période (7 nov. 2026)

- Supprimé côté serveur par décision d'Émilien ; la redirection du rappel vers le calendrier des Tâches a été retirée de l'arbre.

## Fusion : le macro incorpore l'objectif, appui long seul, plus de « Délier » (7 nov. 2026)

- Le macro INCORPORE l'objectif existant : sa carte prend la place de la rangée de son enfant le plus lointain (même période), élargie sur les colonnes fusionnées ; aucune rangée n'est créée, aucune case vide n'est ajoutée (mesuré : 5 rangées avant et après la fusion). Les enfants incorporés n'ont plus de carte propre dans cette rangée. Si une carte étrangère occupe la place, le macro garde sa rangée voisine (cas rare).
- Titres choisis en mode fusion : REMPLIS de la couleur de l'activité (du pôle), plus de contour violet.
- La zone « Délier » et le glisser-lier sont supprimés (interface, code, CSS) : l'appui long ouvre le mode et la barre du bas devient tout de suite le bouton, avant même le relâchement : « Séparer » (violet) sur un objectif fusionné, « Enregistrer » gris sinon. Aucune autre manière de délier. Rattacher un objectif à un autre reste possible par « Rattaché à » dans les paramètres (mode édition).
- Un toucher COURT sur un macro, un objectif fusionné ou un titre descend d'un niveau (règle générale) ; seul l'appui long ouvre le mode. Vérifié à 390 px (capture pendant l'appui long : bouton « Séparer », aucune zone pointillée, composer masqué ; toucher court : niveau d'après, mode fermé).

## Cartes de groupe : un titre court, aucun comptage (7 nov. 2026)

- Le texte « N objectifs » est retiré (cartes qui regroupent plusieurs objectifs : activités, blocs, années, périodes, macros). La carte porte UN titre court, SANS IA : le titre du plus grand objectif du groupe (celui qui englobe le plus d'autres, sinon l'échéance la plus lointaine). Une carte de macro porte son titre et, dessous, les colonnes reliées, sans comptage. Vérifié à 390 px aux niveaux activités et années : aucune carte ne contient « objectifs ».

## Fusion aux niveaux pôles et secteurs ; cycle suivant (7 nov. 2026)

- Niveau pôles (années, colonnes = pôles d'une activité) : l'appui long sur une case d'année ouvre le même mode (tremblement, grisé, cases éligibles de la ligne éclairées, bouton du bas « Enregistrer » gris) ; choisir la case d'un autre pôle puis Enregistrer crée un macro de 2 pôles, sa carte large est dans la rangée de l'année. Vérifié au toucher réel à 390 px (capture regardée). Un macro ne relie que des objectifs d'un même niveau : on ne propose que ceux du niveau affiché. Si une autre carte occupe la rangée de l'année, la carte du macro prend une rangée voisine (cas rare, signalé par le repère partagé).
- Niveau secteurs : même mode via les cartes d'objectif (colonnes = secteurs d'un pôle) ; pas testé avec deux secteurs remplis dans la démo.
- Cycle suivant : un objectif dont l'échéance dépasse la fin du cycle affiché apparaît dans le cycle suivant, à sa période ou année, sans marque : « Plus un an » (+1 an) apparaît en période 5 de la vue des secteurs 2027 (on y arrive en touchant la case 2027 du niveau pôles) ; « Plus six ans » (+6 ans) apparaît à l'année 2032 de la vue des années du bloc 2031-2035 (on y arrive depuis le niveau activités, rangée 31/35). Aucune flèche n'est ajoutée : la navigation reste « descendre / remonter ».

## Niveaux sans pincement ; repères centrés ; plus d'année au niveau des périodes (7 nov. 2026)

- Le zoom au pincement et la Ctrl+molette qui changeaient de niveau sont retirés (code, écouteurs, test) : on ne change de niveau que par le toucher (descendre) et la flèche de retour. Vérifié à 390 px : un pincement ne change pas de niveau.
- Niveau des périodes : l'ovale d'année à côté des repères est retiré ; le rond cerclé de la période reste (aucun repère à quatre chiffres : 0 mesuré).
- Niveau des années : le repère est au milieu de TOUTE la hauteur de la rangée de son année (rangée de cases et rangées de macro ensemble). Mesuré à 390 px, 8 années dont une rangée plus haute (macro, 132 px) et deux rangées de 54 px : écart repère/rangée de 0 px pour toutes ; niveau des périodes : 0 px.

## Colonne unique au-dessus d'une fusion, traits, butée du bas, sélection aux niveaux fins (7 nov. 2026)

- Au-dessus d'une fusion (futur) il ne reste qu'UNE colonne, sur toute la largeur des colonnes liées (mesuré à 390 px : cases de 290 px, la même largeur que la carte du macro ; zone utile 295 px). Les cases sous le macro restent des colonnes normales.
- Traits : le trait qui descend du macro vers chaque carte enfant est continu (2 px, de la couleur de la colonne reliée, centré sur sa colonne) et passe au-dessus du trait gris ; le trait du haut du macro vers la colonne unique prend la couleur de la première colonne liée.
- Butée du bas : la hauteur de l'arbre est calculée depuis le haut réel de la barre (`getBoundingClientRect`) ; la gouttière de 8 px sous la rangée des titres est le seul espace. Mesuré à 390 et 360 px, niveaux activités, pôles (2 colonnes), secteurs (2 colonnes) et pôle à 1 colonne : bas des titres = haut de la barre − 8 px. L'arbre est recalculé quand la barre bouge sans redimensionnement de la fenêtre (clavier, barre d'adresse) : `visualViewport`, entrée et sortie de champ. Non testé : clavier ouvert (pas de clavier dans l'environnement de test).
- Sélection aux niveaux fins : appui long, mode actif, toucher une case éligible de la ligne la coche, le bouton passe à « Enregistrer », Enregistrer fusionne : vérifié au toucher réel à 390 px aux niveaux activités, années (2 pôles) et périodes (2 secteurs). Les objectifs proposés sont ceux du MÊME niveau que l'objectif touché (règle du serveur), sinon la colonne reste éteinte.

## Safari mobile : barre d'adresse et butée du bas (7 nov. 2026)

- Cause : dans Safari (pas dans l'app installée), la barre d'adresse qui se rétracte déplace la barre « Nouvel objectif… » sans toujours déclencher « resize » ; la hauteur de l'arbre, calculée une seule fois, laissait alors un grand vide. Correctif : l'arbre se recale depuis le haut RÉEL de la barre (`getBoundingClientRect`, `visualViewport.height` en repli) sur `visualViewport` resize/scroll, défilement de la page, rotation, entrée/sortie de champ, et par un filet léger (contrôle toutes les 400 ms, un seul rendu seulement si l'écart dépasse 1 px).
- Simulation à 390 px (barre déplacée de −90 px puis +40 px puis retour, sans aucun événement de redimensionnement) : bas des titres = haut de la barre − 8 px dans les quatre états (barre à 694, 604, 734, 694 px). Non testé : un vrai Safari (pas de Safari dans l'environnement).

## Mise en page déterministe : largeurs et hauteur en CSS pur (7 nov. 2026, remplace les recalculs JS)

- Retirés : tout écouteur de redimensionnement, de défilement, de `visualViewport`, d'orientation, d'entrée/sortie de champ et le minuteur de 400 ms ; aucune largeur n'est plus mesurée ni calculée en pixels en JS.
- Largeurs : `--ar-w` (posée sur la zone qui défile, `container-type: inline-size`) vaut `calc(100cqw - 4px)` pour UNE colonne et `calc((100cqw - 14px) / 2)` pour deux ou plus ; cartes, titres et macros en dérivent (`spanW`) ; en modification d'un macro de n colonnes, `--ar-w` est la largeur qui les fait tenir toutes. Indépendantes de la hauteur, du défilement et de l'élastique.
- Hauteur : l'arbre est `position: fixed`, `top` = bas de l'en-tête (mesuré à chaque rendu), `bottom` = distance du HAUT RÉEL de la barre du bas au bas de l'écran, republiée par un `ResizeObserver` sur la barre elle-même (jamais par minuteur ni défilement) ; la page est verrouillée tant que l'arbre est affiché (`html.arbreOn`, corps en `fixed`, `overscroll-behavior: none`). Gouttière sous les titres : 8 px, toujours.
- Mesuré à 390 et 360 px, hauteurs d'écran 844, 760 et 700 : bas des titres = haut de la barre − 8 px ; avant, pendant et après un tirage tactile vers le haut puis vers le bas et depuis l'en-tête : largeur de bulle identique (140 px à 390, 127 px à 360), défilement de la page 0, gouttière 8 px. Non vérifié dans WebKit (Playwright et WebKit non installés, rien téléchargé) ni avec un vrai élastique iOS.
- Comparaison avec l'arbre périodique d'origine (page 2) : à 390 px, zone de défilement 358 px, colonnes de 159 px ; à 360 px, 328 et 144 px. L'arbre des objectifs : colonnes de 140 px à 390 px (127 px à 360 px), zone 295 px (268 px) : la colonne de repères fixe fait 56 px (26 px à la page 2) et l'arbre est 7 px moins large ; les colonnes sont donc PLUS ÉTROITES que celles de la page 2 (−19 px à 390 px).
## Création : case vide, croix, description guidée (7 nov. 2026)

- Toucher une case vide de l'arbre ouvre aussitôt le panneau de création (la barre devient « Suivant n/total ») : titre vide à saisir, activité (niveau, pôle, secteur) verrouillée, échéance de la case imposée et NON modifiable (page Temps : « Période · Échéance : date », ni durée ni sélecteur de date). `POST /api/objectifs/contexte` accepte `blank: true` avec une échéance valide et un titre vide ; sans cela le titre vide reste refusé. Vérifié à 375 px (capture regardée).
- La croix ✕ en haut à droite du panneau était absente (un commentaire de ligne avalait son appel) : rétablie ; elle annule (aucun objectif créé, vérifié).
- Description guidée : la zone libre est remplacée par trois questions à cases multiples (`.cmpSeg`) + « Quelques mots » : Réussite (Chiffre, Date, Résultat), Raison (Santé, Carrière, Plaisir), Obstacle (Temps, Énergie, Argent). Le texte composé (« Réussite : chiffre, 10 km · Raison : santé… », 500 au plus) est enregistré dans la description lue par l'IA ; aucun changement serveur.
- Cas : titre vide → « Écris ton objectif. » ; case touchée pendant une création en cours → ignorée (`busy`) ; échéance de la case passée → refus du serveur.

## Création : pages recomposées, description compacte (7 nov. 2026)

- Ordre des pages : Description (titre + description seulement) → Rattachement (si candidat) → Temps → **Activité** (Activité liée, charge de la semaine prochaine, Avancé) → Niveau (si info manquante) → Tâches. Vérifié à 375 px : page 1 compacte, page 3 « Activité ».
- Description compacte : les questions s'ouvrent une à une (la suivante après un choix, plusieurs choix possibles) ; UN seul champ « Quelques mots » (80 au plus, « Précisions : … ») après la dernière question.
- Cas : l'activité n'est plus demandée à la page 1 ; « Suivant » de la page Activité refuse sans activité (« Choisis une activité. ») ; le rattachement est proposé d'après l'activité suggérée ou verrouillée, et s'il change à la page Activité le parent proposé est abandonné (aucun rattachement silencieux).
