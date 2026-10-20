# Mémo IA mesuré et journal de coût (20 oct. 2026, chantier 4, repli 25)

## Instabilité de la suite
`node test/run-tests.js` lancé 2 fois de suite sur staging à jour : 144 passées, 0 échouée aux deux passages. 2 passages propres, aucun test instable identifié.

## Taux de succès réel du mémo (`aicache.memoize`)
Avant : aucune mesure (impossible de dire si le mémo évite des appels). Après : compteurs succès/échecs (`aicache.memoStats()`, succès = réponse en mémoire ou requête identique déjà en cours) et une ligne au journal serveur tous les 200 appels : `[aicache] mémo : X succès / N (P %)`. Aucun changement de comportement ni de dépense. Test : `test/ia-memo-stats-test.js` (5 appels, 2 succès = 40 %).
À lire par Émilien après quelques jours en production : si le taux du classement est bas, voir la case ci-dessous.

## Constats (sans changement)
- Anti-rebond par clé : déjà couvert, deux appels identiques simultanés partagent une requête (`memoPending`) ; un changement rapide de pôle/secteur produit des prompts différents (catégories dans le prompt), donc non fusionnables sans changer le sens.
- Prompts répétés > 1000 caractères : inter-secteurs (1362) et hebdo (1263) sous le minimum cachable (1024 jetons), gain d'un raccourcissement ~quelques dizaines de jetons par appel, non mesurable sans `--live`. Documents (6814 car.) : déjà en cache de prompt Anthropic (lecture à 0,1 x). Rien changé.
- Journal de coût (`ai_usage_log`) : une ligne agrégée par (compte, jour, modèle, fonction) avec appels, jetons entrée/sortie, jetons cache lus/écrits et coût. Ce n'est PAS une ligne par appel, et le compte est l'identifiant interne (userId), non haché (pas de courriel).

## Cases à cocher (non exécutées)
- [ ] Classement : clé du mémo = prompt entier, donc les « exemples récents » de l'utilisateur la font varier (un même titre re-soumis après un autre classement manque le mémo). Retirer le bloc d'exemples de la clé augmenterait le taux de succès mais peut renvoyer une réponse calculée avec d'anciens exemples : risque de qualité, à décider après lecture du taux réel.
- [ ] Journal : hacher l'identifiant de compte dans `ai_usage_log` (migration, perd le lien avec la table des comptes pour budgets) : à décider.
- [ ] Journal : une ligne par appel (au lieu d'agrégats) : plus de détail, plus de stockage.
