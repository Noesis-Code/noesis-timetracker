# Intentions d'Émilien (mot pour mot)

Source de vérité de ce qu'Émilien a demandé. Une entrée = une demande copiée **telle quelle** (jamais reformulée), classée par chantier, avec date. Toute tâche auto-générée (voir `docs/regles/modele-tache.md`) renvoie ici : si le résultat attendu n'a pas de citation, la tâche n'est pas lancée.

Règle d'écriture : le coordinateur ajoute l'entrée à la réception de la demande, avant de la découper. Entre crochets = contexte ajouté par Claude, jamais présenté comme citation. Une demande plus récente qui contredit une ancienne la remplace : on l'indique, on ne supprime pas.

## 21 oct. 2026

### Captures des modifications visuelles (règle R30)
- **21 oct.** Décision d'Émilien, mots exacts :
  > « chaque tâche qui est une modification visuelle doit avoir une capture d'écran avec la modification appliquée pour que je sache exactement ce qui va être et on doit se tenir exactement au plan. »

## 19-20 oct. 2026

### Chantier 1 — Trade Tracker
- **19 oct.** Mots exacts :
  > « Au tradetracker, je souhaite que ce ne soit pas un bouton ni un onglet dans les paramètres, mais une extension ajoutable directement depuis le volet activé »
- **20 oct.** Correction (remplace la précédente interprétation « appui long sur la barre du bas »), mots exacts :
  > « Ce n'est pas ce que j'ai demandé. J'ai demandé... Dans le volet activité, lorsqu'on clique sur modifier l'activité, d'ajouter une option avec un plus où on peut connecter le module Trade Tracker à l'activité. »

### Chantier 5 — Simplification et design général
- **19 oct.** Réglages en plein écran, mots exacts :
  > « Je souhaite que le réglage soit basé sur le même principe qu'une fenêtre de l'écran aussi je ne comprends pas les modifications propres modules et trade tracker n'est pas un module mais une extension »
- **20 oct.** Écran de chargement (le N), mots exacts, dans l'ordre :
  > « Commande pour design, je t'ai demandé de changer le N de chargement. Je souhaite qu'il y ait encore le triangle en haut à droite qui apparaisse. Fais moi des maquettes. »
  > « Rappel, à chaque chargement, le N doit se charger en entier. Soit il charge plus vite, soit on laisse le temps de chargement un peu plus longtemps pour voir le N charger en entier. »
  > « Pour le N qui charge, je n'aime pas la nouvelle version, honnêtement. Je préférais la première version, celle qui est encore disponible sur la production. Remets-la et éventuellement propose-moi des améliorations en maquette. »
  [Cette dernière demande remplace les deux précédentes : la version de la production est rétablie ; les améliorations passent par des maquettes, pas par du code.]
- **19 oct.** Simplification : l'application doit rester simple, on retire avant d'ajouter (voir `SIMPLIFICATION.md`, ouverture du 19 oct.).
- **20 oct.** Chrono : pas de case en dessous pour suggérer une amélioration (« tu aurais compris par toi-même que dans Chrono, il ne devait pas y avoir une case en dessous pour une amélioration à suggérer »).

### Chantier 7 — Principal et pilotage
- **19 oct.** Sept chantiers permanents, mots exacts :
  > « Pour le chantier principal cette chantier doivent tourner en permanence si plus rien à faire trouve de ta affaire, il ne doit jamais y avoir moins de sept chantiers qui tourne en permanence »
- **20 oct.** Apprentissage, mots exacts :
  > « En gros, l'objectif, c'est que tu t'entraînes et que tu entraînes les tâches et la génération de tâches dans mon app à comprendre ma personnalité, mon besoin et ma vision. Et que tu t'ajustes par rapport à cela en permanence. Je souhaite que ceci s'applique aussi pour l'app, que les tâches générées par l'app grâce à l'API deviennent de plus en plus performantes au fil de l'utilisation par l'utilisateur. »
  > « Je souhaite codwer les 2 mais tout dépend du cout de chacune » [mesure + profil par utilisateur]
- **20 oct.** Demande de la boucle de veille, mots exacts :
  > « garder la partie sur la comparaison avec les apps concurrentes afin de garder un modèle qui passe de 0 à 1. Aussi, je souhaite que tu lises automatiquement les tâches de mon thread tracker. Donc, il faut trouver un moyen pour générer les tâches quasiment en continu en fonction de tes résultats et que les tâches soient suffisamment spécifiques pour que tu les comprennes et que ce soit bien cerné sur ma demande. Ainsi, ça se auto-générera en permanence. Par exemple, pour l'application actuelle, tu aurais compris par toi-même que dans Chrono, il ne devait pas y avoir une case en dessous pour une amélioration à suggérer. »

## 18 oct. 2026

### Chantier 3 — TT Expansion : de l'objectif annuel aux tâches
- **18 oct.** Vision d'Émilien. Mots exacts : **NON RETROUVÉS** (le texte d'origine n'est ni dans le dépôt, ni dans l'historique git, ni accessible depuis cette session ; seule sa reformulation figure dans `BACKLOG.md` section 5). À coller ici par Émilien ou le coordinateur, sans reformulation. Résumé de la reformulation, NON citation : l'utilisateur d'Expansion saisit son objectif annuel et sa stratégie ; l'IA propose objectifs périodiques, hebdomadaires puis tâches, par pôle/secteur, en proposition validée avant/après.
- **21 oct.** Réponses d'Émilien : E1 à E4 OUI (feuille de route : `docs/expansion/vision-objectif-annuel-cadrage.md`). Étape 1 livrée : objectif annuel + stratégie vers objectifs de période (`server/lib/yearplanproposals.js`).

## 21 oct. 2026

### Chantier 3 — TT Expansion : connecteur IA libre
- **21 oct.** Décision d'Émilien, mots exacts :
  > « Je permets aux utilisateurs le plus de flexibilité possible entre la connexion de l'application avec leur IA. C'est déjà assez efficace et assez à l'aise avec l'IA. Ils devraient donc pouvoir utiliser la version extension, la version gratuite, avec les mêmes fonctionnalité de l'extension sans payer l'extension, mais grâce à une bonne organisation avec leur connecteur IA. Je ne veux pas limiter l'organisation. »
  Confirmé en chat (21 oct., 01 h 51) « Oui, aux deux » : outils d'écriture au connecteur, et seule l'IA intégrée reste payante. Cadrage : `docs/expansion/connecteur-ia-libre.md`.

## Note d'amorçage
Les citations du 19-20 oct. ont été complétées mot pour mot par le coordinateur (20 oct.). Seule l'entrée « Simplification » reste un renvoi à `SIMPLIFICATION.md`.
