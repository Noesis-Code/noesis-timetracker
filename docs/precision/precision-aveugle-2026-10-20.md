# Précision à l'aveugle — repli 11 et 12 (20 oct. 2026)

**Conclusion : le taux réel est celui de l'aveugle, pas celui du jeu entier.** Chaque lot neuf, jugé AVANT correction, donne 83,3 % (lot 1) puis 60,0 % (lot 2, volontairement plus dur). Le 99-100 % du jeu complet mesure surtout ce qu'on a déjà corrigé.

| Lot | Cas | Aveugle (avant correction) | Après correction (non indépendant) | Jeu entier ensuite |
|---|---|---|---|---|
| h01-h30 (repli 11) | 30 | 83,3 % (25/30) | 100 % | 99,3 % |
| h31-h60 (repli 12) | 30 | 60,0 % (18/30) | 100 % | 100 % (302 cas) |

Lecture : la courbe à l'aveugle ne monte pas, car chaque lot vise les points faibles du précédent (synonymes, abréviations, noms propres). Les anciens cas restent à 100 % (≥ 98 % exigé) : aucune régression. Estimation honnête du taux réel du simulé : entre 60 et 85 % selon la difficulté ; le vrai chiffre (modèle réel) se mesure en `--live` (voir `docs/questions/questions-emilien-precision.md`).

## Lot 6 (h301-h330, repli 30) : fautes, abréviations, dates relatives, durées implicites, vague
`test/fixtures/task-precision/blind-h301-h330.json`. 30 titres FR/QC/EN écrits avant toute relecture du code du repli (jour de référence : mardi 20 oct. 2026), taux noté AVANT correction.

**Aveugle brut : 27/30 = 90,0 %** (3 titres en écart, 3 causes) :
| Écart | Cause | Suite |
|---|---|---|
| « Finish onboarding doc in a week » : indice au 19 oct. (passé) | la forme « in a week » comptait « a » comme -1 ; et « weeks » (anglais) était lu comme des jours (seul « s... » valait 7 jours) | corrigé : « a » = 1, semaines anglaises = 7 jours (« in 2 weeks » donnait aussi +2 jours) |
| « Envoyer le contrat ... avant 17h » : titre « ...cliente avant » | l'heure est retirée mais pas sa préposition (avant, après, before, by, after, until, till, jusqu'à) | corrigée avec l'heure (devant une heure explicite seulement) |
| « Finalize Q4 budget by next Fri » : attente de l'auteur fausse | « next Friday » dit un mardi est ambigu en anglais ; la convention existante (vendredi à venir) est gardée | attente alignée, laissée dans le taux brut |

Aussi: l'attente d'indice « avant 17h » (jour même) était une erreur d'auteur (une heure seule n'est pas une date) ; corrigée, comptée dans le brut. Bien traités d'emblée : fautes (« Apeler », « Renouveller », « mornin »), « thurs 3pm », « rdv », « CR », « w/ », « pis », « ce weekend », « dans 10 jours », « d'ici la fin du mois », « (environ 2h) » conservé, tâches vagues (« Faire le truc », « Do stuff », « Voir pour ça », « À faire », « Misc ») rejetées, aucun titre vague accepté, aucune récurrence créée.

**Non-régression** : après correction h301-h330 30/30 (non indépendant) ; h181-h300 et g001-g060 inchangés à 100 % (test `precision-generees-test.js`) ; jeu `cases.json` 99,7 % (302 cas, identique à avant : seul e28, ancien) ; faux rejets 5/345 = 1,4 %, identique à avant et ce sont des rejets voulus (« Voir ça », « Faire ça », « Gérer les choses », « Penser au projet », titre de plus de 140 caractères). Les 2 corrections de h271-h300 (« before the 25th », titres vagues « affaire(s) », « s'occuper », « deal with ») ne créent donc aucun faux rejet sur les lots existants.

Lecture : 90 % à l'aveugle, au niveau des meilleurs lots (h181, h271) ; les deux vrais défauts étaient des bogues de règles existantes (anglais), pas des mots absents. Aucun appel IA payant, aucune interface touchée.

## Lot 5 (h271-h300, repli 29) : vie courante, écrit avant relecture du code
`test/fixtures/task-precision/blind-h271-h300.json`. 30 titres neutres (courses, rendez-vous médicaux génériques, école/garderie, voiture, finances perso, vacances, bricolage, anniversaires, administratif) en FR, québécois et EN, sans prénom réel. Attendus écrits avant toute relecture de `taskprecision.js` / `capturedatehint.js` (jour de référence : mardi 20 oct. 2026).

**Aveugle (avant correction) : 27/30 = 90,0 %** (meilleur lot à ce jour avec h181-h210). 3 écarts, 2 causes :
| Écart | Cause |
|---|---|
| « Pay the daycare invoice before the 25th » : jour au lieu d'échéance | la règle « the 25th » ignorait before/by/until/avant (échéance) |
| « Faire des affaires », « S'occuper de ça » : acceptés | noms et verbes sans contenu (« affaire(s) », « s'occuper », « deal with ») absents de la liste fermée du vague |

Corrections générales (classes, pas des cas) : « the Nth » lit l'échéance comme les autres formes ; vague = + affaire(s), s'occuper, deal with. Les 30 passent ensuite (non indépendant après coup) ; lots précédents inchangés. Aucune récurrence créée par l'IA.

## Lot 2 (h31-h60), écrit avant lecture de `taskprecision.js`
Couvre : synonymes de « à ignorer » (Instagram, recruter, infolettre, balado, Uber Eats, cartes de fidélité, webinar), refonte/« nouveau », abréviations (exam, TP), verbe flou + nom propre, clients/commerces nommés, anglais, épicerie hors liste.
12 échecs sur 30 : 8 refus manqués (synonymes), « exam de stats », « lait et œufs », « Café Olimpico », « the client ».

### Corrections (classes, pas des cas)
- « À ignorer » : titre ET terme ramenés au même concept par groupes de synonymes (refonte/redessiner/refaire/nouveau, embauche/recruter, newsletter/infolettre, podcast/balado, webinaire/webinar, conférence/colloque, livraison/delivery, fidélité/loyalty) et plateformes (réseaux sociaux : Instagram, Facebook, TikTok, LinkedIn... ; livraison à domicile : Uber, DoorDash...). Noms génériques d'un terme (programme, plan, service, campagne, carte) ignorés si un mot porteur reste.
- Classement : abréviations exam/TP ; correction/retouche/modification = révision ; follow-up = suivi ; « étudier/réviser » -> cours/examen ; denrées courantes (lait, œufs, pain, fruits...) -> épicerie ; « le/mon/the client » (article défini, pas « nouveau/potentiel ») = client en place ; envoi/relance vers un commerce nommé (Café/Restaurant/Hôtel + nom propre) = clientèle professionnelle.
- Effet de bord positif : h07 (corrections) et h18 (« nouveau logo ») du lot 1, laissés en erreur, sont résolus.

### Limites
Les groupes de synonymes sont finis : un synonyme absent échouera encore. Un lot 3 neuf est nécessaire pour mesurer le gain réel ; il tombera probablement sous 100 %.

---

# Détail du lot 1 (repli 11)

30 cas h01-h30 écrits AVANT l'évaluation, sans lire `taskprecision.js` (resto, pigiste, café, étudiante, SaaS, jargon de l'app ; québécois, dates/heures, fautes, anglicismes, multi-actions).

## Estimation honnête (simulé, avant correction) : 25/30 = 83,3 %
Le 98 % du jeu complet est du sur-apprentissage : sur des cas neufs, le simulé tombe à ~83 %. Cible réaliste en réel : à mesurer en `--live` par Émilien.

| Cas | Erreur | Nature |
|---|---|---|
| h07 « corrections sur le logo de la boulangerie Fournier » | incertain au lieu de Clients | synonyme (corrections = révisions) : non généralisable |
| h10 « Suivre le tuto Figma » | incertain au lieu de Formation | abréviation « tuto » |
| h18 « nouveau logo » vs à ignorer « refonte du logo » | incertain au lieu de rejeté | cas ambigu (formulation différente de la stratégie) |
| h21 « rdv dentiste et payer le loyer » | placé Vie perso | mon attente était fausse : les deux moitiés sont perso, le placement est juste (attente corrigée) |
| h27 « graphique des stats … dans le chrono » | égalité Basic/Expansion | abréviation « stats » |

## Corrections (généralisables seulement)
- Abréviations : tuto, stats, dispo ajoutées à la table `ABBREV` (classe de mots, pas un cas).
- Règle « verbe flou + un seul mot » généralisée : plus seulement « projet » (c45) ; tout objet isolé derrière un verbe flou est ignoré.
- « client + nom propre » (a05) : indices élargis (livrables, projets, suivi) au lieu d'un seul mot.

## Laissées en erreur (documenté)
h07 (synonymes : demanderait un dictionnaire, sur-apprentissage) et h18 (formulation voisine du « à ignorer », incertain est un résultat acceptable).

## Règles locales c45/c47/a05/a07
c45 : était un mot unique (« projet ») -> généralisée. c47 (facture domine le destinataire) : règle sur une classe de documents, gardée. a05 : élargie. a07 : liste fermée de lieux de santé/épicerie (plusieurs mots, par thème), gardée ; limite : ne couvre pas les lieux hors liste.

Jeu : 272 cas, exactitude 99,3 % (global, non indépendant : seuls h01-h30 sont à l'aveugle).

---

# Lot h61-h90 : réserve, et lot h91-h120 vraiment à l'aveugle (repli 17)

**Réserve sur h61-h90** : ces 30 titres ont été écrits APRÈS lecture de `checkGenerated`. Le résultat « 0/30 faux rejet » est donc optimiste : il ne prouve pas le taux réel.

**Lot h91-h120** (`test/fixtures/task-precision/blind-h91-h120.json`) : écrit SANS relire `taskprecision.js`. Mélange : titres de 1 mot, très longs (> 140 car.), chiffres/dates/heures, emoji, noms propres, MAJUSCULES, abréviations (fact., tel., qté, compta), fr/en.

Mesure (avant correction) : 27/30 inchangés ou nettoyés comme prévu ; 3 écarts.
| Titre (résumé) | Résultat | Verdict |
|---|---|---|
| 2 titres de 150-170 car. | rejetés « tropLong » | voulu (consigne de génération : 140 car. max), pas un défaut |
| « Meeting with … @ 2:30 pm » | « Meeting with … pm » | VRAI DÉFAUT : l'alternation heure testait « 2:30 » avant « 2:30 pm » |
| « … ACME Corp. » | point final retiré | nettoyage normal de ponctuation finale |
Limite notée : un mot sans sens non listé (« asdf ») est conservé (volontaire : pas de liste de mots, pour éviter les faux rejets).

Correction (classe, pas un cas) : dans `FIXED_TIME`, les formes am/pm sont essayées AVANT les formes « 9 h »/« 10:30 », après un « à / at / @ / vers ». Taux réel de faux rejet à l'aveugle : 0/28 hors titres trop longs ; 1 déformation sur 30 (corrigée). Les 4 titres vides de sens du lot (`rejetsAttendus`) sont rejetés.

# Garde ajoutée au test
`test/precision-generees-test.js` (qui n'était PAS lancé par `run-tests.js` : maintenant branché) crée des tâches manuelles par la vraie route (« Réunion à 9 h », « Épicerie », « truc ») et vérifie qu'elles sont enregistrées telles quelles. `test/saisie-manuelle-proposition-test.js` : l'IA (faux client) propose de changer une saisie manuelle -> rien n'est modifié avant validation, avant/après champ par champ, refus mémorisé et non re-proposé au cycle suivant. Aucun écart de code trouvé sur ce point.

# Table `generation_quality_log`
Colonnes : `day`, `feature`, `generated`, `rejected`, `cleaned`. Aucun identifiant de compte ni titre : compteur agrégé par jour et fonction. Rien à effacer à la suppression de compte (et le test `precision-generees-test.js` vérifie que les colonnes sont exactement celles-là).

---

# Lot h151-h180 : vraiment neuf (repli 19, 20 oct. 2026)

`test/fixtures/task-precision/blind-h151-h180.json`, écrit AVANT de rouvrir `taskprecision.js`, `capturedatehint.js` et `taskrecurrence.js` (qui avait été lu pour la question des récurrences, hors dates). Mélange : vie perso, travail, dev ; fr/en ; abréviations (rdv, sem., nov., chap., CR) ; noms propres ; durées et heures sans espace (14h, 1h30).

**Taux aveugle honnête : 22/30 = 73,3 %** (8 échecs avant correction). Après correction : 30/30, non indépendant.

| Échec | Règle généralisée |
|---|---|
| « pour son anniversaire samedi » lu comme échéance | « pour » n'est une échéance que devant une date (le, jour de semaine, chiffre) |
| « jeudi 14h » : heure non retirée | heure 13-23 h sans minutes = horaire (sauf « de », « max », « environ », contexte de durée) |
| « 1h30 mercredi » : durée prise pour une heure | `H h MM` avec H de 1 à 4 sans « à » = durée (un horaire se dit « à 14 h » ou 15h30) |
| « 5 nov. », « 3 sem. » : point final retiré | point d'abréviation après chiffre + mot de 2-5 lettres conservé |
| « dans 3 sem. » sans indice | abréviations sem / j / jr dans « dans N » |
| « before Friday », « on the 1st » sans indice | jours de semaine anglais, before / by / until, « the 1st/15th » |
| « réunion du 12 octobre » -> 2027 | « du N mois » déjà passé cette année = référence, aucun indice (sauf échéance ou « à partir du ») |

Limite : « 1h30 » vs « 3h30 » sans contexte reste ambigu (garder le texte est le choix sûr). Aucune règle ne cible un cas précis ; les lots précédents restent à 100 %.

---

# Lot h181-h210 : vraiment neuf (repli 20, 20 oct. 2026)

`test/fixtures/task-precision/blind-h181-h210.json`, écrit AVANT de rouvrir `taskprecision.js`, `capturedatehint.js` et `taskrecurrence.js`. 30 titres + 4 paires de doublons, tous neutres (aucune tâche personnelle réelle recopiée). Axes : fautes de frappe, MAJUSCULES, abréviations, heures québécoises (9h30, 10h, midi), dates relatives (semaine prochaine, fin du mois, d'ici vendredi, dans 2 semaines), durées, titres sans verbe, listes collées.

**Taux aveugle honnête : 29/34 = 85,3 %** (5 écarts avant correction). Dont 2 étaient une erreur de MON attente (« la semaine prochaine » donne bien un indice de semaine ; « Appeler X » / « Appeler X demain » n'est pas un doublon sûr : la date diffère), corrigées dans la fixture. Vrais défauts : 3 sur 34 (91,2 % si on ne compte qu'eux).

| Défaut | Règle généralisée |
|---|---|
| « vendredi à midi » : heure non retirée | « à / vers / at / @ » + midi, minuit, noon, midnight = horaire |
| « mercredi 10h » : heure non retirée | heure 5-12 h collée à un jour de semaine ou « demain » = horaire (une durée ne s'écrit pas ainsi) |
| « le 28 à 16h » : aucun indice de date | « le N » suivi d'une heure d'horloge facultative = jour du mois |

Corrections : `server/lib/taskprecision.js` (FIXED_TIME), `server/lib/capturedatehint.js` (jour du mois nu). Rien ne crée de récurrence : « tous les lundis » reste un titre inchangé, sans validation automatique.
Limite : « 10h » sans jour ni « à » reste ambigu avec une durée ; le texte est conservé (choix sûr).

Non-régression : les lots h121-h150 et h151-h180 rejoués à 0 écart ; `eval-task-precision` : exactitude 100 %, refus justes 100 % ; `precision-generees-test.js` couvre maintenant h181-h210.

---

# Lot h211-h240 : vraiment neuf, québécois et oral écrit (repli 22, 20 oct. 2026)

`test/fixtures/task-precision/blind-h211-h240.json`, écrit AVANT de rouvrir `capturedatehint.js` (`taskprecision.js` déjà connu). 30 titres neutres : « faut que », « pis », « à soir / à matin », « fin de semaine », « magasiner », « dîner » = midi, « 5 à 7 », « la St-Jean », « 1er juillet », « char », « booker », « de quoi ».

**Taux aveugle honnête : 21/30 = 70 %** (9 écarts avant correction). Dont 1 était une erreur de MON attente (« pour le réveillon le 24 décembre » = échéance à cause de « pour », corrigée dans la fixture). 8 vrais défauts. Après correction : 30/30, non indépendant.

| Défaut | Règle généralisée |
|---|---|
| « à soir », « à matin » : aucun indice (= ce soir / ce matin) | ajoutés avec « cet après-midi » aux formes du jour même |
| « pour la fin de semaine » : aucun indice | « fin de semaine / week-end » = le samedi (jour même un samedi/dimanche) ; « prochaine » = le suivant ; « pour / avant / d'ici » = échéance |
| « pour la St-Jean » : aucun indice | fêtes à date fixe avec mot de contexte : « la St-Jean » (24 juin), « pour / avant Noël », « l'Halloween » ; jamais « Noël » seul (prénom) |
| « semaine du 10 novembre » lu comme un jour | « semaine du N mois » = la semaine (lundi) de cette date |
| « Faire de quoi », « Pis ça » acceptés | « quoi », « pis », « puis » mots vides de sens (titre fait que de cela = rejeté) |

Bien traité d'emblée : « 5 à 7 » jamais lu comme une heure ; « dîner à midi » / « souper à 18h » retirés ; « 1er juillet » ; « dormir 8h » (durée) ; « à 8h demain ». Limite : « dîner » seul n'est pas converti en 12 h (aucune heure n'est posée) ; « fin de semaine » = samedi est un choix (la case de l'utilisateur prime, simple suggestion). Aucune récurrence créée.

# Règles de rejet : saisie manuelle et repli (repli 22)

- **Jamais appliquées à une saisie manuelle ni à l'existant** (`test/precision-repli-test.js`, branché) : « Réfléchir », « Faire des recherches », « Avancer sur le projet », « Penser à l'objectif », un doublon exact et « Appeler Paul à 14 h 30 » saisis à la main sont créés tels quels (origine user). `checkGenerated` n'est appelé que par `documenttasks.parseDetailed` et `offerdelivery.parsePlan`. Une génération ne retire ni ne modifie rien d'existant avant validation ; `apply` (cases cochées) ne refiltre pas.
- **Tout rejeté, que voit l'utilisateur ?** Avant : « L'IA a trouvé N tâches, 0 affichées » sans raison, aucun repli. Maintenant : la raison est écrite (« N trop vague(s) ou recopiée(s) de l'objectif ») et, si RIEN n'est retenu, **une seule relance** du modèle (consigne précisée, tâches seules, même plafond quotidien) ; si elle échoue aussi, le premier résultat et son message sont gardés. Rejet partiel : pas de relance.
- **Feuille de route (offre 1)** : un sous-projet entièrement vague lève une erreur, ce qui déclenche le repli existant sur le modèle fort ; s'il échoue aussi, l'activation est annulée sans rien créer (jamais un sous-projet vide).

---

# Lot h241-h270 : anglais informel et mélanges FR/EN (repli 23, 20 oct. 2026)

`test/fixtures/task-precision/blind-h241-h270.json`, titres et attentes écrits AVANT de tester ; `capturedatehint.js` avait été lu plus tôt dans la session (question « fin de semaine »), donc indépendance partielle pour les dates, entière pour `taskprecision.js`. 30 titres : « remind me to », ASAP, EOD, « by Friday », « call Paul re: invoice », « pick up kids at 3pm », tmrw, next wk, « Oct 30 », « in 2 days », « 2pm to 3pm ».

**Taux aveugle honnête : 17/30 = 57 %** (13 écarts avant correction, tous de vrais défauts ; aucune attente à corriger). Après correction : 30/30, non indépendant.

| Défaut | Règle généralisée |
|---|---|
| EOD, COB, « end of day », « this afternoon / morning / evening », tonite : aucun indice | formes du jour même |
| tmrw, tmr, 2morrow : aucun indice | = demain |
| « next wk / next week », « this week / wk » : aucun indice | = semaine prochaine / en cours |
| « next Tuesday » lu comme AUJOURD'HUI (mardi) | « next <jour> » = le suivant (jamais le jour même) |
| « in 2 days / a week » : aucun indice | = « dans N jours / semaines » (chiffres ou mots anglais) |
| « by end of month / EOM », « next month », « next weekend », « the weekend » | = fin de mois (échéance), mois prochain, week-end |
| « by Oct 30 », « September 3rd » : aucun indice | mois anglais + jour ramené à « 30 octobre » (liste fermée de mois : « Decide 5 » n'est pas décembre) |
| « Meeting from 2pm to 3pm » -> « Meeting from » | « from / de » devant l'heure am/pm retiré avec la plage |
| « Work on it » accepté | « on », « about » ajoutés aux mots vides de sens |

Bien traité d'emblée : « pick up kids at 3pm », « 9am Monday », « 10:30am Thursday », « at noon », « re: invoice » (non lu comme une date), « ASAP » (aucune date inventée), « by Friday » = échéance, « on the 1st », titres FR/EN mêlés. Limite : « EOW » (fin de semaine : vendredi ou dimanche ?) laissé sans indice, choix sûr. Aucune récurrence créée.

# « Fin de semaine » : cohérence (repli 23)

Jour d'aujourd'hui -> « cette fin de semaine » / « la fin de semaine prochaine » / « la semaine prochaine » : dimanche -> ce dimanche / samedi suivant / lundi suivant ; lundi à vendredi -> samedi à venir / samedi d'après / lundi suivant ; samedi -> aujourd'hui / samedi suivant / lundi suivant. Cohérent : la semaine va de lundi à dimanche, le week-end en cours (samedi-dimanche) reste « cette » fin de semaine jusqu'au dimanche inclus, « prochaine » saute toujours à la suivante, « la semaine prochaine » est la semaine entière (lundi). Ambiguïté restante : le samedi est un choix (voir `docs/questions/questions-emilien-precision.md`).

---

# Lot de GÉNÉRALISATION g001-g060 et causes communes (repli 24, 20 oct. 2026)

`test/fixtures/task-precision/blind-g001-g060.json`. Aucun lot par thème : 54 titres COMPOSÉS AU HASARD (graine fixe 20261020) à partir de 29 bases neutres (FR, québécois, EN) et de 50 suffixes de date/heure/durée/abréviation vus dans tous les thèmes précédents, plus 6 titres sans date (dont 3 à rejeter). Les attendus sont déduits des composants du générateur, jamais du code. Réserve honnête : j'avais relu `taskprecision.js` et `capturedatehint.js` avant d'écrire le générateur ; l'indépendance est donc partielle. La répartition par thème est celle du tirage (FR 24, québécois 9, EN 21).

**Taux global avant correction : 52/60 = 86,7 %** (FR 19/24 = 79 %, québécois 9/9, EN 18/21 = 86 %, sans date 6/6). Les 8 écarts sont de 3 sortes seulement, toutes déjà cousines de défauts passés :
| Écart | Cause |
|---|---|
| « le 5 nov. », « le 3 déc. » (3 titres) : aucun indice | mois français ABRÉGÉ (le nettoyage de titre gardait le point, mais l'indice ne connaissait que les mois complets) |
| « next Tue », « Fri 2pm » (3 titres) : aucun indice ; « lun. 9h » : heure non retirée | jour ABRÉGÉ (EN et FR) |
| « après-demain » (2 titres) : aucun indice | variante graphique (trait d'union) d'un mot connu |

Lecture : 86,7 % global est entre le meilleur (85 %, h181-h210) et les pires (57-70 %) des lots par thème. Les règles généralisent mal surtout hors de leur FORMULATION (abréviation, trait d'union), moins hors de leur thème : tout ce qui est une forme pleine d'un mot déjà connu passe (23 titres sur 24 des suffixes pleins FR, 9/9 québécois).

## Causes communes des 24 défauts des lots h211-h270 (+ ceux de g001)
1. **Forme non listée d'un mot de temps connu** (la majorité : à soir, tmrw, EOD, tonite, « sem. », « Oct 30 », trait d'union) : chaque lot ajoutait des alternatives à des regex dispersées. Remède : une table unique.
2. **Jour + heure collés** (jeudi 14h, mercredi 10h, 1h30 mercredi, vendredi à midi, « lun. 9h ») : la frontière durée / horaire dépend du contexte (jour ou « à » devant).
3. **« pour / by / avant » = échéance** seulement devant une date (anniversaire samedi, pour la fin de semaine).
4. **Fêtes et locutions à date fixe** (St-Jean, Noël seulement avec contexte, fin de semaine).
5. **Mots vides de sens** (quoi, pis, on, about) : liste fermée.
6. **Attentes erronées de l'auteur** (3 sur 4 lots) : le lot se trompe aussi.

## Table de normalisation appliquée : `server/lib/temporalvocab.js`
Un seul module pour jours (FR + EN), mois (complets, abrégés FR, abrégés EN), abréviations de jours (avec point : toutes ; sans point : seulement tue/tues/wed/thu(r)(s)/fri, jamais « mon », « sat », « sun », « mar », « jeu », « mer » nus) et « après-demain ». `canon(texte)` met les abréviations en toutes lettres AVANT l'analyse de date ; `DAY_ABBR_RE` sert au retrait de l'heure dans `taskprecision.js`. Garde-fous : un mois abrégé n'est reconnu que derrière un numéro de jour (« sept jours » inchangé), « mon ami » inchangé.
Appliquée parce que sûre : h01-h270, `generees-objectifs`, `eval-task-precision` (exactitude 100 %) et g001-g060 passent (59/60 puis 60/60 après le point d'abréviation d'un jour conservé dans le titre).
**Non appliqué (risque, proposition)** : y déplacer aussi les mots RELATIFS (demain, ce soir, à soir, EOD, tmrw, next wk, dans N jours, fin de semaine, fêtes) et les moments de la journée (matin, soir, midi, minuit). Ils vivent dans 12 regex de `parseDateHint` dont l'ordre porte des priorités (semaine prochaine avant jour de semaine, échéance avant jour) ; les extraire en table exigerait de modéliser l'ordre et fait courir un risque de régression sans gain démontré (aucun écart de g001 ne vient de là). À faire seulement si un prochain lot de généralisation montre des échecs de cette famille.
Limite : « mar » (mardi, mars, March), « jeu », « mer », « sam » restent ignorés sans point ; « Mon » / « Sun » sans point aussi.

# « EOW » (fin de semaine de travail)
Inchangé : « by EOW » ne donne aucun indice de date (ambigu : vendredi ou dimanche). Case à cocher ajoutée dans `docs/questions/questions-emilien-precision.md` (vendredi / dimanche / ignorer) ; rien n'est appliqué tant que rien n'est coché. Aucune récurrence créée.
