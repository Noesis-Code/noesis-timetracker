# Expansion — code gratuit et états affichés (20 oct. 2026)

Tests : `test/expansion-code-statut-test.js` (+ `test/offer1access-test.js`). Aucun réseau, clés de test seulement.

## Code gratuit (POST `/offer1/redeem`)
Mécanisme : hash sha256 dans `OFFER1_FREE_CODE_HASHES` (jamais en clair) ; réussite = droit permanent `offer1_grants` (toutes les activités du compte), révocable (`revokeAccess`).

| Cas | Résultat | Test |
|---|---|---|
| Code inconnu / vide / non texte / sans corps / > 200 car. | 400 « Code invalide. », compte comme échec | oui |
| Casse différente | refusé (sensible à la casse) | oui |
| Espaces autour du bon code | accepté (trim) | oui |
| Usage multiple / déjà utilisé par un autre compte | accepté : un code vaut pour tous les comptes, sans compteur d'usage | oui |
| Même compte rejoue le code | succès, un seul droit (pas de doublon) | oui |
| Compte déjà ouvert + faux code | succès immédiat, pas d'échec compté | oui |
| 5 échecs en 15 min | 429, même avec le bon code, par compte ET par IP ; levé après 15 min | oui |
| Expiration du code | non gérée : retirer le hash empêche les nouveaux, les droits existants restent (révocation manuelle) — question Q11 | oui |
| Révocation puis nouveau code valide | nouvel accès accordé | oui |
| Code de la liste retiré | refusé pour les nouveaux | oui |

Aucun correctif de code nécessaire pour le code gratuit.

## États affichés (écran Expansion de la feuille de route)
Source : GET `/offer/subscriptions` (ajout du champ `status`). Seul `active` ouvre l'accès.

| État réel | Texte affiché | Accès | Test |
|---|---|---|---|
| active | nom de l'activité | ouvert | oui |
| past_due | « Activité — paiement à régulariser » | fermé | oui |
| incomplete / trialing | « Activité — en attente de paiement » | fermé | oui |
| canceled / aucun | absent de la liste (« Aucun abonnement actif pour l'instant. ») | fermé | oui |
| code gratuit seul | pas de ligne (aucun abonnement) ; le lien « J'ai un code » disparaît | ouvert | oui |

Avant : past_due, incomplete et trialing s'affichaient comme un abonnement normal alors que l'accès était fermé.
