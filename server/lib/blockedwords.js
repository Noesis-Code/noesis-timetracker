// Modération proactive (sans IA, sans appel API) : liste de mots bloqués
// configurable côté serveur. Sources, cumulées : variable d'environnement
// BLOCKED_WORDS (séparée par virgules) et fichier blocked-words.txt dans le
// dossier de données (un mot ou une expression par ligne, # = commentaire).
// Comparaison sans accents ni casse, sur mots entiers. Liste vide = rien
// n'est bloqué. Un message refusé n'est jamais enregistré.
const fs = require('fs');
const path = require('path');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function loadWords() {
  const words = [];
  (process.env.BLOCKED_WORDS || '').split(',').forEach((w) => words.push(w));
  try {
    const dir = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, '..', '..', 'data');
    const f = path.join(dir, 'blocked-words.txt');
    if (fs.existsSync(f)) fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l) => { if (l.trim() && l.trim()[0] !== '#') words.push(l); });
  } catch (e) { /* fichier illisible : on ignore */ }
  return words.map((w) => norm(w).trim()).filter(Boolean);
}

// true si le texte contient un mot bloqué.
function containsBlockedWord(text, words) {
  const list = words || loadWords();
  if (!list.length) return false;
  const hay = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
  return list.some((w) => hay.includes(' ' + w.replace(/[^a-z0-9]+/g, ' ').trim() + ' '));
}

const BLOCKED_MESSAGE = "Ce message contient un terme non autorisé dans la Communauté. Reformule-le pour l'envoyer.";

module.exports = { containsBlockedWord, BLOCKED_MESSAGE, norm };
