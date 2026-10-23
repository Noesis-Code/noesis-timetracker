// Limites de taille et caractères spéciaux des textes saisis (titre de tâche, nom d'activité, note, message).
// Règles communes : texte obligatoirement une chaîne (jamais d'erreur 500 sur un nombre, un objet ou null) ;
// caractères de contrôle invisibles retirés (NUL, ESC, etc.) ; saut de ligne : conservé dans un texte, remplacé par une espace dans un titre ;
// longueur comptée en caractères visibles (points de code : un emoji, même une séquence ZWJ ou un drapeau, ne compte pas pour la moitié d'un caractère) ;
// un texte trop long est REFUSÉ avec un message clair, jamais tronqué (on ne coupe donc jamais au milieu d'un emoji).
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g');
const LINE_SEP = new RegExp('[\\u2028\\u2029]', 'g');
const NEWLINES = /\r\n|\r|\n/g;

function length(s) { let n = 0; for (const c of s) { void c; n++; } return n; } // points de code (pas les unités UTF-16)

// opts.kind : 'title' (une seule ligne) ou 'text' (sauts de ligne conservés) ; opts.word : « Intitulé », « Nom »... ; opts.fem : accord de « long(ue) ».
function clean(raw, opts) {
  const max = opts.max, word = opts.word, fem = !!opts.fem, kind = opts.kind || 'title';
  if (raw === undefined || raw === null) return { text: '' };
  if (typeof raw !== 'string') return { error: word + ' invalide.' };
  let s = raw.replace(CONTROL, '');
  s = kind === 'title'
    ? s.replace(LINE_SEP, ' ').replace(NEWLINES, ' ').replace(/\t/g, ' ').replace(/ {2,}/g, ' ')
    : s.replace(LINE_SEP, '\n');
  s = s.trim();
  if (length(s) > max) return { error: word + ' trop long' + (fem ? 'ue' : '') + ' (' + max + ' caractères maximum).' };
  return { text: s };
}

const LIMITS = { TASK_TITLE: 300, ACTIVITY_NAME: 120, SESSION_NOTE: 5000 };

module.exports = { clean, length, LIMITS };
