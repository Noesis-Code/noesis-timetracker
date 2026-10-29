// Horaire : import des employés depuis un document (Paramètres > Employés, demande d'Émilien du 29 oct. 2026). Lecture SANS IA :
// .txt, .csv, .md, .docx (tableaux compris), .pdf texte (server/lib/documenttasks.js textFromFile) et .xlsx (1re feuille, lu ici).
// Colonnes reconnues d'après l'en-tête (casse et accents ignorés) : nom, catégorie, poste, heures min, cible, max, note. Les quarts
// ne sont pas des heures : leurs colonnes sont ignorées et signalées. Jamais d'application silencieuse : preview() rend l'aperçu
// (ajoutés, modifiés avant → après par champ, lignes ignorées), apply() n'écrit qu'après « Importer ». Fusion par nom : ajoute,
// met à jour les champs présents dans le document ; ne supprime personne et ne vide aucun champ absent.
// Confidentialité (Loi 25) : le fichier n'est ni stocké ni journalisé ; il ne vit que le temps de la requête.
const db = require('../db');
const h = require('./horaire');
const docs = require('./documenttasks');
const { validateAttachmentPayload } = require('./attachments');

const MAX_RANK = 5; // tableaux de catégorie de la page Employés (public/js/horaire.js, MAX_RANK)
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });

// ---------- lecture du fichier ----------
function xmlDecode(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}
function fileBuffer(att) {
  const v = validateAttachmentPayload(att || {});
  if (v.error) throw bad(v.error);
  const i = v.dataUrl.indexOf(','), head = v.dataUrl.slice(0, i), body = v.dataUrl.slice(i + 1);
  return { name: v.fileName, buf: /;base64/i.test(head) ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8') };
}
// .xlsx : 1re feuille (xl/worksheets/sheet1.xml) et textes partagés ; une ligne = un tableau de cellules (place d'après « r="B2" »).
function xlsxRows(buf) {
  let sheet, shared;
  try { sheet = docs.unzipEntry(buf, 'xl/worksheets/sheet1.xml'); shared = docs.unzipEntry(buf, 'xl/sharedStrings.xml'); } catch (e) { return null; }
  if (!sheet) return null;
  const strings = shared ? (shared.toString('utf8').match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [])
    .map((si) => xmlDecode((si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))) : [];
  const col = (ref) => { let n = 0; for (const ch of String(ref || '').replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const rows = [];
  for (const m of sheet.toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = []; let k = 0;
    for (const c of m[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d*)"/.exec(c[1]), t = (/\bt="(\w+)"/.exec(c[1]) || [])[1];
      const i = ref ? col(ref[1]) : k; k = i + 1;
      const inner = c[2] || '', v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let val = '';
      if (t === 's') val = strings[Number(v)] || '';
      else if (t === 'inlineStr') val = xmlDecode((inner.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join(''));
      else if (t === 'b') val = v === '1' ? 'oui' : 'non';
      else if (v != null) val = xmlDecode(v);
      if (i >= 0 && i < 200) cells[i] = val;
    }
    rows.push(Array.from(cells, (x) => (x == null ? '' : String(x).trim())));
  }
  return rows;
}
// .docx : un tableau Word garde ses colonnes (tabulation entre les cellules, une ligne par rangée).
function docxText(buf) {
  let xml;
  try { xml = docs.unzipEntry(buf, 'word/document.xml'); } catch (e) { return null; }
  if (!xml) return null;
  return xmlDecode(xml.toString('utf8')
    .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (t) => t.replace(/<\/w:p>/g, ' ').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n'))
    .replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ''));
}
const FORMATS = 'Formats lus : .csv, .txt, .xlsx, .docx, .pdf (texte).';
async function fileRows(att) {
  const name = String((att && att.fileName) || '').toLowerCase();
  if (/\.xlsx$/.test(name)) {
    const rows = xlsxRows(fileBuffer(att).buf);
    if (!rows) throw bad('Fichier .xlsx illisible.');
    return rows;
  }
  if (/\.docx$/.test(name)) {
    const t = docxText(fileBuffer(att).buf);
    if (t == null) throw bad('Fichier .docx illisible.');
    return textRows(t);
  }
  if (/\.(xls|doc|odt|ods|pages|numbers)$/.test(name)) throw bad('Format non pris en charge. ' + FORMATS);
  const r = await docs.textFromFile(att);
  if (r.unsupported) throw bad(r.unsupported.replace(/Formats lus : .*$/, FORMATS));
  return textRows(r.text);
}

// ---------- texte -> lignes ----------
// Séparateur d'une ligne : ; tabulation | ou , (le plus présent), sinon deux espaces ou plus. Guillemets "..." gérés.
function sepOf(line) {
  const best = [';', '\t', '|', ','].map((c) => [c, line.split(c).length - 1]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}
function splitLine(line, sep) {
  if (sep === null) return line.trim().split(/\s{2,}/);
  const cells = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"' && !cur.trim()) q = true;
    else if (ch === sep) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  if (sep === '|') { if (cells[0] === '') cells.shift(); if (cells[cells.length - 1] === '') cells.pop(); } // tableau Markdown
  return cells;
}
function textRows(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).slice(0, h.LIMITS.csvRows + 100);
  let sep;
  return lines.map((line) => {
    if (!line.trim() || /^\s*```/.test(line) || /^[\s|:\-+]+$/.test(line)) return [];
    const cells = splitLine(line, sep === undefined ? sepOf(line) : sep);
    if (sep === undefined && header(cells)) sep = sepOf(line); // séparateur fixé par la ligne d'en-tête
    return cells;
  });
}

// ---------- en-tête ----------
function colKind(cell) {
  const s = fold(cell).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/\b(quarts?|shifts?)\b/.test(s)) return 'shifts';
  if (/\b(notes?|contraintes?|remarques?|commentaires?|constraints?|comments?)\b/.test(s)) return 'note';
  if (/\b(postes?|roles?|fonctions?|positions?)\b/.test(s)) return 'pos';
  if (/^(cat|cats|categories?|category|rangs?|niveaux?|classes?)\b/.test(s)) return 'cat';
  if (/\b(cibles?|desirees?|desires?|souhaitees?|souhaites?|visees?|vises?|target)\b/.test(s)) return 'target';
  if (/\b(min|minimum|mini)\b/.test(s)) return 'min';
  if (/\b(max|maximum|maxi)\b/.test(s)) return 'max';
  if (/^(prenoms?|first name)\b/.test(s)) return 'first';
  if (/^(noms?|employes?|employees?|names?|salaries?|personnel|membres?)\b/.test(s)) return 'name';
  return null;
}
// Ligne d'en-tête : une colonne Nom (ou Prénom) et au moins une autre colonne reconnue. Renvoie { idx, shifts } ou null.
function header(cells) {
  const idx = {}; let shifts = false;
  cells.forEach((c, i) => { const k = colKind(c); if (k === 'shifts') shifts = true; else if (k && idx[k] === undefined) idx[k] = i; });
  const named = idx.name !== undefined || idx.first !== undefined;
  return named && (Object.keys(idx).length > 1 || shifts) ? { idx, shifts } : null;
}

// ---------- postes ----------
const posKey = (name) => {
  const f = fold(name).replace(/[^a-z]/g, '');
  if (/^serv/.test(f)) return 'serveur';
  if (/^bar/.test(f)) return 'barman';
  if (/^commis/.test(f)) return 'commis';
  if (/^suit/.test(f)) return 'suiteur';
  if (/^hot/.test(f)) return 'hote';
  return f;
};
// « Serveur:1, Barman 2 / Hôtesse » -> [{ name, rank|null }]
function posTokens(cell) {
  return String(cell || '').split(/[,;|/+&]|\bet\b/i).map((t) => t.replace(/[()]/g, ' ').trim()).filter(Boolean).map((t) => {
    const m = /^(.*?)[\s:=#-]*(\d+)$/.exec(t);
    return m && m[1].trim() ? { name: m[1].trim(), rank: Number(m[2]) } : { name: t, rank: null };
  });
}
const rankOf = (cell) => { const m = /(\d+)/.exec(String(cell || '')); return m ? Number(m[1]) : null; };
const sectionRank = (cells) => {
  const filled = cells.filter((c) => String(c).trim());
  if (filled.length !== 1) return null;
  const m = /^(?:categorie|cat\.?|rang|niveau)\s*(\d+)\s*:?$/.exec(fold(filled[0]));
  return m ? Number(m[1]) : null;
};

// ---------- analyse (aucune écriture) ----------
const FIELDS = [['wantHoursMin', 'Heures min'], ['wantHoursTarget', 'Heures cible'], ['wantHoursMax', 'Heures max'], ['constraintNote', 'Note']];
const show = (k, v) => (v == null || v === '' ? '—' : /^wantHours/.test(k) ? String(v).replace('.', ',') : String(v));
async function analyse(u, att, defaultPositionId) {
  const rows = await fileRows(att);
  const positions = h.listPositions(u);
  const byPos = new Map(positions.map((p) => [posKey(p.name), p]));
  const defPos = positions.find((p) => p.id === Number(defaultPositionId)) || byPos.get('serveur') || positions[0] || null;
  const emps = h.listEmployees(u);
  const quals = h.listQualifications(u);
  const findEmp = (name) => { const k = fold(name); const same = emps.filter((e) => fold(e.name) === k); return same.find((e) => e.active) || same[0] || null; };
  const out = { added: [], updated: [], unchanged: 0, ignored: [], notes: [] };
  const ops = [];
  let head = null, section = null, shiftsNoted = false;
  const seen = new Set();
  let room = h.LIMITS.employees - h.countEmployees(u);
  rows.forEach((cells, n) => {
    const line = n + 1;
    if (!cells.some((c) => String(c).trim())) return;
    const hd = header(cells);
    if (hd) {
      head = hd.idx;
      if (hd.shifts && !shiftsNoted) { shiftsNoted = true; out.notes.push('Colonnes de quarts ignorées : les quarts ne sont pas des heures.'); }
      return;
    }
    const sec = sectionRank(cells);
    if (sec != null) { section = sec; return; }
    if (!head) return; // texte avant l'en-tête (titre, présentation) : ignoré
    const cell = (k) => (head[k] === undefined ? '' : String(cells[head[k]] == null ? '' : cells[head[k]]).trim());
    if (cells.filter((c) => String(c).trim()).length < 2) { out.ignored.push({ line, reason: 'ligne sans colonnes' }); return; }
    const name = h.cleanName([cell('first'), cell('name')].filter(Boolean).join(' ')); // Prénom et Nom en deux colonnes : réunis
    if (!name) { out.ignored.push({ line, reason: 'nom manquant' }); return; }
    const key = fold(name);
    if (seen.has(key)) { out.ignored.push({ line, name, reason: 'en double dans le document' }); return; }
    seen.add(key);
    const emp = findEmp(name);
    const fixes = [];
    // Champs présents dans le document seulement (case vide = inchangé).
    const vals = {};
    [['min', 'wantHoursMin'], ['target', 'wantHoursTarget'], ['max', 'wantHoursMax']].forEach(([c, k]) => {
      const raw = cell(c).replace(/\s*(h|hrs?|heures?)\.?$/i, '').trim();
      if (!raw) return;
      const v = h.hoursValue(raw);
      if (v === undefined) fixes.push(FIELDS.find((f) => f[0] === k)[1] + ' illisible'); else vals[k] = v;
    });
    const hv = (k) => (vals[k] !== undefined ? vals[k] : (emp ? emp[k] : null));
    if (!h.hoursOrdered(hv('wantHoursMin'), hv('wantHoursTarget'), hv('wantHoursMax'))) {
      delete vals.wantHoursMin; delete vals.wantHoursTarget; delete vals.wantHoursMax; fixes.push('heures ignorées (min > max)');
    }
    const note = cell('note');
    if (note) { const v = h.constraintText(note); if (v === undefined) fixes.push('note trop longue'); else vals.constraintNote = v; }
    // Postes et catégories : « Serveur:1 » dans la colonne Poste, sinon colonne Catégorie, sinon titre « Catégorie N » au-dessus.
    const catCell = cell('cat');
    let rowRank = catCell ? rankOf(catCell) : section;
    if (catCell && rowRank == null) fixes.push('catégorie illisible');
    const toks = posTokens(cell('pos'));
    const wanted = new Map();
    (toks.length ? toks : (defPos ? [{ name: defPos.name, rank: null }] : [])).forEach((t) => {
      const p = byPos.get(posKey(t.name));
      if (!p) { fixes.push('poste inconnu « ' + t.name + ' »'); return; }
      const r = t.rank != null ? t.rank : rowRank;
      if (r == null) return;
      if (r < 1 || r > MAX_RANK) { fixes.push('catégorie hors 1 à ' + MAX_RANK); return; }
      wanted.set(p.id, { pos: p, rank: r });
    });
    if (!emp && !wanted.size) { out.ignored.push({ line, name, reason: fixes.length ? fixes.join(', ') : 'catégorie manquante' }); return; }
    const changes = [];
    FIELDS.forEach(([k, label]) => {
      if (vals[k] === undefined) return;
      const before = emp ? emp[k] : null;
      if ((before == null ? null : before) !== vals[k]) changes.push({ label, before: show(k, before), after: show(k, vals[k]) });
    });
    const setQ = [];
    wanted.forEach(({ pos, rank }) => {
      const q = emp && quals.find((x) => x.employeeId === emp.id && x.positionId === pos.id);
      if (!q || q.rank !== rank) { changes.push({ label: 'Catégorie (' + pos.name + ')', before: q ? String(q.rank) : '—', after: String(rank) }); setQ.push({ positionId: pos.id, rank }); }
    });
    if (emp && !emp.active) changes.push({ label: 'Actif', before: 'non', after: 'oui' });
    const fields = {}; Object.keys(vals).forEach((k) => { if (changes.some((c) => c.label === FIELDS.find((f) => f[0] === k)[1])) fields[k] = vals[k]; });
    if (fixes.length) out.ignored.push({ line, name, reason: fixes.join(', ') });
    if (!emp) {
      if (room <= 0) { out.ignored.push({ line, name, reason: 'limite d\'employés atteinte' }); return; }
      room -= 1;
      out.added.push({ name, changes: changes.map((c) => ({ label: c.label, after: c.after })) });
      ops.push({ create: { name, ...fields }, quals: setQ });
    } else if (changes.length) {
      out.updated.push({ name: emp.name, changes });
      ops.push({ id: emp.id, fields: { ...fields, ...(emp.active ? {} : { active: true }) }, quals: setQ });
    } else out.unchanged += 1;
  });
  if (!head) throw bad('En-tête introuvable : il faut une colonne Nom et au moins une autre (Catégorie, Poste, Heures min, cible, max ou Note).');
  return { preview: out, ops };
}

async function preview(u, att, defaultPositionId) { return (await analyse(u, att, defaultPositionId)).preview; }
// Applique exactement l'aperçu recalculé sur le même fichier (même règles) ; tout ou rien.
async function apply(u, att, defaultPositionId) {
  const { preview: out, ops } = await analyse(u, att, defaultPositionId);
  db.exec('BEGIN');
  try {
    ops.forEach((op) => {
      const emp = op.create ? h.createEmployee(u, op.create) : h.updateEmployee(u, op.id, op.fields);
      op.quals.forEach((q) => h.setQualification(u, emp.id, q.positionId, q.rank));
    });
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { ...out, applied: true };
}

module.exports = { preview, apply, textRows, xlsxRows, fileRows, header, posTokens };
