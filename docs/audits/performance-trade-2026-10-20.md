# Performance et précision de Trade, gros portefeuille (20 oct. 2026)

Base de test déterministe (`trade-tracker/test/lib-gros-portefeuille.js`) : 3 comptes, 200 positions (40 % USD), 5 000 transactions, 1 500 jours d'historique, 300 lignes de synchro. Mesure : `node trade-tracker/test/gros-portefeuille-bench.js`.

## Temps (lecture, par appel, SQLite en mémoire)
| Route | Travail | Temps |
|---|---|---|
| Accueil, positions, répartition | `buildPortfolio` | 2 à 5 ms |
| Rendement / historique | 1 500 points + indice | 4 à 12 ms (bruit de mesure) |
| Achats de l'expert | 5 000 transactions, tri | 3 à 5 ms |
| Journal de synchro | 50 lignes | < 0,1 ms |

Verdict : aucun goulot, tout reste très en dessous de 50 ms. Pas de cache à ajouter.

## Plans de requête (EXPLAIN QUERY PLAN)
Toutes les requêtes de lecture utilisaient déjà un index, sauf deux tris temporaires :
- dernière synchro (`ORDER BY id DESC` par utilisateur, appelée à chaque accueil) : ajout de `idx_synclog_user_id (userId, id)`, tri temporaire disparu ;
- achats de l'expert (`type = 'ACHAT'`) : ajout de `idx_tx_account_type_date (accountId, type, date)` (le tri sur plusieurs comptes reste temporaire, il est court).
L'instantané quotidien garde `idx_tx_account_date` (vérifié par test).

Migration : `CREATE INDEX IF NOT EXISTS` dans `server/db.js` (additive, idempotente). Test de non-régression `gros-portefeuille-test.js` : 8 routes comparées octet pour octet avec et sans les index, instantané identique, index recréés par `migrate`.

## Arrondis et précision monétaire
Contrôles à 0,01 $ près sur la base de volume : positions + encaisse = total ; positions = investi ; comptes = total ; encaisse des comptes = encaisse ; répartitions par compte et par secteur = leur total ; conversion CAD/USD aller-retour sur les 80 positions en USD.
Un seul écart trouvé (0,02 $) : le gain de chaque position était arrondi depuis des valeurs non arrondies, donc la somme des gains affichés différait du gain total. Corrigé dans `calc.positionMetrics` (gain = valeur arrondie - coût arrondi). Les totaux sont déjà construits à partir de montants arrondis par position : pas de dérive de flottants sur 5 000 opérations (aucune somme de transactions n'alimente un total affiché ; seul le flux net du jour passe par `netFlowCad`, arrondi à la fin).
