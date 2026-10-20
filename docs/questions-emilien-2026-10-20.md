# Questions en attente : index (20 oct. 2026)

Une case par ligne. Détail et choix dans le fichier cité (`questions-emilien-<nom>.md`) : coche la question là-bas, puis ici. Les lignes sans fichier se cochent ici. Aucune case n'est tranchée par un commit (vérifié au repli 22).

## Les 5 décisions qui débloquent le plus
- [ ] 1. Expansion en production : Q1 courriels, Q2 CGU « Offre 1 » -> « Expansion », Q3 remboursement, Q4 code gratuit (`expansion`)
- [ ] 2. Trade en production : Q4 service Railway, Q5 « validé », Q6 condition de lancement (`trade`)
- [ ] 3. Lancer les évaluations `--live` (~0,05 $, au plus ~0,15 $) : Précision h01-h60, regroupement des classements, retrait du repli Sonnet (`precision`, `credits`)
- [ ] 4. Simplification : retirer/garder les ~30 lignes d'audit (`simplification`) et Trade Q7 (`trade`)
- [ ] 5. Premier lancement : retirer modules, « Crée tes activités », confirmation du code (`basic`, section Premier lancement)

## A. Bloque une mise en ligne
- [ ] Basic : liste des 26 bugs staging du 2 oct. (#1299, #1307, #1308) (`basic`)
- [ ] Basic : effacer nom de famille et téléphone en base (irréversible, après sauvegarde) (`basic`)
- [ ] Loi 25 : registre « Apprentissage du classement des tâches » (`apprentissage-usage.md`) et mention du masquage avant envoi à l'IA (`credits`)
- [ ] Trade L1 à L5 : effacement, sauvegardes, export, texte légal (`loi25-trade-2026-10-20.md`)
- [ ] Healthcheck Railway : ajouter `"healthcheckPath": "/healthz"` et `healthcheckTimeout` dans `deploy` de `railway.json` (route prête, fichier non touché)

## B. Retirer de l'interface
- [ ] Simplification : Feuille de temps (4), Stats (6), Communauté (4), pastille orange (`simplification`)
- [ ] Simplification : audit des écrans (orange, carte Expansion, bandeaux, Activité, Profil, Partage, Mon IA, Sécurité) (`simplification`)
- [ ] Trade Q3 : filtres de Positions à garder ; Q7 : retraits de l'écran Trade (`trade`)
- [ ] Basic : retirer les écrans de `points-non-necessaires.md`, rien ajouter (`basic`)
- [ ] Basic : récupération de profil, activité sans pôle, bouton « Créer mon profil » grisé, nom/téléphone à la création (`basic`, Premier lancement)
- [ ] Retirer la notification « message d'activité » (`?notif=activity`) : elle ouvre désormais la Page 2 de l'activité (Discussion retirée le 15 oct.) ; aucun message n'est plus envoyé sans écran pour en écrire (`pilotage`, `notifications-liens-2026-10-20.md`)
- [ ] Pop-up de placement : liste « Où » en verre translucide (voulu le 5 oct.) ; la rendre opaque (`--float-bg`) ? (`pilotage`)
- [ ] Routes dormantes `offerforms.js` ; scripts et docs sans appelant (`simplification`, `code-mort-2026-10-20.md`)
- [ ] Feuille de temps, vue Semaine : garder l'ouverture 1 h avant la première case remplie, ou revenir à 0 h ? (aucun contrôle ajouté)

## C. Décisions produit et IA
- [ ] Précision : horaire fixe dans un titre IA, A / B « (vers 9 h) » / C (recommandé B) ; récurrence A / B / C (recommandé A) ; 5 cas ambigus (`precision`)
- [ ] Trade : afficher le gain réalisé (Q9) ; délai « temps réel » (Q1) ; lien privé (Q2) ; doublons d'import (Q10) ; lien de dernière minute (Q11) ; bouton Danger (Q12) (`trade`)
- [ ] Expansion Q5 à Q9, Q11 : résiliation, staging, FDR/formule 1, suivi, publicité, message de retour Stripe (`expansion`)
- [ ] Basic : entrée dimanche 23 h -> lundi 1 h, compter l'heure après minuit au lundi ? ; ajout de tâche hors ligne en file d'attente (`basic`)
- [ ] Crédits : seuil d'alerte 5 $/sem. ; canal d'alerte (journal / push / courriel) ; seuils par compte actif ; tarifs IA à confirmer (`credits`)
- [ ] Crédits : mémo IA persistant ; signal d'acceptation de la reformulation ; troncature inter-secteurs ; candidats 60 -> 25 (`credits`)
- [ ] Contrastes : 3 couleurs sous 4,5:1 (`contrastes-basic.md`)
- [ ] Fuseaux : le rappel de 6 h part à l'heure de Toronto pour tous (Paris midi, Vancouver 3 h) ; l'envoyer à 6 h locale exige d'enregistrer le fuseau au profil (nouveau champ) ; plafonds de jour IA : unifier Montréal / UTC ? (`fuseaux-serveur-2026-10-20.md`)
- [ ] Traduire en EN « Ajouter des tâches > document » ; trancher 4 clés EN en conflit (`simplification`, `code-mort-2026-10-20.md`)

## D. Ajouts (refus par défaut, Simplification)
- [ ] Basic : vues jour/semaine/mois/année, responsable de tâche, liste de 3 tâches + « besoin », zone Communauté, RDV/découverte/animation du N (`basic`)

## E. Accès et infra
- [ ] Benchmarks (Trade Q8, Simplification, temps) : session avec recherche web, ou accès à Sharesight/Delta/Toggl/Clockify/Harvest
- [ ] Expansion Q10 : relire les tâches du secteur depuis une session avec le MCP TiMeTracker (`expansion`)
- [ ] Supprimer ~1384 fichiers `/tmp/noesis-verify-*` (68 Mo) et les fichiers à la racine (`/o2.txt`, `/o3.txt`, `/o4.txt`, `/out.txt`, `/x`) : destructeur, à valider ; cause corrigée
