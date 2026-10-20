# Projection de coût IA mensuel (20 oct. 2026)

Outil : `node scripts/ai-cost-projection.js [--hyp fichier.json] [--detail]` (aucun réseau, aucun secret, aucune base). Hypothèses : `scripts/ai-cost-hypotheses.json` (modifiable : appels par utilisateur et par jour pour léger/moyen/intensif, jetons entrée/sortie, modèle, taux de mémo, part de repli fort, relances, part d'entrée en cache, remise lots). Tarifs : `PRICES` (`aimodels.js`, non confirmés, voir `questions-emilien-credits.md`). Test : `test/ia-projection-test.js` (valeurs connues).

Hypothèses SUPPOSÉES, pas mesurées : à remplacer par `ai-cost-report.js --court 30` en production. Exemple profil moyen : 25 orthographes, 10 classements, 6 rapprochements, 2 inter-secteurs par jour ; mémo 10-30 % ; repli fort 5-50 % selon la fonction.

## Résultat (tarifs Haiku 1/5, Sonnet 3/15 $/M)
| Profil | $/util./mois | 10 util. | 100 util. | 1000 util. | % du plafond 15 $ | Marge brute vs 20 $ |
|---|---|---|---|---|---|---|
| Léger | 0,65 | 6 | 65 | 648 | 4 % | 97 % |
| Moyen | 2,35 | 23 | 235 | 2345 | 16 % | 88 % |
| Intensif | 7,86 | 79 | 786 | 7855 | 52 % | 61 % |

Marge = (20 $/mois Expansion, `offercheckout.js`, 1 activité - coût IA) / 20 $, avant frais Stripe et hébergement, donc indicative. Un utilisateur non abonné coûte aussi : le total vaut pour des utilisateurs actifs, pas pour des abonnés seulement. Le plafond de 15 $ n'est approché par aucun profil ; la cible de 10 $ moyens est très au-dessus du moyen supposé.

## Ce qui domine
Profil moyen : rapprochement tâche -> objectif 22 % (0,52 $), classement 15 %, inter-secteurs 12 %, objectifs hebdo 12 %, documents 10 %. L'orthographe, la plus fréquente, ne pèse que 5 %. Le rapprochement domine par son entrée (jusqu'à 5236 jetons au pire cas, `ia-rapprochement-2026-10-20.md`) et ses deux paliers.

## Optimisation ciblée : non appliquée
Plafond de candidats du rapprochement 60 -> 25 : entrée moyenne supposée 1500 -> ~630 jetons ; profil moyen 2,35 -> 2,12 $ (-10 % du total), intensif 7,86 -> 7,10 $. Elle peut faire disparaître un objectif pertinent sans mot commun (qualité non mesurable hors `--live`) : reste une case à cocher (déjà posée, chiffre ajouté).

## Alerte globale (somme de tous les comptes, par jour)
Elle existe : `AI_COST_ALERT_DAY_USD`, défaut 8 $, somme de `ai_usage_log` du jour, une ligne `ALERTE coût IA du jour` au journal (une par jour, durable au redémarrage). Test : 100 comptes à 50 % du budget mensuel (25 $ ce jour) = une alerte ; 100 comptes à 10 % (5 $) = aucune.
Limite : seuil FIXE. Le profil moyen coûte ~0,08 $/jour : 8 $ est franchi vers 100 utilisateurs actifs moyens, puis l'alerte sonne tous les jours (bruit) ; à 1000 elle ne signale plus rien d'anormal. À l'inverse 10 comptes intensifs (2,6 $) passent sous le seuil. Proposition (case à cocher) : seuil proportionnel au nombre de comptes actifs du jour, au rythme du plafond mensuel : 15 $ / 30 = 0,50 $ x comptes actifs (jour), 3,5 $ x comptes actifs (semaine). Aucun suivi mensuel global n'existe (le rapport hebdomadaire seul). Canal : voir la question déjà posée (journal, push, courriel).
