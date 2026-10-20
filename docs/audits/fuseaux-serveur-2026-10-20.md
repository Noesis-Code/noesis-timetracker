# Fuseaux côté serveur : quel « jour » décide quoi (20 oct. 2026, repli 29)

Le processus serveur tourne à `America/Toronto` (`server/index.js`, pas en UTC). Le téléphone envoie son fuseau (`X-Client-Tz` -> `req.timezone`). Aucun fuseau n'est enregistré au profil.

## Table : fonction -> fuseau utilisé

| Fonction (fichier) | Décide | Fuseau avant | Fuseau maintenant |
|---|---|---|---|
| Entrées (`routes/timer.js`, `history.js`) | jour d'une entrée | téléphone | téléphone |
| Feuille de temps, Répartition, Graphique, Aujourd'hui, Communauté, page publique (`stats.js`, `categorystats.js`, `community.js`, `routes/stats.js`, `profile.js`) | « aujourd'hui », lundi, bornes | téléphone (repli 17) | téléphone |
| Priorité du jour (`goalsdailypriority.js`) | jour pour échéances, objectif en cours, moyennes | Toronto | téléphone (en requête) |
| Tâches non réalisées, report, réalisme (`goalscarryover.js`) | « en retard », jour cible | Toronto | téléphone |
| Surcharge et « écarté aujourd'hui » (`goalsoverload.js`) | plan du jour, écartement du jour | Toronto | téléphone |
| Capture : date par défaut, placement, redispatch (`subprojects.todayIso`, `goalscaptureplace.js`, `goalsauto.js`, `goalscapacity.js`) | jour d'une tâche créée sans date | Toronto | téléphone |
| Planning, période en cours, tâches closes (`goals.js`, `goalstasks.js`, `statsactivityprogress.js`, `statsinsights.js`, `calendarfeed.js`, `timecaps.js`) | période courante, clôture, moyennes 28 j | Toronto (clôture : **UTC**) | téléphone |
| Propositions de document (`changeproposals.js`, `documenttasks.js`) | « jamais avant aujourd'hui » | Toronto | téléphone |
| Recalcul nocturne (`goalsrecalc.js`, cron 3 h 30 `America/Montreal`) | périodes passées | Montréal | Montréal (apply en requête : téléphone) |
| Rappel de 6 h (`dailysuggestioncron.js`) | heure d'envoi + liste du jour | Toronto | **Toronto (inchangé)** |
| Rappels d'échéance d'objectif / sous-projet (`goalreminders.js`, `duereminders.js`, balayage 30 min) | « jours restants » | Toronto | Toronto (inchangé) |
| Bilans automatiques (`goals.js` balayage 6 h), abonnements (3 h, horaire), comptes inactifs | jour de balayage | Toronto | Toronto (inchangé) |
| Plafonds et budget IA par jour/mois (`aibudget.js`, `aifeaturecaps.dayKey`) | jour du compteur | Montréal | Montréal |
| Plafonds par jour de `silentspellfix.js`, `crosssectorinference.js`, `drivesync.js` (`drive_ai_usage.day`) | jour du compteur | **UTC** | Montréal (repli 30) |
| MCP (`routes/mcp.js`, `todayLocal` propre) | dates relatives de l'outil | Toronto | Toronto (client IA sans en-tête) |

Mécanisme : `dates.runWithTimezone` (posé par `session.js`, même technique que `aibudget.runAs`) et `dates.userToday()`. Les `todayLocal()` des modules d'objectifs l'appellent ; hors requête (cron, script, test) : jour du processus, comme avant.

## Incohérences (non corrigées : cases dans l'index)
1. **Rappel de 6 h** : heure de Toronto pour tous (Paris : midi, Vancouver : 3 h). Il faut un fuseau enregistré (dernier `X-Client-Tz`) : nouveau champ de profil, donc à décider.
2. **Rappels d'échéance** (30 min) : « il reste N jours » compté au jour de Toronto ; écart d'au plus un jour pour Paris/Vancouver, sans doublon (clé période + seuil).
3. **Trois définitions du jour pour les plafonds** : Montréal (budget IA), UTC (correction orthographique, inter-secteurs, Drive). Le plafond UTC se remet à zéro à 19-20 h à Toronto. **Corrigé (repli 30)** : les trois utilisent maintenant le jour de Montréal (`aifeaturecaps.dayKey`) ; avant, chacun pouvait être consommé deux fois dans un même jour de Montréal (Drive 40 -> 80 appels, inter-secteurs 30 -> 60 par activité). Test : `test/ia-plafonds-jour-test.js`.
4. **Activité partagée entre fuseaux** : chaque membre voit « aujourd'hui » selon son téléphone ; une échéance posée par l'un est lue au jour de l'autre. Voulu.
5. Les cron (rappel de 6 h) calculent la liste avec le jour de Toronto, pas celui du membre : la notification peut annoncer une tâche du jour de Toronto.

## Corrigé dans ce repli (perdait ou décalait un jour)
- Vancouver à 23 h 30 : une tâche capturée sans date prenait le lendemain, et les « non réalisées » comptaient en retard la tâche du jour. Paris à 00 h 30 : tâche capturée la veille, donc déplacée comme « en retard ». Même chose à l'heure répétée du changement d'heure. Corrigé par `userToday()`.
- `goalstasks.js` : clôture d'un sous-projet comparée à la date **UTC** (un jour trop tôt le soir) : désormais jour du téléphone.
- `db.js` : à la première ouverture d'une base neuve, la reconstruction de `goal_periods` retirait `carriedOverFromId/carriedToId` (liste « Non réalisées » en erreur jusqu'au redémarrage) : colonnes recréées après la reconstruction.

## Test d'invariance : `test/fuseaux-invariance-test.js`
Horloge simulée, serveur à Toronto. 16 cas (Montréal, Paris, Vancouver ; 23 h 30, 00 h 30, veille/jour/heure répétée des changements d'heure d'octobre-novembre et de mars). Pour chacun : priorité du jour, non réalisées, Feuille de temps et date d'une tâche capturée donnent le même jour (celui de la date murale du téléphone) ; hors requête le jour de Toronto est conservé. Avant correctif : 13 échecs (Vancouver 23 h 30, Paris 00 h 30, heure répétée de Paris) ; après : 96 vérifications, 0 échec.
