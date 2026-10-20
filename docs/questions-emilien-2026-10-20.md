# Questions à cocher en attente : index unique (20 oct. 2026)

Titre court + lien ; les cases se cochent dans le fichier d'origine. Classé par urgence/gain (débloque le plus, ou bloque la production, d'abord). Précision des tâches : `questions-emilien-precision.md` (cas réels dont le bon résultat dépend d'une préférence).

## 1. Urgent : bloque une mise en ligne ou un chantier entier
- Trade Q4 (service Railway Trade existe-t-il ?), Q5 (critères « validé » du portefeuille réel), Q6 (condition de lancement en production) : `questions-emilien-trade.md`
- Expansion : valider les courriels d'abonnement et activer `EXPANSION_MAILS=1` : `questions-emilien-expansion.md`
- Expansion : remplacer « Offre 1 » par « Expansion » dans CGU et confidentialité (légal) : `questions-emilien-expansion.md`
- Basic : liste des 26 bugs staging du 2 oct. et correctifs en attente (#1299, #1307, #1308) : `questions-emilien-basic.md`
- Basic : effacer nom de famille et téléphone en base (irréversible, après sauvegarde) : `questions-emilien-basic.md`

## 2. Gros gain : retire de l'interface (priorité Simplification)
- Feuille de temps, Stats, Communauté, pastille « Feuille de route » : 15 cases retirer/garder/déplacer : `questions-emilien-simplification.md`
- Trade Q7 (retraits de l'écran Trade) et Q3 (filtres de Positions à garder) : `questions-emilien-trade.md`
- Basic : retirer les écrans listés dans `points-non-necessaires.md` et ne rien ajouter (thèmes, widgets...) : `questions-emilien-basic.md`

## 3. Gain moyen : débloque des tâches
- Trade Q1 (« temps réel » suffisant ?) et Q2 (lien privé déjà fait ?) : `questions-emilien-trade.md`
- Crédits : garder le seuil d'alerte hebdomadaire à 5 $ : `questions-emilien-credits.md`
- Crédits : évaluations `--live` (regroupement des classements, retrait du repli Sonnet) : `questions-emilien-credits.md`
- Crédits : mémo IA persistant ; signal d'acceptation de la reformulation : `questions-emilien-credits.md`

## 4. Ajouts de fonctionnalités (à refuser par défaut selon la Simplification)
- Basic : vues jour/semaine/mois/année, responsable de tâche, liste d'objectifs + bouton « besoin », zone Communauté de Justin, prise de RDV/phase découverte : `questions-emilien-basic.md`

## 5. Accès et sessions
- Benchmarks (Trade Q8, temps) : accès web refusé aux agents, session avec recherche web : `questions-emilien-trade.md`, `questions-emilien-simplification.md`
- Expansion : relancer la lecture des tâches du secteur depuis une session avec le MCP TiMeTracker : `questions-emilien-expansion.md`

## 6. Infra (pilotage)
- [ ] Nettoyer les ~1384 fichiers orphelins `/tmp/noesis-verify-*.db-shm/-wal` (68 Mo au total dans `/tmp/noesis-*`) : action destructrice, à valider. La cause est corrigée (`restore-backup.js verify` supprimait mal ses fichiers temporaires sur échec d'intégrité ; test ajouté) : plus de nouveaux orphelins.
- [ ] Ajouter un healthcheck à `railway.json` : la route `/healthz` existe maintenant côté serveur (200 « ok », sans base) ; `railway.json` non touché, à décider.
