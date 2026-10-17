// Pré-filtre LOCAL avant l'IA pour la surveillance programmée de Drive (17 oct. 2026, réduction du coût IA).
// Règle absolue d'Émilien : ne JAMAIS perdre de contenu important. Seuls gestes permis :
//   (a) ignorer un fichier vide ou de moins de 20 mots ; (b) ignorer un doublon exact d'un fichier déjà traité de la même connexion
//   (fait dans drivesync.js : même contentHash) ; (c) nettoyer SANS toucher aux phrases : espaces multiples, lignes vides en trop,
//   lignes identiques répétées 3 fois ou plus (en-têtes / pieds de page : on garde la première occurrence) ;
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
const looksTabular = (l) => /[|\t;]/.test(l) || (l.match(/,/g) || []).length >= 2;

// (c) Nettoyage sans toucher aux phrases.
function clean(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, ''));
  const count = new Map();
  lines.forEach((l) => { const k = l.trim(); if (k) count.set(k, (count.get(k) || 0) + 1); });
  const kept = new Set(), out = [];
  lines.forEach((l) => {
    const k = l.trim();
    if (k && count.get(k) >= REPEAT_MIN && !looksTabular(k)) { if (kept.has(k)) return; kept.add(k); } // répétée : première occurrence seulement
    out.push(l);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Retourne { skip: 'vide' | 'sans mots' } ou { text } (texte nettoyé à envoyer).
function evaluate(text, file) {
  const raw = String(text || '');
  if (!raw.trim()) return { skip: 'vide' };
  if (isSheet(file) && !hasWord(raw)) return { skip: 'sans mots' };
  if (wordCount(raw) < MIN_WORDS) return { skip: 'vide' }; // vide ou moins de ~20 mots
  return { text: clean(raw) };
}

module.exports = { enabled, evaluate, clean, wordCount, MIN_WORDS, REPEAT_MIN };
