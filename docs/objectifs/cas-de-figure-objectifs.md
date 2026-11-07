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
