# Amélioration de l'utilisation de l'IA : état des lieux et pistes (20 oct. 2026) — PROPOSITION

Sources : tâches Basic « Améliorer utilisation IA dans application » (id 1464, 19 oct.) et « Améliorer l'utilisation de l'IA dans l'application » (id 553, 21 oct.), trop vagues pour être lancées (`modele-tache.md` : pas de résultat attendu cité). Ce document les transforme en pistes vérifiables. Aucune n'est implémentée ici sauf le plafond du point « Exécuté ». Coûts = estimations de `ia-appels.md` / `ia-modeles.md` (aucune base de production disponible ici : `node scripts/ai-cost-report.js 30` et `node scripts/ai-acceptance-report.js 30` donnent les vrais chiffres).

## État des lieux (9 fonctions)

| Fonction | Ce que fait l'IA | Ce que l'utilisateur voit | Acceptation mesurable (`ai-acceptance-report.js`) | Coût / appel |
|---|---|---|---|---|
| Orthographe | corrige le titre d'une tâche | rien (appliquée en silence, règle du 16 oct.) | non (sans objet) | ~0,0002 $ |
| Classement | range la tâche dans un secteur | tâche déjà rangée | oui : classées vs corrigées à la main (`goal_classify_examples`) | ~0,0009 $ (repli ~0,0027 $) |
| Reformulation | réécrit un texte sur clic | texte proposé | NON : rien stocké | ~0,001 $ |
| Inter-secteurs | suggère une tâche voisine dans un autre secteur | suggestion à accepter/refuser | oui : applied / dismissed / pending | ~0,004 $ |
| Document / modifications proposées | extrait des tâches, propose des changements champ par champ | liste à valider | oui : `change_proposals` par champ | ~0,0075 $ |
| Surveillance Drive | lit les fichiers modifiés, propose des tâches | tâches proposées | partiel (via document) | ~0,008 $ (lots ~0,004 $) |
| Objectifs hebdo | décline l'objectif de période en semaines | aperçu puis application | NON : aperçu non journalisé | ~0,013 $ |
| Plan Offre 1 / Expansion | feuille de route payante | sous-projets et tâches | NON (livrable, pas une proposition) | ~0,019 $ |
| Récurrence / rapprochement | suggère une récurrence, relie à un objectif | suggestion | NON | marginal |

Protections déjà en place : budget `aibudget` (2 $/jour/compte), mémos 24 h, Haiku d'abord, plafonds par compte pour orthographe, classement, reformulation, récurrence, rapprochement, inter-secteurs, alerte de coût du jour. Manquait : plafond de **Objectifs hebdo** (seule fonction par compte sans plafond propre, avec Offre 1 qui est rare) — exécuté ci-dessous.

## Pistes, classées par rapport gain / coût (PROPOSITION, rien de visible)

### 1. Plafond Objectifs hebdo — EXÉCUTÉ (gain faible, coût quasi nul)
Fait : `HEBDO_MAX_PER_DAY` (défaut 60/compte/jour, appels réels seulement). Test : `test/ia-plafonds-test.js`.

### 2. Mémo persistant orthographe/classement (gain moyen, coût faible)
- Contexte : le mémo est en mémoire, perdu à chaque redémarrage Railway (`ia-appels.md`) ; l'orthographe est appelée à chaque titre.
- Titre : Conserver les réponses IA répétées d'orthographe et de classement après un redémarrage.
- Résultat attendu : citation à obtenir (intention « faire plus avec moins », chantier 4) ; invisible pour l'utilisateur.
- C'est fini quand : (a) un test relance le module (mémoire vidée) et la même entrée ne fait aucun appel réseau ; (b) la table est purgée à 24 h ; (c) aucun fichier d'interface touché.
- Périmètre : `server/lib/aicache.js` + une table dans `server/db.js` (fichier très partagé). Ne touche pas : prompts, interface.
- Coût estimé : 1 agent, 1 session ; économie = les appels répétés post-redémarrage (faible à moyen, à mesurer via `ai-cost-report`).

### 3. Signal d'acceptation de la reformulation (gain moyen en mesure, coût faible)
- Problème : seule fonction à clic explicite sans mesure de son taux d'acceptation, donc impossible de dire si elle est utile (et à retirer sinon : principe de simplification).
- C'est fini quand : (a) le serveur enregistre « proposée » et « utilisée » sans le texte ; (b) `ai-acceptance-report.js` affiche le taux de reformulation ; (c) test sur les deux compteurs.
- Périmètre : `goalsrewrite.js`, route associée, script ; l'envoi « utilisée » demande un appel depuis l'interface (`app.js`, fichier très partagé) : minimal, invisible. Loi 25 : ne stocker aucun texte.
- Coût estimé : 1 agent, 0 jeton IA.

### 4. Classement : Haiku seul, repli retiré (gain moyen, coût moyen, risque de qualité visible)
- C'est fini quand : `eval-task-precision.js --live` (par Émilien) donne >= 98 % sans repli et le taux de repli (`fallbackReport`) est mesuré avant.
- Périmètre : `goalstaskclassify.js` (rebase frais obligatoire). Changement de qualité visible = proposé, jamais appliqué sans accord.
- Coût estimé : 1 évaluation `--live` ; économie ~3x sur la part en repli.

### 5. Regrouper les classements en un appel (gain moyen, coût élevé)
- Déjà posée en question. Exige évaluation `--live` ; à ne lancer qu'après la piste 4. Périmètre : `goalstaskclassify.js`, `aicache.js`.

## Hors liste (déjà fait ou refusé)
Cache de prompt sur classement/reformulation/inter-secteurs : non (sous le seuil, `ia-appels.md`). Exemples dans le prompt de reformulation/orthographe : refusé (`apprentissage-usage.md`). Rapport hebdo : `scripts/ai-cost-weekly.js` existe.
