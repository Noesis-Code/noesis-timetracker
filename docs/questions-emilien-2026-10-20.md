# Questions en attente : index (20 oct. 2026)

Une case par ligne, par urgence. Détail dans le fichier cité (`questions-emilien-<chantier>.md`). Les lignes sans fichier source se cochent ici.

## 1. Urgent : bloque une mise en ligne
- [ ] Trade Q4 : le service Railway Trade existe-t-il ? (`trade`)
- [ ] Trade Q5 : critères « validé » du portefeuille réel (`trade`)
- [ ] Trade Q6 : condition de lancement en production (`trade`)
- [ ] Expansion : valider les courriels, activer `EXPANSION_MAILS=1` (`expansion`)
- [ ] Expansion : « Offre 1 » devient « Expansion » dans CGU et confidentialité (`expansion`)
- [ ] Expansion Q9 : rappel avant renouvellement, désactivé par défaut ? (`expansion`)
- [ ] Crédits : ajouter au registre Loi 25 « Apprentissage du classement des tâches » (`apprentissage-usage.md`)
- [ ] Basic : 26 bugs staging du 2 oct. (#1299, #1307, #1308) (`basic`)
- [ ] Basic : effacer nom de famille et téléphone en base (irréversible, après sauvegarde) (`basic`)

## 2. Gros gain : retirer de l'interface
- [ ] Simplification : 15 cases retirer/garder/déplacer (Feuille de temps, Stats, Communauté, pastille) (`simplification`)
- [ ] Trade Q7 : retraits de l'écran Trade (`trade`)
- [ ] Trade Q3 : filtres de Positions à garder (`trade`)
- [ ] Basic : retirer les écrans de `points-non-necessaires.md`, ne rien ajouter (`basic`)

## 3. Gain moyen : débloque des tâches
- [ ] Trade : afficher le gain réalisé (calcul prêt, non branché à l'écran) (`fiabilite-trade-2026-10-20.md`)
- [ ] Basic : entrée dimanche 23 h → lundi 1 h, compter l'heure après minuit au lundi ? (`basic`)
- [ ] Trade Q1 : « temps réel » = 15 min suffisent ? (`trade`)
- [ ] Trade Q2 : lien privé déjà fait ? (`trade`)
- [ ] Trade L1 : journal d'audit après effacement d'un compte : garder, anonymiser ou limiter la durée ? (`loi25-trade-2026-10-20.md`)
- [ ] Trade L2 : sauvegardes contenant un compte effacé : expiration seule (~14 jours) ou purge ? (`loi25-trade`)
- [ ] Trade L3 : déclencheur de l'effacement : script, propagation depuis TMT ou bouton ? (`loi25-trade`)
- [ ] Trade L4 : déclencheur de l'export : script d'abord, route ensuite ? (`loi25-trade`)
- [ ] Trade L5 : texte légal (politique, registre) à compléter pour Trade, à rédiger par toi (`loi25-trade`)
- [ ] Crédits : garder le seuil d'alerte à 5 $ par semaine (`credits`)
- [ ] Crédits : évaluations `--live` (regroupement des classements, retrait du repli Sonnet) (`credits`)
- [ ] Précision : évaluation `--live` du jeu à l'aveugle (~83 % simulé) (`precision-aveugle-2026-10-20.md`)
- [ ] Précision : 5 cas à trancher, ex. « horaire », « loyer » (`precision`)
- [ ] Crédits : mémo IA persistant ; signal d'acceptation de la reformulation (`credits`)
- [ ] Contrastes : 3 couleurs sous 4,5:1 (`contrastes-basic.md`)

## 4. Ajouts (refus par défaut, Simplification)
- [ ] Basic : vues jour/semaine/mois/année, responsable de tâche, bouton « besoin », zone Communauté, prise de RDV (`basic`)

## 5. Accès et sessions
- [ ] Benchmarks (Trade Q8, temps) : session avec recherche web (`trade`, `simplification`)
- [ ] Expansion : relire les tâches du secteur depuis une session avec le MCP TiMeTracker (`expansion`)

## 6. Infra
- [ ] Nettoyer ~1384 fichiers orphelins `/tmp/noesis-verify-*` (68 Mo) : destructeur, à valider ; cause corrigée.
- [ ] Healthcheck `/healthz` dans `railway.json` (route prête, fichier non touché).
