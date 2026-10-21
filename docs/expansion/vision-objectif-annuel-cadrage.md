# Vision Expansion (18 oct. 2026) : cadrage d'une page

Source : `BACKLOG.md` section 5 (vision d'Émilien du 18 oct.) : l'utilisateur d'Expansion ne saisit que son objectif annuel et sa stratégie ; l'IA propose objectifs périodiques, hebdomadaires et tâches, par pôle/secteur, toujours en proposition validée (avant/après). Aucune citation mot pour mot dans `docs/regles/intentions.md` : à ajouter par le coordinateur avant tout code (règle de `modele-tache.md`). NON codé.

## Ce qui existe
- Objectif annuel par activité/pôle (`goals.js`, tables `goal_years`, `goal_year_goals`) et objectifs périodiques saisis à la main.
- Stratégie par activité (`strategy.js`, route `/activities/:id/strategy`) : but, échéance, 3 priorités, à ignorer. Étape 1 livrée : bloc `<strategie>` dans `documenttasks` et retrait des tâches IA hors stratégie via `changeproposals`.
- Périodique -> hebdomadaire par IA (`goalsweeklyauto.js`, Haiku puis fort, mémo 15 min). Noter : l'en-tête du fichier le déclare GRATUIT (décision du 26 sept.).
- Tâches par IA : `documenttasks` (documents/Drive), plan quotidien (`dailysuggestioncron.js`), `offerdelivery.js` (plan d'achat Expansion).
- Mécanisme de proposition validée : `changeproposals` (avant/après, refus mémorisé). Capacité hebdo : `weekplanner.js` (`planWeeks` écrit, testé, non branché).
- Garde d'accès : `offer1access.hasOffer1Access`; budgets IA : `aibudget`.

## Ce qui manque
1. Annuel + stratégie -> objectifs périodiques proposés (aucun générateur ; `goalsauto.js` est déterministe et sans IA).
2. Hebdomadaire -> tâches proposées (aujourd'hui les tâches viennent de documents ou du plan quotidien, pas des objectifs hebdo).
3. Une entrée unique et un déclencheur : où l'utilisateur voit les propositions sans nouvel écran (piste : « Modifications proposées » existante).
4. Injection de la stratégie dans les générateurs 1 et 2 et dans le classement (piste 3 de BACKLOG « Précision »).
5. Branchement de `planWeeks` pour la répartition du plan de la semaine (aujourd'hui seule la capacité est utilisée).
6. Règle claire gratuit/payant : le périodique -> hebdo est gratuit ; la nouveauté payante serait l'enchaînement complet à partir de l'annuel.

## Étapes proposées (chacune livrable seule, flag Expansion)
- E2 : annuel + stratégie -> périodiques proposés (1 appel, sortie JSON validée, avant/après).
- E3 : périodique validé -> hebdomadaires (réutilise `goalsweeklyauto`, ajoute la stratégie au prompt).
- E4 : hebdomadaire -> tâches proposées par secteur (secteurs créés par l'utilisateur ; temps remonte au pôle).
- E5 : `planWeeks` pour proposer délégation/report (jamais d'horaire à créneaux).
- Tests : sorties simulées (fournisseur injectable comme `scripts/eval-task-precision.js`), jeu de cas par secteur, aucun appel payant.

## Coût IA estimé (tarifs `aimodels.js` : Haiku 1/5, Sonnet 3/15 $ par million de jetons ; estimation, aucune mesure réelle disponible)
Un appel type : 4 k jetons en entrée, 3 k en sortie = ~0,02 $ Haiku, ~0,06 $ Sonnet (repli fort).
Par activité et par an : 1 (annuel->périodiques) + 4 (périodiques->hebdo) + ~52 (hebdo->tâches) = ~57 appels = ~1,1 $ (tout Haiku) à ~3,4 $ (tout fort). Réaliste avec replis ~2 $/an/activité, contre 20 $/mois facturés. Marge large; plafond `aibudget` (2 $/jour/utilisateur) inchangé. À confirmer avec `scripts/ai-cost-report.js` en production.

## Décisions d'Émilien (21 oct. 2026)
- E2 OUI : les propositions de l'IA arrivent par l'écran « Modifications proposées » existant, avant/après, aucun écran nouveau.
- E3 OUI : périodique -> hebdo reste gratuit ; l'enchaînement depuis l'objectif annuel est réservé à Expansion.
- E4 OUI : génération à la demande (un geste), pas automatique ; moins de coût IA.
- E1 NON, « Besoin de clarification. Je ne comprends pas. » : reformulé ci-dessous, en attente d'un oui. Aucun code Expansion avant ce oui.

## E1 reformulée : la feuille de route en 5 lignes
1. Ce qui serait construit : une aide qui part de ton objectif de l'année et de ta stratégie, et te propose les objectifs de chaque période, puis ceux de chaque semaine, puis les tâches.
2. Dans quel ordre : d'abord les objectifs de période, ensuite ceux de la semaine, ensuite les tâches par secteur, enfin un coup de main pour répartir la semaine ; chaque étape sort seule.
3. Ce que tu gardes : rien ne change sans ton accord ; tu vois l'avant et l'après dans « Modifications proposées », et un refus est retenu.
4. Ce que ça coûte en IA : un appel seulement quand tu le demandes, environ 2 $ par an et par activité en moyenne, contre 20 $ par mois facturés.
5. Ce que tu vois : pas de nouvel écran, un seul geste pour demander les propositions, et la partie « de l'objectif annuel jusqu'aux tâches » est réservée à Expansion.

Question restante : OK pour cette feuille de route (étapes E2 à E5) ? Et ta demande d'origine, citée mot pour mot, est à ajouter à `intentions.md` avant tout code.

## E1 : OUI (21 oct. 2026)
Étape 1 livrée (branche `claude/expansion-e1`) : sur le geste existant « chercher des modifications », si des périodes de l'année sont vides sous un objectif annuel, UN appel IA (annuel + stratégie) propose les objectifs de période dans « Modifications proposées » (avant/après, refus mémorisé, périodes déjà saisies jamais touchées, Expansion seulement). Aucun écran ni bouton nouveau. E3-E5 restent à faire.

## Ajustement de E3 (21 oct. 2026)
L'organisation faite par l'IA de l'utilisateur via le connecteur est gratuite pour tous les comptes ; seul l'enchaînement par l'IA intégrée (payée par Noèsis) reste réservé à Expansion. Voir `connecteur-ia-libre.md`.

## E3 livrée (21 oct. 2026)
Le remplissage hebdomadaire existant (`goalsweeklyauto.js`, déclenché à la saisie d'un objectif de période, gratuit) reçoit maintenant la stratégie de l'activité (bloc `strategie`, omis si vide : requête et mémo inchangés) et la consigne de la respecter. Aucun écran, aucun appel de plus. Reste : E4 (tâches par secteur à la demande), E5 (`planWeeks`).
