// Config Capacitor commune. Android : le contenu vient du serveur (server.url). iOS (CAP_TARGET=ios) : les fichiers de public/ sont dans le paquet
// (www-ios, produit par scripts/prepare-ios.js) et l'app appelle le serveur de production par son API (public/js/native-shell.js).
const SERVER = 'https://web-production-15a4a.up.railway.app';
const ios = process.env.CAP_TARGET === 'ios';

module.exports = ios
  ? {
      appId: 'com.compagnienoesis.timetracker',
      appName: 'Noèsis',
      webDir: 'www-ios',
      backgroundColor: '#000000',
      plugins: { CapacitorHttp: { enabled: true }, CapacitorCookies: { enabled: true } },
    }
  : {
      appId: 'com.compagnienoesis.timetracker',
      appName: 'Noèsis',
      webDir: 'www',
      backgroundColor: '#000000',
      server: { url: SERVER, cleartext: false, androidScheme: 'https' },
      android: { allowMixedContent: false },
    };
