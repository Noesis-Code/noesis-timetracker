// Journal des erreurs HTTP sans donnée personnelle (Loi 25, 30 oct. 2026).
//
// Sans ce gestionnaire, Express écrit err.stack dans les journaux : le message d'une erreur d'analyse JSON contient un
// extrait du corps envoyé (ex. « Unexpected token … "Jean Tremblay;lundi…" is not valid JSON »), donc un bloc collé, un
// nom d'employé ou le texte d'un courriel pouvait finir dans les journaux Railway. Ici on n'écrit QUE : méthode, route
// (segments longs masqués : jetons secrets), code HTTP, type d'erreur et emplacements du code (fichier:ligne). Jamais
// err.message, jamais le corps, jamais la requête. La réponse au client reste générique.

// Segments d'URL longs (jetons d'adresse entrante, identifiants) masqués.
function safePath(req) {
  const p = String((req && (req.originalUrl || req.url)) || '').split('?')[0];
  return p.split('/').map((s) => (s.length >= 20 ? ':masque' : s)).join('/').slice(0, 200);
}

// Emplacements seulement (lignes « at … (fichier:ligne:col) ») : la première ligne de la pile, qui porte le message, est retirée.
function safeFrames(err) {
  const st = err && typeof err.stack === 'string' ? err.stack.split('\n') : [];
  return st.filter((l) => /^\s+at /.test(l)).slice(0, 4).map((l) => {
    const m = /\(?([^()\s]+:\d+:\d+)\)?\s*$/.exec(l);
    return m ? m[1].replace(/^.*[\\/]((server|node_modules|test|scripts)[\\/])/, '$1') : '';
  }).filter(Boolean).join(' < ');
}

function statusOf(err) {
  const s = Number(err && (err.status || err.statusCode));
  return s >= 400 && s < 600 ? s : 500;
}

function safeErrorLine(err, req) {
  const name = String((err && (err.type || err.code || err.name)) || 'Error').replace(/[^\w.-]/g, '').slice(0, 40);
  const frames = safeFrames(err);
  return '[http] ' + String((req && req.method) || '?').slice(0, 8) + ' ' + safePath(req) + ' -> ' + statusOf(err) + ' ' + name + (frames ? ' @ ' + frames : '');
}

// Gestionnaire d'erreurs Express (dernier middleware de server/index.js).
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = statusOf(err);
  try { console.error(safeErrorLine(err, req)); } catch (_) { /* journal impossible : sans conséquence */ }
  if (res.headersSent) { try { req.socket.destroy(); } catch (_) { /* déjà fermé */ } return; } // jamais next(err) : Express journaliserait la pile complète
  res.status(status).json({ error: status >= 500 ? 'Erreur serveur' : 'Requête invalide.' });
}

module.exports = { errorHandler, safeErrorLine, safePath };
