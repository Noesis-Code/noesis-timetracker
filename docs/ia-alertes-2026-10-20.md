# Alertes de coût IA de bout en bout (20 oct. 2026)

Test : `test/ia-alertes-bout-en-bout-test.js` (processus forcé en UTC, pire cas). Les alertes vont au journal serveur seulement (aucun courriel interne n'existe) ; mémoire du processus : un redémarrage du serveur peut en répéter une dans la journée.

| Scénario | Résultat | Test |
|---|---|---|
| Un compte passe 70 % du plafond de classement (10/jour) | aucune alerte | 1re série, appel 7 |
| Il passe 80 % | une ligne `ALERTE plafond classement-tache`, sans identifiant de compte | appel 8 |
| Il atteint puis dépasse 100 % | toujours une seule alerte ; appels 11 et 12 refusés avant tout appel réseau (message « Plafond quotidien… », les appelants se replient comme sur une panne IA) | appels 9-12, compteur réseau = 10 |
| Un autre compte le même jour | non bloqué | `u2` |
| Coût total du jour > `AI_COST_ALERT_DAY_USD`, 2 comptes | une seule ligne `ALERTE coût IA du jour` | scénario 2 |
| Le lendemain (Montréal) | nouvelle alerte possible | scénario 3 |
| 23 h 59 à Montréal (03 h 59 UTC) | encore le même jour | `dayKey` |
| 0 h 01 à Montréal | compteur du plafond remis à zéro | `takeDailyCap` |
| Hiver (UTC-5) | minuit à 05 h UTC | `dayKey` |

## Défaut corrigé
`aicache.takeDailyCap` comptait par jour UTC (remise à zéro à 20 h, heure de Montréal l'été) et `aibudget.todayLocal` suivait le fuseau du processus. Les deux passent par `aifeaturecaps.dayKey` (jour civil America/Toronto, même fuseau que Montréal). `scripts/ai-cost-report.js` aussi.

## Tarifs
Un seul endroit : `PRICES` et `PRICES_UPDATED` dans `server/lib/aimodels.js` (valeurs d'avant, non vérifiées en ligne). Le rapport affiche les tarifs, la date et un avertissement au-delà de 90 jours. Confirmation demandée : `docs/questions-emilien-credits.md`.
