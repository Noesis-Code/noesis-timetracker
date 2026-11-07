# Audit du code mort — 7 nov. 2026 (phase 1, lecture seule)

Base : `origin/staging` 68b2df8f. Méthode : scripts de recherche d'identifiants (mot entier, tout `public/` + `server/` + `scripts/`, hors commentaires) et de classes CSS (classe absente de tout `.js`/`.html`, avec contrôle des noms construits dynamiquement). Preuve = « 0 occurrence hors définition ». Doute = « non ».

## A. JS — fonctions/variables jamais lues (preuve : 0 autre occurrence dans public/ server/ test/)
| # | fichier:ligne | élément | risque | sûr |
|---|---|---|---|---|
| A1 | public/js/objectifs-arbre.js:46 | `idsOf` | faible | oui |
| A2 | public/js/objectifs-arbre.js:47 | `SAME_ACT` (texte jamais affiché) | faible | oui |
| A3 | public/js/objectifs-arbre.js:125 | `colPayload` | faible | oui |
| A4 | public/js/objectifs-creer.js:491 | `durText` | faible | oui |
| A5 | public/js/objectifs-page1.js:75 | `addDaysISO` | faible | oui |
| A6 | public/js/objectifs-page1.js:85 | `toggleGoalsCaptureActivitySelection` (+ `goalsCaptureSelectedActivityIds` à revérifier) | faible | oui (fonction) |
| A7 | public/js/objectifs-page2-objectif.js:961 | `displayColor` (variable locale inutilisée) | faible | oui |
| A8 | public/js/objectifs-page2-taches.js:292 | `TMT.getGoalsPage2Mode` | faible | oui |
| A9 | public/js/objectifs-page2-taches.js:314,327 | `swEl`, `sc0` (locales inutilisées) | faible | oui |
| A10 | public/js/objectifs-page3.js:867 | `wNum` (locale) | faible | oui |
| A11 | public/js/objectifs-page3.js:1012 | `openGoalsMainPop` | faible | oui |
| A12 | public/js/objectifs-page3.js:1019 | `hasTasks` | faible | oui |
| A13 | public/js/objectifs-page3.js:1519 | `TMT.goalsCalMonthIso` | faible | oui |
| A14 | public/js/objectifs-document-taches.js:109,171 | `TMT.docTasksAddFiles`, `TMT.docTasksSubmit` | faible | oui |
| A15 | public/js/objectifs-page1.js:419 | `wNone` (locale) | faible | oui |
| A16 | public/app.js:6307 | `openActivityPage` | moyen (gros fichier partagé) | à vérifier |
| A17 | public/app.js:16206, 16381 | `maxShared`, `spokes` (locales) | faible | oui |
| A18 | public/js/aujourdhui.js:101,797 | `hw`, `flashAdded` | faible | oui |
| A19 | public/js/horaire.js:1044 | `cellState` | faible | oui |
| A20 | public/js/objectifs-page2-objectif.js:~286-520 | **Rail tactile entier** (`goalsScrubDots`, `renderGoalsScrub`, `updateGoalsScrubVisibility`, `showGoalsScrub`, `hideGoalsScrub`, écouteurs scroll/tick, `TMT.updateGoalsScrubVisibility` l.1513, appel l.1458) : `$('goalsScrubRail')`, `$('goalsScrubZone')`, `$('goalsScrubLabel')` n'existent NI dans index.html NI créés en JS (`grep goalsScrub public/index.html` = 0) → tout sort par `if (!rail) return`. ~230 lignes | moyen (appelant app.js `updateGoalsScrubVisibility` à retirer aussi) | oui après retrait des appels |

## B. Serveur
| # | fichier:ligne | élément | preuve | risque | sûr |
|---|---|---|---|---|---|
| B1 | server/lib/goals.js:1084 | `weekIsOver` | 0 usage | faible | oui |
| B2 | server/lib/goalsrecalc.js:17 | `COOLDOWN_DAYS` | 0 usage | faible | oui |
| B3 | server/routes/goals.js:849 | `GET /goals/tasks/history` | aucun appelant (public/, test/, server/lib) | moyen (client externe/MCP ?) | non, à vérifier |
| B4 | server/routes/history.js:39 | `attachmentsFor` | 0 usage | faible | oui |
| B5 | goalscapacity.js:80-81 `shortfall`,`savedTotal`; :93 `addMinutesToWeekOf`; goals.js:446,467 `realignPlanToMonday`,`plansNeedingRealignment`; goalscaptureplace.js:303 `autoPlaceTask`; goalsimportance.js:18 `LEVEL_RANK`; objectifs-temps.js:8 `TIME_LEVELS`; crosssectorinference.js:346; dataexport.js:165,409; modulegate.js:58; planstructurelists.js:11; s3sig.js:102 | exportés mais seule occurrence = la ligne d'export | | faible-moyen (tests ?) | non, à vérifier un par un |

## C. CSS — classes sans élément (absentes de tout .js/.html, noms dynamiques écartés)
Sûr : oui (risque faible), sauf mention. ~60 règles, ~220 lignes.
- objectifs-creer.css : `.objEmpty .objEmptyTitle .objList .objCard .objCardHead .objCardTitle .objNone .objActsTitle .objCustom .objStepHead .objStepToggle .objTaskRow .objWeeks .objWeekNo .objTitleRow .objPinBtn` (l.9-89) ; `.objDotBtn` (l.23) à vérifier.
- objectifs-arbre.css : `.arSpacer` (l.24), `.ar-dropped` (54) ; `.ar-done/.ar-future` (60-61) et `.goalsRowMarker--future/--current` (77-78) = **NON** (noms construits en JS, objectifs-arbre.js:313).
- objectifs-page1.css : `.historyReassign*` (113-143), `.historyRowDone` (190). objectifs-page2-taches.css : `.historyReassign` (243), `.taskLocked` (283).
- objectifs-page2-objectif.css : `.goalsRowMarker--future/--past` (213-214) = NON (dynamique) ; **rail** `.goalsScrubZone/.goalsScrubRail/.goalsScrubLabel/.goalsScrubDot` (l.198-250, ~55 lignes) = oui avec A20.
- objectifs-page3.css : `.goalsPeriodNavLabel .goalBilanHint .goalWeeklyExpandBtn .goalsCalendarRow .weekOpen .goalsCalendarDate .goalsCalendarTodayBadge .goalsCalendarMinutes .goalsCalendarTaskRow .goalsCalendarTaskCheck .goalsCalendarTaskLabel .goalsCalendarTaskUnseenDot .goalsCalendarTaskOtherCategory .goalTaskEditField .goalTaskEditSave .goalsDayTaskEditBtn .goalsDayTaskAdd .goalsMainAddLine` ; verre-calme.css:27-29 et :200 (`.goalsCalendar*`, `.docTasksWin`) ; objectifs-document-taches.css:30 `.docTasksCheck`.
- activite-stats-taches.css `.caTaskHead .caTaskName .caNoNone` ; aujourdhui.css `.tasksSortBtn .lv1` ; strategie.css `.activityEditStrategyToggle/Body` ; stats-avance.css `.saOnTime .saMarked .saAdvState` ; barre-volets.css `.barHint` ; composants.css `.cmpStatus--ok/mid/bad` = NON (composants.js:80 dynamique) ; bureau.css `.bureauArrow-prev/next` = NON (bureau.js:20).
- styles.css : `.subProjectRowDesc .subProjectProgressFill .subProjectRowTrack .historyEditTaskLabel .activityProgressRing(+Bg,Fill,Percent,Text,Title) .activityVisRow/Word/Note/Line .activityEditMerge .logoutBtnHeader` (1983-3286).

## D. Anciens mécanismes (décisions d'Émilien)
| # | où | constat | sûr |
|---|---|---|---|
| D1 | tiroir des tâches | `public/` et `sw.js` ne le chargent plus (test vue-taches-jour-test.js l.12) ; code au repos dans docs/fonctionnalites/repos-tiroir/ voulu | rien à retirer |
| D2 | pincement/zoom | aucun `pinch`/`wheel` restant dans objectifs-arbre.js ; le mot `zoom` désigne maintenant la variable de niveau de temps (`'period'/'year'/'block'`), pas un geste. Commentaires l.241 (« Période / Année / Tout », « zoom Tout ») périmés | commentaires : oui |
| D3 | page 3 | `#goalsDetailPage` et `objectifs-page3.js` (1560 l.) encore chargés et utilisés (calendrier, test calendrier-page3-test.js) : pas du code mort ; seuls A10-A13 + CSS C le sont | non (fichier vivant) |
| D4 | « étape » | pas d'interface restante dite « étape » hors objectifs-creer.js (parcours Suivant/Terminer, vocabulaire interne `stepBtn/showStep` = étapes du parcours de création). Côté serveur : colonne `stepsJson` et `parentRel` de `user_objectives` = les périodes d'un objectif, lues partout → **ne pas toucher (S6, données)**. Textes d'erreur serveur objectifs.js l.76, 899, 917 parlent encore d'« étape » | non |
| D5 | colonnes `objectifs_*` des périodes | aucune colonne de ce type dans server/db.js ; seules tables `objectifs_refus/resume_annuel/ordre`, toutes lues (dataexport, accountdeletion) | rien |
| D6 | « Défusionner » / panneau MACRO | aucune occurrence dans objectifs-*.js ni CSS | rien |
| D7 | bloc commenté | objectifs-page2-objectif.js:1446 `// if (showAddSlot) { ... }` | oui |
| D8 | sw.js | tous les fichiers listés existent ; tous les .js/.css de public/js et public/css sont référencés. Commentaires historiques sw.js:42-47 périmés | commentaire : oui |
| D9 | tests | seul `test/trade-e2e-test.js` cite des fichiers absents (`server/lib/connectors/demo`, `notifier`, `sync`) : probablement le sous-projet trade-tracker | non |

## E. Doublons
Non traités (vérification coûteuse, risque de fausse alerte) : à auditer si Émilien le demande.

## Résumé
- ~95 entrées (15 JS objectifs, 6 JS autres, 4 serveur sûres + ~15 exports à vérifier, ~60 règles CSS, 3 anciens mécanismes).
- Lignes retirables sûres : ≈ 560 (rail tactile ~230 JS + ~55 CSS, CSS orphelin ~220, fonctions orphelines ~60).
- Top 5 : 1) rail tactile mort (A20, ~285 l.) ; 2) CSS orphelin `.obj*` de objectifs-creer.css (~60 l.) ; 3) CSS `.goalsCalendar*`/`.goalTask*` de page3 + verre-calme (~100 l.) ; 4) CSS `.activityProgress*`/`.activityVis*`/`.subProject*` de styles.css (~60 l.) ; 5) fonctions orphelines page1/page3/arbre/document-taches (~60 l.).
- Non touché : stepsJson, tiroir au repos, page 3 vivante, exports serveur douteux.
