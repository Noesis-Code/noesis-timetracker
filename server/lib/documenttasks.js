// « Ajouter des tâches » depuis un document (Essor, 15 oct. 2026).
// L'utilisateur joint un document et écrit une consigne ; l'IA PROPOSE une liste de tâches
// (titre, secteur/pôle, jour cible, durée estimée). Rien n'est écrit avant `apply`, qui
// n'écrit QUE les tâches cochées par l'utilisateur, via goalstasks.addCategoryTask (même
// logique que l'existant : recalcul/auto-planification déclenchés par addCategoryTask).
//
// Garde-fous : le contenu du document est une DONNÉE (le prompt système le dit, il est
// délimité) ; texte envoyé limité ; limite de débit 10 appels/heure/utilisateur ; aucun
// contenu de document journalisé ni stocké ; la réponse de l'IA est revalidée (clé de
// catégorie, semaine, durée) ; aucune cible d'objectif (manual ou non) n'est touchée ;
// une LISTE de tâches, jamais d'horaire à créneaux. Prompt en cache Anthropic (aicache.js : système + partie stable). La durée estimée sert à signaler un
// dépassement de la capacité hebdo ; elle n'est pas stockée (une tâche n'a pas de durée).
const aibudget = require('./aibudget');
const docanalysis = require('./docanalysis');
const changeproposals = require('./changeproposals');
const zlib = require('zlib');
const db = require('../db');
const goals = require('./goals');
const goalstasks = require('./goalstasks');
const classify = require('./goalstaskclassify');
const weekplanner = require('./weekplanner');
const { MAX_ATTACHMENTS_PER_NOTE, validateAttachmentPayload } = require('./attachments');

const MAX_DOC_CHARS = 24000;
const MAX_INSTRUCTION = 1500;
const MAX_TASKS = 80;
const MAX_WEEKS = 260;      // plafond technique de lundis (≈ 5 ans), pour borner la taille du prompt sans couper les années créées
const MAX_OBJECTIVES = 200; // objectifs hebdomadaires listés dans le prompt (les plus proches d'abord)
const MAX_PERIOD_GOALS = 120; // objectifs périodiques listés dans le prompt (les plus proches d'abord)
const DEFAULT_WORK_DAYS = 7; // nombre de jours travaillés par semaine (la capacité hebdo est mesurée week-ends inclus) ; un réglage futur pourra le remplacer
const WORK_DAYS = [1, 2, 3, 4, 5, 6, 0].slice(0, DEFAULT_WORK_DAYS); // getUTCDay : lundi d'abord
const DEFAULT_TASK_MINUTES = 30;   // durée d'une tâche sans estimation (acceptée ou proposée sans durée)
const LOAD_WEEKS_IN_PROMPT = 12;   // semaines proches dont la charge déjà acceptée est donnée à l'IA
const RATE_MAX = 10, RATE_WINDOW = 60 * 60 * 1000;

const rate = new Map();

function httpError(status, message) { return Object.assign(new Error(message), { statusCode: status }); }
function setCaller(fn) { docanalysis.setCaller(fn); } // appelant injectable (tests), partagé avec changeproposals
function resetRate() { rate.clear(); }

function takeRateSlot(userId) {
  const now = Date.now();
  const l = (rate.get(userId) || []).filter((t) => now - t < RATE_WINDOW);
  if (l.length >= RATE_MAX) { rate.set(userId, l); return false; }
  l.push(now); rate.set(userId, l);
  return true;
}

function todayIso() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// ---------- Extraction de texte (sans dépendance) ----------
function dataBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma), body = dataUrl.slice(comma + 1);
  return /;base64/i.test(head) ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
}

function unzipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let off = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let k = 0; k < n && off + 46 <= buf.length && buf.readUInt32LE(off) === 0x02014b50; k++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), comLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (name === wanted) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      return method === 0 ? data : zlib.inflateRawSync(data, { maxOutputLength: 30 * 1024 * 1024 });
    }
    off += 46 + nameLen + extraLen + comLen;
  }
  return null;
}

function docxText(buf) {
  let xml;
  try { xml = unzipEntry(buf, 'word/document.xml'); } catch (e) { return null; }
  if (!xml) return null;
  const s = xml.toString('utf8')
    .replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return s;
}

// PDF texte uniquement (unpdf, pdf.js sans dépendance native). Le contenu reste une donnée.
const MAX_PDF_PAGES = 40;
let unpdfMod = null;
async function pdfText(buf, fileName) {
  const label = `« ${fileName} »`;
  let pdf;
  try {
    unpdfMod = unpdfMod || require('unpdf');
    pdf = await unpdfMod.getDocumentProxy(new Uint8Array(buf));
  } catch (e) {
    const protectedPdf = e && (e.name === 'PasswordException' || /password/i.test(String(e.message)));
    return { unsupported: protectedPdf ? `PDF protégé par mot de passe (${label}).` : `PDF illisible ou corrompu (${label}).` };
  }
  try {
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const out = [];
    let len = 0;
    for (let i = 1; i <= pages && len <= MAX_DOC_CHARS; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const line = tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join(' ').replace(/[ \t]+/g, ' ').trim();
      if (line) { out.push(line); len += line.length; }
    }
    const text = out.join('\n\n');
    if (!text.trim()) return { unsupported: `PDF sans texte lisible (scan) (${label}).` };
    return { text: text.slice(0, MAX_DOC_CHARS) };
  } catch (e) {
    return { unsupported: `PDF illisible ou corrompu (${label}).` };
  } finally {
    try { await pdf.destroy(); } catch (e) { /* ignore */ }
  }
}

// Renvoie { text } ou { unsupported: 'message' }.
async function textFromFile(att) {
  const v = validateAttachmentPayload(att || {});
  if (v.error) throw httpError(400, v.error);
  const name = v.fileName.toLowerCase();
  const buf = dataBuffer(v.dataUrl);
  if (/\.docx$/.test(name)) {
    const t = docxText(buf);
    return t == null ? { unsupported: `Impossible de lire « ${v.fileName} » (fichier .docx illisible).` } : { text: t };
  }
  if (/\.pdf$/.test(name) || v.mimeType === 'application/pdf') {
    return pdfText(buf, v.fileName);
  }
  if (/\.(txt|md|markdown|csv)$/.test(name) || /^text\//.test(v.mimeType) || v.mimeType === 'application/json') return { text: buf.toString('utf8') };
  return { unsupported: `Format non pris en charge (« ${v.fileName} »). Formats lus : .txt, .md, .csv, .docx, .pdf (texte).` };
}

async function documentText(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > MAX_ATTACHMENTS_PER_NOTE) throw httpError(400, `${MAX_ATTACHMENTS_PER_NOTE} fichiers maximum.`);
  const parts = [], notes = [];
  for (const f of list) {
    const r = await textFromFile(f);
    if (r.unsupported) notes.push(r.unsupported);
    else if (r.text.trim()) parts.push(r.text.trim());
  }
  if (list.length && !parts.length) throw httpError(400, notes[0] || 'Aucun texte lisible dans les fichiers joints.');
  let text = parts.join('\n\n----\n\n');
  const truncated = text.length > MAX_DOC_CHARS;
  if (truncated) text = text.slice(0, MAX_DOC_CHARS);
  return { text, truncated, notes };
}

// ---------- Contexte ----------
// Horizon (17 oct. 2026) : tous les lundis de la semaine courante jusqu'à la dernière semaine de la dernière année
// créée de CETTE activité (même borne que le défilement des périodes). Sans année au-delà : ce qui existe, au minimum la semaine courante.
function weeksContext(activityId) {
  const monday = goals.mostRecentMonday(todayIso());
  let lastMonday = monday;
  try {
    const maxYear = goals.maxYearFor(activityId);
    lastMonday = goals.addDays(goals.yearAnchor(maxYear), 51 * 7); // 13 périodes x 4 semaines = 52 semaines
  } catch (e) { /* activité inconnue : semaine courante seulement */ }
  const out = [];
  for (let d = monday; d && d <= lastMonday && out.length < MAX_WEEKS; d = goals.addDays(d, 7)) out.push(d);
  return out.length ? out : [monday];
}

// Données de l'application (16 oct. 2026, Émilien) : objectifs hebdomadaires à venir et tâches ouvertes de CETTE activité.
// Sans document joint, l'IA s'appuie sur elles ; avec un document, elles s'ajoutent comme ressources.
function appData(activityId, weeks) {
  const monday = weeks[0], end = goals.addDays(weeks[weeks.length - 1], 6);
  let objectives = [], open = [];
  try {
    objectives = db.prepare(`SELECT w.text, w.description, w.estimateMinutes, w.weekIndex, p.startDate, p.category AS cat
      FROM goal_weekly w JOIN goal_periods p ON p.id = w.periodId
      WHERE p.activityId = ? AND w.carriedOverFromId IS NULL AND w.text != ''`).all(activityId)
      .map((w) => ({ ...w, week: goals.addDays(w.startDate, (w.weekIndex - 1) * 7) }))
      .filter((w) => w.week >= monday && w.week <= end)
      .sort((a, b) => a.week.localeCompare(b.week)).slice(0, MAX_OBJECTIVES);
    open = db.prepare(`SELECT i.label, i.dueDate, sp.goalCategory AS cat FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
      WHERE sp.activityId = ? AND i.done = 0 ORDER BY i.dueDate, i.id LIMIT 80`).all(activityId);
  } catch (e) { /* données absentes : l'IA répond avec la consigne seule */ }
  // Hiérarchie (17 oct. 2026) : objectif ANNUEL par catégorie (années de l'horizon) puis objectif PÉRIODIQUE (grand objectif des périodes de l'horizon).
  let yearGoals = [], periodGoals = [];
  try {
    for (let y = Number(monday.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
      const g = goals.getYearGoals(activityId, y);
      Object.keys(g).forEach((cat) => { if (String(g[cat] || '').trim()) yearGoals.push({ year: y, cat, text: g[cat] }); });
    }
    periodGoals = db.prepare(`SELECT category AS cat, startDate, endDate, mainGoalText AS text FROM goal_periods
      WHERE activityId = ? AND mainGoalText != '' AND endDate >= ? AND startDate <= ? ORDER BY startDate, category LIMIT ?`).all(activityId, monday, end, MAX_PERIOD_GOALS);
  } catch (e) { /* objectifs annuels/périodiques absents */ }
  return { objectives, open, yearGoals, periodGoals };
}

// Tâches ACCEPTÉES (ouvertes, avec échéance dans l'horizon) : charge par jour en minutes. Aucune colonne d'estimation n'existe sur
// sub_project_items : durée par défaut DEFAULT_TASK_MINUTES. Toutes les activités de la personne (sa capacité est globale), tâches
// non assignées à quelqu'un d'autre.
function acceptedLoadByDay(userId, weeks) {
  const out = {};
  try {
    const from = weeks[0], to = goals.addDays(weeks[weeks.length - 1], 6);
    db.prepare(`SELECT i.dueDate AS d FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
      WHERE i.done = 0 AND i.dueDate >= ? AND i.dueDate <= ? AND (i.plannedUserId IS NULL OR i.plannedUserId = ?)
      AND sp.activityId IN (SELECT activityId FROM activity_members WHERE userId = ?)`).all(from, to, userId, userId)
      .forEach((r) => { const d = String(r.d || '').slice(0, 10); if (isRealDate(d)) out[d] = (out[d] || 0) + DEFAULT_TASK_MINUTES; });
  } catch (e) { /* aucune charge connue */ }
  return out;
}

function buildContext(userId, activityId) {
  const candidates = classify.buildClassificationCandidates(activityId);
  const cap = weekplanner.getWeeklyCapacity(userId);
  const weeks = weeksContext(activityId);
  const capacityMinutes = cap && cap.minutes ? cap.minutes : null;
  return { candidates, weeks, capacityMinutes, dayCapacityMinutes: capacityMinutes ? Math.round(capacityMinutes / WORK_DAYS.length) : null,
    loadByDay: acceptedLoadByDay(userId, weeks), today: todayIso(), app: appData(activityId, weeks) };
}

const SYSTEM = docanalysis.SYSTEM; // prompt commun aux tâches et aux modifications proposées (docanalysis.js)

// Lundis groupés par année : « 2026: 10-19 10-26 … 2027: 01-04 … » (moins de caractères que des dates complètes).
function weeksCompact(weeks) {
  const by = new Map();
  weeks.forEach((w) => { const y = w.slice(0, 4); if (!by.has(y)) by.set(y, []); by.get(y).push(w.slice(5)); });
  return [...by].map(([y, l]) => y + ': ' + l.join(' ')).join(' ; ');
}

function appBlock(app, loadByDay, loadLimit) {
  const clean = (t, n) => docanalysis.tagsOut(t || '').replace(/\s+/g, ' ').trim().slice(0, n || 300);
  const a = app || { objectives: [], open: [] };
  const obj = a.objectives.map((o) => `${o.week} [${o.cat}] ${clean(o.text, 160)}${o.description ? ' — ' + clean(o.description, 100) : ''}${o.estimateMinutes ? ' (' + o.estimateMinutes + 'm)' : ''}`).join('\n') || '(aucun)';
  const open = a.open.map((t) => `- [${t.cat}] ${clean(t.label)}${t.dueDate ? ' (' + t.dueDate + ')' : ''}`).join('\n') || '(aucune)';
  const yg = (a.yearGoals || []).map((g) => `${g.year} [${g.cat}] ${clean(g.text, 200)}`).join('\n') || '(aucun)';
  const pg = (a.periodGoals || []).map((g) => `${g.startDate.slice(5)}→${g.endDate.slice(5)} [${g.cat}] ${clean(g.text, 120)}`).join('\n') || '(aucun)';
  const lines = [];
  if (loadByDay) Object.keys(loadByDay).sort().filter((d) => d <= loadLimit).forEach((d) => lines.push(d.slice(5) + ':' + loadByDay[d]));
  const load = lines.join(' ') || '(aucune)';
  return 'Objectifs ANNUELS (année [catégorie] objectif) :\n' + yg + '\n\nObjectifs PÉRIODIQUES (début→fin de la période de 4 semaines [catégorie] grand objectif) :\n' + pg
    + '\n\nObjectifs hebdomadaires à venir (lundi de la semaine [catégorie] objectif (durée estimée en minutes)) :\n' + obj
    + '\n\nCharge DÉJÀ acceptée par jour (MM-JJ:minutes ; les jours absents sont libres) : ' + load
    + '\n\nTâches déjà ouvertes (ne pas les reproposer) :\n' + open;
}

// Deux parties : STABLE (catégories, semaines, capacité, application : mises en cache) puis VARIABLE (consigne, document).
function buildUserParts(ctx, instruction, doc) {
  const cats = docanalysis.tagsOut(ctx.candidates.map((c) => `- ${c.key} : ${c.label}${c.description ? ' — ' + c.description : ''}`).join('\n'));
  const safeDoc = docanalysis.tagsOut(doc);
  const safeInstr = docanalysis.tagsOut(instruction);
  const stable = [
    'Catégories disponibles (clé : libellé) :', cats, '',
    'Semaines de l\'horizon (lundis, AAAA : MM-JJ ; le jour proposé est un jour de ces semaines, jamais avant ' + (ctx.today || todayIso()) + ') : ' + weeksCompact(ctx.weeks),
    ctx.capacityMinutes ? `Capacité hebdomadaire de la personne : ${ctx.capacityMinutes} minutes, soit ${Math.round(ctx.capacityMinutes / WORK_DAYS.length)} minutes par jour travaillé (évite de les dépasser).` : 'Capacité : inconnue.',
    '', '<application>', appBlock(ctx.app, ctx.loadByDay, ctx.weeks.length ? goals.addDays(ctx.weeks[Math.min(ctx.weeks.length, LOAD_WEEKS_IN_PROMPT) - 1], 6) : ''), '</application>',
  ].join('\n');
  const variable = ['<consigne>', safeInstr, '</consigne>', '', '<document>', safeDoc, '</document>'].join('\n');
  return { stable, variable };
}

function buildUser(ctx, instruction, doc) {
  const p = buildUserParts(ctx, instruction, doc);
  return p.stable + '\n\n' + p.variable;
}

// Récupère les éléments tâche COMPLETS (objet {…} ancien format, ou tableau […] format court) d'un JSON coupé (réponse tronquée à max_tokens).
function salvageTaskObjects(text) {
  const str = String(text || '');
  const k = str.search(/"(?:tasks|t)"\s*:\s*\[/);
  if (k < 0) return null;
  let i = str.indexOf('[', k) + 1;
  const out = [];
  let depth = 0, inStr = false, esc = false, start = -1;
  for (; i < str.length; i++) {
    const c = str[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') { if (depth === 0) start = i; depth++; }
    else if (c === '}' || c === ']') {
      if (depth === 0) break; // fin de la liste
      depth--;
      if (depth === 0 && start >= 0) { try { out.push(JSON.parse(str.slice(start, i + 1))); } catch (e) { /* élément illisible : ignoré */ } start = -1; }
    }
  }
  return out;
}

// Format court ["titre","cle","AAAA-MM-JJ"|null,minutes|null] -> objet {title,key,week,minutes} ; l'objet de l'ancien format passe tel quel.
function taskFromRow(t) {
  return Array.isArray(t) ? { title: t[0], key: t[1], week: t[2], minutes: t[3] } : t;
}

const norm = (v) => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Clé la plus proche d'une clé inconnue (égalité/inclusion sur clé ou libellé) ; sinon null.
function closestKey(raw, candidates) {
  const q = norm(raw); if (!q) return null;
  const hit = candidates.find((c) => norm(c.key) === q || norm(c.label) === q)
    || candidates.find((c) => { const k = norm(c.key), l = norm(c.label); return (k && (k.includes(q) || q.includes(k))) || (l && (l.includes(q) || q.includes(l))); });
  return hit ? hit.key : null;
}

function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
// ---------- Jours (17 oct. 2026) ----------
const dowOf = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const isWorkday = (iso) => WORK_DAYS.includes(dowOf(iso));
// Capacité d'un jour (minutes) : agenda externe de l'utilisateur (ctx.dayCaps : 0 = vacances, X/Y réglés) sinon capacité par défaut ; null = illimitée.
function capOf(ctx, day) {
  const c = ctx && ctx.dayCaps ? ctx.dayCaps[day] : undefined;
  return c != null ? c : (ctx && ctx.dayCapacityMinutes ? ctx.dayCapacityMinutes : null);
}
function nextWorkday(iso, last, ctx) {
  for (let d = iso; d && d <= last; d = goals.addDays(d, 1)) if (isWorkday(d) && capOf(ctx, d) !== 0) return d;
  return null;
}
// La date figure-t-elle dans le texte du document (AAAA-MM-JJ, JJ/MM, « 14 oct. », « Oct 14 ») ? Alors c'est une date EXACTE du document.
const MONTH_PREFIXES = [['jan'], ['fev', 'feb'], ['mar'], ['avr', 'apr'], ['mai', 'may'], ['juin', 'jun'], ['juil', 'jul'], ['aou', 'aug'], ['sep'], ['oct'], ['nov'], ['dec']];
function docMentionsDate(docText, iso) {
  if (!docText || !isRealDate(iso)) return false;
  if (docText.includes(iso)) return true;
  const t = norm0(docText);
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  const pm = MONTH_PREFIXES[m - 1].join('|');
  const re = [
    new RegExp(`(?:^|[^0-9])0?${d}\\s*[/.]\\s*0?${m}(?:\\s*[/.]\\s*(?:${y}|${String(y).slice(2)}))?(?:[^0-9]|$)`),
    new RegExp(`(?:^|[^0-9])0?${d}(?:er|st|nd|rd|th)?\\s+(?:de\\s+|d\\s*)?(?:${pm})[a-z]*`),
    new RegExp(`(?:${pm})[a-z]*\\.?\\s+0?${d}(?:[^0-9]|$)`),
  ];
  return re.some((r) => r.test(t));
}
function norm0(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

// Jour retenu pour une valeur de l'IA : { day, exact } ou null. Un lundi d'une semaine de l'horizon (ancien format) est un jour valide.
// Jamais avant aujourd'hui ; hors horizon -> null ; jour non travaillé sans date du document -> prochain jour travaillé.
function resolveDay(v, ctx) {
  const weeks = ctx.weeks, today = ctx.today || todayIso();
  const last = goals.addDays(weeks[weeks.length - 1], 6);
  if (!isRealDate(v) || v > last) return null;
  let day = v;
  if (day < today) { if (weeks.includes(v) && v >= weeks[0]) day = today; else return null; }
  if (day < weeks[0]) return null;
  const exact = docMentionsDate(ctx.docText, v);
  if (!exact && (!isWorkday(day) || capOf(ctx, day) === 0)) { day = nextWorkday(day, last, ctx); if (!day) return null; }
  return { day, exact };
}

// Date cible acceptée (conservée pour l'apply) : un lundi proposé OU une date exacte valide dans l'horizon (jusqu'à la fin de la dernière semaine).
function validTargetDate(v, weeks) {
  if (weeks.includes(v)) return v;
  if (!isRealDate(v)) return null;
  const last = goals.addDays(weeks[weeks.length - 1], 6);
  return v >= weeks[0] && v <= last ? v : null; // jour quelconque de l'horizon étendu
}

// Format de réponse court {"t":[[titre,clé,date,minutes],...]} (moins de jetons de sortie) ; l'ancien {"tasks":[{title,key,week,minutes}]} reste accepté.
// Revalide la réponse de l'IA : JSON tolérant (entourage/markdown, JSON coupé réparé),
// semaines/durées contrôlées. Une clé inconnue n'écarte PLUS la tâche : repli sur la clé la plus
// proche ou la première catégorie, marqué `toChoose` (l'utilisateur corrige dans l'UI).
function parseDetailed(text, ctx) {
  if (!text) return null;
  const raw = String(text);
  let list = null, repaired = false;
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m) { try { const j = JSON.parse(m[0]); if (j && Array.isArray(j.t)) list = j.t; else if (j && Array.isArray(j.tasks)) list = j.tasks; } catch (e) { /* réparation ci-dessous */ } }
  if (!list) { list = salvageTaskObjects(raw); repaired = !!(list && list.length); if (!list || !list.length) return null; }
  list = list.map(taskFromRow);
  const labels = new Map(ctx.candidates.map((c) => [c.key, c.label]));
  const seen = new Set(), tasks = [];
  const dropped = { doublon: 0, vide: 0, limite: 0 };
  let toChoose = 0;
  list.forEach((t) => {
    if (!t || typeof t !== 'object') { dropped.vide++; return; }
    const title = String(t.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!title) { dropped.vide++; return; }
    let key = t.key, pick = false;
    if (!labels.has(key)) { key = closestKey(key, ctx.candidates) || ctx.candidates[0].key; pick = true; }
    const dedupe = key + '|' + title.toLowerCase();
    if (seen.has(dedupe)) { dropped.doublon++; return; }
    if (tasks.length >= MAX_TASKS) { dropped.limite++; return; }
    seen.add(dedupe);
    const mn = Math.round(Number(t.minutes));
    if (pick) toChoose++;
    const rd = resolveDay(t.week != null ? t.week : t.day, ctx);
    tasks.push({ title, key, categoryLabel: labels.get(key), toChoose: pick, week: rd ? goals.mostRecentMonday(rd.day) : null, day: rd ? rd.day : null, exact: !!(rd && rd.exact), moved: false, minutes: Number.isFinite(mn) && mn >= 5 && mn <= 1440 ? mn : null });
  });
  return { tasks, found: list.length, dropped, toChoose, repaired };
}

function parseProposals(text, ctx) {
  const r = parseDetailed(text, ctx);
  return r ? r.tasks : null;
}

// loadByDay (optionnel) : charge déjà ACCEPTÉE par jour, ajoutée à la somme de chaque semaine qui reçoit des tâches proposées.
function capacityWarnings(tasks, capacityMinutes, loadByDay) {
  if (!capacityMinutes) return [];
  const by = {};
  tasks.forEach((t) => { if (t.week && t.minutes) by[t.week] = (by[t.week] || 0) + t.minutes; });
  if (loadByDay) Object.keys(by).forEach((w) => { for (let i = 0; i < 7; i++) by[w] += loadByDay[goals.addDays(w, i)] || 0; });
  return Object.keys(by).sort().filter((w) => by[w] > capacityMinutes).map((w) => ({ week: w, minutes: by[w], capacityMinutes }));
}

// Jours encore en dépassement APRÈS répartition (cause : tâches acceptées ou tâche seule plus longue que le jour) : information seulement.
function dayWarnings(tasks, ctx) {
  const load = { ...(ctx.loadByDay || {}) };
  tasks.forEach((t) => { if (t.day) load[t.day] = (load[t.day] || 0) + (t.minutes || DEFAULT_TASK_MINUTES); });
  const days = new Set(tasks.filter((t) => t.day).map((t) => t.day));
  return [...days].sort().filter((d) => capOf(ctx, d) != null && load[d] > capOf(ctx, d))
    .map((d) => ({ day: d, week: goals.mostRecentMonday(d), minutes: load[d], capacityMinutes: capOf(ctx, d) }));
}

// Contrôle déterministe (« Semaine qui dépasse sa capacité », 17 oct. 2026). Charge d'un jour = tâches ACCEPTÉES + PROPOSÉES.
// Jour en dépassement : on déplace d'abord les tâches PROPOSÉES les moins importantes (fin de liste), jamais celles à date exacte du
// document, jamais une tâche acceptée, vers le prochain jour travaillé avec de la place (même semaine d'abord, puis semaines suivantes
// de l'horizon). Aucune place : la tâche reste sans jour (`day` null, `noRoom`) et l'utilisateur choisit. Modifie `tasks` en place.
function balanceDays(tasks, ctx) {
  if (!ctx.dayCapacityMinutes && !(ctx.dayCaps && Object.keys(ctx.dayCaps).length)) return tasks;
  const last = goals.addDays(ctx.weeks[ctx.weeks.length - 1], 6);
  const mins = (t) => t.minutes || DEFAULT_TASK_MINUTES;
  const load = { ...(ctx.loadByDay || {}) };
  tasks.forEach((t) => { if (t.day) load[t.day] = (load[t.day] || 0) + mins(t); });
  const days = [...new Set(tasks.filter((t) => t.day).map((t) => t.day))].sort();
  for (const day of days) {
    while (capOf(ctx, day) != null && (load[day] || 0) > capOf(ctx, day)) {
      let idx = -1;
      for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].day === day && !tasks[i].exact) { idx = i; break; }
      if (idx < 0) break; // plus rien de déplaçable : avertissement seulement
      const t = tasks[idx];
      load[day] -= mins(t);
      let dest = null;
      for (let d = nextWorkday(goals.addDays(day, 1), last, ctx); d; d = nextWorkday(goals.addDays(d, 1), last, ctx)) {
        if (capOf(ctx, d) == null || (load[d] || 0) + mins(t) <= capOf(ctx, d)) { dest = d; break; }
      }
      if (dest) {
        // Changement de JOUR dans la même semaine : silencieux (18 oct. 2026, Émilien), aucune indication. Autre semaine : signalé (`moved`).
        load[dest] = (load[dest] || 0) + mins(t); t.fromWeek = t.week; t.day = dest; t.week = goals.mostRecentMonday(dest);
        if (t.week !== t.fromWeek) t.moved = true;
      }
      else { t.day = null; t.noRoom = true; } // « à choisir » ; `week` conservé
    }
  }
  return tasks;
}

// Préparation d'une demande (validations, contexte, prompt). opts.skipRate : surveillance Drive (server/lib/drivesync.js), qui a son
// propre plafond quotidien. opts.skipChanges : première lecture d'un fichier surveillé, aucune « modification proposée » à comparer.
// opts.callTaken : l'appelant a déjà réservé l'appel IA du jour (drivesync.takeCall).
// UN SEUL appel IA renvoie les tâches ET (avec un document) les modifications proposées (docanalysis.js).
async function prepareProposal(userId, activityId, body, opts) {
  const o = opts || {};
  const instruction = String((body && body.instruction) || '').trim().slice(0, MAX_INSTRUCTION);
  if (!instruction) throw httpError(400, 'Écris une consigne (ou choisis un raccourci).');
  const doc = await documentText(body && body.files);
  if (!doc.text && !instruction) throw httpError(400, 'Joins un document ou écris une consigne.');
  if (!docanalysis.hasCaller() && !classify.configured()) throw httpError(503, "L'IA n'est pas configurée sur ce serveur. Réessaie plus tard.");
  if (!o.skipRate && !takeRateSlot(userId)) throw httpError(429, 'Limite atteinte : 10 demandes par heure. Réessaie plus tard.');
  const ctx = buildContext(userId, activityId);
  // Agenda externe (offre gratuite incluse) : capacité par jour (vacances = 0, jour travaillé ailleurs = X h, jour libre = Y h). Jamais bloquant.
  try {
    const days = [];
    const lastDay = goals.addDays(ctx.weeks[ctx.weeks.length - 1], 6);
    for (let d = ctx.weeks[0]; d <= lastDay && days.length < 400; d = goals.addDays(d, 1)) days.push(d);
    ctx.dayCaps = await require('./externalcalendar').dayCapacities(userId, days);
  } catch (e) { ctx.dayCaps = {}; }
  if (!ctx.candidates.length) throw httpError(400, 'Aucune catégorie sur cette activité.');
  const cctx = changeproposals.buildContext(userId, activityId);
  let wantC = !!doc.text && !o.skipChanges && !!(cctx.open.length || cctx.weeklies.length);
  if (wantC && !o.callTaken && !require('./drivesync').takeCall(userId)) wantC = false; // plafond quotidien partagé : on garde les tâches seules
  const want = { t: true, c: wantC };
  return { ctx, cctx, doc, want, instruction, parts: docanalysis.buildParts(ctx, cctx, { instruction, doc: doc.text, want }) };
}

// Interprétation de la réponse de l'IA (aussi pour un résultat de lot). prep : { ctx?, cctx?, doc?, want }.
function finishProposal(userId, activityId, out, prep) {
  const ctx0 = prep.ctx || buildContext(userId, activityId);
  const ctx = { ...ctx0, docText: (prep.doc && prep.doc.text) || '' };
  const text = out && typeof out === 'object' ? out.text : out;
  const aiTruncated = !!(out && typeof out === 'object' && out.stopReason === 'max_tokens');
  const parsed = parseDetailed(text, ctx);
  if (!parsed) throw Object.assign(httpError(502, "La réponse de l'IA était inexploitable. Réessaie ou reformule la consigne."), { unusable: true });
  const tasks = balanceDays(parsed.tasks, ctx);
  // Compteurs seulement : aucun contenu de document ni de tâche n'est journalisé.
  console.log(`[documenttasks] trouvées=${parsed.found} retenues=${tasks.length} doublons=${parsed.dropped.doublon} vides=${parsed.dropped.vide} limite=${parsed.dropped.limite} aChoisir=${parsed.toChoose} reparee=${parsed.repaired} coupee=${aiTruncated}`);
  // Modifications proposées (16 oct. 2026) : propositions d'avant/après sur l'existant, rien n'est écrit. Section "c" de la même réponse.
  let changes = 0;
  if (prep.want && prep.want.c) { try { changes = changeproposals.storeFromText(userId, activityId, text, prep.cctx || changeproposals.buildContext(userId, activityId)); } catch (e) { /* non bloquant */ } }
  const doc = prep.doc || {};
  return {
    changes,
    tasks, truncated: !!doc.truncated, notes: doc.notes || [],
    found: parsed.found, kept: tasks.length, dropped: parsed.dropped, toChoose: parsed.toChoose,
    repaired: parsed.repaired || aiTruncated, aiTruncated,
    categories: ctx.candidates.map((c) => ({ key: c.key, label: c.label })),
    weeks: ctx.weeks, capacityMinutes: ctx.capacityMinutes,
    warnings: capacityWarnings(tasks, ctx.capacityMinutes, ctx.loadByDay), dayWarnings: dayWarnings(tasks, ctx),
    dayCapacityMinutes: ctx.dayCapacityMinutes, movedCount: tasks.filter((t) => t.moved).length,
  };
}

async function propose(userId, activityId, body, opts) {
  const prep = await prepareProposal(userId, activityId, body, opts);
  let out;
  try { out = await docanalysis.call({ parts: prep.parts, want: prep.want, feature: 'document-taches' }); }
  catch (e) { throw e && e.aiBlocked ? httpError(429, e.message) : httpError(502, "L'IA n'a pas répondu. Réessaie dans un moment."); }
  return finishProposal(userId, activityId, out, prep);
}

// `tasks` : uniquement ce que l'utilisateur a coché ({ title, key, week?, minutes? }).
function apply(userId, activityId, tasks) {
  if (!Array.isArray(tasks) || !tasks.length) throw httpError(400, 'Rien à ajouter : coche au moins une tâche.');
  if (tasks.length > MAX_TASKS) throw httpError(400, 'Trop de tâches à la fois.');
  const weeks = weeksContext(activityId);
  const today = todayIso();
  const exists = db.prepare(`SELECT 1 FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId
    WHERE sp.activityId = ? AND sp.goalCategory = ? AND i.done = 0 AND LOWER(i.label) = ? LIMIT 1`);
  const added = [], skipped = [];
  tasks.forEach((t) => {
    const title = String((t && t.title) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const key = t && t.key;
    if (!title || typeof key !== 'string' || !goals.isValidCategoryOrSecteurForActivity(activityId, key)) { skipped.push({ title, reason: 'catégorie invalide' }); return; }
    if (exists.get(activityId, key, title.toLowerCase())) { skipped.push({ title, reason: 'déjà présente' }); return; }
    const extra = {};
    const target = validTargetDate((t && t.day) || (t && t.week), weeks); // le jour choisi, sinon la semaine (ancien format)
    if (target) extra.dueDate = target < today ? today : target;
    try { added.push(goalstasks.addCategoryTask(activityId, userId, key, title, extra).id); }
    catch (e) { skipped.push({ title, reason: e.statusCode ? e.message : 'erreur' }); }
  });
  return { addedCount: added.length, addedIds: added, skipped };
}

module.exports = { norm, propose, prepareProposal, finishProposal, buildContext, MAX_DOC_CHARS, apply, setCaller, resetRate, parseProposals, textFromFile, capacityWarnings, dayWarnings, balanceDays, docMentionsDate, parseDetailed, SYSTEM, buildUser, buildUserParts, weeksContext, RATE_MAX };
