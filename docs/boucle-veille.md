# Boucle de veille (génération continue de tâches)

Décision d'Émilien du 20 oct. 2026 (citation : `intentions.md`). Objectif : lire ses tâches automatiquement, générer en continu des tâches **assez précises pour être comprises sans lui**, et garder un produit qui part de 0 et ne gagne que ce qui sert (modèle « 0 → 1 »). Aucun code serveur ni interface : c'est une procédure suivie par le coordinateur et les chantiers.

## La boucle (à chaque relance d'un chantier)
1. **Lire** les tâches d'Émilien du secteur du chantier : MCP TiMeTracker `lister_taches` (par secteur, voir `CHANTIERS.md`). Non réservées d'abord.
2. **Relire les intentions** (`intentions.md`) du chantier : toute nouvelle demande y est copiée mot pour mot avant d'être découpée.
3. **Générer 3 tâches candidates** à partir des résultats du chantier : échecs de tests ou de livraison, remarques des relectures croisées, mesures (précision, coût, captures), audit de simplicité et benchmark ci-dessous.
4. **Passer chaque candidate dans `modele-tache.md`** : complète = inscrite à la liste de repli du chantier ; incomplète = question à cocher (regroupée, jamais de notification).
5. **Exécuter** la première tâche disponible (ordre de `CHANTIERS.md` règle 1), livrer avec la preuve demandée.
6. **Consigner** : un malentendu rencontré va au journal ci-dessous.

Les tâches de **retrait** passent avant celles d'ajout.

## Audit de simplicité par écran
Pour chaque écran, avec une capture à 390 px (CLAUDE.md « Vérification visuelle », fermer `#marketingInviteModal` avant de cliquer) :
- Quelle est **l'unique fonction** de l'écran (une phrase) ?
- Pour **chaque élément** visible : sert-il cette fonction ? Qui l'utilise (donnée d'usage si elle existe, sinon « personne n'a demandé ») ?
- Sinon : **proposer le retrait**. Si l'élément a été ajouté sans demande d'Émilien (diff + `intentions.md`), le retirer directement (code, CSS, i18n, test) après vérification des usages ; sinon le lister en proposition.
- Rendu : `docs/audit-<écran>-<date>.md` avec capture.

Exemple fondateur : **le Chrono n'a pas de case de suggestion d'amélioration** (Émilien, 20 oct.). Un champ de feedback existe déjà à un seul endroit (Réglages › Aide et suggestions) : une deuxième entrée vers la même fonction est interdite (`SIMPLIFICATION.md` principe 2).
Écrans à auditer, un par passe : Chrono (fait 20 oct.), Stats, Feuille de route (pages 1-3), Communauté, Activité, Profil, Réglages, Trade Tracker.

## Benchmark « 0 → 1 »
Pour chaque écran audité, comparer **2 à 3 applications concurrentes** et noter ce qu'elles font **avec le moins d'éléments** :
- Temps : Toggl Track, Clockify, Harvest.
- Portefeuille (Trade Tracker) : Sharesight, Delta (+ une app de courtier simple).
Grille : fonction unique de l'écran chez eux / nombre d'éléments à l'écran / ce qu'ils ne montrent pas. Ne garder que ce qui **justifie notre différence** ; le reste devient une tâche de retrait ou de simplification (modèle de tâche). Le benchmark sert à **retirer**, jamais à copier une fonction. Consulter les sites/stores en lecture seule, citer la source et la date.
Rendu : section « Benchmark » dans le même `docs/audit-<écran>-<date>.md`.

## Journal des malentendus (cause → règle)
| Date | Malentendu | Cause | Règle |
|---|---|---|---|
| 20 oct. 2026 | Une case « Une amélioration à suggérer ? » est apparue sous le Chrono, qu'Émilien n'a pas voulue. | Une demande de feedback a été interprétée comme « ajouter un champ » à l'écran sans demande explicite d'interface. | Une demande qui ne nomme pas d'élément d'interface n'en crée pas : utiliser l'entrée existante ou poser une question à cocher. Le Chrono ne reçoit aucun ajout sans demande mot pour mot. |

## Lecture des tâches
Les sous-agents n'ont pas le MCP TiMeTracker. Avant de lancer un agent, le coordinateur exporte les tâches du secteur concerné (`lister_taches`) dans `/home/claude/taches-secteurs/<secteur>.json` (ex. `Basic.json`, `Expansion.json`). Ce dossier est **hors dépôt** : données personnelles, jamais commitées. L'agent lit ce fichier (id, tâche, échéance) ; avant de coder, il vérifie si la tâche est déjà faite (`BACKLOG.md`, `git log -S`) et, si oui, n'ajoute que le test manquant.
