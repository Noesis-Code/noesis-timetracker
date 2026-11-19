# Stratégie d'une catégorie : modèle modulable (19 nov. 2026)

Décision d'Émilien (19 nov. 2026) : la Stratégie d'une catégorie (activité, pôle, secteur) devient un **document modulable**, pour que plus tard (offre payante) des utilisateurs puissent façonner, vendre et s'abonner à des stratégies. Code : `server/lib/categorie-strategie.js`, route `/api/activities/:id/strategie-categorie/:key`.

## Principes
- La Stratégie ne contient NI le résultat visé NI l'horizon : ils vivent dans les objectifs de l'arbre.
- Tout ce que Noèsis a décidé (seuils, durées, nombres) est une **valeur par défaut** (`DEFAUTS`), modifiable. Sans modification : comportement identique à avant.
- L'IA propose, ne décide jamais : avant/après champ par champ, validation ligne par ligne. Le mode « Auto » est stocké mais ne s'applique pas encore.
- Héritage descendant : défauts Noèsis < activité < pôle < secteur (fusion profonde). Le niveau inférieur surcharge ; il ne modifie JAMAIS le supérieur. L'affichage remonte en résumé (valeur effective + origine).
- Rien n'est supprimé (S6) : les anciennes colonnes `kind/sens/famille/rythme/dateFixe/reformer` restent et sont tenues à jour.

## Schéma (JSON versionné `v: 1`, colonne `docJson`, creux : seules les clés posées à ce niveau)
| Famille | Variables |
|---|---|
| nature | `kind` (projet\|progression), `sens` (monter\|descendre\|maintenir), `famille` (13 + autre), `rythme` (regulier\|espaces\|libre), `dateFixe`, `reformer`, `unite` (texte), `structure` (lineaire\|paliers\|libre) |
| temps | `heuresSemaine` (0-168, cible ; vide = celle de l'objectif), `jours` ([1..7]), `pauses` ([{from,to}] 12 au plus) |
| taches | `parSemaine` (0-100), `tailleMin` (5-480), `phases` (reformer, developper, maintenir), `maintenance` (oui/non) |
| objectifs | `decoupage` (aucun\|periodes\|semaines), `jalons` (0-12) |
| personne | `niveau` (debutant\|intermediaire\|avance), `dispoHeures` (0-168), `contraintes` (texte 300) |
| ajustement | `mode` (propose\|auto, défaut propose), `frequence` (hebdo\|mensuel\|periode), `ampleurMaxPct` (1-100), `regles` (voir plus bas) |

Le « retard toléré » et les « seuils de révision » ne sont pas des champs séparés : ce sont les `seuil` / `duree` des règles de la famille Ajustement (une seule source). Le rythme reste dans Nature (migration sans perte).

## Règles « signal, seuil, durée, action » (`ajustement.regles`, une entrée par id)
Règle : `{ signal, seuil, duree, action, actif, label? }`. Règles Noèsis (id fixe, non supprimables, désactivables, « Revenir à la valeur de Noèsis ») et règles de l'utilisateur (id `u_*`, supprimables).

| Id Noèsis | Signal | Défaut | Action | Moteur |
|---|---|---|---|---|
| `chrono-ecart` | `chrono_vs_prevu` : Chrono contre heures prévues | seuil 20 %, durée 4 semaines | `proposer_temps` | ACTIF (`objectifs-ecart.js`) |
| `planifie-ecart` | `planifie_vs_prevu` : durées des tâches ouvertes contre heures prévues | seuil 20 %, durée 0 | `proposer_temps` | ACTIF (`objectifs-ajuste.js`) |
| `retard-periode` | `retard_periode` : travail qui ne rentre pas dans la capacité d'une semaine | seuil 20 % (capacité 120 %), durée 0 | `reporter_suivante` | ACTIF (`goalsperiodlate.js`) |
| `surcharge-jour` | `surcharge_jour` : charge d'un jour contre la référence | seuil 20 %, durée 0 | `marquer` | ACTIF (`goalsoverload.js`) |

Un règle de l'utilisateur est enregistrée mais « pas encore active » (le moteur ne lit que les quatre règles Noèsis).

## Inventaire des signaux (catalogue)
Signal | unité | lu aujourd'hui par le moteur ?
- `chrono_vs_prevu` (% sur n semaines de suite) : oui. `planifie_vs_prevu` (%) : oui. `retard_periode` (% de la capacité) : oui. `surcharge_jour` (%) : oui.
- `taches_en_retard` (nombre), `taches_reportees` (n fois), `regularite` (jours par semaine travaillés), `duree_reelle_vs_estimee` (%, existe en lecture dans `dureefacteur.js` mais ne déclenche rien), `objectif_atteint` (semaines non atteintes de suite), `difficulte_declaree` (1-5), `objectif_modifie` (fois) : stockés seulement.

## Tableau signal, variable modifiée, action proposée
| Signal | Variable touchée | Action proposée (toujours validée par l'utilisateur) |
|---|---|---|
| Chrono au-dessus de +20 % 4 semaines de suite | heures par semaine de l'objectif | fenêtre « Ajuste ton temps » (cause Réel) |
| Durées planifiées au-dessus de +20 % | heures par semaine de l'objectif | fenêtre « Ajuste ton temps » (cause Planifié) |
| Travail au-delà de 120 % d'une semaine | dates des tâches (classement unique) | report silencieux ; message si rien ne rentre |
| Jour au-delà de +20 % de la référence | marque discrète sur le jour | proposition de nouveau plan |
| Tâche reportée n fois, régularité basse, difficulté, objectif non atteint, objectif modifié, durée réelle contre estimée | (à venir) | (à venir) : stockés, aucune action |

## Où vivent les seuils décidés (code réel)
- 20 % Chrono contre prévu : `server/lib/objectifs-ecart.js:9` (`THRESHOLD`), 4 semaines de suite : même ligne (`WEEKS`), rodage 14 jours : même ligne (`RODAGE_DAYS`) ; évaluation `:30-37`.
- 20 % durées planifiées : `server/lib/objectifs-ajuste.js:10` (`THRESHOLD`), test `:44`.
- 120 % de capacité hebdomadaire (retard de période, report, reprise) : `server/lib/goalsperiodlate.js:17` (`LIMITE`), `:51`, `:65`, `:128`, `:225`.
- 20 % de surcharge d'un jour : `server/lib/goalsoverload.js:126` (`TOLERANCE`), `:133`, `:210`.
- Non câblés, stockés seulement : `MIN_OBSERVED_DAYS = 7` et `MIN_BUDGET_MINUTES = 60` (`goalsoverload.js:26,126`), `MARGIN = 1.15` et `HORIZON = 60` (`goalscarryover.js:10-11`), `MAX_TOURS = 3` (`objectifs-boucle.js:5`), `MIN_PROPOSITIONS = 8` (`objectifs-trou.js:10`), 80 % de durées identiques (`documenttasks.js:455`), `MAX_TASKS = 80` (`documenttasks.js:27`).
- 50 % (révision obligatoire) : RETIRÉ par Émilien le 10 nov. 2026 (un seul test, un seul message) ; aucune constante dans le code, donc aucun défaut inventé. Idem « 3 reports » : aucune constante trouvée.

## Actif / stocké
- ACTIF : les quatre règles Noèsis ci-dessus (seuil, durée, activation lus par catégorie) ; la famille Nature (déjà lue par `objectifs-type.js`, `estimateur.js`, `taches-place.js`).
- STOCKÉ seulement : Temps, Tâches, Objectifs, Personne, mode Auto, fréquence, ampleur max, règles de l'utilisateur, signaux non lus.

## À venir (non fait ici)
Place de marché (publier, vendre une stratégie) ; achat et abonnement ; passage hebdomadaire d'IA qui propose des tâches à partir des signaux ; signaux définis librement par formule.
