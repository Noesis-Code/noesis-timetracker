# Propositions de simplification (20 oct. 2026) — liste vivante unique

État au 21 oct. 2026 : S3, S7, S9, S10, S11 (modifiée : seulement 3,5 CAD/semaine et 15 CAD/mois par compte, plus de plafond du jour ni par fonction), S12, S13, S14, S15 EXÉCUTÉES ; S1, S2, S4, S5, S6 par l'agent composants ; S8 REFUSÉE (journal de `SIMPLIFICATION.md`).
Livraison (24 oct. 2026) : la tâche « S1 étape 2 » (jetons communs : verre calme, --pop-bg, --halo, --good) est livrée par le commit 3134671, intitulé par erreur « S1 étape 4 » (historique non réécrit).

Pour chaque proposition : répondre **oui** ou **non**. Rien n'est exécuté avant ton oui ; chaque entrée est assez précise pour qu'un agent l'exécute telle quelle. Classées par gain, groupe par groupe. Constats vérifiés sur `origin/staging` (f4509f6) : les points déjà corrigés des audits (route PUT `goals/capacity`, `bindSubProjectDrag`, classes `goalCapacity*`) ne sont plus listés.

## A) Doublons et code inutile

### S1 · Un seul fichier de jetons Trade
Quoi : Trade Tracker garde sa propre copie des couleurs et du verre (`trade-tracker/public/tokens.css`) qui a dérivé ; on sert le même fichier aux deux apps.
Gain : une copie de jetons en moins, fin des écarts de fond de carte et de rouge entre les deux apps.
Risque : moyen, l'aspect de Trade peut bouger.
Preuve : `docs/audits/audit-composants-2026-10-20.md` §1.7 et §3.3 ; `trade-tracker/public/index.html:13`.

### S2 · Un seul rouge de danger
Quoi : trois noms (`--red`, `--bad`, `--danger-armed`) et un 4e rouge dans Trade désignent le même rouge ; n'en garder qu'un.
Gain : 3 variables CSS en moins, un seul rouge dans l'app.
Risque : faible, même valeur #E0626B.
Preuve : `docs/audits/audit-composants-2026-10-20.md` §1.2 ; `grep -rn "danger-armed" public trade-tracker/public`.

### S3 · Retirer les scripts d'une seule fois
Quoi : supprimer les scripts de rattrapage déjà passés (`apply-offre1-roadmap`, `apply-offre1-weekly-goals`, `realign-goals-monday`, `cross-sector-retroactive-sweep`, `migrate-year-grid`, `seed-stats-demo`) ; aucune fonction de l'app retirée.
Gain : 6 fichiers, environ 790 lignes, plus leurs tests éventuels.
Risque : moyen, on ne pourra plus rejouer l'Offre 1 à la main.
Preuve : `wc -l scripts/*.js` ; ils ne sont référencés que par eux-mêmes (`grep -rl <nom> .`).

### S4 · Une seule icône crayon
Quoi : le même dessin du crayon ✎ est recopié 4 fois (Chrono, Page 1, Tâches, Page 3) ; on garde une copie partagée.
Gain : 3 copies de code en moins, aucun changement visible.
Risque : faible, dessin identique.
Preuve : `CHRONO_HISTORY_EDIT_ICON` (`public/app.js:3263`), `HISTORY_EDIT_ICON` (`objectifs-page1.js:174`), `GOALS_TASK_EDIT_ICON` (`objectifs-page2-taches.js:1160`), `GOAL_DESC_EDIT_ICON` (`objectifs-page3.js:360`).

### S5 · Une seule croix de suppression de message
Quoi : la croix rouge qui supprime un message de discussion est copiée-collée 6 fois dans `app.js` ; une seule fonction la fabrique.
Gain : environ 5 copies de code en moins, aucun changement visible.
Risque : faible, copies identiques.
Preuve : `grep -c discussionMsgDelete public/app.js` = 7 ; `docs/audits/audit-composants-2026-10-20.md` §1.2.

### S6 · Fusionner deux boutons « + » pointillés
Quoi : `.extCalAddBtn` (Réglages, calendrier) est une copie de `.saAdd` (Stats) ; les deux deviennent la même classe.
Gain : une règle CSS en moins, même aspect.
Risque : faible, styles quasi identiques.
Preuve : `public/styles.css:3488-3489` contre `public/css/stats-avance.css:65`.

### S7 · Retirer les commentaires sur du code supprimé
Quoi : effacer les commentaires qui parlent de `bindSubProjectDrag` (retiré) et de `liveFeed` (périmé) ; aucune fonction touchée.
Gain : environ 10 lignes de bruit, lecture du code plus claire.
Risque : faible, commentaires seulement.
Preuve : `public/app.js:12382`, `15579` ; `docs/questions/questions-emilien-simplification.md` (ligne `liveFeed`).

## B) Fonctionnement de l'IA

### S8 · Haiku seul pour classement et reformulation
Quoi : ne plus rappeler le gros modèle quand le petit hésite ; si le résultat est faible, la tâche reste sans catégorie (ou sans reformulation) comme en cas de panne. Retire une étape de l'IA.
Gain : environ -2/3 du coût des appels concernés quand le repli se produit (classement 0,0027 $ contre 0,0009 $ ; reformulation 0,003 $ contre 0,001 $), 2 modèles forts en moins sur ces fonctions.
Risque : moyen, quelques tâches mal classées.
Preuve : `docs/ia/ia-modeles.md` (tableau) ; à mesurer d'abord par `node scripts/eval-task-precision.js --live` et le taux de repli de `scripts/ai-cost-report.js`.

### S9 · Un seul modèle fort au lieu de deux
Quoi : aujourd'hui le repli utilise Sonnet 5 pour certaines fonctions et Sonnet 4.5 pour d'autres ; on garde un seul identifiant.
Gain : une constante et un tarif en moins, un comportement plus simple à expliquer.
Risque : faible, mêmes tarifs (3 $ / 15 $ le million).
Preuve : `server/lib/aimodels.js` (`STRONG` contre `CLASSIFY_STRONG`) ; `docs/ia/ia-modeles.md` (section « Identifiants de modèle »).

### S10 · Un seul réglage de modèle rapide
Quoi : six variables d'environnement `NOESIS_*_FAST_MODEL` permettent de choisir un modèle rapide par fonction ; on ne garde que `FAST` pour toutes.
Gain : 6 réglages cachés en moins, un test de moins à entretenir.
Risque : faible, jamais utilisés (défaut Haiku partout).
Preuve : `docs/ia/ia-modeles.md` (tableau des constantes) ; `grep -rn "FAST_MODEL" server`.

### S11 · Retirer les plafonds par fonction redondants
Quoi : le budget commun (2 $/jour et 15 $/mois par compte) arrête déjà tout emballement ; retirer les plafonds propres des fonctions bon marché (orthographe 200, reformulation 150, classement 500, rapprochement 500, récurrence 300 par jour). Aucune fonction retirée.
Gain : 5 compteurs et 5 variables en moins, `aifeaturecaps.js` (43 lignes) et ses tests de cohérence réduits.
Risque : moyen, un bogue en boucle coûterait jusqu'au budget commun.
Preuve : `server/lib/aifeaturecaps.js` ; `docs/ia/ia-appels.md` (section « Plafonds et mémos »).

### S12 · Un seul script de rapport de coût
Quoi : `ai-cost-report`, `ai-cost-weekly`, `ai-cost-projection` et `ai-acceptance-report` se recoupent (la projection est déjà dans le rapport) ; en faire une commande avec options (`--court`, `--semaine`).
Gain : 3 fichiers et environ 180 lignes en moins, une seule commande à retenir.
Risque : faible, outils de lecture seule.
Preuve : `scripts/ai-*.js` (331 lignes) ; `docs/ia/ia-couts-reels-2026-10-20.md` (étapes 1 et 4).

## C) Processus de propositions lui-même

### S13 · Un seul document IA au lieu de seize
Quoi : les 16 fichiers `docs/ia-*.md` (64 Ko) se répètent (plafonds, modèles, échecs, coûts) ; les fondre dans `docs/ia/ia-appels.md` et supprimer le reste.
Gain : 15 fichiers et environ 50 Ko en moins, une seule source à lire.
Risque : faible, texte seulement ; garder les liens du test `ia-appels-doc-test.js`.
Preuve : `ls docs/ia-*.md` ; `wc -c docs/ia-*` = 63 814.

### S14 · Un seul fichier de questions pour Émilien
Quoi : sept `docs/questions-emilien-*.md` (47 Ko) à cocher ; les fondre en un seul fichier, une case par décision, sans doublon (ex. benchmark déjà fusionné avec Trade Q8).
Gain : 6 fichiers en moins, une seule liste à ouvrir ; cette page devient la liste de référence des propositions.
Risque : faible, texte seulement.
Preuve : `ls docs/questions-emilien*` ; `docs/questions/questions-emilien-simplification.md` (renvoie à d'autres audits).

### S15 · Fondre audits de simplification en un
Quoi : `code-mort`, `points-non-necessaires`, `inventaire-options` et `audit-composants` listent les mêmes éléments (croix, « + », filtre Stats, pastille orange) ; ne garder que ce fichier-ci, et que `SIMPLIFICATION.md` (étape 4 de la boucle) y renvoie. Une proposition acceptée ou refusée y est cochée puis archivée au journal de `SIMPLIFICATION.md`.
Gain : 4 audits (environ 56 Ko) en moins ; une seule liste vivante, plus de décision demandée deux fois.
Risque : faible, les constats utiles sont repris ici.
Preuve : `docs/audits/points-non-necessaires.md` (11 points) contre `docs/questions/questions-emilien-simplification.md` (mêmes points en cases) ; `SIMPLIFICATION.md` étape 4.

## Constats repris des anciens audits (S15, 21 oct. 2026)
Les audits `code-mort`, `points-non-necessaires`, `inventaire-options` et `audit-composants` sont retirés. Reste à décider (cases dans `docs/questions/questions-emilien.md`, section Simplification) :
- Écrans et options : pastille orange de « Feuille de route », filtre Public/Confidentiel de Stats, deux menus de période, sections Réglages à fusionner (Sécurité + Supprimer mon compte, Partage), langue de Trade, graphique Camembert/Barres, petites positions.
- Routes sans appelant : `routes/offerforms.js` (`/activities/:id/forms`, `/profile-form`, flux Offre 1 dormant mais tables lues par `offerdelivery.js`), `POST /import/history`, `POST /offer/portal`, `DELETE /profile/:id/ai-examples`, `GET /push/status`.
- Scripts sans appelant restants : `activate-offre1.js` (cité en commentaire seulement), `eval-false-rejects.js`, `hash-offer1-code.js` et `run-inactive-accounts.js` (outils d'exploitation, à garder), `export-activity-structure.js`.
- i18n : `objectifs-document-taches.js` n'a aucune traduction EN (~60 phrases) ; 4 clés EN en conflit (`Valider`, `Atteint`, `En cours`, `En retard`).
- CSS : 106 déclarations `!important` non vérifiables (états inatteignables en test) ; quasi-doublons JS non fusionnés (`bindProjectDrag`/`bindActivityDrag`, `buildAttachmentRow`/`ReadOnly`, `buildPostCard`/`buildProfileFeedPostCard`, `chronoHistoryWeekLabel`/`goalsTasksHistoryWeekLabel`).
- Composants (S1 à S6 faits ou en cours) : il n'existe pas de `css/composants.css` ; croix ✕ en 12 variantes, croix rouge de retrait en 9, « + » pointillé, flèches, séparateurs, verre et ✎ redéfinis par écran ; plan de migration vers un composant unique par contrôle (R29), garde `test/composants-garde-test.js`.
- Colonnes inertes à supprimer par Émilien si souhaité : `users.chronoScrollClock`, `users.aiConfirmEach`.
