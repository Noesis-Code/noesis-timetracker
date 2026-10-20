// Précision des tâches générées (chantier permanent n°6) : règles DÉTERMINISTES, pures (aucune base, aucun réseau),
// appliquées avant/après l'IA. Rien ici ne modifie une saisie manuelle : ces règles ne touchent que les tâches PROPOSÉES par l'IA
// (titres normalisés, doublons, « à ignorer » de la stratégie) ou servent de mesure (scripts/eval-task-precision.js).

const { DAY_ABBR_RE } = require('./temporalvocab');
const STOP = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'ou', 'a', 'au', 'aux', 'en', 'pour', 'sur', 'dans', 'd', 'l', 'ne', 'pas', 'tout', 'tous', 'avec', 'par', 'mon', 'ma', 'mes', 'ce', 'cette', 'faire', 'ignorer', 'eviter',
  // anglais (titres rédigés en anglais ou mixtes fr/en)
  'the', 'for', 'and', 'with', 'from', 'our', 'your', 'that', 'this', 'about', 'after', 'before', 'into', 'then', 'them', 'their', 'his', 'her', 'its', 'all', 'you', 'are', 'was']);

// Titre proposé : sans puces/numérotation/case à cocher, sans ponctuation finale, espaces réduits, 200 caractères.
function cleanTitle(raw) {
  let s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i += 1) s = s.replace(/^(?:[-*•–—▪◦]+|\[[ xX]?\]|\(?\d{1,2}[.)]|\d{1,2}\s*[-–:])\s+/, '').trim();
  s = s.replace(/^["«“]\s*/, '');
  const abbr = /\d\s+[a-zéû]{2,5}\.$/i.test(s) || /(?:^|\s)(?:lun|mar|mer|jeu|ven|sam|dim|mon|tue|wed|thu|fri|sat|sun)\.$/i.test(s); // « le 5 nov. », « dans 3 sem. » : le point d'une abréviation de date/durée est conservé
  s = s.replace(/[\s.;,:"»”]+$/, '').trim();
  if (abbr) s += '.';
  return s.slice(0, 200);
}

// Forme de comparaison : minuscules, sans accents ni ponctuation.
function fold(v) {
  return String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
// Abréviations courantes (formes pliées : « fact. » -> fact) ramenées au mot plein pour la comparaison seulement, jamais affichées.
const ABBREV = { fact: 'facture', compta: 'comptabilite', qte: 'quantite', tel: 'telephone', tuto: 'tutoriel', stats: 'statistique', dispo: 'disponibilite', exam: 'examen', exams: 'examens', tp: 'travail' };
// Mots utiles (sans mots vides, pluriel simple ramené au singulier).
// Anglicismes courants du français de bureau : le mot anglais garde son sens ET ajoute son équivalent français (comparaison seulement).
const ANGLICISM = { invoice: 'facture', meeting: 'reunion', deadline: 'echeance', followup: 'suivi', follow: 'suivi' };
// Retouches d'un livrable : mêmes sens que « révision » pour le classement (corrections, retouches, modifications).
const ANGLICISM_EXTRA = { correction: 'revision', corrections: 'revision', retouche: 'revision', retouches: 'revision', modification: 'revision', modifications: 'revision' };
const VAGUE_VERBS = new Set(['penser', 'voir', 'regarder', 'revoir', 'checker', 'think'].map((w) => stem(w)));
function tokens(v) {
  const out = [];
  fold(v).split(' ').filter((w) => w && !STOP.has(w) && (w.length > 2 || /\d/.test(w))).forEach((w) => {
    out.push(stem(ABBREV[w] || w));
    if (ANGLICISM[w]) out.push(stem(ANGLICISM[w]));
    if (ANGLICISM_EXTRA[w]) out.push(stem(ANGLICISM_EXTRA[w]));
  });
  // Titre vague (verbe flou + UN seul mot-objet : « Penser au projet », « Revoir ça ») : un objet isolé ne désigne aucun secteur, il ne compte pas.
  if (out.length === 2 && VAGUE_VERBS.has(out[0])) out.pop();
  return out;
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

// Concepts équivalents pour « à ignorer » seulement (titre ET terme ramenés au même mot) : classes de synonymes, pas des cas.
const IGN_GROUPS = [
  ['refonte', 'refondre', 'redessiner', 'redesign', 'refaire', 'repenser', 'redo', 'revamp', 'nouveau', 'nouvelle', 'new'],
  ['embauche', 'recruter', 'recrutement', 'hiring', 'hire'],
  ['newsletter', 'infolettre', 'emailing', 'mailchimp'],
  ['podcast', 'balado', 'baladodiffusion'],
  ['webinaire', 'webinar'],
  ['conference', 'colloque', 'congres'],
  ['livraison', 'delivery'],
  ['fidelite', 'loyalty'],
];
// Plateformes : désignent à elles seules le concept (« sur Instagram » = réseaux sociaux ; « Uber Eats » = livraison à domicile).
const IGN_PLATFORMS = {
  reseaux_sociaux: ['instagram', 'facebook', 'tiktok', 'linkedin', 'twitter', 'youtube', 'snapchat', 'pinterest'],
  livraison_domicile: ['uber', 'ubereats', 'doordash', 'skipthedishes'],
};
const IGN_CANON = {}, IGN_ADD = {};
IGN_GROUPS.forEach((g) => g.forEach((w) => { IGN_CANON[stem(w)] = stem(g[0]); }));
IGN_PLATFORMS.reseaux_sociaux.forEach((w) => { IGN_ADD[stem(w)] = [stem('reseaux'), stem('sociaux')]; });
IGN_PLATFORMS.livraison_domicile.forEach((w) => { IGN_ADD[stem(w)] = [stem('livraison'), stem('domicile')]; });
// Noms génériques d'un terme (« programme de fidélité », « plan marketing ») : le mot qui porte le sens suffit.
const IGN_GENERIC = new Set(['programme', 'projet', 'service', 'plan', 'strategie', 'campagne', 'systeme', 'carte'].map(stem));
function ignoreTokens(v) {
  const out = [];
  tokens(v).forEach((w) => { if (IGN_ADD[w]) out.push(...IGN_ADD[w]); out.push(IGN_CANON[w] || w); });
  return out;
}

// Termes de la rubrique « à ignorer » : séparés par virgule, point-virgule, retour de ligne ou puce. Chaque terme garde ses mots utiles.
function ignoreTerms(ignoreText) {
  return String(ignoreText || '').split(/[,;\n•]+|\s[-–—]\s/).map(ignoreTokens).map((t) => {
    const core = t.filter((w) => !IGN_GENERIC.has(w));
    return core.length ? core : t;
  }).filter((t) => t.length);
}
// Vrai si TOUS les mots utiles d'un terme à ignorer figurent dans le titre (prudent : « site web » n'écarte pas « Écrire au webmestre »).
function matchesIgnore(title, ignoreText) {
  const t = new Set(ignoreTokens(title));
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
// Validateur déterministe d'un titre GÉNÉRÉ par l'IA (jamais d'une saisie manuelle). Renvoie { title, reason } : title = titre nettoyé
// (horaire à créneau fixe retiré s'il reste une tâche valable) ou null si rejeté ; reason = 'vide' | 'horaire' | 'sansSens' | 'tropLong' | 'doublon'.
const MAX_GENERATED_TITLE = 140;
const HM = '\\d{1,2}\\s*(?:h(?:eures?)?(?:\\s*\\d{2})?|:\\d{2})(?![a-zà-ÿ])', AMPM = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)';
// Heure précise : « à 14 h », « 14 h 30 », « 10:30 », « 3pm », « de 9 h à 10 h ». Un « 2 h » nu reste une durée, jamais un horaire ; « de 3 heures »,
// « (1 h 30) », « environ 1h30 », « pendant 1 h 15 », « 1 h 30 max » sont des DURÉES (contexte de durée devant/derrière) : conservées telles quelles.
const DUR_BEFORE = '(?<!(?:\\(|pendant|environ|about|for|dur[ée]e|pour|\\bde|d[\'’]|~)\\s*)', DUR_AFTER = '(?!\\s*(?:\\)|max\\b|maximum|environ|approx))';
// « à midi », « at noon » ; heure 5-12 h collée à un jour (« mercredi 10h », « demain 9h30 ») = horaire, pas une durée.
const NOON = '(?:midi|minuit|noon|midnight)\\b', DAYW = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)';
const FIXED_TIME = new RegExp('\\s*(?:(?<=^|\\s)de\\s+' + HM + '\\s*(?:à|a|-|–)\\s*(?:' + AMPM + '|' + HM + ')|(?<=^|[\\s(])(?:à|a|vers|dès|at|@)\\s+(?:' + AMPM + '|' + HM + '|' + NOON + ')|(?<=\\b' + DAYW + '\\s+|' + DAY_ABBR_RE + '\\s+)(?:[5-9]|1[0-2])\\s*h(?:\\s*\\d{2})?(?![a-zà-ÿ0-9])|' + DUR_BEFORE + '\\b(?:[5-9]|0\\d|1\\d|2[0-3])\\s*h\\s*\\d{2}\\b' + DUR_AFTER + '|' + DUR_BEFORE + '\\b(?:1[3-9]|2[0-3])\\s*h(?![a-zà-ÿ0-9])(?!\\s*(?:de\\b|d[\'’]|max|maximum|environ|\\)))|\\b\\d{1,2}:\\d{2}\\b|(?:(?<=^|\\s)(?:from|de)\\s+)?\\b' + AMPM + '\\b)(?:\\s*(?:à|a|-|–|to)\\s*(?:' + AMPM + '|' + HM + '))?', 'i');
// Mots vides de sens : un titre qui n'est fait QUE de ces mots (« truc », « à faire », « todo ») ne désigne aucune action. Tout autre mot, même seul
// (« Épicerie », « Facture Hydro-Québec », « Vérifier », « Acme »), est une tâche valable : pas de liste de verbes, donc pas de faux rejets.
const VAGUE = new Set(['truc', 'trucs', 'chose', 'choses', 'machin', 'bidule', 'divers', 'autre', 'autres', 'rien', 'tache', 'taches', 'task', 'tasks', 'todo', 'to', 'do', 'stuff', 'thing', 'things', 'misc', 'tbd', 'tba', 'etc', 'na', 'n', 'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'the', 'an', 'mon', 'ma', 'mes', 'notre', 'nos', 'ce', 'cette', 'ca', 'quoi', 'pis', 'puis', 'cela', 'ceci', 'it', 'this', 'that']);
// Verbes sans contenu (« Réfléchir », « Avancer », « Penser à l'objectif ») : un titre fait QUE de ces mots + mots vides ne dit pas quoi faire.
// Liste fermée, volontairement courte ; un verbe concret seul (« Vérifier », « Courir ») reste valable.
const EMPTY_VERBS = new Set(['reflechir', 'reflechis', 'penser', 'avancer', 'continuer', 'commencer', 'demarrer', 'travailler', 'essayer', 'se', 'motiver', 'planifier', 'organiser', 'preparer', 'faire', 'gerer', 'traiter', 'regarder', 'voir', 'checker', 'think', 'work', 'try', 'start', 'continue', 'organize', 'prepare', 'handle', 'dessus', 'on', 'about', 'tout', 'objectif', 'but', 'goal', 'recherche', 'recherches', 'research', 'projet', 'project', 'sur', 'au', 'aux', 'pour', 'avec']);
function checkGenerated(raw, existing) {
  const t0 = cleanTitle(raw);
  if (!t0) return { title: null, reason: 'vide' };
  let t = t0;
  if (FIXED_TIME.test(t)) t = cleanTitle(t.replace(FIXED_TIME, ' ').replace(/\(\s*\)/g, ' ')); // « Appeler Paul à 14 h 30 » -> « Appeler Paul »
  const words = fold(t).split(' ').filter(Boolean);
  if (!words.length) return { title: null, reason: t !== t0 ? 'horaire' : 'vide' };
  if (t.length > MAX_GENERATED_TITLE) return { title: null, reason: 'tropLong' };
  if (words.every((w) => VAGUE.has(w)) || /^(?:a faire|to do|a voir|a completer)$/.test(words.join(' ')) || fold(t).replace(/[^a-z]/g, '').length < 3) return { title: null, reason: 'sansSens' }; // « truc », « à faire », « A », « T1 », « 12345 » : rien à faire de ce titre
  const w2 = fold(t.replace(/\s[àÀ]\s/g, ' ')).split(' ').filter(Boolean); // « à » (préposition) ignoré ; une lettre seule (« Faire A ») n'est pas du vague
  if (w2.length <= 4 && w2.every((w) => VAGUE.has(w) || EMPTY_VERBS.has(w))) return { title: null, reason: 'sansSens' }; // « Réfléchir », « Avancer sur le projet »
  if ((existing || []).some((o) => sameTitle(t, o))) return { title: null, reason: 'doublon' };
  return { title: t, reason: t !== t0 ? 'horaire' : null }; // reason 'horaire' avec title = nettoyé
}
function isDuplicate(title, others) { return (others || []).some((o) => sameTitle(title, o)); }

// « Action contre sujet » : le verbe d'ouverture dit le domaine (« Payer la facture du fournisseur » = finances, pas approvisionnement).
// Renvoie les mots-thèmes (racines) à pondérer en plus des mots du titre ; liste fermée, volontairement courte, 0 hasard.
const ACTION_THEMES = { pay: ['paiement', 'payment', 'invoice'], rembours: ['paiement'], regl: ['paiement'], declar: ['impot', 'taxe'], form: ['formation'], embauch: ['embauche'], photographi: ['photo'], horair: ['employe'], etudi: ['cours', 'examen', 'revision'], revis: ['cours', 'examen'] };
// Lieux/démarches du quotidien (liste fermée) : « Passer à la pharmacie » = vie personnelle (santé), même sans mot de catégorie dans le titre.
const ERRAND_THEMES = { pharmaci: ['sante'], medecin: ['sante'], dentist: ['sante'], docteur: ['sante'], clinique: ['sante'], epicer: ['epicerie'], lait: ['epicerie'], oeuf: ['epicerie'], pain: ['epicerie'], fromage: ['epicerie'], fruit: ['epicerie'], beurre: ['epicerie'], viande: ['epicerie'] };
function actionHints(title) {
  const tk = tokens(title);
  const first = tk[0];
  const out = first && ACTION_THEMES[first] ? ACTION_THEMES[first].slice() : [];
  tk.forEach((w) => { if (ERRAND_THEMES[w]) out.push(...ERRAND_THEMES[w]); });
  // Un document financier domine son destinataire (« Envoyer la facture au client » = facturation, pas Clients) ; pas pour une double action (« … et relancer le client »).
  if (tk.includes('factur') && !/\s(?:et|and)\s/i.test(String(title))) out.push('facturation');
  // « le client Acme » (nom propre après « client ») : client existant, donc travail en cours, pas prospection.
  if (/\bclient\s+[A-ZÉÈÀ]/.test(String(title))) out.push('livrables', 'projets', 'suivi', 'deliverables', 'projects');
  // « le/mon/the client » (article défini) : client déjà en place, donc travail en cours ; pas « client potentiel / nouveau ».
  else if (/\b(?:le|la|mon|ma|notre|the|my|our)\s+client(?:e)?\b(?!\s+(?:potentiel|prospect))/i.test(String(title)) && !/\b(?:nouveau|nouvelle|new|potentiel|prospect)/i.test(String(title))) out.push('livrables', 'projets', 'suivi', 'deliverables', 'projects');
  // Envoi/relance vers un commerce nommé (« au Café Olimpico », « chez Restaurant Chez Luc ») : clientèle professionnelle, pas fournisseur.
  if (/^(?:envoy|propos|pr[ée]sent|offr|relanc|rappel|contact|visit)/i.test(fold(title)) && !tk.includes('factur') && /\b(?:au|[àa] la|[àa] l'|chez|pour)\s+(?:le |la |l')?(?:Caf[ée]|Restaurant|Resto|Bistro|H[ôo]tel|Boulangerie|Bar|Brasserie|Pâtisserie)\s+[A-ZÉÈÀ]/.test(String(title))) out.push('clients', 'professionnels', 'restaurants');
  return out.map(stem);
}

module.exports = { stem, actionHints,  cleanTitle, fold, tokens, ignoreTerms, matchesIgnore, priorityRank, sameTitle, isDuplicate, checkGenerated, MAX_GENERATED_TITLE };
