# Modèles IA par fonction et répartition du travail Claude (19 oct. 2026)

Aucun modèle n'est changé dans le code. Tarifs du code (`aibudget.js`, $ / million de jetons) : Haiku 1 entrée / 5 sortie ; Sonnet 3 / 15. Le journal `ai_usage_log` n'a pas de données dans les bases disponibles ici : les coûts ci-dessous sont des ESTIMATIONS (tailles de `docs/ia-appels.md`, hors cache de prompt). À remplacer par les vrais chiffres : `node scripts/ai-cost-report.js 30` sur la base de production (colonnes ent.moy, sort.moy, $/appel).

## Tableau fonction / modèle / candidat / coût par appel

| Fonction | Modèle actuel | Candidat | Coût estimé / appel (actuel -> candidat) | Risque de qualité |
|---|---|---|---|---|
| Orthographe | Haiku seul | déjà Haiku | ~0,0002 $ | nul (garde-fou `isPureSpellingFix`) |
| Classement de tâche | Haiku, repli Sonnet (confiance < 80) | Haiku seul (retirer le repli) | Haiku ~0,0009 $ ; repli ~0,0027 $ | moyen : le repli rattrape les cas ambigus ; jeu d'évaluation (chantier 6) d'abord |
| Reformulation | Haiku, repli Sonnet 4.5 | Haiku seul | ~0,001 $ ; repli ~0,003 $ | moyen : fait inventé / ton ; le contrôle de chiffres reste |
| Inter-secteurs | Haiku, repli Sonnet 5 | Haiku seul | ~0,004 $ ; repli ~0,011 $ | moyen : suggestions moins pertinentes (déjà proposées, jamais imposées) |
| Document / modifications proposées | Haiku, repli Sonnet | Haiku seul | ~0,0075 $ ; repli ~0,022 $ | moyen à élevé : tâches manquées dans un document |
| Surveillance Drive | Haiku, repli sur confiance < 80, lots -50 % | déjà Haiku (conserver) | ~0,008 $ (lots ~0,004 $) | faible ; ne pas monter vers Sonnet |
| Objectifs hebdo | Haiku, repli Sonnet 5 | Haiku seul | ~0,013 $ ; repli ~0,039 $ | élevé : sortie longue structurée, plan visible |
| Plan Offre 1 / Expansion | Haiku, repli Sonnet 5 | garder tel quel | ~0,019 $ ; repli ~0,057 $ | élevé : livrable payant, appel rare (mémo 24 h) |

Lecture : Haiku coûte ~3 fois moins que Sonnet. Les gains restants viennent donc du TAUX DE REPLI (voir la fin du rapport : `fallbackRate`), pas d'un changement de modèle de premier essai, déjà Haiku partout. Ordre des candidats à tester : (1) classement, (2) reformulation, (3) inter-secteurs ; seulement après évaluation en `--live`, et toute baisse de qualité visible est proposée à Émilien avant application. Les plans payants (hebdo, Offre 1) ne passent pas à Haiku seul.

## Répartition du travail Claude (~14 % du quota hebdomadaire par jour)

Réinitialisation samedi 5 h (New York) : 7 jours x 14 % ~ 100 %. Cible quotidienne, ajustée par la réponse d'Émilien à la notification de 8 h 54.
- Ordre des chantiers selon le retard : Précision des tâches (6) et Expansion (3) d'abord (valeur produit), puis Basic (2), Trade Tracker (1), Simplification (5) ; Crédits (4) et Principal (7) sont légers.
- Tâches lourdes (multi-fichiers, évaluations `--live`, tests complets, balayages de code mort) : la nuit ou en fin de période, en un seul agent à la fois.
- En avance sur la cible : moins d'agents en parallèle, tâches courtes (libellés, CSS). En retard : relancer les listes de repli, un agent par segment de fichiers.
- Éviter le gaspillage : lectures ciblées, pas de balayage complet, un seul `scripts/suite-verrouillee.sh` en fin de tâche, aucun agent qui refait le travail d'un autre.

## Identifiants de modèle codés en dur (20 oct. 2026)

Tous centralisés dans `server/lib/aimodels.js` (seul fichier de `server/` contenant un identifiant `claude-...` ; le test `test/ia-modeles-centralises-test.js` échoue sinon). Valeurs par défaut inchangées.

| Constante | Identifiant | Surcharge (variable d'environnement) | Utilisé par |
|---|---|---|---|
| `STRONG` | `claude-sonnet-5` | `ANTHROPIC_MODEL` | `offerdelivery`, `goalsweeklyauto`, `crosssectorinference` (modèle fort) |
| `CLASSIFY_STRONG` | `claude-sonnet-4-5-20250929` | `NOESIS_TASK_CATEGORY_MODEL` (reformulation : `NOESIS_GOALS_REWRITE_MODEL` d'abord) | `goalstaskclassify`, `goalsrewrite`, `docanalysis` |
| `FAST` | `claude-haiku-4-5` | `DRIVE_SYNC_MODEL`, `NOESIS_SPELLFIX_MODEL`, et par palier `NOESIS_CLASSIFY_FAST_MODEL`, `NOESIS_CROSS_FAST_MODEL`, `NOESIS_REWRITE_FAST_MODEL`, `NOESIS_WEEKLY_FAST_MODEL`, `NOESIS_DOC_FAST_MODEL`, `NOESIS_OFFER_FAST_MODEL` (`off` = désactivé) | `drivesync`, `silentspellfix`, `aicache.fastModelFor` (paliers) |

## Échéance des tarifs, couverture de l'API, journal, cache (repli 29, 20 oct. 2026)

- **Revérification des tarifs : tous les 90 jours.** `PRICES_UPDATED` (`server/lib/aimodels.js`) = 2026-10-16, prochaine échéance 2027-01-14. `test/ia-tarifs-echeance-test.js` AVERTIT (ne fait jamais échouer la suite) au-delà de 90 jours ; le rapport `ai-cost-report.js` fait de même. Après vérification : corriger `PRICES` et la date.
- **Point d'appel unique** : tous les appels `/v1/messages` passent par `aibudget.fetchAnthropic` (budget, relances 429/529, masquage Loi 25, alerte clé 401/403, journal). Seule exception : `aibatch.js` (API Batch de la surveillance Drive, autre endpoint) ; il a son budget (`submit`), son délai (60 s), son masquage, et maintenant la même alerte 401/403 ; son coût s'écrit à la relève (facteur 0,5). Le script `eval-task-precision.js --live` passe par `classify.callModel`, donc par le point unique. `test/ia-point-unique-test.js` échoue si un nouvel accès direct apparaît hors de la liste d'exceptions (avec raison) du test.
- **Journal de coût** : `test/ia-journal-somme-test.js` (faux serveur renvoyant `usage`) vérifie que la somme du journal = jetons réellement retournés, pour succès, JSON invalide, sortie tronquée, relances 429/529 (une seule ligne) et repli après 500. Limite connue : un **délai dépassé** coupe la réponse avant `usage` : le coût éventuel facturé par Anthropic n'est pas journalisé (borné par `max_tokens` et le délai ; un lot expiré/annulé n'est pas facturé).
- **Cache de prompt** : déjà posé là où il y a un gros bloc répété (documents/Drive, modifications : `aicache.messageParams`). Économie théorique maximale d'un cache sur les blocs statiques restants : inter-secteurs ~340 jetons, hebdo ~316 jetons, soit 0,9 x 340 x 1 $/M = ~0,0003 $/appel en Haiku, et NULLE en pratique (sous les minimums cachables 1024 Sonnet / 4096 Haiku 4.5, l'API ignore le marqueur). Rien appliqué.

