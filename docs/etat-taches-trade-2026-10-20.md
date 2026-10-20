# État des 7 tâches ouvertes du secteur Trade (20 oct. 2026)

Source des tâches : lecture MCP par le coordinateur (secteur Trade, pôle TradeTracker). Rien n'est modifié ni marqué dans l'app. Les versions « modèle » sont des PROPOSITIONS (`modele-tache.md`). Questions regroupées : `questions-emilien-trade.md`.

**Constat général** : le code couvre déjà l'essentiel de ces 7 titres. Elles sont vagues car elles décrivent des fonctions déjà livrées ; ce qui manque est surtout de la **preuve** (essai réel avec Questrade, déploiement, parcours testé de bout en bout sur staging). Aucune citation d'intention d'Émilien n'existe pour elles (`intentions.md` ne contient que la connexion via « modifier l'activité ») : le champ 3 du modèle est donc vide partout, d'où des questions à cocher.

Code d'entrée côté TMT : `server/routes/trade.js` (`GET /api/trade/link`), `server/lib/tradelink.js`, `public/js/trade.js` (iframe plein écran), activation via la modification d'une activité (`TMT.modules.setTrade`). Côté Trade : `trade-tracker/` (serveur Express + SQLite, PWA).

---
## 1. « Implémenter la synchronisation temps réel des données » (18 nov.)

**Existe**
- Synchro serveur planifiée toutes les 15 min (`TRADE_SYNC_INTERVAL_MIN`), expert d'abord, échec isolé par utilisateur : `trade-tracker/server/lib/sync.js`. Connecteurs `demo` et `questrade` (lecture seule) : `server/lib/connectors/`.
- Rafraîchissement de l'interface toutes les 30 s onglet visible (pause onglet caché, recul exponentiel jusqu'à 5 min, ETag/304, redessin seulement si les données changent) : `public/js/app.js` (`tick`, `schedule`), `public/js/data.js`.
- Notification push d'achat détecté (`notifier.js`), alerte « prix en retard » (`pricewatch.js`, `/health`).
- Tests : `sync-test.js`, `sync-charge-test.js` (150 utilisateurs en ~9 s), `refresh-test.js`, `questrade-test.js` (fixtures, sans réseau), `broker-e2e-test.js`, `pricewatch-test.js`.

**Manque**
- Aucun essai contre le VRAI Questrade (documenté : « jamais testé en réel », `API.md`).
- Aucune décision sur ce que « temps réel » signifie : les données ne peuvent pas être plus fraîches que la synchro (15 min), l'écran lit le serveur toutes les 30 s. Questrade n'offre le flux en continu (streaming) qu'avec une portée supplémentaire à vérifier : ce serait un nouveau mécanisme.
- Pas de mesure du délai réel entre un achat chez le courtier et la notification.

**Version proposée (modèle)**
```
Titre : Mesurer sur staging le délai entre un achat Questrade et la notification Trade Tracker
Chantier / secteur : 1 Trade Tracker / pôle Trading › Trade Tracker
1. Contexte observé : synchro 15 min + lecture écran 30 s (code ci-dessus) ; jamais essayé avec un vrai jeton.
2. Problème : « temps réel » non défini ; on ne sait pas si 15 min suffit à Émilien/Nick.
3. Résultat attendu, dans ses mots : AUCUNE CITATION -> question Q1 (questions-emilien-trade.md).
4. C'est fini quand… : (a) un achat test (ou simulé via le connecteur de démo) apparaît dans l'écran en <= intervalle de synchro + 30 s, durée mesurée et écrite dans le compte rendu ; (b) test `sync-test.js`/`refresh-test.js` passent ; (c) Émilien a coché la réponse Q1.
5. Périmètre : trade-tracker/server/lib/sync.js, trade-tracker/public/js/app.js (aucun autre).
6. On ne touche pas : connecteur en écriture (interdit : lecture seule), interface (aucun bouton « actualiser » nouveau), sécurité.
7. Preuve : sortie des deux tests + une ligne de mesure.
```
Statut proposé : bloquée par Q1 ; si Q1 = « 15 min suffit », la tâche se ferme sans code.

---
## 2. « Créer le système de génération de lien privé » (14 nov.)

**Existe : OUI, complet et testé.** Deux sens possibles de « lien privé » :
- **Entrée TMT -> Trade** : jeton HMAC-SHA256 signé (`TRADE_LINK_SECRET` >= 16 car.), expire en 2 min, usage unique (jti mémorisé), lié à l'utilisateur, à l'audience `trade-tracker` et au navigateur (hash du user-agent, obligatoire en production). Émission : `server/lib/tradelink.js` ; vérification : `trade-tracker/server/lib/auth.js` (`verifyLinkToken`, `consumeLink`) ; route `GET /api/trade/link` réservée aux ids autorisés avec module actif ; ouverture en iframe ou « Ouvrir à part » (lien neuf à chaque clic).
- **Invitation d'un client** : `POST /api/invitations` (expert seulement, ré-authentification TOTP), code aléatoire, haché en base, valide 7 jours, usage unique, lié à l'e-mail si fourni ; écran `screen-invite.js`.
- Tests : `test/trade-link-test.js` (signature, payload, bac à sable de l'iframe), `test/trade-e2e-test.js` (lien accepté, rejoué, falsifié, expiré, autre navigateur ; notification push), `trade-tracker/test/auth-test.js`, `security-test.js`, `session-test.js`, `stepup-test.js`, `broker-e2e-test.js`/`e2e-broker.py` (parcours navigateur).

**Manque**
- Le parcours COMPLET sur staging avec deux vrais comptes TMT (expert + client invité) n'a pas été joué ; les tests sont locaux. Dépend du déploiement de Trade (tâche 5).
- Le code d'invitation n'est pas un « lien » (le client colle un code ; il n'y a pas d'URL à envoyer). Question Q2 : est-ce ce qu'Émilien veut par « lien privé » ?

**Version proposée**
```
Titre : Jouer sur staging le parcours expert -> invitation -> client -> entrée par lien
Chantier / secteur : 1 Trade Tracker
1. Contexte : jeton HMAC 2 min et invitation 7 j codés et testés en local (fichiers ci-dessus) ; jamais joués entre deux vrais comptes sur staging.
2. Problème : aucune preuve que le parcours marche de bout en bout une fois déployé.
3. Résultat attendu, dans ses mots : AUCUNE CITATION -> question Q2.
4. C'est fini quand… : (a) l'expert crée une invitation, un 2e compte l'utilise et ouvre Trade depuis TMT ; (b) le même lien rejoué donne `linkError=denied` ; (c) une capture 390 px de chaque étape.
5. Périmètre : lecture/essai seulement ; code Trade seulement si un défaut est trouvé.
6. On ne touche pas : durée 2 min, usage unique, secrets (jamais écrits dans un document).
7. Preuve : captures + `node test/run-tests.js` vert.
```
Dépend de la tâche 5 (déploiement). Aucun code à écrire : la tâche d'origine peut être fermée comme « déjà livrée » si Q2 = oui.

---
## 3. « Implémenter les filtres et options de visualisation » (3 nov.)

**Existe** (`trade-tracker/public/js/screen-positions.js`, `prefs.js`, `screen-allocation.js`)
- Écran Positions : puces de compte (Tous/CELI/REER/…), 4 tris (Valeur, Gain $, Gain %, Symbole), 3 filtres Gains/Pertes (Toutes/Gains/Pertes), liste déroulante de secteur, menu ⋮ : Montants (valeur/%), Masquer petites positions (non, <1, <2, <5 %), Graphique (camembert/barres) sur Répartition. Préférences mémorisées dans le navigateur.
- Tests : aucun test fonctionnel dédié aux filtres (`public-files-test.js` vérifie seulement que les fichiers ne sont pas vides).

**Manque**
- La tâche ne dit pas quels filtres. Tout ce qui est ci-dessus a été ajouté sans citation d'Émilien dans `intentions.md`. Par la charte (« retirer avant d'ajouter »), la bonne suite est de décider quoi GARDER, pas d'en ajouter (audit : `audit-trade-2026-10-20.md`).

**Version proposée**
```
Titre : Réduire les filtres de l'écran Positions à ceux que garde Émilien
Chantier / secteur : 1 Trade Tracker (+ 5 Simplification pour l'avis)
1. Contexte : 4 tris + 3 filtres G/P + secteur + comptes + menu ⋮ (3 options) sur l'écran Positions (capture 390 px, audit 20 oct.).
2. Problème : plusieurs contrôles sans demande ; l'écran montre ~3 rangées de contrôles avant la première position.
3. Résultat attendu, dans ses mots : AUCUNE CITATION -> question Q3.
4. C'est fini quand… : (a) seuls les contrôles cochés par Émilien restent dans `screen-positions.js`/`prefs.js` ; (b) la 1re position est visible sans défiler sur 390 px ; (c) code, CSS et libellés i18n retirés des options supprimées.
5. Périmètre : trade-tracker/public/js/screen-positions.js, prefs.js, screen-allocation.js, styles.css, i18n.js (Trade).
6. On ne touche pas : calculs (`calc.js`), API, sécurité, autres écrans.
7. Preuve : capture 390 px avant/après + `node trade-tracker/test/run.js`.
```
Bloquée par Q3. Les préférences mémorisées (`tt.view.v1`) sont locales : retirer une option ne détruit aucune donnée serveur.

---
## 4. « Optimiser les performances de rafraîchissement temps réel » (6 nov.)

**Existe**
- Interrogation conditionnelle (ETag/304, corps identique = même objet, pas de redessin), pause onglet caché, recul exponentiel (30 s -> 5 min), pas de prolongation de session si la personne est inactive (`X-TT-Poll`/`X-TT-Active`), modale ouverte = pas de redessin.
- Charge serveur : `sync-charge-test.js` (~60 ms par utilisateur), limite de lecture 300/min/IP.
- Tests : `refresh-test.js`, `session-test.js`, `ratelimit-test.js`, `sw-cache-test.js`.

**Manque**
- Aucun chiffre de performance de l'écran (temps de rendu, octets par rafraîchissement, taille des réponses) ni budget cible. « Optimiser » sans cible n'est pas vérifiable.
- Dépend de la tâche 1 (si « temps réel » = streaming, ce chantier change complètement).

**Version proposée**
```
Titre : Mesurer le coût d'un rafraîchissement de 30 s et fixer un budget
Chantier / secteur : 1 Trade Tracker
1. Contexte : polling 30 s avec ETag (app.js, data.js) ; aucune mesure.
2. Problème : impossible de dire si c'est « optimisé ».
3. Résultat attendu, dans ses mots : AUCUNE CITATION -> question Q1 (même réponse que la tâche 1).
4. C'est fini quand… : (a) un relevé écrit : octets et durée d'un tick sans changement (304) et avec changement, 150 positions simulées ; (b) si > budget (proposé : < 2 Ko sans changement, < 200 ms serveur), un correctif ciblé et le relevé après ; (c) `refresh-test.js` vert.
5. Périmètre : trade-tracker/public/js/data.js, app.js, server/app.js (routes de lecture).
6. On ne touche pas : fréquence de synchro Questrade, interface.
7. Preuve : relevé chiffré dans le compte rendu + tests.
```
Fusionnable avec la tâche 1 (une seule mesure).

---
## 5. « Déployer l'extension en environnement de staging » (11 nov.)

**Existe**
- Guide complet `trade-tracker/DEPLOY.md` (variables TMT et Trade, ordre des étapes, Questrade, checklist sécurité, sauvegarde/restauration, retour arrière), `railway.json`, `Procfile`, `/health`, démarrage refusé en production si un secret manque (`preflight.js`), tests `deploy-doc-test.js`, `preflight-test.js`, `restore-e2e-test.js`.
- TMT staging : https://web-staging-6d1b.up.railway.app ; le fichier `index.html` de Trade pointe déjà dessus (bouton retour).

**Manque** (je n'ai pas accès à Railway : non vérifié)
- Existence d'un service Railway Trade séparé, de son volume `/data`, des 3 secrets, de `TRADE_BASE_URL`/`TRADE_ALLOWED_USER_IDS` côté TMT staging, de `TRADE_RP_ID`. Les secrets et la création de service = Émilien (clés et dépense éventuelle).
- Aucune vérification automatique « Trade répond sur staging » (`/health` + un lien signé accepté).

**Version proposée**
```
Titre : Mettre Trade Tracker en ligne sur staging avec les variables du guide DEPLOY.md
Chantier / secteur : 1 Trade Tracker
1. Contexte : guide DEPLOY.md complet ; état du service Railway inconnu des agents.
2. Problème : l'extension n'est peut-être pas joignable depuis TMT staging.
3. Résultat attendu, dans ses mots : AUCUNE CITATION directe ; tâche d'Émilien (11 nov.) -> question Q4 (qui crée le service).
4. C'est fini quand… : (a) `https://<trade>/health` répond `{"ok":true,...}` ; (b) depuis TMT staging, un compte autorisé ouvre Trade par « Connecter » dans « modifier l'activité » et voit l'écran (capture 390 px) ; (c) le connecteur reste `demo` jusqu'à la tâche 6.
5. Périmètre : variables Railway (Émilien), aucune modification de code attendue.
6. On ne touche pas : `main`, production, jetons Questrade réels, `TRADE_ADMIN_TOKEN` (non défini).
7. Preuve : sortie de /health + capture.
```
Agent : préparer et vérifier seulement ; la création du service et des secrets reste à Émilien.

---
## 6. « Valider le fonctionnement avec le portefeuille réel de Nic » (12 nov.)

**Existe**
- Connecteur Questrade complet en lecture seule (renouvellement du jeton à chaque usage, `renewToken` si refus), TOTP obligatoire avant tout collage de jeton, import CSV de secours (`import-sheet.js`), purge `DELETE /api/broker/token`.
- Checklist de mise en service sécurisée (`DEPLOY.md`), `SECURITY.md`.
- Tests sur fixtures uniquement.

**Manque**
- Tout essai réel : il exige le jeton Questrade de Nic (donnée sensible, jamais confié à un agent) et ses TOTP/codes de secours. Priorité absolue sécurité (`CHANTIERS.md`). Aucun agent ne doit manipuler ce jeton.
- Critère de « validé » : pas défini (quels chiffres comparer ? valeur totale, positions, encaisse ?).

**Version proposée (préparation seulement)**
```
Titre : Préparer la grille de comparaison des chiffres Trade Tracker avec le relevé Questrade de Nic
Chantier / secteur : 1 Trade Tracker
1. Contexte : connecteur Questrade testé sur fixtures ; jamais sur un vrai compte.
2. Problème : pas de définition de « validé ».
3. Résultat attendu, dans ses mots : AUCUNE CITATION -> question Q5.
4. C'est fini quand… : (a) une grille écrite (valeur totale, encaisse, N positions, gain par compte : colonne Questrade / colonne Trade, tolérance) ; (b) Nic ou Émilien la remplit lui-même après avoir collé son propre jeton (TOTP actif, checklist DEPLOY points 1-10 faits) ; (c) écarts > tolérance = tâche de correction ouverte.
5. Périmètre : document seulement ; aucun agent ne voit le jeton.
6. On ne touche pas : jeton, données réelles dans le dépôt ou les logs, portée Questrade (lecture seule).
7. Preuve : grille remplie par Émilien/Nic (valeurs agrégées, sans numéros de compte).
```
Dépend de la tâche 5. Réservé à Émilien/Nic pour l'exécution.

---
## 7. « Mettre en production l'extension TradeTracker » (14 nov.)

**RÉSERVÉ À ÉMILIEN : préparer la check-list, ne pas exécuter** (fusion `main`, secrets de production, dépense Railway possible).

Check-list proposée (à valider par Émilien ; rien n'est coché) :
- [ ] Tâches 5 et 6 terminées ; aucun échec ouvert sur Trade en staging ; `node test/run-tests.js` et `trade-tracker/test/run.js` verts.
- [ ] Revue sécurité relue (`SECURITY.md`, `DEPLOY.md` points 1-14) : secrets distincts générés (jamais dans le dépôt), `TRADE_ADMIN_TOKEN` absent, un seul réplica, Railway 2FA.
- [ ] `TRADE_ALLOWED_USER_IDS` (TMT) = Émilien + Nic + clients invités seulement ; `TRADE_EXPERT_TMT_IDS` = id de Nic.
- [ ] Service Trade de production distinct de staging (volume `/data`, `TRADE_RP_ID` propre), sauvegarde planifiée + copie hors volume testée en restauration.
- [ ] `TRADE_BASE_URL` de production côté TMT `main`, `TMT_BASE_URL` côté Trade ; la bannière « TimeTracker » de `trade-tracker/public/index.html` pointe encore vers staging (`web-staging-6d1b…`) : à faire corriger (code) AVANT la production.
- [ ] TOTP de Nic activé et codes de secours conservés hors appareil avant toute invitation.
- [ ] Plan de retour arrière lu (`DEPLOY.md`, « Retour arrière ») ; qui est joignable le jour J.
- [ ] Fusion `staging` -> `main` : par Émilien.

Version modèle : non lancée (réservée). Question Q6 : date et condition de déclenchement.

Constat à corriger sans attendre (code, petite tâche) : liens vers `web-staging-6d1b.up.railway.app` codés en dur dans `trade-tracker/public/index.html` et `public/js/app.js` (bouton TimeTracker, écran 401) : à remplacer par une valeur venant de `TMT_BASE_URL` avant la production.
