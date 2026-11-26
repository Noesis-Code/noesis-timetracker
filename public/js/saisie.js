// Contrôles de saisie UNIQUES (courriel, téléphone, mot de passe), partagés par le client (<script src="/js/saisie.js">) et le serveur (require).
// Une seule règle par type : toute autre validation de ces champs dans l'app doit passer par ici.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Saisie = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Courriel : quelque chose, « @ », un domaine avec au moins un point, sans espace. Le « + », les points, tirets et sous-domaines passent.
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  function normalizeEmail(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function isValidEmail(v) { var e = normalizeEmail(v); return e.length <= 254 && EMAIL_RE.test(e); }

  // Téléphone : tous les formats courants (espaces, tirets, points, parenthèses, +1, « poste »). On nettoie au lieu de refuser ;
  // seul ce qui ne contient manifestement pas de numéro (moins de 7 chiffres) est refusé.
  function normalizePhone(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function isValidPhone(v) {
    var p = normalizePhone(v);
    return p.length <= 40 && p.replace(/\D/g, '').length >= 7;
  }

  // Mot de passe : 10 caractères ou plus, rien d'autre d'exigé (le serveur ajoute « trop courant » / « contient ton nom »).
  var PASSWORD_MIN = 10;
  var PASSWORD_MAX = 128;
  var MSG_PASSWORD_MIN = 'Le mot de passe doit avoir 10 caractères ou plus.';
  function passwordProblem(pw) {
    if (typeof pw !== 'string' || !pw) return 'Choisis un mot de passe.';
    if (pw.length < PASSWORD_MIN) return MSG_PASSWORD_MIN;
    if (pw.length > PASSWORD_MAX) return 'Le mot de passe est trop long (128 caractères au plus).';
    return '';
  }

  return { EMAIL_RE: EMAIL_RE, normalizeEmail: normalizeEmail, isValidEmail: isValidEmail, normalizePhone: normalizePhone, isValidPhone: isValidPhone,
    PASSWORD_MIN: PASSWORD_MIN, PASSWORD_MAX: PASSWORD_MAX, MSG_PASSWORD_MIN: MSG_PASSWORD_MIN, passwordProblem: passwordProblem };
});
