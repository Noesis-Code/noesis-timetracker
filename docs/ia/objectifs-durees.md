# Base de durées des objectifs (date butoir proposée sans IA)

Code : `server/lib/objectifs-durees.js` (version 1, 4 nov. 2026). Coût nul : aucun appel IA.

- **Table de référence** : catégories courantes (course 5 km/10 km/semi/marathon, lecture, langue, permis, perte de poids, épargne, projet professionnel, étude/examen, musculation, instrument) avec durée médiane et fourchette P10–P90 en semaines ; mots-clés FR/EN. L'ordre de grandeur annoncé (« 4 livres », « 10 kg ») recalcule la médiane.
- **Apprentissage** : durées réelles, anonymes (aucun identifiant ni texte), des objectifs atteints par catégorie ; dès 30 objectifs atteints dans une catégorie, elles remplacent la table.
- **Personnalisation** : facteur de l'utilisateur = médiane de (durée réelle / durée prévue) de ses objectifs passés (atteints, ou échéance dépassée), borné à 0,6–2. Sans historique : médiane de la table. (Les heures passées dans l'app ne sont pas encore utilisées.)
- **Date imposée** (examen, permis, concours, mariage, soutenance, voyage, rendez-vous, naissance, « le 15 mars »…) : jamais estimée ; le champ date est demandé en premier et obligatoire avant « Proposer les étapes ».
- **Aucune catégorie reconnue** : la durée saisie est gardée, rien n'est inventé. La date reste toujours modifiable.
- **Cible mesurable (pas une promesse)** : environ 95 % des objectifs atteints dans la fourchette proposée ; suivi par l'écart entre la durée réelle (`metaJson.attainedAt`) et la fourchette (`metaJson.proposed`).
- **Gratuit** : aucune tâche proposée ni créée ; 1 proposition IA (étapes ou lecture de pièces jointes) par utilisateur et par mois, plafond global `OBJECTIFS_GRATUIT_PLAFOND_USD` (50 $ US). Expansion garde la génération de tâches.
