# BACKLOG TimeTracker

Tenu à jour par le coordinateur. Priorité : 🔴 bloquant · 🟠 à faire · 🟡 quand possible · ❓ à trancher par Émilien.
Dernière mise à jour : 30 sept. 2026 (construit à partir de `chantiers-en-cours.md` ; tout le code écrit sur le disque d'Émilien au 30 sept. est déjà dans `staging` sauf la Piste B « verre » ci-dessous).

## 1. En attente de validation d'Émilien (code déjà dans `staging`, confirmation visuelle)
- Page 3 Objectifs s'ouvre par-dessus la Page 2 (z-index 101), fermeture qui revient sur la Page 2.
- Page 2 Objectifs en fenêtre plein écran + boutons Tâches/Objectifs façon onglets d'activité.
- Page 1 : puces d'activité (état au repos gris + point ; états d'écriture inchangés).
- Épuration visuelle : bouton d'envoi dans la zone (Profil, Feedback), topbar (Noesis→profil, profil→réglages), icône + étiquette « Feuille de route », page Profil en fenêtre, Réglages mode épuré.

## 2. En cours
- (rien) — Piste B « verre » + « verre partout » fusionnées dans `staging` le 30 sept., validées par Émilien.
- 🟡 Vérifier en thème clair (captures non concluantes) le « + » des projets du Profil et les bascules en verre.
- 🟡 `server/lib/seed-staging.js` n'est appelé nulle part : `staging` démarre-t-il sans données de test ? À vérifier.

## 3. À trancher (❓ Émilien)
- ❓ Panneaux flottants / menus : ajouter une croix ✕ en plus du clic en dehors ? (jamais posé).
- ❓ Faut-il migrer le bloc capacité/génération jour par jour (Planification IA) et les sections Tâches/Discussion vers un fichier de page, ou les laisser dans le tronc commun ?
- ❓ Sous-projets : aucune discussion dédiée ; garder le segment ou l'absorber ?

## 4. Bugs connus / à vérifier
- 🟠 Diagnostic clavier sur l'écran Catégories (fenêtre Activité) : HUD de diagnostic posé, capture de l'écran précis jamais obtenue ; bandeau clavier natif.
- 🟠 Bandeau/zone teintée pointillée au-dessus du clavier sur la Page 3 quand la période a déjà un objectif (non reproduit ; piste : pincement clavier partagé dans `app.js`).
- 🟡 `bindActivityDrag` (`app.js` ~L16046) : ajouter `click → stopPropagation()` sur la poignée (même défaut corrigé sur `bindProjectDrag`).
- 🟡 `users.stripeCustomerId` et `notifyEnabled`/`communityNotifyEnabled` : présents dans `db.js` ; vérifier qu'ils survivent sur une base NEUVE (le testeur démarre le serveur sur base vide).

## 5. Fonctionnalités à finir
- 🟠 Vision (18 oct. 2026, Émilien) : à terme l'utilisateur de l'offre Expansion ne saisit que son OBJECTIF ANNUEL et sa STRATÉGIE ; l'IA propose ensuite objectifs périodiques, hebdomadaires et tâches, par pôle/secteur créés par l'utilisateur (toujours en proposition validée avant/après). Étape 1 en cours : formulaire de stratégie par activité + filtre IA des tâches IA hors stratégie (branche `claude/strategie`). Étape 2 : génération des objectifs périodiques/hebdo/tâches à partir de objectif annuel + stratégie.
- 🟡 Persistance du geste « reporter à plus tard » (liste du jour) — nécessite une table, cadrage d'abord.
- 🟡 Affichage de la suggestion cross-secteur en attente (moteur livré, affichage hors scope jusqu'ici).
- 🟡 Retrait de l'option « Publier » dans Communauté (zone recherche seule, bouton dedans) — vérifier l'état dans le code.
- 🟡 Notifications : adressage au clic pour demande de suivi (`#profileNotifPanel`), publication, tâche du jour (`activityId`/`taskId`) — vérifier ce qui est livré.
- 🟡 Objectifs : cohérence pôle sans secteur / secteur gelé (scénarios 1, 2, 5 du brief « cohérence secteur/tâches/objectif »).

## 6. Hors code (Émilien)
- Relecture avocat (politique de confidentialité, mentions légales, CGU) ; CGU Offre 1 (écarts à trancher) ; consentement parental Offre 1.
- Test Stripe live avant le premier abonnement ; Offre 1 pas encore mergée en production.
- Fusion `staging` → `main` après test sur Railway.
- Module Horaires / Jacopo : en pause depuis le 15 sept. (PR #3 déployée, à reprendre).

## 7. Dette / méta
- 🟡 Aucune suite de tests fonctionnelle (seulement les sauvegardes) : créer un smoke test qui démarre le serveur sur base neuve et appelle les routes principales — **à proposer à Émilien (nouveau mécanisme)**.
- 🟡 Archiver les règles « device_list_dir / SHA-256 / verrou 🔒 » : obsolètes depuis le passage au flux Git (fait dans CLAUDE.md, reste à nettoyer dans les docs du projet Claude).

## À supprimer par Émilien (tables inertes)
- Tables des conversations par projet / notes de tâches / tâches éphémères (créées par l'ancien server/lib/conversations.js, retiré) : plus utilisées, données laissées en base.

## Propositions du Simplificateur (19 oct. 2026, passe 1 ; non exécutées, par impact)
1. Réglage « Confirmer chaque tâche ajoutée par l'IA » (Mon IA, 49a7324) : option de plus ; garder la confirmation toujours active et retirer la bascule (si #1451 ne la demandait pas mot pour mot).
2. Modules : deux chemins vers « désactiver un module » (Réglages > Modules ET appui long + ✕ dans la barre du bas) ; n'en garder qu'un.
3. (FAIT 19 oct., approuvé par Émilien) Réglages > Calendrier : « Exporter vers le calendrier », « Activités exportées », « Importer » et « Exporter mes données » en 4 blocs ; fusionner export agenda + activités en un seul bloc.
4. Chrono : zone « Une amélioration à suggérer ? » (57b813a) double le signalement/feedback existant ; RÉSERVÉ Émilien (touche le Chrono).
5. Signalement de messages + mots bloqués configurables (7328aab) : surface de modération ; RÉSERVÉ Émilien (légal/Loi 25), à évaluer pour réduction.
6. Écran d'onboarding « Choisis ce dont tu as besoin » (a35e500) doublon de Réglages > Modules ; défaut tout actif et retirer l'écran.
7. « Mon IA » : sous-section « détails repliés » de la connexion MCP, à réduire à état + bouton + révocation.
8. Bouton « Tout supprimer » (Nouvelles tâches / Modifications proposées, 7405e05) : doublon du tri case par case ; à confirmer utile.
9. Feuille de temps : vue Année dans le menu de période (8675c9f), à garder seulement si utilisée ; sinon retirer.
10. Textes d'aide ⓘ des Réglages agenda : raccourcir à une ligne.
