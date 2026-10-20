# Questions à cocher — Crédits Claude et API

- [ ] Lancer une évaluation `--live` du regroupement de plusieurs classements de tâches en un seul appel IA (économie attendue, qualité à mesurer) ? — tâche bloquée : Regrouper les classements en un appel — champ manquant : 4 (critère de fin : seule une mesure `--live` d'Émilien peut valider la qualité)
- [ ] Seuil d'alerte hebdomadaire du rapport (`AI_WEEKLY_ALERT_USD`, défaut 5 $ par semaine pour l'ensemble des utilisateurs) : garder 5 $ ? — tâche : Rapport hebdomadaire de coût — champ manquant : 3
- Lecture des tâches du secteur « Crédits Claude et API » : l'outil MCP `lister_taches` n'était pas disponible dans cette session de repli ; aucune tâche traitée.

Rapport hebdomadaire : `node scripts/ai-cost-weekly.js` (base) ou `--from export.json`.

Pistes d'amélioration IA (`docs/ia-amelioration-2026-10-20.md`) :
- [ ] Conserver les réponses IA répétées (orthographe, classement) après un redémarrage du serveur, via une table de la base ? — tâche bloquée : Mémo persistant — champ manquant : 3 (citation d'intention)
- [ ] Enregistrer, sans le texte, si une reformulation proposée est utilisée, pour mesurer son utilité (et la retirer si personne ne s'en sert) ? — tâche bloquée : Signal d'acceptation de la reformulation — champ manquant : 3
- [ ] Lancer l'évaluation `eval-task-precision.js --live` pour décider de retirer le repli Sonnet du classement ? — tâche bloquée : Classement Haiku seul — champ manquant : 4

Loi 25 (registre des traitements, légal non modifié par l'agent) :
- [ ] Ajouter au registre des traitements (et à la politique de confidentialité si tu le juges utile) la mention : « Les courriels, numéros de téléphone et numéros de carte/NAS probables écrits dans un texte libre sont masqués automatiquement avant tout envoi à l'IA » (module `server/lib/aiscrub.js`) ? — tâche : Masquage avant envoi à l'IA

Tarifs IA (`PRICES` dans `server/lib/aimodels.js`, mis à jour le 2026-10-16, non vérifiés en ligne) :
- [ ] Confirmer les tarifs actuels en $ par million de jetons (entrée/sortie) : Haiku 1/5, Sonnet 3/15, Opus 15/75 ? Si faux, donner les bons chiffres ; le rapport `ai-cost-report.js` affiche la date et avertit au-delà de 90 jours (échéance 2027-01-14 ; `test/ia-tarifs-echeance-test.js` avertit aussi, sans faire échouer la suite).

Alerte de dépassement de coût (20 oct. 2026, `docs/ia-pire-cas-2026-10-20.md`) : aujourd'hui, les alertes (coût du jour, plafond à 80 %) vont au journal serveur seulement, une seule fois par jour de Montréal, même après un redémarrage. Canaux existants : la notification push (`server/lib/push.js`, vers un compte précis ; il faudrait désigner ton compte), le courriel Resend (`server/lib/mail.js`, aucune adresse interne configurée, pas de variable `ALERT_EMAIL`), le MCP `notifier` (côté coordinateur seulement, pas depuis le serveur). Rien n'est branché. Quel canal ?
- [ ] Journal seulement (statu quo) : rien ne te prévient, il faut lire les journaux Railway ; aucun risque de bruit.
- [ ] Notification push à ton compte : un message sur le téléphone au premier dépassement du jour (une fois par jour et par seuil) ; demande de désigner ton compte par une variable d'environnement.
- [ ] Courriel Resend : un courriel par dépassement du jour ; demande une adresse de destination (`ALERT_EMAIL`) et une clé Resend active en production.
- [ ] Seuils d'alerte : adopter la règle jour = 1 $ x comptes actifs, semaine = 3,5 $ x comptes actifs (aujourd'hui 8 $ et 5 $, la semaine est incohérente avec le jour) ?


Entrées IA bornées (repli 24, 20 oct. 2026) :
- [ ] Accepter la troncature inter-secteurs (objectif actuel du candidat 240 caractères, description 160 ; -56 % d'entrée au pire cas, `docs/ia-entree-bornee-2026-10-20.md`) ? Si non, cocher ici : revenir au texte complet (retirer `cut(...)` dans `buildPayload`, `server/lib/crosssectorinference.js`). Vérifié : jamais d'identifiant coupé ; décision du modèle non rejouable hors `--live`.
- [ ] Rapprochement tâche -> objectif : ramener le plafond de candidats envoyés de 60 à 25 (pire cas 5236 -> ~2200 jetons, -58 %, `docs/ia-rapprochement-2026-10-20.md`) ? Risque : un objectif sans mot commun au-delà du 25e n'est plus proposé.

Relance unique de la génération de tâches (repli 23, 20 oct. 2026) : quand TOUTES les tâches générées sont rejetées, `documenttasks.propose` refait UN appel (jamais plus ; code vérifié, `test/precision-repli-test.js`). Elle ne contourne rien : même plafond de 10 demandes par heure et par compte (la relance ne prend pas de créneau de plus), et le budget par compte (`aibudget.check`) est vérifié avant : compte au plafond = aucune relance, erreur 429 au message clair (« Limite d'utilisation de l'IA atteinte… Elle reprend le … »). Aucun plafond par fonction (`aifeaturecaps`) n'existe pour `document-taches` : le budget en dollars est le seul garde-fou.
- Coût maximal ajouté : au plus 1 appel de plus par demande où tout est rejeté (cas rare), soit au pire le double du coût de cette demande (palier rapide + éventuel repli fort inclus, 2 appels chacun). Par jour et par compte, le plafond en dollars (`AI_BUDGET_DAY_USD`, 2 $ par défaut) borne le total, relances comprises : le coût ajouté ne peut pas dépasser ce plafond.

Coût des échecs IA (repli 27, relu au repli 28, 20 oct. 2026, `docs/ia-echecs-2026-10-20.md`) : chaque case est un changement de comportement ; décocher = demander de le retirer. Recommandation entre parenthèses.
- [ ] Délai dépassé du modèle rapide : ne plus appeler le modèle fort ; risque : une lenteur passagère du modèle rapide n'obtient plus de second essai ? (Recommandé : oui ; le modèle fort est plus lent, il expirerait aussi.)
- [ ] Erreurs 400/401/403 du modèle rapide : ne plus appeler le modèle fort ? (Recommandé : oui ; même corps ou même clé = même échec. Un 401/403 écrit maintenant une ALERTE clé API au journal, une par heure.)
- [ ] Délais : seul l'hebdo passe de 90 à 60 s (sortie max 1600 jetons, marge x1,9) ; inter-secteurs (90 s) et Offre 1 (120 s) sont RESTÉS aux valeurs d'avant, un délai plus court était trop juste (2500 et 4096 jetons de sortie). Accepter les 60 s de l'hebdo ? (Recommandé : oui ; sinon `AI_TIMEOUT_HEBDO_MS=90000`, sans code. À revoir avec les latences réelles une fois mesurées.)
- [ ] Relances automatiques sur 429/529 (2 au plus, Retry-After respecté, 8 s au plus chacune, non facturées, comptées une seule fois au budget) : jusqu'à 16 s de latence en plus lors d'une surcharge ? (Recommandé : oui ; `AI_RETRY_MAX=0` pour couper.)
- [ ] Réparation locale d'un JSON abîmé avant de rappeler le modèle fort (jamais sur sortie tronquée, jamais de chaîne fermée ni de valeur inventée) : accepter un texte réparé plutôt qu'une relance payante ? (Recommandé : oui ; corrigée au repli 28 : lenteur quadratique sur 1 Mo, `null` inventé et chaîne fermée retirés.)
- [ ] Cache de prompt des documents : lire la colonne « Cache % » de `ai-cost-report.js 30` en production. Si ~0 % sur Haiku (préfixe ~1700 jetons < minimum cachable Haiku 4,5 de 4096), le cache ne paie que sur le repli Sonnet ; rien à changer, chiffre à confirmer.
- [ ] Délai dépassé : le coût éventuel (sortie générée avant coupure) n'est pas journalisé. Écart borné par `max_tokens`/délai ; comparer le total du rapport à la facture Anthropic du mois pour l'estimer.
