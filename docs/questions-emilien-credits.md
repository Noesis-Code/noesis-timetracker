# Questions à cocher — Crédits Claude et API

Regroupées par thème (20 oct. 2026). « Reco. » = recommandation de l'agent. Rapport hebdomadaire : `node scripts/ai-cost-weekly.js` (base) ou `--from export.json`. Projection : `node scripts/ai-cost-projection.js` (`docs/ia-projection-2026-10-20.md`).

## 1. Alertes de coût
Aujourd'hui les alertes (coût du jour tous comptes, plafond à 80 %, rapport hebdo) vont au journal serveur seulement, une fois par jour de Montréal. Le seuil global existe mais est FIXE (8 $/jour, 5 $/semaine) : franchi tous les jours vers 100 utilisateurs moyens, muet à 10 comptes intensifs (`docs/ia-projection-2026-10-20.md`).
- Décision d'Émilien (20 oct.) : NON au seuil quotidien de 0,50 $ x comptes (trop strict) ; coût limité PAR SEMAINE seulement.
  - [ ] Seuil hebdomadaire = 3,5 $ x comptes actifs (10 comptes : 35 $ ; 100 : 350 $), à la place de 5 $ fixes ? Calcul prêt et testé (`server/lib/aialertthreshold.js`, `scripts/ai-cost-weekly.js`), désactivé tant que `AI_ALERT_ADAPTIVE=1` n'est pas posé. Le seuil quotidien de 8 $ reste inchangé.
- Canal d'alerte, un seul à choisir. Reco. : push à ton compte (rien à configurer sauf une variable désignant ton compte).
  - [ ] Journal seulement (statu quo) : il faut lire les journaux Railway ; aucun bruit.
  - [ ] Notification push à ton compte : un message au premier dépassement du jour et par seuil ; demande de désigner ton compte par une variable d'environnement.
  - [ ] Courriel Resend : un courriel par dépassement ; demande `ALERT_EMAIL` et une clé Resend active en production.

## Décisions validées OUI (Émilien, 20 oct. 2026)
Délais d'expiration plus courts, relances 429/529, retrait des replis payants, réparation locale du JSON, tarifs (Haiku 1/5, Sonnet 3/15, Opus 15/75). Le disjoncteur de panne est documenté dans `docs/ia-panne-2026-10-20.md`.

## 2. Tarifs
`PRICES` dans `server/lib/aimodels.js` (mis à jour le 2026-10-16, non vérifiés en ligne). Le rapport avertit au-delà de 90 jours.
- [ ] Confirmer les tarifs ($ par million de jetons, entrée/sortie) : Haiku 1/5, Sonnet 3/15, Opus 15/75 ? Si faux, donner les bons chiffres. Reco. : confirmer (toute la projection en dépend).

## 3. Évaluations `--live` (toi seul peux les lancer : coût réel)
- [ ] Regrouper plusieurs classements de tâches en un seul appel IA (économie attendue, qualité à mesurer) ? Reco. : évaluer après le point suivant, gain modeste (le classement pèse ~15 % du coût).
- [ ] `eval-task-precision.js --live` pour décider de retirer le repli Sonnet du classement (Haiku seul) ? Reco. : oui, c'est la mesure qui débloque les deux.

## 4. Réduire l'entrée envoyée (qualité non mesurable hors `--live`)
- [ ] Rapprochement tâche -> objectif : plafond de candidats envoyés 60 -> 25 (pire cas 5236 -> ~2200 jetons ; avec les hypothèses de la projection, profil moyen 2,35 -> 2,12 $/mois, -10 % du total ; `docs/ia-rapprochement-2026-10-20.md`) ? Risque : un objectif sans mot commun au-delà du 25e n'est plus proposé (le repli lexical reste). Reco. : oui, c'est la fonction qui pèse le plus.
- [ ] Troncature inter-secteurs (objectif du candidat 240 caractères, description 160 ; -56 % d'entrée au pire cas, `docs/ia-entree-bornee-2026-10-20.md`) : l'accepter ? Si non, retirer `cut(...)` dans `buildPayload` (`crosssectorinference.js`). Reco. : accepter (jamais d'identifiant coupé, vérifié).

## 5. Mesure et mémoire
- [ ] Conserver les réponses IA répétées (orthographe, classement) après un redémarrage, via une table de la base ? Reco. : non tant que la projection n'est pas confirmée en production (l'orthographe ne pèse que ~5 %).
- [ ] Enregistrer, sans le texte, si une reformulation proposée est utilisée (mesurer son utilité, la retirer si personne ne s'en sert) ? Reco. : oui, 1 compteur, aucune interface.

## 6. Loi 25 (registre des traitements, texte légal non modifié par l'agent)
- [ ] Ajouter au registre (et à la politique de confidentialité si utile) : « Les courriels, numéros de téléphone et numéros de carte/NAS probables écrits dans un texte libre sont masqués automatiquement avant tout envoi à l'IA » (`server/lib/aiscrub.js`) ? Reco. : oui.

## Information (rien à cocher)
Relance unique de la génération de tâches (`documenttasks.propose`) : au plus UN appel de plus quand toutes les tâches générées sont rejetées, sans créneau horaire de plus, après vérification du budget par compte ; le plafond en dollars (`AI_BUDGET_DAY_USD`, 2 $) borne le total relances comprises (`test/precision-repli-test.js`).
