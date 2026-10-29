// Horaire, étape 1 « Récupération » : import direct du rapport Dayforce des disponibilités et congés (demande d'Émilien du 29 oct. 2026),
// SANS IA. Le fichier est lu par le même pipeline que l'import des employés (./horaire-import.js fileRows : csv, txt, xlsx 1re feuille,
// docx, pdf texte) puis converti en bloc « nom;jour;début;fin;type » pour la semaine affichée. Ce bloc remplit la zone de collage :
// l'utilisateur le voit et l'envoie lui-même (importAvailabilitiesCsv) ; rien n'est appliqué ici.
// Format Dayforce inconnu : lecture tolérante. Liste (une ligne par plage ou par congé, en-tête repérée) ou grille (une ligne par employé,
// une colonne par jour : « 16:00-23:00 », « Vacances »). Une ligne non comprise est comptée et signalée, jamais inventée.
// Confidentialité (Loi 25) : le fichier n'est ni stocké ni journalisé ; il ne vit que le temps de la requête.
const h = require('./horaire');
const gen = require('./horaire-generation');
const imp = require('./horaire-import');

const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = (s) => fold(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const HEAD = 'nom;jour;début;fin;type';

// ---------- en-tête ----------
function colKind(cell) {
  const s = words(cell);
  if (!s) return null;
  if (/^(prenoms?|first ?names?|given names?)$/.test(s)) return 'first';
  if (/^(nom de famille|last ?names?|surnames?|family names?)$/.test(s)) return 'last';
  if (/^(statut|status|etat|approbation|approval)\b/.test(s)) return 'status';
  if (/\bdates?\b/.test(s) && /\b(fin|end|to|jusqu)\b/.test(s)) return 'dateEnd';
  if (/\bdates?\b/.test(s)) return 'date';
  if (/^(heure )?(de )?(debut|start|from|depart)\b|^de$|^start time$|^in$/.test(s)) return 'start';
  if (/^(heure )?(de )?(fin|end|to)\b|^a$|^end time$|^out$/.test(s)) return 'end';
  if (/^(dates?|jours?|days?)\b/.test(s)) return 'date';
  if (/\b(types?|conges?|vacances|absences?|motifs?|raisons?|reasons?|codes?|paycodes?|categories?)\b/.test(s)) return 'type';
  if (/\b(heures|plages?|horaires?|disponibilites?|dispos?|availabilit(y|ies)|hours|times?)\b/.test(s)) return 'range';
  if (/^(noms?|employes?|employees?|names?|salaries?|personnel|membres?)\b/.test(s)) return 'name';
  return null;
}
// Grille : « Lundi », « Lun 2 nov. », « Mon 11/02 », « 2026-11-02 » -> jour de la semaine affichée.
function headerDay(cell, weekStart) {
  const d = dayOf(cell, weekStart);
  return d && !d.other ? d.day : null;
}
function findHeader(rows, weekStart) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = rows[r] || [], idx = {}, days = {};
    cells.forEach((c, i) => {
      const day = headerDay(c, weekStart);
      if (day && !/^(dates?|jours?|days?)$/.test(words(c))) { if (!Object.values(days).includes(day)) days[i] = day; return; }
      const k = colKind(c);
      if (k && idx[k] === undefined) idx[k] = i;
    });
    const named = idx.name !== undefined || idx.first !== undefined || idx.last !== undefined;
    if (named && Object.keys(days).length >= 2) return { row: r, idx, days, grid: true };
    if (named && idx.date !== undefined) return { row: r, idx, grid: false };
  }
  return null;
}

// ---------- valeurs ----------
const WEEKDAYS = [['lundi', 'lun', 'monday', 'mon'], ['mardi', 'mar', 'tuesday', 'tue', 'tues'], ['mercredi', 'mer', 'wednesday', 'wed'],
  ['jeudi', 'jeu', 'thursday', 'thu', 'thur', 'thurs'], ['vendredi', 'ven', 'friday', 'fri'], ['samedi', 'sam', 'saturday', 'sat'], ['dimanche', 'dim', 'sunday', 'sun']];
function isoDate(y, mo, d) {
  const out = String(y) + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const t = Date.parse(out + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === out ? out : null;
}
// Date lue : AAAA-MM-JJ, JJ/MM/AAAA (MM/JJ si JJ/MM est impossible), numéro de série Excel ; sinon nom du jour en tête.
// Renvoie { day } dans la semaine affichée, { other: true } pour une autre semaine, null si illisible.
function dayOf(v, weekStart) {
  const days = gen.weekDays(weekStart), s = String(v == null ? '' : v).trim();
  if (!s) return null;
  let date = null, m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s))) date = isoDate(+m[1], +m[2], +m[3]);
  else if ((m = /(?:^|\s)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s|$)/.exec(s))) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    date = isoDate(+m[3], mo, d);
  } else if (/^\d{5}(\.\d+)?$/.test(s) && +s > 30000 && +s < 80000) date = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000).toISOString().slice(0, 10);
  if (date) return days.includes(date) ? { day: date, date } : { other: true, date };
  const first = words(s).split(' ')[0];
  const i = WEEKDAYS.findIndex((names) => names.includes(first));
  return i >= 0 ? { day: days[i] } : null;
}
// Heure : 24 h, AM/PM, « 17h30 », fraction de jour d'un tableur (0,6875 = 16:30) ; une date en tête est ignorée.
function timeOf(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  if (/^0?[.,]\d+$/.test(s)) { const min = Math.round(parseFloat(s.replace(',', '.')) * 1440); return min < 1440 ? String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') : null; }
  const direct = h.normTime(s);
  if (direct) return direct;
  const m = /(\d{1,2}(?:[:h.]\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?|\d{1,2}h)\s*$/i.exec(s.replace(/\b([ap])\.m\.?/gi, '$1m'));
  return m && /[:h]|[ap]m/i.test(m[1]) ? h.normTime(m[1]) : null;
}
// Plages d'une cellule : « 16:00-23:00 », « 4 PM - 11 PM », « 16h à 23h », plusieurs séparées par , / ; « et ». Plage après minuit : fin 23:59.
function rangesOf(v) {
  const s = String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b([ap])\.m\.?/g, '$1m');
  if (/toute la journee|journee complete|all day|full day/.test(s)) return [['00:00', '23:59']];
  const out = [];
  for (const part of s.split(/\s*(?:[,;/\n]|\bet\b|\band\b)\s*/i)) {
    if (!part.trim()) continue;
    const m = /^(.+?)\s*(?:-|–|—|\ba\b|\bto\b|\bau\b)\s*(.+)$/i.exec(part.trim());
    if (!m) return null;
    const a = timeOf(m[1]), b = timeOf(m[2]);
    if (!a || !b || a === b) return null;
    out.push([a, b <= a ? '23:59' : b]);
  }
  return out.length ? out : null;
}
const TIMEOFF = /\b(vacances?|vacations?|conges?|holidays?|feries?|pto|time ?off|leaves?|absences?|absent|maladie|sick)\b/;
const NOT_AVAILABLE = /^(-+|x|off|repos|ferme|indisponible|non disponible|pas disponible|unavailable|not available|n ?a|aucune?|none)$/;
const REFUSED = /\b(refuse|refusee|rejete|rejetee|rejected|denied|declined|en attente|pending|annule|annulee|cancell?ed|soumis|submitted)\b/;
// « Nom, Prénom » -> « Prénom Nom » ; matricule entre parenthèses et numéros retirés.
function nameOf(v) {
  let s = String(v == null ? '' : v).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b\d{3,}\b/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^([^,]+),\s*([^,]+)$/.exec(s);
  if (m) s = m[2].trim() + ' ' + m[1].trim();
  return /\p{L}/u.test(s) ? s.replace(/[;\n]/g, ' ').slice(0, h.LIMITS.name) : '';
}

// ---------- conversion ----------
// rows : tableaux de cellules (fileRows). Rend { text, employees, lines, ignored, otherWeek }.
function convert(rows, weekStart) {
  const out = [], seen = new Set(), names = new Set();
  let ignored = 0, otherWeek = 0;
  const push = (name, day, start, end, type) => {
    const line = [name, day, start || '', end || '', type || ''].join(';');
    if (!seen.has(line)) { seen.add(line); out.push(line); }
    names.add(name);
  };
  const hd = findHeader(rows, weekStart);
  const idx = hd ? hd.idx : { name: 0, date: 1, start: 2, end: 3, type: 4 }; // sans en-tête : déjà au format nom;jour;début;fin;type
  const nameAt = (cells) => {
    const full = [idx.first, idx.name, idx.last].filter((i) => i !== undefined && cells[i]).map((i) => String(cells[i]).trim());
    return nameOf(idx.first !== undefined || idx.last !== undefined ? full.join(' ') : cells[idx.name]);
  };
  const headKey = hd ? (rows[hd.row] || []).map(fold).join('|') : null;
  let current = '';
  rows.slice(hd ? hd.row + 1 : 0).forEach((cells) => {
    if (!cells || !cells.some((c) => String(c).trim())) return;
    if (headKey && cells.map(fold).join('|') === headKey) return; // en-tête répétée (rapport sur plusieurs pages)
    let name = nameAt(cells);
    if (hd && hd.grid) {
      if (!name) { ignored++; return; }
      let bad = false;
      for (const [i, day] of Object.entries(hd.days)) {
        const v = String(cells[i] == null ? '' : cells[i]).trim(), f = words(v);
        if (!v || NOT_AVAILABLE.test(f)) continue;
        if (TIMEOFF.test(f)) { push(name, day, '', '', 'vacances'); continue; }
        const r = rangesOf(v);
        if (r) r.forEach(([a, b]) => push(name, day, a, b, '')); else bad = true;
      }
      if (bad) ignored++;
      return;
    }
    const filled = cells.filter((c) => String(c).trim());
    const day = dayOf(cells[idx.date], weekStart);
    // Rapport groupé par employé : une ligne avec le seul nom, puis ses lignes sans nom.
    if (!day && filled.length === 1 && hd && nameOf(filled[0])) { current = nameOf(filled[0]); return; }
    if (name) current = name; else name = current;
    if (!name || !day) { ignored++; return; }
    const status = idx.status !== undefined ? fold(cells[idx.status]) : '';
    const type = idx.type !== undefined ? words(cells[idx.type]) : '';
    if (status && REFUSED.test(status)) { ignored++; return; }
    if (type && NOT_AVAILABLE.test(type)) return;
    const st = idx.start !== undefined ? String(cells[idx.start] || '').trim() : '';
    const en = idx.end !== undefined ? String(cells[idx.end] || '').trim() : '';
    // Congé sur plusieurs jours (colonnes « Date de début » et « Date de fin ») : chaque jour de la semaine affichée compris dedans.
    const last = idx.dateEnd !== undefined ? dayOf(cells[idx.dateEnd], weekStart) : null;
    if (last && last.date && day.date && (TIMEOFF.test(type) || (!type && !st && !en))) {
      const inWeek = gen.weekDays(weekStart).filter((d) => d >= day.date && d <= last.date);
      if (!inWeek.length) { otherWeek++; return; }
      inWeek.forEach((d) => push(name, d, '', '', 'vacances'));
      return;
    }
    if (day.other) { otherWeek++; return; }
    if (type && TIMEOFF.test(type)) { push(name, day.day, '', '', 'vacances'); return; }
    let r = null;
    if (st && en) { const a = timeOf(st), b = timeOf(en); if (a && b && a !== b) r = [[a, b <= a ? '23:59' : b]]; }
    else if (st) r = rangesOf(st);
    if (!r && idx.range !== undefined) {
      const v = String(cells[idx.range] || '').trim(), f = words(v);
      if (TIMEOFF.test(f)) { push(name, day.day, '', '', 'vacances'); return; }
      if (NOT_AVAILABLE.test(f)) return;
      r = rangesOf(v);
    }
    if (!r) { ignored++; return; }
    r.forEach(([a, b]) => push(name, day.day, a, b, ''));
  });
  return { text: out.length ? [HEAD].concat(out).join('\n') : '', employees: names.size, lines: out.length, ignored, otherWeek };
}

// Fichier joint { fileName, mimeType, dataUrl } -> bloc de la semaine. Erreurs de format : statusCode 400 (./horaire-import.js).
async function fromFile(att, weekStart) {
  return convert(await imp.fileRows(att), weekStart);
}

module.exports = { fromFile, convert, rangesOf, timeOf, dayOf, nameOf };
