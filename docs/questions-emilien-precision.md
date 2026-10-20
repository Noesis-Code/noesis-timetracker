# Questions pour Émilien — Précision des tâches

Cas réels de `test/fixtures/task-precision/cases.json` dont le bon résultat dépend d'une préférence. Cocher = oui ; ajouter une phrase si autre choix. Tant que rien n'est coché, le comportement actuel reste.

- [ ] « Horaire des serveurs de la semaine prochaine » (r15) : « horaire » = gestion du personnel (travail) plutôt que tâche personnelle ? Actuellement : Personnel/RH.
- [ ] « Payer loyer » (s01) : dans un restaurant, loyer du local (Comptabilité) ou loyer personnel ? Actuellement : incertain, la tâche reste à classer.
- [ ] « Envoyer la facture à Marie-Ève demain avant-midi » (r01) : « avant-midi » = 9 h ? (sans heure fixe, la tâche reste sur le jour seulement). Actuellement : jour seulement.
- [ ] « Payer l'abonnement Claude » (s21) : Crédits Claude et API (coût) ou Expansion (abonnements) ? Actuellement : incertain.
- [ ] « Penser au projet » (c45) : un titre à verbe flou et sans sujet précis doit rester « incertain » plutôt qu'être placé sur le premier secteur qui parle de projets ?

- [ ] Lancer l'évaluation réelle sur les 60 cas à l'aveugle h01-h60 (seule mesure fiable du taux réel). Commande : `ANTHROPIC_API_KEY=... node scripts/eval-task-precision.js --live --only=h`. Coût estimé : 60 cas, dont ~11 refusés sans appel (« à ignorer ») = ~49 appels de classement Haiku à ~0,0009 $ = environ 0,05 $ (au plus ~0,15 $ si le repli Sonnet, ~0,0027 $, est déclenché partout). Tarifs et modèles : `docs/ia-modeles.md`.

- [ ] Horaire fixe dans un titre généré par l'IA (aucun champ d'heure sur les tâches ; règle « une liste, jamais des créneaux fixes »). Cocher UNE option :
  - [ ] A. Retirer l'heure (actuel). « Réunion à 9 h » -> « Réunion » ; « Appeler Paul à 14 h 30 » -> « Appeler Paul » ; « Dentiste 10:30 » -> « Dentiste ». L'heure est perdue.
  - [ ] B. Garder en mention non contraignante. « Réunion à 9 h » -> « Réunion (vers 9 h) » ; « Appeler Paul à 14 h 30 » -> « Appeler Paul (vers 14 h 30) » ; « Dentiste 10:30 » -> « Dentiste (vers 10 h 30) ». Aucun créneau, l'information survit dans le titre.
  - [ ] C. Garder tel quel. « Réunion à 9 h » -> « Réunion à 9 h » (le titre de l'IA n'est pas touché ; l'heure reste lisible mais ressemble à un horaire fixe).
  Recommandation : B (rien de perdu, aucune heure contraignante). Non appliqué tant que rien n'est coché.

- [ ] Récurrence « chaque jour ouvrable » / « 3 fois par semaine » : l'app ne sait dire que « tous les N jours / semaines / mois ». Cocher UNE option :
  - [ ] A. Ignorer (actuel). Aucune proposition de récurrence ; la tâche est créée normalement, titre intact (« Courir 3 fois par semaine »), à refaire à la main.
  - [ ] B. Approcher par récurrence hebdomadaire. « 3 fois par semaine » -> proposition « chaque semaine » (à valider dans le pop-up) ; « jour ouvrable » -> « chaque jour » (inclut samedi et dimanche : faux). Le sens exact est perdu.
  - [ ] C. Ne rien faire de plus. Identique à A (aucune proposition), mais sans en parler dans les consignes de l'IA.
  Recommandation : A (une approximation fausse est pire qu'aucune proposition).


- [ ] « Fin de semaine » (et « week-end ») sans jour précis : quel jour proposer ? Seule une suggestion, modifiable. Cocher UNE option :
  - [ ] A. Samedi (actuel). « Magasiner pour la fin de semaine » -> samedi ; dimanche = le jour même.
  - [ ] B. Vendredi soir. « Faire l'épicerie pour la fin de semaine » -> vendredi (avant le début du week-end).
  - [ ] C. Dimanche. « Préparer la semaine d'ici la fin de semaine » -> dimanche (fin du week-end).
  Recommandation : A (aucune récurrence, un seul jour, l'utilisateur peut changer).
