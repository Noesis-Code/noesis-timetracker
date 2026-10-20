// Relevé statique des insertions HTML de public/ : pour chaque `.innerHTML =`, `.innerHTML +=`, `.outerHTML =` ou `insertAdjacentHTML(`,
// découpe l'expression en opérandes (concaténations `+` et gabarits `${}`) et renvoie ceux qui ne sont ni un littéral ni un appel d'échappement.
const fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, '..', '..', 'public');
const TRIG = /(\.innerHTML\s*\+?=(?!=)|\.outerHTML\s*=(?!=)|\.insertAdjacentHTML\s*\()/g;

// Avance depuis i (début d'une expression) jusqu'à la fin de l'instruction ; renvoie l'index de fin.
function endOfExpr(src, i, closeParen) {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipStr(src, i); continue; }
    if (c === '`') { i = skipTpl(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return i; depth--; }
    else if ((c === ';' || (c === ',' && closeParen)) && depth === 0) return i;
  }
  return i;
}
function skipStr(src, i) { const q = src[i]; for (i++; i < src.length; i++) { if (src[i] === '\\') i++; else if (src[i] === q || src[i] === '\n') return i; } return i; }
function skipTpl(src, i) {
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '`') return i;
    else if (src[i] === '$' && src[i + 1] === '{') { i = endOfExpr(src, i + 2, false); }
  }
  return i;
}
// Découpe en opérandes de premier niveau séparés par `+` ; les gabarits sont ouverts (leurs ${} deviennent des opérandes).
function operands(expr) {
  const out = []; let cur = ''; let depth = 0;
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '"' || c === "'") { const j = skipStr(expr, i); cur += expr.slice(i, j + 1); i = j; continue; }
    if (c === '`') {
      const j = skipTpl(expr, i); const body = expr.slice(i + 1, j);
      for (let k = 0; k < body.length; k++) {
        if (body[k] === '\\') { k++; continue; }
        if (body[k] === '$' && body[k + 1] === '{') { const e = endOfExpr(body, k + 2, false); out.push(...operands(body.slice(k + 2, e))); k = e; }
      }
      cur += '""'; i = j; continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') depth--;
    if (c === '+' && depth === 0 && expr[i + 1] !== '+' && expr[i - 1] !== '+') { flush(); continue; }
    cur += c;
  }
  flush();
  return out;
}
// t()/tr() renvoient le texte inchangé s'il n'est pas traduit : sûrs seulement avec un littéral (voir isSafe).
const SAFE_CALL = /^(?:[\w$.]*\.)?(?:escapeHtml|escHtml|esc|escAttr|escapeAttr|escapeText|fmtDur|fmtDuration|fmtHM|formatDuration|String\(\s*Number|Number|Math\.\w+|parseInt|parseFloat|encodeURIComponent|\w*[Ee]scape\w*)\s*\(/;
const TR_CALL = /^(?:[\w$.]*\.)?(?:t|tr|tt)\s*\(\s*(["'`])/;
const NUMERIC = /^[-+]?\d[\d.]*$|^(?:true|false|null|undefined)$/;
let BAD = [];
function isSafe(op) { const r = isSafe0(op); return r; }
function isSafe0(op) {
  let s = op.trim();
  if (!s) return true;
  if (/^(["'`])[\s\S]*\1$/.test(s) && !/\$\{/.test(s)) return true;      // littéral
  if (NUMERIC.test(s)) return true;
  if (/^[A-Za-z_$][\w$]*$/.test(s) && ACC[s]) { if (RESOLVING.has(s)) return true; RESOLVING.add(s); const ok = ACC[s].map((rhs) => operands(rhs).map(isSafe).every(Boolean)).every(Boolean); RESOLVING.delete(s); return ok; }
  while (s[0] === '(' && s[s.length - 1] === ')' && !/^\([^()]*\)\s*[\w$.]/.test(s)) s = s.slice(1, -1).trim(); // parenthèses englobantes
  if (topQ(s) < 0) { const ops = operands(s); if (ops.length > 1) return ops.map(isSafe).every(Boolean); }
  if (topQ(s) >= 0 && !SAFE_CALL.test(s)) {              // ternaire : chaque branche
    const q = topQ(s); const rest = s.slice(q + 1); const col = findColon(rest);
    if (col > -1) return operands(rest.slice(0, col)).map(isSafe).every(Boolean) && operands(rest.slice(col + 1)).map(isSafe).every(Boolean);
  }
  if (/\|\||&&/.test(s) && !SAFE_CALL.test(s)) { const parts = operands2(s); if (parts.length > 1) return parts.map(isSafe).every(Boolean); }
  if (/\.map\(\s*(?:function|\()/.test(s) || /\.map\(\s*[\w$]+\s*=>/.test(s)) {   // rappel de .map : on contrôle ses retours
    const rets = []; const re = /\breturn\s+|=>\s*(?!\{)/g; let m;
    while ((m = re.exec(s))) { const e = endOfExpr(s, m.index + m[0].length, false); rets.push(s.slice(m.index + m[0].length, e)); }
    if (rets.length) return rets.map((r) => operands(r).map(isSafe).every(Boolean)).every(Boolean);
  }
  if (TR_CALL.test(s)) { const m = s.match(/^[\w$.]*\(/)[0]; return matchParen(s, m.length - 1) === s.length - 1; }
  if (SAFE_CALL.test(s)) { const m = s.match(SAFE_CALL)[0]; const end = matchParen(s, m.length - 1); return end === s.length - 1; }
  BAD.push(s);
  return false;
}
function topQ(s) { let d = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"' || c === "'") { i = skipStr(s, i); continue; } if (c === '`') { i = skipTpl(s, i); continue; } if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === '?' && d === 0) return i; } return -1; }
function operands2(s) { const out = []; let d = 0, cur = ''; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"' || c === "'") { const j = skipStr(s, i); cur += s.slice(i, j + 1); i = j; continue; } if ('([{'.includes(c)) d++; if (')]}'.includes(c)) d--; if (d === 0 && (s.startsWith('||', i) || s.startsWith('&&', i))) { out.push(cur); cur = ''; i++; continue; } cur += c; } out.push(cur); return out; }
function findColon(s) { let d = 0, q = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"' || c === "'") { i = skipStr(s, i); continue; } if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === '?' && d === 0) q++; else if (c === ':' && d === 0) { if (q === 0) return i; q--; } } return -1; }
function matchParen(s, i) { let d = 0; for (; i < s.length; i++) { const c = s[i]; if (c === '"' || c === "'") { i = skipStr(s, i); continue; } if (c === '`') { i = skipTpl(s, i); continue; } if (c === '(') d++; else if (c === ')') { d--; if (d === 0) return i; } } return -1; }

// Variables qui accumulent du HTML (`html += '<div>' + ...`) : une variable est sûre si TOUTES ses affectations du fichier le sont.
function accumulators(src) {
  const map = {}; const re = /(?:^|[\s;{(,])(?:var\s+|let\s+|const\s+)?([A-Za-z_$][\w$]*)\s*\+?=(?![=>])\s*/g; let m;
  while ((m = re.exec(src))) {
    const e = endOfExpr(src, m.index + m[0].length, false); const rhs = src.slice(m.index + m[0].length, e);
    if (!/(["'`])[^"'`\n]*<[a-zA-Z/][^"'`\n]*\1|`[^`]*<[a-zA-Z/]/.test(rhs)) continue;
    (map[m[1]] = map[m[1]] || []).push(rhs);
  }
  return map;
}
let ACC = {}; const RESOLVING = new Set();
function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8'); const sites = []; ACC = accumulators(src);
  let m; TRIG.lastIndex = 0;
  while ((m = TRIG.exec(src))) {
    const isIns = m[0].includes('insertAdjacentHTML');
    let start = m.index + m[0].length, expr;
    if (isIns) { const e = endOfExpr(src, start, false); const full = src.slice(start, e); const k = full.indexOf(','); expr = k > -1 ? full.slice(k + 1) : full; }
    else { const e = endOfExpr(src, start, false); expr = src.slice(start, e); }
    const line = src.slice(0, m.index).split('\n').length;
    BAD = []; operands(expr).forEach((o) => isSafe(o));
    const unsafe = Array.from(new Set(BAD));
    sites.push({ file: path.relative(PUB, file), line, unsafe, expr });
  }
  return sites;
}
function scanAll() {
  const files = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'img' && e.name !== 'icons') walk(p); } else if (/\.js$/.test(e.name) && !/legal-en\.js$/.test(e.name)) files.push(p); }); })(PUB);
  return files.sort().flatMap(scanFile);
}
module.exports = { scanAll, scanFile, operands, isSafe };
