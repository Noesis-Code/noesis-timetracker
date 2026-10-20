# Robustesse et confidentialité des appels IA (chantier 4, repli 16, 20 oct. 2026)

Faux client IA = `global.fetch` remplacé. Tests : `test/ia-robustesse-test.js` (robustesse), `test/ia-confidentialite-test.js` (Loi 25). Aucun changement visible.

Cas testés pour chaque fonction : JSON illisible (`res.json()` lève), texte coupé, arrêt `max_tokens`, `content` vide, texte vide, prose hors format, `null`, délai dépassé (`TimeoutError`), réseau coupé, HTTP 500. Colonne « plafond » = prises de plafond quotidien par appel de la fonction.

| Fonction | Cas | Résultat | Appels / plafond | Test |
|---|---|---|---|---|
| Reformulation (`proposeRewrite`) | tous les cas | `null` (jamais d'exception). Texte lisible mais hors format = simple proposition que la personne valide ou non | <= 2 appels (rapide puis fort) / plafond x1 | robustesse |
| Orthographe silencieuse (`fixText`) | tous les cas | `null`, titre inchangé ; refus de `isPureSpellingFix` inchangé | 1 appel | robustesse |
| Récurrence (`suggest`) | tous les cas | `null` | 1 appel / plafond x1 | robustesse |
| Classement (`classifyCategory`) | tous les cas | normal : premier candidat (`usedAi:false`) ; strict : `unresolved` avec les candidats (la personne choisit) | <= 2 appels / plafond x2 (un par appel réel, rapide puis fort : voulu) | robustesse |
| Rapprochement tâche -> objectif (`matchObjective`) | tous les cas | repli lexical (`method:'lexical'`) | 1 appel / plafond x1 | robustesse |
| Objectifs hebdo (`generateForPeriod`, `callAi`) | tous les cas | `{error:true}` ou liste vide, jamais d'exception ; échec jamais mémorisé | <= 3 appels (rapide, fort, relance si « illisible ») / plafond x1 | robustesse |
| Inter-secteurs (`evaluateCrossSectorLinks`) | tous les cas | `{error:true}` ou `{written:0}`, jamais d'exception | <= 3 appels | robustesse |
| Documents / modifications / redistribution (`docanalysis.call`) | tous les cas | panne propagée sous forme d'`Error` (ou texte brut à valider en aval), rattrapée par les appelants (`prepareProposal`, `generate`) ; JSON invalide ou tronqué du modèle rapide => modèle fort | <= 2 appels | robustesse |
| Plan Offre 1 (`generateSubProjectsPlan`) | tous les cas | `Error` propre, aucun repli local par conception : l'abonnement et le quota ne sont pas avancés (voir `regenerateActivityRoadmap`) | <= 2 appels / plafond x1 | robustesse |
| Délai dépassé | chaque requête réseau | porte un `AbortSignal` (15 s classement/reformulation, 45 s documents, 90 s hebdo et inter-secteurs, 120 s Offre 1) | - | robustesse |
| Analyseurs `parseWeeklyGoals`, `parseSuggestions`, `parsePlan` | `null`, `[]`, `"x"`, entrées `null` dans les listes | erreur « illisible » propre ou liste vide, jamais de `TypeError` | - | robustesse |
| Échec puis reprise | HTTP 500 puis succès | la reprise réussit (rien de mémorisé) | - | robustesse |

## Corrections minimales faites
- Délai manquant : hebdo, inter-secteurs et plan Offre 1 n'avaient aucun délai (une requête bloquée attendait sans fin). Ajout de `signal: AbortSignal.timeout(...)`.
- `parseWeeklyGoals`, `parseSuggestions`, `parsePlan` : une réponse `null` ou une entrée `null` dans la liste levait une `TypeError` au lieu de l'erreur « illisible » (ou d'une liste vide).

## Limite connue (non corrigée)
- Reformulation : le modèle fort n'est pas validé (prose du type « Désolé... » possible comme proposition). Reste une proposition que la personne accepte ou refuse ; détecter un refus de modèle demanderait une règle de plus.

## Confidentialité (Loi 25)
Profil d'essai : prénom/nom d'utilisateur, nom de famille, courriel (et sa partie locale), téléphone (formaté et en chiffres), identifiant de compte, et un second membre dans l'activité. Le test capte le corps complet (consigne système + messages) de chaque requête réseau de : classement (normal et strict), reformulation, orthographe, récurrence, rapprochement, objectifs hebdo, inter-secteurs, document/tâches, modifications proposées, plan Offre 1. Résultat : aucune de ces valeurs n'apparaît. Les prompts ne contiennent que le contenu métier (tâches, objectifs, catégories, réponses libres des formulaires Offre 1). Témoin : le contenu métier est bien retrouvé dans les corps captés (le détecteur voit ce qu'il doit voir). Les noms de membres n'entrent dans aucun prompt (l'attribution est résolue côté serveur). Les réponses libres des formulaires Offre 1 sont envoyées telles que saisies : si une personne y écrit son courriel, il part au modèle (non filtré ; à décider par Émilien si on veut un masquage).
