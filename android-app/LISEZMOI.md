# Application Android de Noèsis (coque Capacitor)

Coque native : icône, plein écran, sans barre d'adresse. Le contenu vient du serveur de production (`server.url` dans `capacitor.config.json`), donc la session (cookie) et les mises à jour du site fonctionnent comme dans le navigateur.

- Test : onglet Actions de GitHub > « Android » > dernière exécution > Artifacts > `noesis-debug-apk`, à installer sur un téléphone Android (autoriser les sources inconnues).
- Boutique (Google Play) : il faudra la clé d'envoi (secret GitHub), puis `./gradlew bundleRelease` pour l'AAB.
- Identifiant de l'application : `com.compagnienoesis.timetracker` (à confirmer avant la première publication : il ne change plus après).
- À faire ensuite : notifications natives (Firebase), Face ID, écran d'erreur hors ligne, version iOS (qui ne pourra pas charger l'adresse distante telle quelle).
