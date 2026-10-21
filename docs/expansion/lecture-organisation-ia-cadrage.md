# Lecture de l'organisation IA : cadrage (21 oct. 2026)

Cadrage seulement. Aucun code. Mots exacts d'Émilien : `docs/regles/intentions.md` (21 oct. 2026).

## Idée
Quand un utilisateur connecte son IA, TimeTracker se réserve le droit de LIRE (sans modifier) l'organisation qu'elle écrit : tâches, plan, stratégie. Le but : s'inspirer de ce qui marche pour ajuster l'algorithme intégré, le garder secret et le vendre.

## À vendre
L'algorithme intégré à l'app (« Timetracker-bespoke »), pour ceux qui ne veulent pas gérer leur IA ou qui veulent mieux que ce qu'ils feraient seuls. Il est personnalisé grâce au domaine d'expertise de l'utilisateur, DEVINÉ par nous (décision 5).

## Décisions d'Émilien (21 oct.)
1. **Contenu lu** : tout SAUF les données sensibles ou secrètes. On retient la STRUCTURE (titres, notes, objectifs, stratégies), jamais les termes exacts (protection des données confidentielles des clients).
2. **Consentement** : case claire affichée à la connexion de l'IA + conditions d'utilisation (Loi 25).
3. **Usage** : statistiques anonymes, sans nom ni lien avec un compte, pour ajuster l'algorithme.
4. **Traitement** : automatique, aucun humain sur un compte précis. L'utilisateur voit dans ses réglages qu'une lecture a eu lieu et peut se retirer. S'ajoute le domaine d'expertise, deviné par nous (décision 5 ; offre « Timetracker-bespoke »).
5. **Domaine d'expertise DEVINÉ par nous** (décision d'Émilien, 21 oct. 2026, 02 h 26, qui remplace « déclaré par l'utilisateur »). Motif d'Émilien : « C'est pour ça que c'est peut-être pas une bonne chose de demander l'expertise directement à l'utilisateur. C'est peut-être plus juste si c'est nous qui soit la devinons, soit décidons à quelle expertise ça peut s'appliquer. » (déclenché par le risque de réidentification d'un plan atypique rattaché à un domaine déclaré).
   - **Liste FERMÉE** de grands domaines, définie par Émilien (voir « Domaines candidats »).
   - **Attribution AUTOMATIQUE** à la lecture, à partir de la structure et des intitulés : (a) règle locale sans coût (mots-clés des noms de pôles/secteurs) ; (b) repli par un petit modèle (Haiku) SEULEMENT si la règle hésite, dans le budget IA existant.
   - **On ne conserve QUE l'étiquette du domaine**, jamais les mots lus.
   - **Visible et corrigeable** : l'utilisateur voit l'étiquette détectée dans ses réglages et peut la corriger (ce qui valide aussi notre devinette).
   - **Un seul endroit modifiable** : l'étiquette vit en un seul endroit ; Émilien peut encore changer d'avis.
   - **Compromis, dit honnêtement** : la classification lit les mots une fois, puis les jette. Les mots sont donc lus (en mémoire, automatiquement, sans humain) le temps de choisir l'étiquette, mais jamais stockés.

### Domaines candidats (à définir avec Émilien, 22 oct.)
Propositions larges, liste non tranchée : 1. commerce / vente ; 2. services professionnels ; 3. création / contenu ; 4. enseignement / formation ; 5. santé / bien-être ; 6. technologie / produit ; 7. finance / gestion ; 8. restauration / hôtellerie ; 9. construction / métiers ; 10. droit / administration ; 11. recherche / études ; 12. personnel / autres. Candidats à discuter : arts et spectacle, transport / logistique, agriculture / environnement.

## À trancher
- **Ce qui « marche »** : DÉFINI avec Émilien le 21 oct. 2026 (voir « Ce qui marche : décisions du 21 oct. »). Reste à trancher : le poids exact des 4 mesures et les seuils.
- **Texte légal et conditions** : réservé à Émilien. Rien n'est rédigé comme définitif.
- ~~Seuil minimal d'utilisateurs~~ : abandonné à la demande d'Émilien (voir « Garde-fous », point 2).
- **Durée de conservation**.
- **Écran de retrait** : sans nouveau bouton si possible (`SIMPLIFICATION.md`).
- **Point sensible** : la lecture ne concerne que l'organisation écrite via le connecteur de l'utilisateur. Rien n'est lu des comptes qui n'ont pas accepté.

## Ce qui marche : décisions du 21 oct. 2026

Mots d'Émilien : un plan marche selon le résultat, mais le résultat doit être assez haut ; ce qui compte surtout, c'est la RAPIDITÉ à laquelle les objectifs sont atteints, comparée à la moyenne des objectifs similaires du même domaine (exemple : une boulangerie ouverte en 2 mois bat 50 ans pour ouvrir des succursales). On cherche celui qui avance anormalement vite par rapport à des objectifs comparables.

1. **Mesure centrale** : vitesse de réalisation d'un objectif, rapportée à la moyenne d'objectifs comparables. On juge d'abord la HAUTEUR de l'objectif, puis la vitesse.
2. **Comparer deux objectifs « similaires »** : domaine (liste fermée) > taille > localisation (ville ou campagne ; même ville ou ville différente).
3. **Hauteur d'un objectif**, par ordre d'importance : structure de mots (ex. « succursale ») > niveau dans le plan (annuel, mensuel, hebdomadaire) > temps total prévu.
4. **Peu de données** : (a) on classe tout de suite avec la mention « peu fiable » (pas de seuil) ET (b) on compare toujours aussi l'utilisateur à lui-même (sa vitesse actuelle contre sa vitesse passée).

### Points de confidentialité : VALIDÉS par Émilien (21 oct. 2026)
- **Localisation = regroupement par ville** : les entreprises d'une même ville sont rangées ensemble (marché le plus semblable). Clé ANONYME et irréversible par ville ; le nom du lieu n'est jamais stocké ni lu par un humain ; comparaison entre clés identiques ; ville peu représentée = mention « peu fiable », sans seuil minimum. Risque résiduel dit honnêtement : domaine + taille + ville peut cibler une seule entreprise dans une petite ville ; compensation : aucune statistique n'est montrée à personne, seul l'algorithme les utilise.
- **Structure de mots** (« succursale ») : liste FERMÉE de marqueurs de hauteur ; le mot est lu une fois puis jeté, on ne garde qu'un niveau (étiquette).

## Ordre du jour de la discussion (21 oct. : point 1 fait)
1. Définir ce qui « marche » (voir « À trancher »).
2. Remplir le tableau des formes observées (voir « Garde-fous », point 1) : Émilien juge chaque forme.
3. Définir la liste fermée des domaines (voir « Domaines candidats », décision 5).

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
