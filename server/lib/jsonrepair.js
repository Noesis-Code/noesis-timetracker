// Réparation locale d'une sortie JSON abîmée du modèle, AVANT tout nouvel appel payant (une sortie illisible est déjà facturée).
// Étapes (jamais d'invention de contenu) : JSON strict -> retrait des clôtures ``` et du texte autour (premier objet/tableau équilibré)
// -> virgules finales retirées -> si la sortie n'est PAS tronquée (arrêt normal) : accolades/crochets manquants fermés
// (une chaîne restée ouverte ou une clé sans valeur = irréparable, rien n'est inventé). Une sortie tronquée par max_tokens (`truncated`) n'est jamais « complétée » : des éléments manqueraient en silence.
// Sans regex non ancrée (une entrée de 1 Mo d'espaces rendait `\s*```\s*$` quadratique) : tout est linéaire.
const MAX_LEN = 2e6; // au-delà : irréparable (aucune sortie de modèle n'approche cette taille)
function stripFences(t) {
  let s = String(t == null ? '' : t).trim();
  if (s.startsWith('```')) s = s.replace(/^```[a-zA-Z]*\s*/, '');
  if (s.endsWith('```')) s = s.slice(0, -3);
  return s.trim();
}

// Premier objet/tableau commençant au premier { ou [ : renvoie le texte jusqu'à la fermeture équilibrée, ou le reste (fermeture manquante).
function firstBalanced(t) {
  const i = t.search(/[{\[]/);
  if (i < 0) return null;
  const stack = []; let inStr = false, esc = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { stack.pop(); if (!stack.length) return { text: t.slice(i, k + 1), closed: true }; }
  }
  return { text: t.slice(i), closed: false, stack, inStr, esc };
}

function dropTrailingCommas(s) {
  let out = '', inStr = false, esc = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ',') { let j = k + 1; while (j < s.length && /\s/.test(s[j])) j++; if (s[j] === '}' || s[j] === ']') continue; }
    out += c;
  }
  return out;
}

// Renvoie { value, repaired } ou null si irréparable sans appel. `truncated` : arrêt par max_tokens.
function parse(text, opts) {
  if (String(text == null ? '' : text).length > MAX_LEN) return null;
  const t = stripFences(text);
  try { return { value: JSON.parse(t), repaired: false }; } catch (e) { /* réparation */ }
  const b = firstBalanced(t);
  if (!b) return null;
  let s = dropTrailingCommas(b.text);
  try { return { value: JSON.parse(s), repaired: true }; } catch (e) { /* suite */ }
  if (b.closed || (opts && opts.truncated)) return null;
  // Fermeture des seules accolades/crochets manquants d'un arrêt normal. Jamais d'invention : une chaîne restée ouverte, ou une clé
  // sans valeur (deux-points final), signale une sortie coupée -> irréparable (repli habituel).
  if (b.inStr) return null;
  s = s.trimEnd();
  if (s.endsWith(':')) return null;
  s = dropTrailingCommas(s.endsWith(',') ? s.slice(0, -1) : s) + b.stack.slice().reverse().map((c) => (c === '{' ? '}' : ']')).join('');
  try { return { value: JSON.parse(s), repaired: true }; } catch (e) { return null; }
}

module.exports = { parse, stripFences };
