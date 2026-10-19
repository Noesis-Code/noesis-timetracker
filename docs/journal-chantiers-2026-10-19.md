# Journal des chantiers — 19 oct. 2026

Résumé de la journée (source : historique `staging`). Mise en place des 7 chantiers permanents (`CHANTIERS.md`) : sept actifs en tout temps, listes de repli, secteurs de l'app par chantier.

## Réglages plein écran
- Réglages TimeTracker et Trade Tracker ouvrent la même fenêtre plein écran que Profil et Activité.
- Menu de l'appui long de la barre du bas : pop-up centré avec ✕ ; toutes les fenêtres du bas deviennent des pop-up centrés (DESIGN.md à jour).
- Réglages > Calendrier : un seul bloc « Exporter vers le calendrier ».

## Extension Trade
- Trade Tracker devient une extension de la barre du bas (interrupteur dans le menu de l'appui long) ; ligne retirée de Réglages > Modules.
- Design aligné sur TMT (Langue dans Réglages, bouton principal, jetons).
- Sécurité : passkeys (WebAuthn) en plus du TOTP, step-up, audit chaîné ; sessions durcies, alertes de sécurité, limites de débit sur `/api/auth`, sauvegarde/restauration testées, alerte prix en retard (`/health`), tests aux ports dynamiques.

## Passkeys
- Passkeys côté Trade (voir ci-dessus), iframe Trade mise à jour (`sw.js` bumpé).

## Stripe Expansion
- Renommage Offre 1 -> Expansion ; bouton d'achat actif seulement quand le paiement est ouvert (`GET /api/offer/available`).
- Taxes TPS/TVQ automatiques via Stripe Tax (`STRIPE_TAX_ENABLED=1`), webhook testé, correctif `users.stripeCustomerId`, textes visibles (CGU, confidentialité, code, courriel parental), plan de la semaine, parcours achat/livraison/résiliation testés (Stripe simulé). `staging` = clés de test uniquement.

## Repli par chantier
- Basic : tests fonctionnels (profil, activités, feuille de temps, tâches, modules) ; capture hors ligne (doublons, libellé vide, 408/425 retentés).
- Crédits Claude et API : inventaire des appels, rapport de coût par fonction, mémo 24 h, payload inter-secteurs allégé (-31 %), plafonds d'abus.
- Simplification et design : charte `SIMPLIFICATION.md`, retrait des conversations de projet, horloge défilante, bascule de confirmation IA ; boutons d'action en violet (orange brique = destructif) ; accessibilité (aria, module de pop-up).
- Précision des tâches : jeu d'évaluation (42 -> 63 -> 45 cas anglais/mixte), règles déterministes, consignes de classement, journal des échecs.
- Principal et pilotage : garde d'intégrité, `new-worktree.sh`, `bump-sw.js`, `chantiers-status.js`, brief standard ; nettoyage listé dans `docs/nettoyage-branches-2026-10-19.md`.
