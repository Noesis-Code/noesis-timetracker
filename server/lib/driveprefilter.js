// Pré-filtre LOCAL avant l'IA pour la surveillance programmée de Drive (17 oct. 2026, réduction du coût IA).
// Règle absolue d'Émilien : ne JAMAIS perdre de contenu important. Seuls gestes permis :
//   (a) ignorer un fichier vide ou de moins de 20 mots (jamais s'il contient des puces, cases ou lignes numérotées) ; (b) ignorer un doublon exact d'un fichier déjà traité de la même connexion
//   (fait dans drivesync.js : même contentHash) ; (c) nettoyer SANS toucher aux phrases : espaces multiples, lignes vides en trop,
//   lignes COURTES de texte ordinaire (< 120 car., ni liste, ni titre, ni tableau) répétées 3 fois ou plus (en-têtes / pieds de page : on garde la première occurrence) ;
//   (d) feuille de calcul / CSV : ignorer seulement si aucun mot (que des chiffres et symboles).
// Interdits : tri de sections par mots-clés, résumé, suppression de signatures ou de tableaux contenant des mots, troncature en plus.
// Filet : chaque fichier ignoré est comptabilisé avec sa raison (drive_skipped, visible dans drive/sync) ; « Synchroniser maintenant »
// contourne tout ; DRIVE_PREFILTER=off coupe le pré-filtre. Compteurs seulement dans les logs.
const MIN_WORDS = 20;
const REPEAT_MIN = 3;

function enabled() { return String(process.env.DRIVE_PREFILTER || '').trim().toLowerCase() !== 'off'; }

const wordCount = (t) => (String(t).match(/\S+/g) || []).filter((w) => /\p{L}/u.test(w)).length;
const hasWord = (t) => /\p{L}{2,}/u.test(String(t));
function isSheet(file) {
  const f = file || {};
  return /spreadsheet|csv|excel/i.test(String(f.mimeType || '')) || /\.(csv|tsv|xlsx?)$/i.test(String(f.name || ''));
}

// Ligne de tableau (séparateurs | ; tabulation, ou plusieurs virgules) : jamais dédoublonnée.
// Lignes de liste (puces, cases, numérotation) et titres : jamais dédoublonnées, et leur présence empêche d'ignorer un fichier court.
const LIST_LINE = /^\s*([-*•–]|\[[ xX]?\]|\d+[.)])\s+\S/;
const HEADING = /^\s*#{1,6}\s/;
const looksTabular = (l) => /[|\t;]/.test(l) || (l.match(/,/g) || []).length >= 2;

// (c) Nettoyage sans toucher aux phrases.
function clean(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, ''));
  const count = new Map();
  lines.forEach((l) => { const k = l.trim(); if (k) count.set(k, (count.get(k) || 0) + 1); });
  const kept = new Set(), out = [];
  lines.forEach((l) => {
    const k = l.trim();
    if (k && count.get(k) >= REPEAT_MIN && k.length < 120 && !looksTabular(k) && !LIST_LINE.test(l) && !HEADING.test(l)) { if (kept.has(k)) return; kept.add(k); } // répétée : première occurrence seulement
    out.push(l);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Retourne { skip: 'vide' | 'sans mots' } ou { text } (texte nettoyé à envoyer).
function evaluate(text, file) {
  const raw = String(text || '');
  if (!raw.trim()) return { skip: 'vide' };
  if (isSheet(file) && !hasWord(raw)) return { skip: 'sans mots' };
  if (wordCount(raw) < MIN_WORDS && !raw.split('\n').some((l) => LIST_LINE.test(l))) return { skip: 'vide' }; // vide ou moins de ~20 mots (sauf puces / cases / lignes numérotées : jamais ignoré)
  if (actionFilterOn() && !raw.split('\n').some((l) => LIST_LINE.test(l)) && !ACTION_RE.test(raw)) return { skip: 'sans action' }; // aucune puce / case et aucun verbe d'action ni marqueur de tâche
  return { text: clean(raw) };
}

// (e) 19 oct. 2026 : fichier sans liste ET sans verbe d'action / marqueur de tâche (à faire, todo, doit, prévoir, appeler, envoyer…) : ignoré et listé. DRIVE_PREFILTER_ACTION=off pour couper.
const actionFilterOn = () => String(process.env.DRIVE_PREFILTER_ACTION || '').trim().toLowerCase() !== 'off';
const ACTION_RE = new RegExp('(?:\\b(?:à faire|a faire|todo|to do|to-do|tâches?|taches?|action|actions|prochaines? étapes?|next steps?|deadline|échéance|echeance|rappel|doit|doivent|faut|devons|devoir|penser à|ne pas oublier|il reste)\\b|\\b(?:appeler|envoyer|faire|préparer|finaliser|vérifier|verifier|contacter|rédiger|planifier|organiser|commander|payer|réserver|reserver|terminer|valider|répondre|relancer|acheter|créer|creer|mettre|prévoir|prevoir|livrer|signer|déposer|corriger|publier|installer|confirmer|réviser|revoir|compléter|completer|call|send|prepare|finish|review|schedule|book|buy|pay|fix|update|follow up)\\b)', 'i');

module.exports = { actionFilterOn, enabled, evaluate, clean, wordCount, MIN_WORDS, REPEAT_MIN };
