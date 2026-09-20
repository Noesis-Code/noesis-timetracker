# TimeTracker (TMT) — Repères pour toute session Claude

Ce fichier est lu automatiquement par les sessions Code et par les conversations Cowork reliées à ce dossier. C'est la source unique de vérité pour le découpage du travail sur ce dépôt — à tenir à jour à chaque nouveau segment créé par Aiguillage.

## Fonctionnement

Plusieurs conversations Claude codent ce dépôt en parallèle, chacune responsable d'un segment précis (périmètre de fichiers défini ci-dessous), pour que plusieurs chantiers avancent sans se marcher dessus. Une conversation « Aiguillage » reçoit toute nouvelle demande et décide dans quel segment elle va, ou si elle mérite un nouveau segment.

Le module Horaires (client Jacopo) est un produit séparé, hors TimeTracker — jamais traité ici.

## Hébergement du code

- Dépôt : https://github.com/Noesis-Code/noesis-timetracker.git
- Branche d'intégration : `staging` — jamais de commit direct sur `main`.
- Chaque segment travaille sur sa propre branche depuis `staging` à jour (ex. `emilien/<segment>`), fusionnée vers `staging` une fois le chantier prêt.
- Environnement de test (Railway) : https://web-staging-6d1b.up.railway.app
- **Avant tout envoi de code vers l'environnement de test**, demander explicitement : « ATTENTION, envoyons-nous le code sur l'application Teste ? » — et attendre la confirmation d'Émilien avant de continuer.
- Fusion `staging` → `main` : toujours faite par Émilien lui-même après avoir testé l'URL Railway — aucune conversation ne fusionne elle-même.

## Cartographie des segments

| Segment | Périmètre de fichiers | Points d'attention |
|---|---|---|
| Chrono | Onglet Chrono : routes et lib du chronométrage, bloc CHRONO de `public/app.js`, section correspondante de `index.html` | Un sélecteur de secteur au démarrage du chrono peut être ajouté par le segment Objectifs (chantier Pôles & secteurs, 20 sept. 2026) — coordonner avec lui avant d'y toucher en parallèle |
| Sous-projets | `server/lib/subprojects.js`, `server/lib/entrysubproject.js`, `server/lib/subprojectstats.js`, `server/routes/subprojects.js`, `server/routes/subprojectstats.js`, tables `sub_projects`/`sub_project_sections`/`sub_project_items`/`sub_project_messages`, blocs UI dédiés dans `app.js`/`index.html`/`styles.css`/`i18n.js` | `#subProjectMessageInput` (composeur) en cours d'usage par le segment Design le temps du correctif clavier virtuel (20 sept. 2026) |
| Offre 1 / Abonnement & Paiement | `server/lib/offerdelivery.js`, `subscriptioncron.js`, `subprojectqueue.js`, `stripe.js`, `server/routes/offercheckout.js`, `server/routes/stripewebhook.js`, les 4 formulaires et leur UI (`public/*`, `docs/formulaires-offre1.md`) | Segment le plus actif historiquement — candidat à scinder en deux (Formulaires / Paiement-Cron) si le volume continue de grossir |
| Paramètres & Profil | Onglet Paramètres, création de compte/profil, case de consentement légal, écran d'onboarding | Les changements de texte légal (CGU, politique de confidentialité) atterrissent ici quand ils touchent le code. Composeurs de la zone Discussion en cours d'usage par le segment Design le temps du correctif clavier virtuel (20 sept. 2026) |
| Communauté | Onglet Communauté | Partage les classes CSS `.barList`/`.barRow`/`.barTop`/`.barTrack`/`.barFill` avec Statistiques — ne jamais les renommer/restructurer depuis ce segment |
| Statistiques | Onglet Statistiques — périmètre exact à délimiter à l'activation | Segment non assigné jusqu'ici (Gaspard ne code plus depuis le 29 août 2026) — à activer dès qu'un chantier le touche ; partage les classes CSS listées ci-dessus avec Communauté. `server/lib/categorystats.js`/`server/lib/stats.js` en cours d'usage par le segment Objectifs (chantier Pôles & secteurs, 20 sept. 2026 — repli/affichage des secteurs en Répartition, renommage catégorie→pôle) — ne pas y toucher en parallèle sans coordination |
| Objectifs | `server/lib/goals.js`, `goalsauto.js`, `goalsdailyauto.js`, `server/lib/entrycategory.js`, `server/routes/goals.js`, blocs UI dédiés dans `app.js`/`index.html`/`styles.css` | Chantier le plus actif actuellement, plusieurs sous-discussions en cours (Arbre périodique, Rail périodique, Ajout de catégorie, Logique métier, Calendrier) — segment ajouté ici car absent du découpage d'origine ; détail dans `noesis-timetracker-objectifs.md` (projet Claude NOÈSIS). Chantier en cours (20 sept. 2026) : renommage complet « catégorie » → « pôle » (code + UI) et exposition des secteurs (routes + frontend) — backend déjà posé le 18 sept., voir `noesis-timetracker-poles-secteurs.md` ; touche aussi `server/lib/categorystats.js`/`server/lib/stats.js` (Statistiques, en cours d'usage) et potentiellement le bloc CHRONO (Chrono, en cours d'usage) |
| Infra & configuration du dépôt | CI, tests globaux, dépendances (Dependabot, CodeQL), configuration du dépôt | Ne touche quasiment jamais aux mêmes fichiers que les segments produit |
| Design | `public/index.html` (balise `<meta name="viewport">`, coquille `.topbar`/`.tabbar`), mécanismes transverses de `public/app.js` (clavier virtuel : `syncTopbarPin`, `mountMessageThread()`, `pollAutoGrow()`, `_isTextInputEl`/`_isCoarsePointer`), classes CSS génériques correspondantes dans `styles.css` | Nouveau segment (20 sept. 2026), créé par Aiguillage pour les chantiers transverses à plusieurs onglets (clavier virtuel, coquille applicative). Ne touche aux instances concrètes des composeurs d'un autre segment (Sous-projets, Paramètres & Profil) que via ce mécanisme partagé — jamais leur logique propre |

Hors segmentation : Horaires / client Jacopo (produit séparé, hors TimeTracker).

## Règle de décision (Aiguillage)

- Le chantier touche des fichiers couverts par un seul segment existant → l'envoyer dans ce segment.
- Le chantier ne touche aucun fichier couvert par un segment existant → proposer un nouveau segment (nom + périmètre de fichiers), à ajouter ici une fois validé par Émilien.
- Le chantier touche des fichiers couverts par plusieurs segments → ne pas répartir : assigner au segment portant la plus grosse part du changement, signaler dans ce tableau que les fichiers partagés sont « en cours d'usage » par ce chantier.
- Ne jamais créer un nouveau segment sur un territoire de fichiers déjà pris par un segment existant.

## Règles pour toute conversation de segment

- Ne jamais toucher aux fichiers d'un autre segment. Si une demande déborde du périmètre, le signaler à Émilien plutôt que d'y toucher — elle doit passer par Aiguillage.
- Travailler sur sa propre branche dédiée (`emilien/<segment>`, créée depuis `staging` à jour) — jamais de commit direct sur `staging`, encore moins sur `main`.
- Une fois le chantier prêt, fusionner cette branche vers `staging`.
- Avant tout envoi vers l'environnement de test, poser la question exacte de la section « Hébergement du code » ci-dessus et attendre confirmation.
- Ne jamais fusionner soi-même vers `main` — c'est Émilien qui teste sur Railway et merge.

## Rappels transverses

- Le gate d'installation PWA (`app.js` / `isStandaloneMode()`) ne se déclenche qu'à la création/récupération d'un profil — à garder en tête pour tout segment touchant à l'onboarding (Paramètres & Profil).
- Pour le détail historique/technique complet (incidents, décisions, journal des chantiers), consulter les documents du projet Claude NOÈSIS (`noesis-timetracker-*.md`), en particulier `noesis-timetracker-chantiers-en-cours.md`.
