# Lecture de l'organisation IA : cadrage (21 oct. 2026)

Cadrage seulement. Aucun code. Mots exacts d'Émilien : `docs/regles/intentions.md` (21 oct. 2026).

## Idée
Quand un utilisateur connecte son IA, TimeTracker se réserve le droit de LIRE (sans modifier) l'organisation qu'elle écrit : tâches, plan, stratégie. Le but : s'inspirer de ce qui marche pour ajuster l'algorithme intégré, le garder secret et le vendre.

## À vendre
L'algorithme intégré à l'app (« Timetracker-bespoke »), pour ceux qui ne veulent pas gérer leur IA ou qui veulent mieux que ce qu'ils feraient seuls. Il est personnalisé grâce au domaine d'expertise de l'utilisateur.

## Décisions d'Émilien (21 oct.)
1. **Contenu lu** : tout SAUF les données sensibles ou secrètes. On retient la STRUCTURE (titres, notes, objectifs, stratégies), jamais les termes exacts (protection des données confidentielles des clients).
2. **Consentement** : case claire affichée à la connexion de l'IA + conditions d'utilisation (Loi 25).
3. **Usage** : statistiques anonymes, sans nom ni lien avec un compte, pour ajuster l'algorithme.
4. **Traitement** : automatique, aucun humain sur un compte précis. L'utilisateur voit dans ses réglages qu'une lecture a eu lieu et peut se retirer. S'ajoute le domaine d'expertise de l'utilisateur (offre « Timetracker-bespoke »).
5. **Domaine d'expertise** : déclaré par l'utilisateur à la connexion de l'IA, pour le moment. Émilien peut changer d'avis vite : la source du domaine doit rester modifiable en UN seul endroit.

## À trancher
- **Ce qui « marche »** : à définir avec Émilien lors d'une discussion (21 oct. : « demain »). Pistes, non tranchées : tâches cochées à temps, objectifs atteints, précision de l'estimation, constance dans la durée.
- **Texte légal et conditions** : réservé à Émilien. Rien n'est rédigé comme définitif.
- ~~Seuil minimal d'utilisateurs~~ : abandonné à la demande d'Émilien (voir « Garde-fous », point 2).
- **Durée de conservation**.
- **Écran de retrait** : sans nouveau bouton si possible (`SIMPLIFICATION.md`).
- **Point sensible** : la lecture ne concerne que l'organisation écrite via le connecteur de l'utilisateur. Rien n'est lu des comptes qui n'ont pas accepté.

## Ordre du jour de la discussion de demain (22 oct.)
1. Définir ce qui « marche » (voir « À trancher »).
2. Remplir le tableau des formes observées (voir « Garde-fous », point 1) : Émilien juge chaque forme.

## Garde-fous (décision d'Émilien, 21 oct. 2026)

Texte légal : réservé à Émilien. Rien ci-dessous n'est définitif.

### 1. Des formes, pas du contenu
Le code retire les mots avant de stocker. Seules des mesures de forme sont conservées (des nombres, des catégories), jamais une phrase ni un mot de l'utilisateur.
Un test automatique échoue si un texte d'utilisateur se retrouve stocké.
**La liste exacte des formes observées reste À DÉFINIR AVEC ÉMILIEN**, qui juge lui-même la pertinence de chaque forme. Aucune n'est retenue d'office. Candidates :

| Forme | Ce que ça mesure | Risque de confidentialité | Verdict d'Émilien (à remplir) |
|---|---|---|---|
| Nombre d'étapes d'un plan | La taille d'un plan | Faible | |
| Découpage (grosses tâches ou petites) | Le niveau de détail | Faible | |
| Ordre des tâches | Séquence logique ou non | Moyen : un ordre rare peut se reconnaître | |
| Longueur du titre | Titre court ou long (en nombre de mots) | Faible | |
| Précision de l'estimation | Écart entre durée prévue et réelle | Faible | |
| Présence d'une note, d'une échéance | Ce que l'IA remplit | Faible | |
| Constance dans la durée | Régularité des tâches cochées | Moyen : un rythme très particulier | |

### 2. Groupe minimum : abandonné
Émilien veut exploiter directement les algorithmes, sans attendre d'avoir assez d'utilisateurs.
**Risque résiduel, dit honnêtement** : sans seuil, un plan très atypique pourrait être reconnaissable dans une statistique de forme.
**Compensation** : seules des formes sans texte sont stockées, et le plan d'un utilisateur n'est jamais montré à un autre. À rediscuter si une forme devient trop précise.

### 3. Aucun humain ne voit un plan
Jamais de plan individuel montré, copié ou lu par une personne. Le traitement est automatique, et personne n'ouvre un plan précis, ni pour vérifier ni pour déboguer.

### 4. Preuve visible
Dans les réglages : la liste de ce qui est lu, la date des lectures et le retrait de la lecture.
Phrase d'accompagnement : « On apprend des formes, jamais de tes mots. »
Sans nouveau bouton si possible (`SIMPLIFICATION.md`) : réutiliser les éléments déjà présents.

### 5. Version 1 sans les stratégies
La version 1 lit seulement les tâches et les objectifs. Les stratégies viennent plus tard, après la preuve de confiance.

### 6. Option « accès au connecteur sans lecture » : à planifier en 2027
Idée : donner accès au connecteur sans aucune lecture, contre un petit montant. Bonne idée selon Émilien.
**À PLANIFIER EN 2027. Rien à construire maintenant** : un paiement est réservé à Émilien.
