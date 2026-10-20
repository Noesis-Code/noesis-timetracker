# Fiabilité des calculs Trade Tracker (20 oct. 2026)

Aucune interface changée. Tests : `trade-tracker/test/finance-test.js` (calculs purs, résultat attendu calculé à la main en commentaire), `prix-manquants-test.js` (serveur), `pricewatch-test.js`, `calc-test.js`.

## Écarts corrigés
- Position courte (quantité < 0) masquée par `quantity > 0` : désormais affichée (valeur négative, gain +1000 pour -100 @ 50 vendu, prix 40).
- Gain % d'une position courte de signe inversé (coût négatif) : dénominateur en valeur absolue (`calc.pct`, portefeuille, comptes).
- Prix absent à la synchro (marché fermé, symbole sans cote) : la synchro effaçait le dernier prix et son horodatage ; ils sont maintenant conservés (`sync.js`), la mention « Prix mis à jour » reste exacte et l'alerte « prix en retard » continue de se déclencher.
- Ajout de `calc.realizedSummary` (pur, non branché à l'écran) : gain réalisé, coût moyen pondéré, dividendes. Réalisé converti au taux courant (taux historique par transaction non conservé).

## Cas, résultat attendu, test
| Cas | Résultat attendu | Test |
|---|---|---|
| Fraction 2,5 @ 40, prix 44,10 | coût 100, valeur 110,25, gain 10,25 (10,25 %) | finance-test §1 |
| Fraction 0,001 @ 40 000, prix 50 000 | gain 10 (25 %) | §1 |
| USD 10 @ 30, prix 33, taux 1,25 | coût 375, valeur 412,50, gain 37,50 CAD | §2 |
| Taux USD absent / 0 / négatif | montants CAD null, jamais inventés | §2 ; prix-manquants (fxMissing) |
| Vente à découvert -100 @ 50, prix 40 / 60 | gain +1000 (+20 %) / perte -1000 (-20 %) | §3 ; prix-manquants |
| Coût moyen 0 ; sans prix | pas de division par zéro ; valeur au coût, gain 0 | §3 |
| Achats 100 @ 10 + 100 @ 14, vente 50 @ 20 | CMP 12, réalisé 400, reste 150 | §4 |
| Transactions dans le désordre | trié par date, même résultat | §4 |
| Frais dans les montants | réalisé net 485 | §4 |
| Fractions 0,5 @ 100, vente 0,2 @ 130 | réalisé 6, reste 0,3 | §5 |
| Short fermé 50 -> 40 / 60 ; partiel ; retournement | +1000 / -1000 ; +200 reste -60 @ 50 ; +1000 reste -50 @ 20 | §6 |
| USD réalisé et dividendes mixtes | 75 CAD ; 15 CAD ; sans taux null | §7 |
| Réalisé + non réalisé | 200 + 120 = 320 | §8 |
| Rendement : dividende, apport, retrait, composition | +5 % ; 0 % ; 0 % ; +10 % puis -10 % = -1 % | §9 |
| Répartition avec position courte | somme des poids = 100 | §10 |
| Prix absent après un prix connu | dernier prix et horodatage conservés, valeur sur ce prix | prix-manquants |
| Symbole jamais coté | valeur au coût, gain 0, pas d'horodatage | prix-manquants |
| Nouveau prix reçu | remplace l'ancien | prix-manquants |
| Prix en retard > seuil | alerte unique par 24 h, `/health` pricesStale | pricewatch-test |

## Limites connues
- Les positions courtes n'entrent pas dans la répartition par secteur (poids sur valeurs positives seulement).
- Le gain réalisé n'est pas affiché : décision d'écran à prendre par Émilien (aucun écran ajouté ici).
