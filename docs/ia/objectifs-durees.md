> **Estimation abandonnée le 9 nov. 2026 (décision d'Émilien)** : plus de date par défaut ; une date ou une durée écrite est prise, sinon la date est demandée. Le module reste en code mort (explicitDate / isFixedDate servent encore).

# Base de durées des objectifs (date butoir proposée sans IA)

Code : `server/lib/objectifs-durees.js` (version 1, 4 nov. 2026). Coût nul : aucun appel IA.

- **Table de référence** : catégories courantes (course 5 km/10 km/semi/marathon, lecture, langue, permis, perte de poids, épargne, projet professionnel, étude/examen, musculation, instrument) avec durée médiane et fourchette P10–P90 en semaines ; mots-clés FR/EN. L'ordre de grandeur annoncé (« 4 livres », « 10 kg ») recalcule la médiane.
- **Apprentissage** : durées réelles, anonymes (aucun identifiant ni texte), des objectifs atteints par catégorie ; dès 30 objectifs atteints dans une catégorie, elles remplacent la table.
- **Personnalisation** : facteur de l'utilisateur = médiane de (durée réelle / durée prévue) de ses objectifs passés (atteints, ou échéance dépassée), borné à 0,6–2. Sans historique : médiane de la table. (Les heures passées dans l'app ne sont pas encore utilisées.)
- **Date imposée** (examen, permis, concours, mariage, soutenance, voyage, rendez-vous, naissance, « le 15 mars »…) : jamais estimée ; le champ date est demandé en premier et obligatoire avant « Proposer les étapes ».
- **Aucune catégorie reconnue** : la durée saisie est gardée, rien n'est inventé. La date reste toujours modifiable.
- **Cible mesurable (pas une promesse)** : environ 95 % des objectifs atteints dans la fourchette proposée ; suivi par l'écart entre la durée réelle (`metaJson.attainedAt`) et la fourchette (`metaJson.proposed`).
- **Gratuit** : aucune tâche proposée ni créée ; 1 proposition IA (étapes ou lecture de pièces jointes) par utilisateur et par mois, plafond global `OBJECTIFS_GRATUIT_PLAFOND_USD` (50 $ US). Expansion garde la génération de tâches.

## Décisions du 5 nov. 2026 (Émilien)
- **Temps par semaine** (facultatif, modifiable) : valeur de départ = médiane des heures Chrono des 4 dernières semaines sur l'activité liée, **historique uniquement** ; aucune valeur typique de catégorie (la catégorie sert à identifier le type d'objectif, pas à remplir ce champ) ; sans historique, le champ est vide.
- **Date proposée** : « Proposé : [date] » seule ; la fourchette P10–P90 reste interne. Aucune question bloquante avant la proposition ; catégorie inconnue (ni durée écrite, ni date écrite) : la date est demandée en premier, règles fixes ensuite, rien n'est inventé.
- **Retard** : plus de recalcul silencieux de la date butoir. Retard = heures Chrono réellement passées sur l'activité depuis le début / (Temps par semaine × semaines écoulées) − 1 ; au-delà de 20 %, le bilan est proposé (Garder tel quel / Alléger = le plan s'aligne sur le rythme réel / Prolonger d'une semaine). Pas de bilan à la simple fin d'une période, ni si le retard est ≤ 20 % ; sans « Temps par semaine » saisi, aucun bilan (rien à comparer).
- **Données anonymes agrégées** (Loi 25) : actives par défaut, case « Contribuer anonymement aux durées d'objectifs » dans Réglages (`users.objectifsAnon`). Une ligne par objectif atteint dans `objectifs_signaux` (aucun identifiant ni texte) avec les 4 signaux : durée réelle vs prévue (`actualWeeks`, `plannedWeeks`), date corrigée par l'utilisateur (`dateCorrectedDays`), heures Chrono par semaine (`chronoHoursPerWeek`), tâches faites par semaine (`tasksDonePerWeek`). Décochée : rien n'est enregistré. `learnedFromSignals` (objectifs-durees.js) agrège les durées réelles par catégorie ; dès 30 lignes, elles remplacent la table. Les trois autres signaux sont enregistrés pour l'analyse, pas encore utilisés dans la proposition.
