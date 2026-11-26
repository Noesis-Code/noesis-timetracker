// Base de durées des objectifs courants (version 1, 4 nov. 2026) : propose une date butoir SANS IA, à coût nul.
// Méthode (docs/ia/objectifs-durees.md) :
//  (a) table de référence ci-dessous : médiane et fourchette P10–P90 en SEMAINES, reconnaissance par mots-clés FR/EN ;
//      l'ordre de grandeur annoncé (« 4 livres », « 15 kg ») recalcule la médiane quand l'entrée a une unité (perUnit) ;
//  (b) apprentissage : durées réelles et anonymes (aucun identifiant ni texte) des objectifs ATTEINTS, par catégorie ;
//      dès MIN_SAMPLE (30) objectifs atteints, elles remplacent la table pour cette catégorie ;
//  (c) personnalisation : facteur propre à l'utilisateur = médiane de (durée réelle / durée prévue) de ses objectifs passés
//      (atteints, ou échéance dépassée), borné à 0,6–2 ; sans historique : médiane de la table, facteur 1.
// Cible mesurable (pas une promesse) : que la durée réelle tienne dans la fourchette proposée ~95 % du temps ;
// suivi : écart entre la durée réelle des objectifs atteints et la fourchette qui avait été proposée.
// Si aucune catégorie n'est reconnue : on garde la durée saisie par l'utilisateur, sans rien inventer.
const MIN_SAMPLE = 30;
const VERSION = 1;

// id, libellé, mots-clés (minuscules, sans accents), médiane/p10/p90 en semaines, perUnit : nombre annoncé devant une unité.
const TABLE = [
  { id: 'marathon', label: 'marathon', kw: ['marathon'], neg: ['semi'], median: 24, p10: 16, p90: 40 },
  { id: 'semi', label: 'semi-marathon', kw: ['semi-marathon', 'semi marathon', 'half marathon', ' semi '], median: 16, p10: 10, p90: 28 },
  { id: 'course10k', label: 'course de 10 km', kw: ['10 km', '10km', '10k'], median: 10, p10: 6, p90: 18 },
  { id: 'course5k', label: 'course de 5 km', kw: [' 5 km', ' 5km', ' 5k'], median: 8, p10: 4, p90: 14 },
  { id: 'course', label: 'course à pied', kw: ['course a pied', 'courir', 'running', 'jogging'], median: 12, p10: 6, p90: 24 },
  { id: 'lecture', label: 'lecture', kw: ['livre', 'lire ', 'roman', 'lecture', 'book', 'read '], median: 4, p10: 2, p90: 10, perUnit: { re: /(\d+)\s*(?:livres?|romans?|books?)/, per: 3, min: 1, max: 156 } },
  { id: 'langue', label: 'apprentissage d’une langue', kw: ['apprendre l', 'langue', 'anglais', 'espagnol', 'allemand', 'italien', 'japonais', 'mandarin', 'portugais', 'learn spanish', 'learn english', 'learn french', 'duolingo', 'bilingue'], median: 40, p10: 20, p90: 90 },
  { id: 'permis', label: 'permis de conduire', kw: ['permis'], median: 20, p10: 10, p90: 40 },
  { id: 'poids', label: 'perte de poids', kw: ['perdre', 'perte de poids', 'maigrir', 'lose weight', 'weight loss', 'kilos', ' kg'], median: 16, p10: 8, p90: 40, perUnit: { re: /(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?)/, per: 2, min: 2, max: 104 } },
  { id: 'epargne', label: 'épargne', kw: ['epargne', 'economiser', 'economies', 'mettre de cote', 'save money', 'savings', 'fonds d urgence', 'mise de fonds'], median: 52, p10: 26, p90: 130 },
  { id: 'projet', label: 'projet professionnel', kw: ['lancer mon', 'lancer ma', 'lancer l', 'creer mon entreprise', 'startup', 'site web', 'application', 'portfolio', 'business', 'entreprise', 'offre payante', 'projet pro', 'launch'], median: 26, p10: 12, p90: 60 },
  { id: 'etude', label: 'étude / examen', kw: ['examen', 'etudier', 'reviser', 'certification', 'diplome', 'concours', 'exam', 'study', 'certificat'], median: 12, p10: 6, p90: 30 },
  { id: 'muscu', label: 'musculation / forme', kw: ['musculation', 'muscle', 'gym', 'pompes', 'tractions', 'abdos', 'souplesse', 'yoga', 'remise en forme', 'fitness', 'bench', 'squat'], median: 12, p10: 6, p90: 26 },
  { id: 'instrument', label: 'instrument de musique', kw: ['guitare', 'piano', 'violon', 'batterie', 'ukulele', 'chanter', 'instrument'], median: 40, p10: 20, p90: 90 },
];

// Objectifs à DATE IMPOSÉE : on n'estime pas, l'utilisateur donne la date.
const FIXED = ['examen', 'permis', 'concours', 'mariage', 'soutenance', 'voyage', 'rendez-vous', 'rendez vous', 'naissance', 'bebe', 'demenagement', 'entrevue', 'audience', 'deadline', 'echeance', 'wedding', 'exam', 'interview', 'appointment', 'flight', 'remise du', 'remise de'];
const MONTHS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

const fold = (s) => ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ') + ' ';
const pad = (n) => String(n).padStart(2, '0');

// Date écrite dans le texte (« le 15 mars », « 15 mars 2027 », « 2027-03-15 ») : prochaine occurrence après `today`.
function explicitDate(text, today) {
  const t = fold(text), iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso && iso[0] > today) return iso[0];
  const m = /\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/.exec(t);
  if (!m) return null;
  const day = Number(m[1]), mon = MONTHS[m[2]];
  let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (day < 1 || day > 31) return null;
  let d = y + '-' + pad(mon) + '-' + pad(day);
  if (d <= today && !m[3]) { y += 1; d = y + '-' + pad(mon) + '-' + pad(day); }
  if (new Date(d + 'T00:00:00Z').getUTCDate() !== day || d <= today) return null;
  return d;
}
function isFixedDate(text, today) {
  const t = fold(text);
  return !!explicitDate(text, today || '0000-00-00') || FIXED.some((k) => t.includes(k));
}

// Premier mot-clé reconnu dans l ordre de la table (le plus précis d abord : marathon, semi, 10 km… avant course à pied).
function match(text) {
  const t = fold(text);
  for (const e of TABLE) {
    if (e.neg && e.neg.some((n) => t.includes(n))) continue;
    if (e.kw.some((k) => t.includes(k))) return e;
  }
  return null;
}

function median(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : null; }

// opts.learned : { [categorie]: [durées réelles en semaines, anonymes] } ; opts.ratios : facteurs réels/prévus de l'utilisateur
function estimate(text, opts) {
  opts = opts || {};
  const e = match(text);
  if (!e) return null;
  let med = e.median, p10 = e.p10, p90 = e.p90, source = 'table';
  const t = fold(text);
  if (e.perUnit) {
    const m = e.perUnit.re.exec(t);
    if (m) { const n = Number(String(m[1]).replace(',', '.')); const w = Math.max(e.perUnit.min, Math.min(e.perUnit.max, Math.round(n * e.perUnit.per))); med = w; p10 = Math.max(1, Math.round(w * 0.55)); p90 = Math.round(w * 1.9); }
  }
  const sample = opts.learned && opts.learned[e.id];
  if (sample && sample.length >= MIN_SAMPLE && !e.perUnit) { med = median(sample); p10 = pct(sample, 0.1); p90 = pct(sample, 0.9); source = 'appris'; }
  const ratios = opts.ratios || [];
  const factor = ratios.length ? Math.max(0.6, Math.min(2, median(ratios))) : 1;
  const r = (x) => Math.max(1, Math.round(x * factor));
  return { id: e.id, label: e.label, source, weeks: r(med), p10: r(p10), p90: r(p90), factor: Math.round(factor * 100) / 100, typicalWeeks: Math.round(med) };
}

// Signaux anonymes (une ligne par objectif atteint) -> durées réelles par catégorie (celles qui remplacent la table dès MIN_SAMPLE).
// Les 4 signaux enregistrés : durée réelle vs prévue (actualWeeks, plannedWeeks), date corrigée par l'utilisateur (dateCorrectedDays),
// heures Chrono par semaine (chronoHoursPerWeek), tâches faites par semaine (tasksDonePerWeek). Seule la durée réelle sert aujourd'hui à la proposition.
function learnedFromSignals(rows) {
  const out = {};
  (rows || []).forEach((r) => { if (r && r.cat && r.actualWeeks > 0) (out[r.cat] = out[r.cat] || []).push(r.actualWeeks); });
  return out;
}

module.exports = { learnedFromSignals, TABLE, FIXED, MIN_SAMPLE, VERSION, match, estimate, isFixedDate, explicitDate, median, pct };
