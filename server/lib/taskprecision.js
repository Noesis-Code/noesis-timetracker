// Précision des tâches générées (chantier permanent n°6) : règles DÉTERMINISTES, pures (aucune base, aucun réseau),
// appliquées avant/après l'IA. Rien ici ne modifie une saisie manuelle : ces règles ne touchent que les tâches PROPOSÉES par l'IA
// (titres normalisés, doublons, « à ignorer » de la stratégie) ou servent de mesure (scripts/eval-task-precision.js).

const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'pour', 'sur', 'dans', 'd', 'l', 'ne', 'pas', 'tout', 'tous', 'avec', 'par', 'mon', 'ma', 'mes', 'ce', 'cette', 'faire', 'ignorer', 'eviter',
  // anglais (titres rédigés en anglais ou mixtes fr/en)
  'the', 'for', 'and', 'with', 'from', 'our', 'your', 'that', 'this', 'about', 'after', 'before', 'into', 'then', 'them', 'their', 'his', 'her', 'its', 'all', 'you', 'are', 'was']);

// Titre proposé : sans puces/numérotation/case à cocher, sans ponctuation finale, espaces réduits, 200 caractères.
function cleanTitle(raw) {
  let s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i += 1) s = s.replace(/^(?:[-*•–—▪◦]+|\[[ xX]?\]|\(?\d{1,2}[.)]|\d{1,2}\s*[-–:])\s+/, '').trim();
  s = s.replace(/^["«“]\s*/, '').replace(/[\s.;,:"»”]+$/, '').trim();
  return s.slice(0, 200);
}

// Forme de comparaison : minuscules, sans accents ni ponctuation.
function fold(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
// Abréviations courantes (formes pliées : « fact. » -> fact) ramenées au mot plein pour la comparaison seulement, jamais affichées.
const ABBREV = { fact: 'facture', compta: 'comptabilite', qte: 'quantite', tel: 'telephone' };
// Mots utiles (sans mots vides, pluriel simple ramené au singulier).
function tokens(v) {
  return fold(v).split(' ').filter((w) => w && !STOP.has(w) && (w.length > 2 || /\d/.test(w))).map((w) => stem(ABBREV[w] || w));
}
// Racine légère (comparaison seulement, jamais affichée) : « commander/commande/commandes », « embaucher/embauche », « terrasse/terase » (faute),
// « réservation/réserver » donnent la même racine. Les mots courts et les nombres restent intacts.
function stem(w) {
  if (w.length <= 3 || /\d/.test(w)) return w;
  let s = w.replace(/(.)\1+/g, '$1');                       // lettres doublées (fautes de frappe : terrasse/terase)
  if (s.length > 4) s = s.replace(/ies$/, 'y');             // anglais : companies/company
  if (s.length > 3) s = s.replace(/[sx]$/, '');             // pluriel AVANT le suffixe (révisions/révision -> révis, comme réviser)
  if (s.length > 5) s = s.replace(/ction$/, 'ct').replace(/(?:ations?|tions?|ions?)$/, ''); // prospection/prospecter -> prospect
  if (s.length > 5) s = s.replace(/ing$/, '');              // anglais : hiring/hire, roasting/roast
  if (s.length > 4) s = s.replace(/ed$/, '');               // anglais : roasted/roast
  if (s.length > 3) s = s.replace(/(?:ement|ent|er|ez|e)$/, '');
  return s;
}

// Termes de la rubrique « à ignorer » : séparés par virgule, point-virgule, retour de ligne ou puce. Chaque terme garde ses mots utiles.
function ignoreTerms(ignoreText) {
  return String(ignoreText || '').split(/[,;\n•]+|\s[-–—]\s/).map(tokens).filter((t) => t.length);
}
// Vrai si TOUS les mots utiles d'un terme à ignorer figurent dans le titre (prudent : « site web » n'écarte pas « Écrire au webmestre »).
function matchesIgnore(title, ignoreText) {
  const t = new Set(tokens(title));
  if (!t.size) return null;
  const hit = ignoreTerms(ignoreText).find((term) => term.every((w) => t.has(w)));
  return hit ? hit.join(' ') : null;
}

// Rang de priorité (1 à 3) de la meilleure correspondance de mots avec la stratégie, 0 si aucune. Informatif : ne change aucune décision.
function priorityRank(title, priorities) {
  const t = new Set(tokens(title));
  let best = 0, bestScore = 0;
  (priorities || []).slice(0, 3).forEach((p, i) => {
    const pt = tokens(p);
    if (!pt.length) return;
    const score = pt.filter((w) => t.has(w)).length / pt.length;
    if (score >= 0.5 && score > bestScore) { best = i + 1; bestScore = score; }
  });
  return best;
}

// Doublon : même titre à la mise en forme près (accents, casse, ponctuation) OU mêmes mots utiles (ordre libre).
function sameTitle(a, b) {
  const fa = fold(a), fb = fold(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const ta = tokens(a), tb = tokens(b);
  return ta.length > 0 && ta.length === tb.length && ta.slice().sort().join(' ') === tb.slice().sort().join(' ');
}
function isDuplicate(title, others) { return (others || []).some((o) => sameTitle(title, o)); }

// « Action contre sujet » : le verbe d'ouverture dit le domaine (« Payer la facture du fournisseur » = finances, pas approvisionnement).
// Renvoie les mots-thèmes (racines) à pondérer en plus des mots du titre ; liste fermée, volontairement courte, 0 hasard.
const ACTION_THEMES = { pay: ['paiement', 'payment', 'invoice'], rembours: ['paiement'], regl: ['paiement'], declar: ['impot', 'taxe'], form: ['formation'], embauch: ['embauche'], photographi: ['photo'] };
function actionHints(title) {
  const first = tokens(title)[0];
  return first && ACTION_THEMES[first] ? ACTION_THEMES[first].map(stem) : [];
}

module.exports = { stem, actionHints,  cleanTitle, fold, tokens, ignoreTerms, matchesIgnore, priorityRank, sameTitle, isDuplicate };
