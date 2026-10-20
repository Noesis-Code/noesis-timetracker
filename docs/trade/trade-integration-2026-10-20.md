# Intégration TMT <-> Trade Tracker : preuves (20 oct. 2026)

Chantier 1, repli 15. Deux vrais serveurs locaux (ports éphémères, bases temporaires, aucun réseau externe). Aucun code de production modifié : tout passe déjà. Test : `node test/trade-e2e-test.js` (sections 1-3 et 7) ; interface : captures 390 px dans `docs/img/trade-activite-*.png`.

| Scénario | Résultat | Test |
|---|---|---|
| Module jamais activé (id autorisé) | lien refusé (403 `module_off`) | e2e §1 et §7 |
| Compte non autorisé (`tradeAllowed` faux) | activation refusée (403), Trade non listé, lien refusé | e2e §1-2, §7 |
| Sans session | refusé | e2e §1 |
| « + » dans « modifier l'activité » = activation | module actif, lien signé renvoyé | e2e §2 ; capture `avec-1/2` |
| Ouverture de Trade avec le lien | 302 vers `/`, session créée, identité = expert (`/api/me`) | e2e §3 |
| Lien réutilisé | refusé (`linkError=denied`), aucune session | e2e §3 |
| Lien falsifié / autre secret | refusé | e2e §3, §7 |
| Lien expiré (> 2 min) | refusé (`linkError=expired`) | e2e §3 |
| Lien d'un autre compte (jamais invité) | refusé, aucune session | e2e §7 |
| Lien ouvert dans un autre navigateur | refusé (empreinte du user-agent) | e2e §7 |
| Retrait de Trade (interrupteur) | nouveau lien refusé (`module_off`), onglet Trade retiré, « + » revient | e2e §7 ; capture `avec-3` |
| `tradeAllowed` retiré alors que la base dit actif | module inactif, masqué, jamais actif | e2e §7 |
| Interface sans `tradeAllowed` | aucune ligne « Trade Tracker » | capture `sans-1` |
| Interface avec `tradeAllowed` | ligne « Trade Tracker » + « + » alignée, puis interrupteur après connexion, aucune rupture de mise en page | captures `avec-1/2/3` |

Limite connue (documentée, pas corrigée) : un lien émis juste AVANT le retrait reste utilisable jusqu'à 2 min, une seule fois (Trade ne rappelle pas TMT ; aucune donnée en jeu). Un contrôle en retour serait un nouveau mécanisme.

## Risque du lien de dernière minute (repli 16)
Question : un lien émis juste avant le retrait de Trade reste valable 2 min. Qui peut s'en servir ?
- **Un tiers qui n'est pas le titulaire** : non en pratique. Le jeton est signé (HMAC), lié à l'identité (`sub` = id TMT du titulaire, déjà connu de Trade ou expert/invité ; un id jamais invité est refusé `not_invited`), à l'audience `trade-tracker`, au navigateur (hash du user-agent, obligatoire en production : ouvert ailleurs = refusé) et à usage unique (`jti` mémorisé). Le lien n'est livré qu'à la session TMT du titulaire (route réservée aux ids autorisés).
- **Le titulaire lui-même, dans le même navigateur**, pendant 2 min, une fois : oui. Il obtient alors une session Trade, mais celle-ci exige la vérification en deux étapes (TOTP) avant toute donnée, et ne lui donne que SES données (cloisonnées par utilisateur). Il pouvait déjà les voir 2 minutes plus tôt.
- **Impact** : aucune donnée d'un autre compte ; aucune action possible sur le courtier (connecteur en lecture seule, écriture bloquée). Risque réel : très faible.
- **Plus long que le lien** : une session Trade déjà ouverte avant le retrait n'est pas fermée par le retrait (Trade ne rappelle pas TMT) : inactivité 15 min, durée absolue 12 h. Même profil de risque (titulaire seul, MFA), mais fenêtre plus grande que les 2 min du lien : à cocher aussi en Q11.
- **Recommandation** : accepter. Un rappel Trade -> TMT (ou une révocation TMT -> Trade) serait un nouveau mécanisme entre deux services pour fermer une fenêtre que seul le titulaire peut utiliser. Question en cases : `questions-emilien-trade.md`, Q11. Rien n'est modifié.
