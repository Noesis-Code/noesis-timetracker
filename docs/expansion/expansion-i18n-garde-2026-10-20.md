# Expansion — garde i18n et achat réservé à staging (20 oct. 2026)

Tests : `test/expansion-i18n-test.js`, `test/expansion-achat-staging-test.js` (branchés dans `test/run-tests.js`). Aucun réseau.

## Garde i18n (les clés sont les phrases FR ; un texte sans entrée dans `public/i18n.js` reste en français en EN)
| Zone auditée | Écart trouvé | Correction |
|---|---|---|
| Carte Expansion (`objectifs-page1.js`) | « J’ai un code » sans EN | clé ajoutée |
| Panneau code (`objectifs-offre1-code.js`) | titre, « Code d’accès » (placeholder, aria-label) non traduits ; « Entre un code. », « Vérification… », « Erreur. Réessaie. », « Code invalide. » en dur | gabarit passé par `translateStaticDom`, messages par `t()`, 5 clés ajoutées |
| Erreurs serveur du code (`offer1access.js`) | « Trop d’essais… » sans EN | clé ajoutée (texte FR affiché via `api()` → `t()`) |
| Fenêtre Souscrire (`index.html`), bloc Expansion de `app.js`, erreurs d’achat | aucun | — |

Le test échoue si : une chaîne de ces zones n’a pas de traduction EN ; un message du panneau code ou du bloc Expansion est posé en dur hors `t()` ; le gabarit du panneau n’est plus traduit à l’injection.

## Achat réservé à staging (règle CLAUDE.md)
| Cas | Résultat | Test |
|---|---|---|
| production / sans environnement + clé de test | `/offer/available` faux ; `POST /offer/checkout` 403, aucun appel Stripe (avant : refus seulement côté bouton) | oui |
| production + `OFFER_CHECKOUT_OPEN=1` | ouvert (décision d’Émilien) | oui |
| staging + clé de test | ouvert | oui |
| staging + `sk_live_` / `rk_live_` | clé traitée comme absente : 503, aucun appel Stripe, client Stripe refuse | oui |
| production + clé live | acceptée | oui |
| client | bouton inerte dans le gabarit, activé seulement si `available=true` ; aucun autre code ne le réactive | oui |

Code : `checkoutOpen()` et `liveKeyOnStaging()` dans `server/lib/stripe.js` (source unique, utilisée aussi par `/offer/available`) ; garde dans `server/routes/offercheckout.js`. Les tests d’achat existants posent `RAILWAY_ENVIRONMENT_NAME=staging` (ou `OFFER_CHECKOUT_OPEN=1`).
