# Application Android de Noèsis (coque Capacitor)

Coque native : icône, plein écran, sans barre d'adresse. Le contenu vient du serveur de production (`server.url` dans `capacitor.config.json`), donc la session (cookie) et les mises à jour du site fonctionnent comme dans le navigateur.

- Test : onglet Actions de GitHub > « Android » > dernière exécution > Artifacts > `noesis-debug-apk`, à installer sur un téléphone Android (autoriser les sources inconnues).
- Boutique (Google Play) : il faudra la clé d'envoi (secret GitHub), puis `./gradlew bundleRelease` pour l'AAB.
- Identifiant de l'application : `com.compagnienoesis.timetracker` (à confirmer avant la première publication : il ne change plus après).
- À faire ensuite (Android) : notifications natives (Firebase), Face ID, écran d'erreur hors ligne.

## iOS

Apple (guideline 4.2) refuse une coque qui ne charge qu'une adresse distante : sur iOS, les fichiers de `public/` sont inclus dans le paquet et l'app appelle le serveur de production par son API.

- Config : `capacitor.config.js` (Android par défaut ; `CAP_TARGET=ios` pour iOS, sans `server.url`, `CapacitorHttp` et `CapacitorCookies` activés pour la session par cookie).
- Préparation : `node scripts/prepare-ios.js` copie `public/` dans `mobile/www-ios/` (jamais commité), sans `sw.js` ni `offline.html`. Puis `CAP_TARGET=ios npx cap sync ios`.
- `public/js/native-shell.js` (sans effet hors iOS natif) préfixe `/api`, `/mcp` et `/healthz` par l'adresse de production, retire service worker, Web Push et clés d'accès, et marque l'app comme installée.
- Serveur : aucun changement (les requêtes natives ne passent pas par CORS ; aucun contrôle d'Origin n'existe côté serveur).
- Vérification : onglet Actions > « iOS » (macOS, compilation simulateur sans signature).

### À faire (iOS, non codé)

- Notifications natives (APNs) : le Web Push n'existe pas en natif.
- Face ID / clés d'accès natives (les clés d'accès WebAuthn du site sont masquées en natif).
- Achat Expansion hors application (règles Apple sur les achats intégrés) : le lien vers Stripe est à revoir avant la soumission.
- Compte Apple Developer, signature, TestFlight, icône complète et écran de lancement.
- Mises à jour : le paquet est figé ; une nouvelle version du site demande un nouveau build.
