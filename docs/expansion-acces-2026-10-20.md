# Expansion — accès côté client, état × route (20 oct. 2026)

Clés Stripe de test seulement, aucun réseau. Tests : `test/expansion-acces-test.js` (matrice complète, événements Stripe signés), `test/migration-lasteventat-test.js` (migration).

## Règle
Accès = abonnement `active` sur l'activité (payé par l'utilisateur lui-même) OU droit par code gratuit actif. Seul `active` ouvre (`server/lib/offer1access.js`). Les routes par activité exigent en plus d'être membre de l'activité.
Remboursement (`charge.refunded`) et litige (`charge.dispute.created`) : **aucun changement d'accès automatique** (choix existant de `stripewebhook.js`, alerte à l'équipe) ; l'accès ne s'arrête qu'avec `customer.subscription.deleted`. À confirmer par Émilien : c'est une règle produit/financière.

## États × résultat (identique pour les 27 routes ci-dessous)
| État du compte | Accès aux fonctions Expansion |
|---|---|
| Aucun abonnement | fermé (403 `offer1_required`) |
| Actif | ouvert |
| past_due | fermé (régularisation par le portail) |
| Annulé (`deleted`) | fermé |
| Remboursé (`charge.refunded`) | inchangé : ouvert si l'abonnement est encore actif |
| Litige (`charge.dispute.created`) | inchangé : ouvert si l'abonnement est encore actif |
| Remboursé puis résilié | fermé |
| Code gratuit actif | ouvert (ses propres activités) |
| Non-membre de l'activité (même abonné ailleurs ou code) | fermé (403) |
| Sans session | 401 |

## Routes Expansion (liste exhaustive, grep `requireOffer1Access` / `activityHasEssor`) — toutes protégées
| Groupe | Routes | Garde |
|---|---|---|
| Capacité de la semaine | GET, PUT `/profile/weekly-capacity` | requireOffer1Access |
| Modifications proposées | GET `/activities/:id/change-proposals` ; POST `…/generate`, `…/apply`, `…/check`, `…/dismiss` | requireOffer1Access + membre + essor |
| Tâches depuis un document | POST `/activities/:id/document-tasks/propose`, `…/apply` | idem |
| Drive | GET `/drive/status`, `/connect`, `/folders`, `/files`, `/sync`, `/sync/pending`, `/sync/added`, `/callback` ; POST `/drive/folder`, `/folder/remove`, `/propose`, `/disconnect`, `/sync/run`, `/folder/settings`, `/sync/resolve`, `/sync/added/ack`, `/sync/added/remove`, `/sync/added/restore` | idem (+ propriétaire pour connecter/gérer) |
| Planification en arrière-plan | `drivesync` (cron), `changeproposals.scheduleForWeekly` (appelé par `PUT /goals` hebdo) | `activityHasEssor` dans le code (testé ailleurs : offer1access-test) |

Volontairement ouvertes (informatives ou achat) : GET `/offer1/access`, GET `/activities/:id/offer1` (renvoie l'état, pas de contenu), POST `/offer1/redeem` (échange de code), POST `/offer/checkout`, `/offer/portal`, GET `/offer/available`, `/offer/subscriptions` (isolées par compte, voir `expansion-securite-2026-10-20.md`).

## Résultat
Aucune route Expansion non protégée trouvée ; aucune correction de code nécessaire. Les routes de planification de base de `routes/goals.js` (surcharge, report, recalcul) restent dans Basic, hors Expansion.

## Migration `lastEventAt`
Base dev-seed (staging) + 3 abonnements : 3 démarrages successifs sur une copie (colonne unique, mêmes données, `integrity_check` ok) ; base « sauvegarde ancienne » sans la colonne : colonne ajoutée au démarrage, lignes conservées avec `lastEventAt` NULL, premier événement appliqué normalement.
