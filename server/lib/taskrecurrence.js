// Tâches récurrentes (9 oct. 2026, demande d'Émilien) : « tous les N jours/semaines/mois », libre.
// Une seule occurrence ouverte à la fois : quand elle est cochée, la suivante est créée (même texte, même
// rangement, même responsable) à la date précédente + l'intervalle. « Arrêter la récurrence » = retirer l'intervalle.
const db = require('../db');

const UNITS = ['day', 'week', 'month'];
const MAX_EVERY = 365;

function ensureColumns() {
  const cols = db.prepare('PRAGMA table_info(sub_project_items)').all().map((c) => c.name);
  if (!cols.includes('recurEvery')) db.exec('ALTER TABLE sub_project_items ADD COLUMN recurEvery INTEGER');
  if (!cols.includes('recurUnit')) db.exec('ALTER TABLE sub_project_items ADD COLUMN recurUnit TEXT');
}
ensureColumns();

// { every, unit } valide, ou null (= pas de récurrence). Lève une erreur 400 si la valeur est incohérente.
function normalize(rec) {
  if (rec === null || rec === undefined || rec === false || rec === '') return null;
  const every = Math.floor(Number(rec.every));
  const unit = String(rec.unit || '');
  if (!UNITS.includes(unit) || !(every >= 1) || every > MAX_EVERY) {
    throw Object.assign(new Error('Récurrence invalide.'), { statusCode: 400 });
  }
  return { every, unit };
}

function pad(n) { return String(n).padStart(2, '0'); }

// Date AAAA-MM-JJ + intervalle (calcul calendaire local, fin de mois ramenée au dernier jour).
function addInterval(iso, every, unit) {
  const [y, m, d] = iso.split('-').map(Number);
  if (unit === 'month') {
    const total = (m - 1) + every;
    const ny = y + Math.floor(total / 12);
    const nm = ((total % 12) + 12) % 12;
    const last = new Date(ny, nm + 1, 0).getDate();
    return ny + '-' + pad(nm + 1) + '-' + pad(Math.min(d, last));
  }
  const dt = new Date(y, m - 1, d + every * (unit === 'week' ? 7 : 1));
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
}

// Prochaine échéance : base + intervalle, répété tant qu'elle est dans le passé (on ne recrée pas du retard).
function nextDueDate(baseIso, every, unit, todayIso) {
  let next = addInterval(baseIso, every, unit);
  for (let i = 0; i < 800 && next < todayIso; i += 1) next = addInterval(next, every, unit);
  return next;
}

const WORD = '(?:r[ée]current(?:e|s|es)?)';
const NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10 };

// Texte libre (mode Autonome) : la récurrence n'est créée QUE si le mot « récurrente » est écrit.
// Retourne { label (sans le mot ni la fréquence), every, unit } ou null. Sans fréquence : chaque semaine.
function parseExplicit(text) {
  let label = String(text || '');
  if (!new RegExp('\\b' + WORD + '\\b', 'i').test(label)) return null;
  let every = 1; let unit = 'week';
  const patterns = [
    [/\b(?:tous|toutes|chaque)\s+les\s+(\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix)\s+(jours?|semaines?|mois)\b/i, 'n'],
    [/\b(?:tous\s+les\s+jours|chaque\s+jour|quotidien(?:ne)?s?)\b/i, 'day'],
    [/\b(?:toutes\s+les\s+semaines|chaque\s+semaine|hebdomadaires?)\b/i, 'week'],
    [/\b(?:tous\s+les\s+mois|chaque\s+mois|mensuel(?:le)?s?)\b/i, 'month'],
    [/\b(?:tous\s+les\s+ans|chaque\s+ann[ée]e|annuel(?:le)?s?)\b/i, 'year'],
  ];
  for (const [re, kind] of patterns) {
    const m = label.match(re);
    if (!m) continue;
    if (kind === 'n') {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[m[1].toLowerCase()];
      every = Math.min(MAX_EVERY, Math.max(1, n || 1));
      unit = /^jour/i.test(m[2]) ? 'day' : /^semaine/i.test(m[2]) ? 'week' : 'month';
    } else if (kind === 'year') { every = 12; unit = 'month'; } else { every = 1; unit = kind; }
    label = label.replace(re, ' ');
    break;
  }
  label = label.replace(new RegExp('\\b' + WORD + '\\b', 'ig'), ' ').replace(/\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '').trim();
  return { label, every, unit };
}

// Mode Partiel : Noèsis PROPOSE (jamais n'impose). Mot explicite d'abord, sinon avis du modèle ; null si doute/panne.
async function suggest(label) {
  const explicit = parseExplicit(label);
  if (explicit) return { every: explicit.every, unit: explicit.unit, label: explicit.label };
  const classify = require('./goalstaskclassify');
  if (!classify.configured()) return null;
  try {
    const text = await classify.callModel(
      'Cette tâche est-elle de nature récurrente (à refaire régulièrement, ex. « payer le loyer », « faire la paie ») ? '
      + 'Réponds UNIQUEMENT par un JSON {"every":nombre,"unit":"day"|"week"|"month"} si oui et si la fréquence est évidente, sinon par le mot NON.\n'
      + 'Tâche : ' + String(label).slice(0, 300), 60);
    const m = String(text || '').match(/\{[^}]*\}/);
    if (!m) return null;
    return normalize(JSON.parse(m[0]));
  } catch (e) { return null; }
}

module.exports = { UNITS, normalize, addInterval, nextDueDate, parseExplicit, suggest };
