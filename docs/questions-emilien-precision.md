# Questions pour Émilien — Précision des tâches

Cas réels de `test/fixtures/task-precision/cases.json` dont le bon résultat dépend d'une préférence. Cocher = oui ; ajouter une phrase si autre choix. Tant que rien n'est coché, le comportement actuel reste.

- [ ] « Horaire des serveurs de la semaine prochaine » (r15) : « horaire » = gestion du personnel (travail) plutôt que tâche personnelle ? Actuellement : Personnel/RH.
- [ ] « Payer loyer » (s01) : dans un restaurant, loyer du local (Comptabilité) ou loyer personnel ? Actuellement : incertain, la tâche reste à classer.
- [ ] « Envoyer la facture à Marie-Ève demain avant-midi » (r01) : « avant-midi » = 9 h ? (sans heure fixe, la tâche reste sur le jour seulement). Actuellement : jour seulement.
- [ ] « Payer l'abonnement Claude » (s21) : Crédits Claude et API (coût) ou Expansion (abonnements) ? Actuellement : incertain.
- [ ] « Penser au projet » (c45) : un titre à verbe flou et sans sujet précis doit rester « incertain » plutôt qu'être placé sur le premier secteur qui parle de projets ?

- [ ] Lancer l'évaluation réelle sur les 60 cas à l'aveugle h01-h60 (seule mesure fiable du taux réel). Commande : `ANTHROPIC_API_KEY=... node scripts/eval-task-precision.js --live --only=h`. Coût estimé : 60 cas, dont ~11 refusés sans appel (« à ignorer ») = ~49 appels de classement Haiku à ~0,0009 $ = environ 0,05 $ (au plus ~0,15 $ si le repli Sonnet, ~0,0027 $, est déclenché partout). Tarifs et modèles : `docs/ia-modeles.md`.
