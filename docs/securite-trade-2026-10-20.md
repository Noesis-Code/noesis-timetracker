# Sécurité de Trade Tracker : cas testés (20 oct. 2026)

Aucune interface changée. Les anomalies cherchées n'ont pas été trouvées : seuls des tests ont été ajoutés (aucun code serveur modifié). Lancer : `node trade-tracker/test/run.js`.

| Cas | Résultat | Test |
|---|---|---|
| Passkey : défi rejoué (même réponse deux fois) | 401, défi détruit à la première lecture | passkey-test (défis) |
| Passkey : défi expiré (> 2 min), inscription et connexion | 401 | passkey-test (défis) |
| Passkey : défi émis pour une autre session | 401 | passkey-test (défis) |
| Passkey d'un autre utilisateur utilisée pour se connecter | refus (« inconnue »), jamais acceptée | passkey-test |
| Voir / supprimer la passkey d'autrui | invisible ; suppression refusée, passkey intacte | passkey-test ; cloisonnement-test §6 |
| /api/auth : 20 requêtes par minute et par IP | la 21e reçoit 429 + Retry-After (limite par défaut) | ratelimit-test (exact 21) |
| Chaque route /api/auth (TOTP, passkey, step-up) comptée | oui, suppression de passkey comprise | ratelimit-test |
| Client 1 lit les données du client 2 (11 routes de lecture × 7 variantes de paramètres : userId, accountId, scope, symbol) | jamais ; ni erreur 500 | cloisonnement-test §1 |
| `scope=expert` | seulement l'expert, jamais un autre client | cloisonnement-test §2 |
| Client appelle les routes d'invitation (expert seulement) | 403 | cloisonnement-test §3 |
| Audit et sessions d'un compte | uniquement ses lignes | cloisonnement-test §4 |
| Supprimer le jeton courtier en visant un autre compte | aucune donnée d'autrui touchée | cloisonnement-test §5 |
| « Fermer toutes mes sessions » du client 2 | ne ferme pas celles du client 1 | cloisonnement-test §7 |
| Sauvegarde tronquée, vide, octets altérés | refusée, rien n'est écrit | backup-version-test |
| Base SQLite d'une autre application | refusée (tables manquantes) | backup-version-test |
| Fichier introuvable | refusé | backup-version-test |
| Chaîne d'audit altérée | refusée | backup-test |
| Sauvegarde d'une version plus ancienne (tables récentes absentes) | acceptée, migrée à l'ouverture, données intactes | backup-version-test |
| Sauvegarde d'une version plus récente (colonne inconnue) | acceptée, colonne conservée | backup-version-test |
| Restauration sur une base existante | refus sans `--force` ; avec, l'ancienne est gardée | backup-test |
| Sauvegarde puis restauration de bout en bout | mêmes données, secrets chiffrés, chaîne d'audit valide | restore-e2e-test |
| En-têtes : no-store, nosniff, CSP, CORP, Permissions-Policy, Referrer-Policy, Clear-Site-Data | présents sur toutes les réponses | headers-test, security-test |
| HSTS | présent derrière HTTPS, absent en HTTP | headers-test |
| Origin étranger sur écriture (CSRF) | 403 | security-test |

## Limite connue
Il n'existe pas de numéro de version de schéma dans la sauvegarde : une version « plus récente » est acceptée telle quelle. Sans risque aujourd'hui (la migration ne supprime rien), à revoir si une migration destructive est un jour ajoutée.
