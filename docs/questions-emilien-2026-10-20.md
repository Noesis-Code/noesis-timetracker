# Questions en attente : index (20 oct. 2026)

## Les 5 décisions les plus importantes (résumé)
1. Activation d'Expansion en production : courriels (`EXPANSION_MAILS=1`, `RESEND_FROM`), CGU « Offre 1 » -> Expansion, portail Stripe, Q1 à Q4 (`expansion`).
2. Précision : lancer l'évaluation `--live` (~0,05 $, jusqu'à ~0,15 $) pour connaître le vrai taux ; trancher l'horaire fixe A/B/C (`precision`).
3. Infra : supprimer ce qui traîne dans `/tmp` (~1384 fichiers `noesis-verify-*`, 68 Mo) et les fichiers parasites à la racine du système (`/o2.txt`, `/o3.txt`, `/o4.txt`, `/out.txt`, `/x`) : destructeur, à valider.
4. Trade : afficher le gain réalisé (calcul prêt, non branché ; Q9) avant la mise en production (Q4 à Q6).
5. Simplification : trancher les retraits proposés par les audits, cases retirer/garder (`simplification`, Trade Q7).

Une case par ligne, par urgence. Détail dans le fichier cité (`questions-emilien-<chantier>.md`). Les lignes sans fichier source se cochent ici.

## 1. Urgent : bloque une mise en ligne
- [ ] Trade Q4 : le service Railway Trade existe-t-il ? (`trade`)
- [ ] Trade Q5 : critères « validé » du portefeuille réel (`trade`)
- [ ] Trade Q6 : condition de lancement en production (`trade`)
- [ ] Expansion Q1 : valider les courriels (confirmation, fin, rappel, paiement à régulariser), activer `EXPANSION_MAILS=1` (`expansion`)
- [ ] Expansion Q2 : « Offre 1 » devient « Expansion » dans CGU et confidentialité (`expansion`)
- [ ] Expansion Q3 : remboursement ou litige : couper l'accès ou garder ? (`expansion`)
- [ ] Expansion Q4 : code gratuit sans expiration : garder ? (`expansion`)
- [ ] Crédits : ajouter au registre Loi 25 « Apprentissage du classement des tâches » (`apprentissage-usage.md`)
- [ ] Basic : 26 bugs staging du 2 oct. (#1299, #1307, #1308) (`basic`)
- [ ] Basic : effacer nom de famille et téléphone en base (irréversible, après sauvegarde) (`basic`)

## 2. Gros gain : retirer de l'interface
- [ ] Simplification : 15 cases retirer/garder/déplacer (Feuille de temps, Stats, Communauté, pastille) (`simplification`)
- [ ] Trade Q7 : retraits de l'écran Trade (`trade`)
- [ ] Trade Q3 : filtres de Positions à garder (`trade`)
- [ ] Basic : simplifier le premier lancement (retirer l'étape modules, l'étape « Crée tes activités », la confirmation du code ; -3 à -6 taps) (`basic`, section Premier lancement)
- [ ] Basic : retirer les écrans de `points-non-necessaires.md`, ne rien ajouter (`basic`)

## 3. Gain moyen : débloque des tâches
- [ ] Trade : afficher le gain réalisé (calcul prêt, non branché à l'écran) (`fiabilite-trade-2026-10-20.md`)
- [ ] Basic : entrée dimanche 23 h → lundi 1 h, compter l'heure après minuit au lundi ? (`basic`)
- [ ] Trade Q1 : « temps réel » = délai mesuré suffisant ? (`trade`, `trade-delais-2026-10-20.md`)
- [ ] Trade Q2 : lien privé (lien signé 2 min, usage unique) déjà fait ? (`trade`)
- [ ] Trade L1 : journal d'audit après effacement d'un compte : garder, anonymiser ou limiter la durée ? (`loi25-trade-2026-10-20.md`)
- [ ] Trade L2 : sauvegardes contenant un compte effacé : expiration seule (~14 jours) ou purge ? (`loi25-trade`)
- [ ] Trade L3 : déclencheur de l'effacement : script, propagation depuis TMT ou bouton ? (`loi25-trade`)
- [ ] Trade L4 : déclencheur de l'export : script d'abord, route ensuite ? (`loi25-trade`)
- [ ] Trade L5 : texte légal (politique, registre) à compléter pour Trade, à rédiger par toi (`loi25-trade`)
- [ ] Crédits : garder le seuil d'alerte à 5 $ par semaine (`credits`)
- [ ] Crédits : évaluations `--live` (regroupement des classements, retrait du repli Sonnet) (`credits`)
- [ ] Précision : évaluation `--live` du jeu à l'aveugle (~83 % simulé) (`precision-aveugle-2026-10-20.md`)
- [ ] Précision : horaire fixe dans un titre IA, A retirer / B « (vers 9 h) » / C garder (recommandé B) (`precision`)
- [ ] Précision : 5 cas à trancher, ex. « horaire », « loyer » (`precision`)
- [ ] Crédits : mémo IA persistant ; signal d'acceptation de la reformulation (`credits`)
- [ ] Contrastes : 3 couleurs sous 4,5:1 (`contrastes-basic.md`)

## 4. Ajouts (refus par défaut, Simplification)
- [ ] Basic : vues jour/semaine/mois/année, responsable de tâche, bouton « besoin », zone Communauté, prise de RDV (`basic`)

## 5. Accès et sessions
- [ ] Benchmarks (Trade Q8, temps) : session avec recherche web (`trade`, `simplification`)
- [ ] Expansion Q10 : relire les tâches du secteur depuis une session avec le MCP TiMeTracker (`expansion`)

## 6. Infra
- [ ] Nettoyer ~1384 fichiers orphelins `/tmp/noesis-verify-*` (68 Mo) : destructeur, à valider ; cause corrigée.
- [ ] Supprimer les fichiers parasites à la racine du système (`/o2.txt`, `/o3.txt`, `/o4.txt`, `/out.txt`, `/x`) : à valider.
- [ ] Healthcheck `/healthz` dans `railway.json` (route prête, fichier non touché).
