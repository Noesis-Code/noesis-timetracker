/* Trade Tracker — traduction fr / en (même principe que TimeTracker : la CLÉ est la phrase française).
   - fr : rien ne change (le texte français est celui du code) ;
   - en : les nœuds de texte et les attributs visibles (aria-label, placeholder, title) sont traduits au rendu,
     par correspondance exacte (DICT) puis par motifs (PATTERNS) pour les textes qui contiennent une valeur.
   Les données (noms de titres, secteurs, courriels) ne sont jamais traduites.
   Langue : localStorage 'tt_lang' (préférence d'affichage seulement), sinon langue du navigateur. Changer de langue recharge la page. */
(function () {
  var DICT = {
    'Accueil': 'Home', 'Positions': 'Holdings', 'Répartition': 'Allocation', 'Historique': 'History', 'Expert': 'Expert', 'Synchro': 'Sync',
    'Navigation principale': 'Main navigation', 'État de la synchronisation': 'Sync status', 'Retour à TimeTracker': 'Back to TimeTracker', 'TimeTracker': 'TimeTracker',
    'Données fictives': 'Sample data', 'démo': 'demo', 'Fermer': 'Close', 'Jamais': 'Never', 'Échec synchro': 'Sync failed', 'Partielle': 'Partial', 'à l’instant': 'just now',
    'Tous': 'All', 'Compte': 'Account', 'Tri': 'Sort', 'Secteur': 'Sector', 'Tous les secteurs': 'All sectors', 'Valeur': 'Value', 'Gain $': 'Gain $', 'Gain %': 'Gain %', 'Symbole': 'Symbol',
    'Valeur totale': 'Total value', 'gain latent': 'unrealized gain', 'Encaisse': 'Cash', 'Rendement (hors apports)': 'Return (excl. deposits)', 'Gain latent': 'Unrealized gain',
    'depuis le début': 'since the start', 'sur le coût': 'on cost', 'Répartition par secteur': 'Allocation by sector', 'Meilleures positions': 'Top holdings', 'À surveiller': 'Watchlist',
    'Aucune position pour ce filtre.': 'No holdings for this filter.', 'Quantité': 'Quantity', 'Coût moyen': 'Average cost', 'Dernier prix': 'Last price', 'Coût': 'Cost', 'Gain': 'Gain',
    'Poids du portefeuille': 'Portfolio weight', 'Prix mis à jour': 'Price updated',
    'Regrouper par': 'Group by', 'Par secteur': 'By sector', 'Par compte': 'By account', 'Par position': 'By holding', 'Détail': 'Details', 'Camembert': 'Pie chart', 'Courbe': 'Line chart', 'valeur totale': 'total value', 'Niveau de détail': 'Level of detail',
    'Période': 'Period', 'Tout': 'All', '1A': '1Y', 'Rendement': 'Return', 'Rendement sur la période': 'Return over the period', 'Valeur au début': 'Starting value', 'Valeur actuelle': 'Current value', 'Mois par mois': 'Month by month',
    'Indice base 100, apports et retraits exclus.': 'Index base 100, deposits and withdrawals excluded.', 'Valeur totale en CAD, apports inclus.': 'Total value in CAD, deposits included.', 'Pas assez de points.': 'Not enough data points.',
    'Pas encore d’historique': 'No history yet', 'Aucune position pour l’instant': 'No holdings yet',
    'Moi et l’expert': 'Me and the expert', 'Moi': 'Me', 'Dernière synchro': 'Last sync', 'À jour': 'Up to date', 'Échec': 'Failed', 'Proportions côte à côte': 'Side-by-side proportions', 'écart en points de %': 'gap in percentage points',
    '+ : plus que l’expert · − : moins que l’expert': '+ : more than the expert · − : less than the expert', 'Derniers achats de l’expert': 'Expert’s latest purchases', 'Notifié sur ton téléphone': 'Notified on your phone',
    'Aucun achat récent.': 'No recent purchases.', 'Comparaison indisponible.': 'Comparison unavailable.', 'Autres': 'Other',
    'Options d’affichage': 'Display options', 'Montants': 'Amounts', 'Graphique': 'Chart', 'Barres': 'Bars', 'Masquer les petites positions': 'Hide small holdings', 'Non': 'No',
    'Gain ou perte': 'Gain or loss', 'Toutes': 'All', 'Gains': 'Gains', 'Pertes': 'Losses', 'Écart': 'Gap', 'Plus que l’expert': 'More than the expert', 'Moins': 'Less',
    'Tri : Écart': 'Sort: Gap', 'Tri : Moi': 'Sort: Me', 'Tri : Expert': 'Sort: Expert', 'Aucune ligne pour ce filtre.': 'No rows for this filter.',
    'Synchronisation': 'Synchronization', 'Dernière mise à jour': 'Last update', 'Connexion du courtier': 'Broker connection', 'Courtier (lecture seule)': 'Broker (read-only)', 'Courtier': 'Broker', 'Aucun compte connecté.': 'No connected account.',
    'Connecter mon courtier': 'Connect my broker', 'Gérer ma connexion': 'Manage my connection', 'Accès': 'Access', 'Inviter un client ou un expert': 'Invite a client or an expert', 'Inviter': 'Invite', 'Journal': 'Log', 'Journal vide.': 'Log is empty.',
    'Synchronisation périodique': 'Periodic sync', 'Prix': 'Prices', 'Taux USD/CAD': 'USD/CAD rate', 'Transactions': 'Transactions',
    'État': 'Status', 'Connecté': 'Connected', 'Non connecté': 'Not connected', 'Actif': 'Active', 'Inactif': 'Inactive', 'En 3 étapes': 'In 3 steps',
    'Dans ton compte chez le courtier, ouvre les réglages d’accès à l’API.': 'In your broker account, open the API access settings.',
    'Crée un jeton en lecture seule (aucune opération d’achat ou de vente).': 'Create a read-only token (no buying or selling).',
    'Colle-le ci-dessous. Il est envoyé chiffré au serveur et jamais gardé dans ce navigateur.': 'Paste it below. It is sent encrypted to the server and never kept in this browser.',
    'Jeton d’accès': 'Access token', 'Remplacer le jeton': 'Replace token', 'Colle ton jeton ici': 'Paste your token here', 'Envoyer le jeton': 'Send the token', 'Envoi…': 'Sending…',
    'Colle d’abord ton jeton.': 'Paste your token first.', 'Courtier connecté. La première synchro démarre.': 'Broker connected. The first sync is starting.',
    'Connexion du courtier pas encore disponible sur ce serveur.': 'Broker connection not yet available on this server.', 'Jeton refusé. Vérifie-le et réessaie.': 'Token rejected. Check it and try again.',
    'Session expirée.': 'Session expired.', 'Hors ligne : le jeton n’a pas été envoyé.': 'Offline: the token was not sent.', 'Mode démonstration : aucune connexion possible.': 'Demo mode: no connection possible.',
    'Déconnecter le courtier': 'Disconnect broker', 'Déconnecter le courtier ?': 'Disconnect the broker?', 'Déconnecter': 'Disconnect', 'Annuler': 'Cancel',
    'Le jeton sera effacé du serveur et la synchronisation s’arrêtera. Tes données déjà lues restent affichées.': 'The token will be erased from the server and syncing will stop. Data already read stays visible.',
    'Courtier déconnecté.': 'Broker disconnected.', 'Déconnexion pas encore disponible sur ce serveur.': 'Disconnecting is not yet available on this server.', 'Hors ligne : rien n’a changé.': 'Offline: nothing changed.',
    'Rôle de la personne invitée': 'Role of the invited person', 'Rôle': 'Role', 'Client': 'Client', 'Voit son portefeuille et celui de l’expert, en lecture seule.': 'Sees their own portfolio and the expert’s, read-only.',
    'Voit tous les portefeuilles et peut inviter.': 'Sees all portfolios and can invite.', 'Courriel': 'Email', 'Créer l’invitation': 'Create the invitation',
    'Entre une adresse courriel valide.': 'Enter a valid email address.', 'Réservé à l’expert.': 'Reserved for the expert.', 'Invitation refusée : vérifie l’adresse.': 'Invitation refused: check the address.',
    'Hors ligne : l’invitation n’a pas été créée.': 'Offline: the invitation was not created.', 'Copier le code': 'Copy the code', 'Copié': 'Copied', 'Copie impossible : sélectionne le code': 'Could not copy: select the code',
    'Invitations': 'Invitations', 'Acceptée': 'Accepted', 'Expirée': 'Expired', 'En attente': 'Pending', 'Aucune invitation envoyée.': 'No invitations sent.', 'Impossible de charger les invitations.': 'Could not load invitations.',
    'Réservé à l’expert': 'Reserved for the expert', 'Mode démonstration : aucune invitation possible.': 'Demo mode: no invitations possible.', 'Seul l’expert peut inviter des clients ou d’autres experts.': 'Only the expert can invite clients or other experts.',
    'Accès sur invitation': 'Invitation only', 'Session expirée ou accès sur invitation. Ouvre Trade Tracker depuis TimeTracker.': 'Session expired or invitation-only access. Open Trade Tracker from TimeTracker.', 'Ouvrir TimeTracker': 'Open TimeTracker',
    'Hors ligne': 'Offline', 'Aucune connexion et aucune donnée gardée sur cet appareil. Reconnecte-toi puis réessaie.': 'No connection and no data saved on this device. Reconnect and try again.',
    'Chargement impossible': 'Loading failed', 'Le serveur ne répond pas comme prévu. Réessaie dans un instant.': 'The server is not responding as expected. Try again in a moment.', 'Réessayer': 'Try again',
    'La première synchro est en cours ou n’a rien trouvé. Reviens dans quelques minutes.': 'The first sync is running or found nothing. Come back in a few minutes.', 'Connecte ton courtier pour voir ton portefeuille ici.': 'Connect your broker to see your portfolio here.',
    'janv.': 'Jan', 'févr.': 'Feb', 'mars': 'Mar', 'avr.': 'Apr', 'mai': 'May', 'juin': 'Jun', 'juil.': 'Jul', 'août': 'Aug', 'sept.': 'Sep', 'oct.': 'Oct', 'nov.': 'Nov', 'déc.': 'Dec',
    'Langue : français. Passer à l’anglais.': 'Language: English. Switch to French.'
  };
  var AGO = [[/il y a (\d+) min/g, '$1 min ago'], [/il y a (\d+) h/g, '$1 h ago'], [/il y a (\d+) j/g, '$1 d ago'], [/à l’instant/g, 'just now']];
  var PATTERNS = [
    [/^Valeur totale · (.+)$/, 'Total value · $1'], [/^(\d+) positions?(?: · gain)?$/, null], [/^· (\d+) positions?$/, null],
    [/^(.+) du total$/, '$1 of total'], [/^apports : (.+)$/, 'deposits: $1'], [/^· apport (.+)$/, '· deposit $1'], [/^Prix et taux USD\/CAD : (.+?)( \(taux manquant\))?$/, 'Prices and USD/CAD rate: $1$2'],
    [/^Code d’invitation pour (.+)$/, 'Invitation code for $1'], [/^Affiché une seule fois\. Valide jusqu’au (.+)\.$/, 'Shown only once. Valid until $1.'],
    [/^Hors ligne · données lues (.+)$/, 'Offline · data read $1'], [/^Client · (.+)$/, 'Client · $1'], [/^Expert · (.+)$/, 'Expert · $1'],
    [/^Échec de l’envoi \((\d+)\)\.$/, 'Sending failed ($1).'], [/^Échec de la déconnexion \((\d+)\)\.$/, 'Disconnecting failed ($1).'], [/^Synchronisation · (.+)$/, 'Synchronization · $1'], [/ \(taux manquant\)$/, ' (rate missing)'],
    [/^(\d+) (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)( \d{4})?$/, function (m, d, mo, y) { return DICT[mo] + ' ' + d + (y || ''); }],
    [/^(janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.) (\d{4})$/, function (m, mo, y) { return DICT[mo] + ' ' + y; }],
    [/^(\d+) k\$$/, '$$$1k']
  ];
  var lang = 'fr';
  try { lang = localStorage.getItem('tt_lang') || (/^en/i.test(navigator.language || '') ? 'en' : 'fr'); } catch (e) {}
  if (lang !== 'en') lang = 'fr';

  function tr(raw) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw), core = m[2];
    if (!core) return raw;
    var out = DICT[core];
    if (out == null) {
      var c = core;
      AGO.forEach(function (a) { c = c.replace(a[0], a[1]); });
      for (var i = 0; i < PATTERNS.length; i++) {
        var p = PATTERNS[i];
        if (p[1] === null) {
          var mm = p[0].exec(c); if (mm) { var n = +mm[1]; c = c.replace(/(\d+) positions?/, n + ' holding' + (n > 1 ? 's' : '')).replace(/ · gain$/, ' · gain'); break; }
          continue;
        }
        if (p[0].test(c)) { c = c.replace(p[0], p[1]); break; }
      }
      // fragments « X · Y » dont chaque morceau est connu
      if (c === core && core.indexOf(' · ') > 0) c = core.split(' · ').map(function (s) { return DICT[s] != null ? DICT[s] : s; }).join(' · ');
      out = c;
    }
    return m[1] + out + m[3];
  }
  var ATTRS = ['aria-label', 'placeholder', 'title'];
  function walk(root) {
    if (lang !== 'en' || !root) return;
    if (root.nodeType === 3) { var v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(root.tagName)) return;
    ATTRS.forEach(function (a) { if (root.hasAttribute(a)) { var o = root.getAttribute(a), v = tr(o); if (v !== o) root.setAttribute(a, v); } });
    for (var n = root.firstChild; n; n = n.nextSibling) walk(n);
  }
  function start() {
    document.documentElement.lang = lang;
    if (lang === 'en') {
      walk(document.body); document.title = tr(document.title);
      new MutationObserver(function (list) {
        list.forEach(function (r) {
          if (r.type === 'characterData') walk(r.target);
          else if (r.type === 'attributes') walk(r.target);
          else r.addedNodes.forEach(walk);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    var b = document.getElementById('langBtn');
    if (b) {
      b.textContent = lang === 'en' ? 'FR' : 'EN';
      b.setAttribute('aria-label', lang === 'en' ? 'Language: English. Switch to French.' : 'Langue : français. Passer à l’anglais.');
      b.addEventListener('click', function () { try { localStorage.setItem('tt_lang', lang === 'en' ? 'fr' : 'en'); } catch (e) {} location.reload(); });
    }
  }
  window.TTI = { lang: lang, locale: lang === 'en' ? 'en-CA' : 'fr-CA', t: function (s) { return lang === 'en' ? tr(s) : s; }, months: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'].map(function (m) { return lang === 'en' ? DICT[m] : m; }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
