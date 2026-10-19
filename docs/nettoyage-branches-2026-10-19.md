# Nettoyage des branches et worktrees — liste pour Émilien (19 oct. 2026)

Source : `node scripts/chantiers-status.js --fetch`, `git branch -r --merged origin/staging`. **Rien n'a été supprimé** (ni distant, ni local). Le stash `stash@{0}` (zone-fichier, 74e8e5c) n'est pas touché.

## Branches distantes `claude/*` déjà fusionnées dans staging
Les 4 seules branches distantes `claude/*` existantes sont toutes fusionnées (suppression distante possible) :
- `origin/claude/accomplissements`
- `origin/claude/annonce-main`
- `origin/claude/taches-5-archives`
- `origin/claude/verre-partout`

## À conserver (ne pas supprimer)
- `/home/claude/wt-credits-repli-1` (branche `claude/credits-repli-1`) : bloqué, marqueurs de conflit (UU) dans `public/css/objectifs-page1.css`, `public/js/objectifs-page1.js`, `public/sw.js`, `server/lib/docanalysis.js` ; autres modifs non commitées (`scripts/ai-cost-report.js`, `server/lib/silentspellfix.js`, `docs/ia-appels.md`). À résoudre ou abandonner par décision d'Émilien.
- Stash `stash@{0}` : WIP sur `claude/zone-fichier` (74e8e5c). Intact.

## Worktrees locaux fusionnés dans staging mais avec modifications non commitées (à vérifier avant retrait)
- `wt-annonce-main` (claude/annonce-main, 3 fichier(s) modifié(s))
- `wt-basic-repli-3` (claude/basic-repli-3, 3 fichier(s) modifié(s))
- `wt-bug-fdr` (claude/bug-fdr-client, 1 fichier(s) modifié(s))
- `wt-cat-scroll` (claude/cat-scroll, 1 fichier(s) modifié(s))
- `wt-chrono-commentaire` (claude/chrono-commentaire, 6 fichier(s) modifié(s))
- `wt-conformite-b` (claude/conformite-b, 1 fichier(s) modifié(s))
- `wt-couleurs-orange` (claude/couleurs-orange, 5 fichier(s) modifié(s))
- `wt-credits-repli-3` (claude/credits-repli-3, 8 fichier(s) modifié(s))
- `wt-expansion-repli-3` (claude/expansion-repli-3, 2 fichier(s) modifié(s))
- `wt-premier-volet` (claude/premier-volet, 1 fichier(s) modifié(s))
- `wt-retrait-conversations` (claude/retrait-conversations, 11 fichier(s) modifié(s))
- `wt-simplif-3` (claude/simplif-3, 11 fichier(s) modifié(s))
- `wt-simplification-repli-2` (claude/simplification-repli-2, 5 fichier(s) modifié(s))

## Worktrees locaux non fusionnés ou détachés, propres (à examiner)
- `wt-apercu-simplification` (claude/apercu-simplification)
- `wt-audit-simpl` (detache)
- `wt-budget-ia` (detache)
- `wt-capture-confirm` (claude/capture-confirm)
- `wt-chk` (detache)
- `wt-css-base` (detache)
- `wt-flaky` (detache)
- `wt-importance` (claude/importance)
- `wt-oldmain` (detache)
- `wt-partage-drive` (detache)
- `wt-pass1` (detache)
- `wt-precision-repli-3` (claude/precision-repli-3)
- `wt-purge-base` (detache)
- `wt-tests-stables` (claude/tests-stables, 1 fichier(s) modifié(s))
- `wt-trade-repli-2` (claude/trade-repli-2)
- `wt-trade-taux` (claude/trade-taux, 12 fichier(s) modifié(s))

## Worktrees obsolètes : branche fusionnée dans staging et arbre propre (249)
Retrait possible (`git worktree remove` puis `git branch -d`), par Émilien :

`wt-actions-taches` `wt-activite-membres` `wt-activite-poles` `wt-activite-stats` `wt-agenda-fusion` 
`wt-ajouter-document-ia` `wt-ajouter-orange-memoire` `wt-alertes` `wt-anglais-legal` `wt-anglais-legal2` 
`wt-anglais-ui` `wt-animation-n` `wt-annee` `wt-annee2` `wt-annonce` `wt-annonce-comm` `wt-annonce-push` 
`wt-annule-541` `wt-anti-rebond-ia` `wt-arbre-attente` `wt-axe` `wt-barre-volets` `wt-basic-1` 
`wt-basic-repli-1` `wt-basic-repli-2` `wt-borne-annee` `wt-bouton-ajouter-essor` `wt-bug-periode-secteur` 
`wt-cal-ext` `wt-calme-accueil` `wt-capsform` `wt-capstable` `wt-capture` `wt-capture-objectifs-horizon` 
`wt-cat-drag` `wt-cat-fix` `wt-cat-plus` `wt-cat-plus2` `wt-cat-toggle` `wt-categorie-inconnue` 
`wt-categories-v2` `wt-charte-simplif` `wt-chrono-horloge` `wt-chrono-ms` `wt-chrono-offline` `wt-clavier` 
`wt-code-acces` `wt-code-bouton-offre1` `wt-code-mort-front` `wt-code-mort-objectifs` `wt-code-mort-serveur` 
`wt-commentaire-chrono` `wt-confirm-ia` `wt-confirmation-ia` `wt-conformite-a` `wt-conformite-c` 
`wt-connecteur-drive` `wt-connexion-ia` `wt-conversations-notes` `wt-cout-api` `wt-credits-api-1` 
`wt-credits-memo` `wt-credits-repli-2` `wt-css-mort` `wt-debit` `wt-dedup-stats` `wt-demo-stats` 
`wt-deplacer-taches` `wt-design-lexique` `wt-design-tokens` `wt-detail-periode` `wt-discussion` 
`wt-discussion-p2` `wt-doublons-api` `wt-drive-erreur` `wt-drive-garde-taches` `wt-drive-multi` 
`wt-drive-recherche` `wt-drive-reglages` `wt-drive-surveillance` `wt-drive-ui` `wt-estimation-activite` 
`wt-estimation-membre` `wt-estimation-visible` `wt-expansion-achat` `wt-expansion-repli-1` 
`wt-expansion-repli-2` `wt-expansion-taxes` `wt-export` `wt-extraction-categories` `wt-feuille-annee` 
`wt-feuille-vide` `wt-fiabiliser-taches-ia` `wt-fix-feuille-mois` `wt-fusion-propositions` `wt-garder-taches` 
`wt-gaspard-a` `wt-gaspard-b` `wt-gaspard-c` `wt-gaspard-cat` `wt-gaspard-d` `wt-gaspard-e` `wt-gaspard-f` 
`wt-glisse-coherent` `wt-glisse-taches` `wt-haiku-hebdo-docs` `wt-i18n-feuille` `wt-i18n-nettoyage` 
`wt-ia-cout` `wt-ia-fusion` `wt-ia-horizon` `wt-ia-jour` `wt-ia-redistrib` `wt-ia-tri` `wt-identites` 
`wt-info-ia` `wt-integration-offre1` `wt-inter-secteurs` `wt-langue` `wt-lecture-pdf` `wt-limite-20` 
`wt-longue` `wt-masquer-secteurs` `wt-mcp-url` `wt-merge-secteur` `wt-migrer-sp` `wt-modifs-cases-retour` 
`wt-modifs-proposees` `wt-modifs-sans-cases` `wt-modules-client` `wt-modules-serveur` `wt-notif-barre` 
`wt-objectif-description` `wt-onb-noir` `wt-onb-retouches` `wt-onb-v3` `wt-onb-v4` `wt-onboarding-modules` 
`wt-orange2` `wt-ortho` `wt-page-ajouter-verre` `wt-page-ajouter-zone-libre` `wt-pages-continues` 
`wt-palette-b` `wt-parpole` `wt-parseplan` `wt-partage` `wt-pastille` `wt-payant-fdr` `wt-periode-secteurs` 
`wt-pilotage-1` `wt-pilotage-regles` `wt-pilotage-repli` `wt-pilotage-repli-2` `wt-pilotage-repli-3` 
`wt-pin-lock` `wt-placement-activite` `wt-plafonds` `wt-plafonds-ia` `wt-points-fixes` `wt-poles-supprimes` 
`wt-popups-sans-bas` `wt-precision-1` `wt-precision-eval` `wt-precision-repli-1` `wt-precision-repli-2` 
`wt-profil-couleurs` `wt-prompts-ia` `wt-propositions-modification` `wt-purge-commentaires` `wt-purge-front` 
`wt-purge-modules` `wt-rangement-ia-dates` `wt-recalcul` `wt-reformul` `wt-reglages-agenda` 
`wt-reglages-croises` `wt-reglages-espaces` `wt-reglages-identite` `wt-reglages-introuvables` 
`wt-reglages-onglets` `wt-reglages-plein-ecran` `wt-relecture-ecarts` `wt-report` `wt-reports-passes` 
`wt-reseau-perf` `wt-retrait-conv2` `wt-routes-mortes` `wt-sans-bilan` `wt-scenarios` `wt-secteurs-supprimes` 
`wt-securite-boutons` `wt-seed-stats` `wt-semaines52` `wt-signalement` `wt-simplif-1-2` `wt-simplif-3b` 
`wt-simplif-verif` `wt-simplif-violet` `wt-simplificateur-1` `wt-socle-modules` `wt-sombre-seul` 
`wt-sommaire-taches` `wt-stats-annee` `wt-stats-avance` `wt-stats-flottant` `wt-stats-graphique` 
`wt-stats-insights` `wt-stats-sync` `wt-stats-ui` `wt-statut-auto` `wt-strategie` `wt-strategie-i18n` 
`wt-strategie-icone` `wt-structure-noesis` `wt-suppr-discussion-ssp` `wt-suppr-pole` `wt-suppr-secteur` 
`wt-suppr-sousprojets` `wt-suppr-ssp-final` `wt-surcharge` `wt-surcharge-points` `wt-surcharge-pole` 
`wt-test-jour` `wt-tests-fonctionnels` `wt-trade-a` `wt-trade-b` `wt-trade-b-phase2` `wt-trade-broker-e2e` 
`wt-trade-broker-token` `wt-trade-deploiement` `wt-trade-design` `wt-trade-e2e` `wt-trade-extension` 
`wt-trade-extension-popup` `wt-trade-filtres` `wt-trade-integration` `wt-trade-passkeys` `wt-trade-phase2` 
`wt-trade-questrade` `wt-trade-repli-1` `wt-trade-restaure-css` `wt-trade-securite` `wt-trade-securite-2` 
`wt-trade-securite-bancaire` `wt-trade-tests` `wt-zone-fichier` `wt-zone-libre` `wt-zone-libre-envoi-rond` 
