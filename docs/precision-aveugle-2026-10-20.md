# Précision à l'aveugle — repli 11 et 12 (20 oct. 2026)

**Conclusion : le taux réel est celui de l'aveugle, pas celui du jeu entier.** Chaque lot neuf, jugé AVANT correction, donne 83,3 % (lot 1) puis 60,0 % (lot 2, volontairement plus dur). Le 99-100 % du jeu complet mesure surtout ce qu'on a déjà corrigé.

| Lot | Cas | Aveugle (avant correction) | Après correction (non indépendant) | Jeu entier ensuite |
|---|---|---|---|---|
| h01-h30 (repli 11) | 30 | 83,3 % (25/30) | 100 % | 99,3 % |
| h31-h60 (repli 12) | 30 | 60,0 % (18/30) | 100 % | 100 % (302 cas) |

Lecture : la courbe à l'aveugle ne monte pas, car chaque lot vise les points faibles du précédent (synonymes, abréviations, noms propres). Les anciens cas restent à 100 % (≥ 98 % exigé) : aucune régression. Estimation honnête du taux réel du simulé : entre 60 et 85 % selon la difficulté ; le vrai chiffre (modèle réel) se mesure en `--live` (voir `docs/questions-emilien-precision.md`).

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
