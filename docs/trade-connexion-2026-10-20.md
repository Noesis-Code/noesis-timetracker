# Trade Tracker : connexion des suiveurs, bouton Questrade, mot de passe (analyse du 20 oct. 2026)

## 3 questions pour Émilien (oui/non)
1. **Suiveur** : tu confirmes que le suiveur peut connecter ses propres comptes comme aujourd'hui (rien à construire) ? Reco : **oui**.
2. **Bouton Questrade** : on demande à Questrade l'accès « Connexion par bouton » (option A, démarches de ta part, délai inconnu) et, en attendant, on raccourcit le collage (option B) ? Reco : **oui**.
3. **Mot de passe spécial** : on n'ajoute PAS un 3e secret ; on garde TMT + code à 6 chiffres (ou passkey) et on redemande ce code sur place quand la session expire, sans quitter Trade ? Reco : **oui**.

## 1. Parcours du suiveur (rôle « client » dans le code)
- Nick (expert) crée une invitation : `POST /api/invitations` (expertOnly, ré-authentification < 5 min). Elle vaut 7 jours, usage unique, liée au courriel du suiveur si indiqué.
- Le suiveur ouvre Trade depuis TMT : `GET /link?token=...&invite=...`. Sans invitation valide : refus uniforme (`linkError=denied`, testé). Jeton de 2 min, usage unique, lié au navigateur.
- Il arrive en session normale. Il voit : son portefeuille (`scope=me`), celui de Nick en lecture (`scope=expert` : positions, répartition, historique, journal sans détail d'erreur), `/compare` et `/purchases`. Il ne voit pas : invitations (403), import admin, exports (404).
- **Il peut connecter ses propres comptes** : `POST /api/broker/token`, puis synchro de SON compte. Condition : activer son code à 6 chiffres (TOTP) d'abord (réponse `mfa_enroll_required` sinon) puis ré-authentification < 5 min. Aucun accès de plus que pour Nick, seulement ce qui est lié à son compte. Le CSV du Sheet n'est possible que par l'admin (`TRADE_ADMIN_TOKEN`), pas par le suiveur.
- **Test jetable fait** (base en mémoire, dossier temporaire supprimé) : expert et suiveur avec jeton et numéro de compte factices, 16 routes lues par chacun. Résultat : 0 fuite. Aucun jeton ni numéro de compte (`externalId`) n'apparaît nulle part ; le suiveur ne voit que le portefeuille de Nick via `scope=expert` ; Nick ne voit rien du suiveur (y compris `/compare`). Le test existant `cloisonnement-test.js` couvre déjà l'entre-suiveurs.
- Limite connue : la comparaison suiveur/expert est faite en direct sur les proportions de Nick (voulu).

## 2. Bouton de connexion Questrade plus simple
Aujourd'hui (8 à 10 taps, quitter l'app) : Questrade > connexion > Centre API > créer une app personnelle > générer le jeton > copier > revenir > coller > envoyer.
**À vérifier (de mémoire, sans accès web)** : Questrade propose aux applications enregistrées un flux « code » (page Questrade, accord, retour vers une adresse de redirection) ; les « apps personnelles » n'ont, je crois, que la génération manuelle du jeton. Il faudrait enregistrer Trade comme app tierce.
- **Option A, flux « code » (si Questrade l'accorde)** : Connecter > page Questrade (identifiants + accepter) > retour = **3 taps**. Risques : dépendance à l'approbation de Questrade ; adresse de retour fixe ; jeton `state` anti-usurpation obligatoire (lié à la session et au TOTP, à usage unique) ; un secret d’app serveur de plus (`TRADE_QUESTRADE_CLIENT_*`, jamais en clair dans le dépôt). Jeton stocké : **identique** (jeton de renouvellement chiffré AES-256-GCM, rotation à chaque usage), seul le point d'entrée change ; collage conservé en secours.
- **Option B, collage raccourci (faisable seul)** : bouton « Ouvrir Questrade » vers le bon écran, champ qui reconnaît le jeton déjà copié, envoi automatique : **5 à 6 taps**. Risque : aucun nouveau ; jeton stocké inchangé. Gain moindre.

## 3. Mot de passe spécial pour Trade : ce qui existe déjà
- Identité : le code (PIN) de TMT + lien signé de 2 min vers Trade (donc Trade n'a aucun mot de passe propre aujourd'hui).
- 2e porte : code TOTP, **obligatoire** pour l'expert et pour quiconque connecte un courtier ; 10 codes de secours hachés ; passkeys (WebAuthn) en facteur normal si présentes.
- Ré-authentification (step-up) 5 min pour les actions sensibles ; session 12 h / 15 min d'inactivité ; verrou progressif (30 s doublé, jusqu'à 1 h) par compte et par IP après 5 échecs ; limites de débit ; journal chaîné ; alertes push.
- **Proposition la plus simple : ne pas créer un mot de passe de plus.** Un 3e secret double TOTP + PIN, ajoute oubli/réinitialisation/hachage à maintenir, et ne protège pas mieux qu'une passkey. À la place :
  1. Rendre la passkey ou le TOTP exigé **à chaque ouverture** (déjà le cas pour l'expert) et à l'expiration de session, redemander ce code **sur place** au lieu du message « Ouvre Trade depuis TimeTracker » (aujourd'hui : `app.js` ligne 74). À faire : conserver la session expirée côté serveur 5 min pour permettre la re-vérification sans rechargement.
  2. Si tu tiens au mot de passe : propre à Trade, 12 caractères minimum, haché (scrypt + sel, comme les codes de secours), 5 essais puis verrou existant, réinitialisation = lien TMT + TOTP/secours, jamais par courriel seul. Coût : une table, 4 routes, un écran.

Sources : `trade-tracker/server/app.js`, `lib/{auth,mfa,lockout,brokertoken,passkeys}.js`, `connectors/questrade.js`, `SECURITY.md`, `public/js/app.js`.
