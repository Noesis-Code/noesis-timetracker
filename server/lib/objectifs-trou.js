// Plan proposé à la création d'un objectif (12 nov. 2026, décision d'Émilien) : règle du TROU, sans IA (repli déterministe).
// Le trou = les cases du MÊME niveau que le nouvel objectif entre l'objectif existant le plus proche (ou aujourd'hui) et lui, bornées à la CELLULE ENGLOBANTE du niveau au-dessus
// (périodique : son année ; annuel : son bloc de 5 ans ; pluriannuel : l'arbre). 1 ou 2 cases : on propose les objectifs du niveau du DESSOUS ; de 3 à 8 : toutes les cases du trou ;
// plus de 8 : 8 cases (jalons répartis ; le choix personnalisé par l'IA est l'étape suivante). Plafond de 8 lignes. Rien n'est écrit ici : la personne valide ligne par ligne.
const db = require('../db');
const goals = require('./goals');
const O = require('./objectifs');

const MAX_LINES = 8;
const MIN_PROPOSITIONS = 8; // 17 nov. 2026 (Émilien) : au moins 8 propositions au total (modifications + ajouts) ; les ajouts sont des ÉTAPES (enfants) vers l'objectif créé, avant lui
const PER_YEAR = 13;
const REPLI_PERIODES = [3, 6, 9, 13]; // 4 jalons fixes par an : toujours quelque chose à faire (repli sans IA)
const parseMeta = (r) => { try { return JSON.parse((r && r.metaJson) || '{}'); } catch (e) { return {}; } };

// ---- Cases par niveau : une case = un numéro d'ordre entier (comparable) ----
const periodStart = (o) => O.addDays(goals.yearGridStart(Math.floor(o / PER_YEAR) + '-07-01'), 28 * (o % PER_YEAR));
const periodOf = (iso) => { const g = O.gridOf(iso); return g.year * PER_YEAR + (g.period - 1); };
const periodCell = (o) => { const s = periodStart(o); return { level: 'periode', ord: o, label: 'P' + (o % PER_YEAR + 1) + ' ' + Math.floor(o / PER_YEAR), start: s, endDate: O.addDays(s, 27) }; };
const yearCell = (y) => ({ level: 'annee', ord: y, label: String(y), start: y + '-01-01', endDate: y + '-12-31' });
const blockCell = (b) => ({ level: 'bloc', ord: b, label: b + '–' + (b + 4), start: b + '-01-01', endDate: (b + 4) + '-12-31' });
const blockOf = (y, y0) => y0 + 5 * Math.floor((y - y0) / 5);
const weekCell = (ws) => ({ level: 'semaine', ord: ws, label: 'S' + O.gridOf(ws).week, start: ws, endDate: O.addDays(ws, 6) });

// Choisit au plus `max` éléments répartis régulièrement (le dernier toujours retenu) : jalons déterministes.
function evenPick(list, max) {
  if (list.length <= max) return list.slice();
  const out = []; for (let i = 0; i < max; i += 1) out.push(list[Math.ceil((i + 1) * list.length / max) - 1]);
  return out;
}

// Cases du trou [from, to[ (ordres), bornées à [lo, hi] de la cellule englobante.
function gapCells(type, newEnd, nearestEnd, today) {
  const y0 = Number(today.slice(0, 4));
  if (type === 'periodique') {
    const g = O.gridOf(newEnd), newOrd = periodOf(newEnd), lo = g.year * PER_YEAR; // l'année englobante
    const from = Math.max(lo, nearestEnd ? periodOf(nearestEnd) + 1 : periodOf(today));
    const out = []; for (let o = from; o < newOrd; o += 1) out.push(periodCell(o)); return out;
  }
  if (type === 'annuel') {
    const y = Number(newEnd.slice(0, 4)), lo = blockOf(y, y0); // le bloc de 5 ans englobant
    const from = Math.max(lo, nearestEnd ? Number(nearestEnd.slice(0, 4)) + 1 : y0);
    const out = []; for (let v = from; v < y; v += 1) out.push(yearCell(v)); return out;
  }
  if (type === 'pluriannuel') { // l'arbre : aucune borne englobante
    const b = blockOf(Number(newEnd.slice(0, 4)), y0), from = nearestEnd ? blockOf(Number(nearestEnd.slice(0, 4)), y0) + 5 : blockOf(y0, y0);
    const out = []; for (let v = from; v < b; v += 5) out.push(blockCell(v)); return out;
  }
  return []; // hebdomadaire : rien en dessous
}

// Objectifs du niveau du dessous, pour les 1 ou 2 cases du trou (plafond 8 ; repli : périodes 3, 6, 9, 13 pour des années).
function belowOf(type, cells, today) {
  let out = [];
  if (type === 'periodique') cells.forEach((c) => { for (let i = 0; i < 4; i += 1) { const w = weekCell(O.addDays(c.start, 7 * i)); if (w.endDate >= today) out.push(w); } });
  else if (type === 'annuel') {
    cells.forEach((c) => { const all = []; for (let p = 0; p < PER_YEAR; p += 1) all.push(periodCell(c.ord * PER_YEAR + p)); out.push(...all.filter((x) => x.endDate >= today)); }); // jamais une période déjà passée
    if (out.length > MAX_LINES) { out = []; cells.forEach((c) => REPLI_PERIODES.forEach((p) => { const x = periodCell(c.ord * PER_YEAR + p - 1); if (x.endDate >= today) out.push(x); })); }
  } else if (type === 'pluriannuel') cells.forEach((c) => { for (let v = c.ord; v < c.ord + 5; v += 1) out.push(yearCell(v)); });
  return evenPick(out, MAX_LINES);
}

// Ajouts pour atteindre le minimum : un ENFANT est une étape vers son parent, donc AVANT lui (17 nov. 2026, précision d'Émilien). Cases LIBRES du même niveau AVANT l'objectif créé, dans la cellule englobante
// (périodique : son année ; annuel : son bloc de 5 ans ; pluriannuel : depuis le bloc d'aujourd'hui), jamais le passé ; les plus proches de l'objectif d'abord.
function beforeCells(type, newEnd, today) {
  const y0 = Number(today.slice(0, 4));
  if (type === 'periodique') { const g = O.gridOf(newEnd), lo = g.year * PER_YEAR, out = []; for (let o = Math.max(lo, periodOf(today)); o < periodOf(newEnd); o += 1) out.push(periodCell(o)); return out.reverse(); }
  if (type === 'annuel') { const y = Number(newEnd.slice(0, 4)), lo = Math.max(blockOf(y, y0), y0), out = []; for (let v = lo; v < y; v += 1) out.push(yearCell(v)); return out.reverse(); }
  if (type === 'pluriannuel') { const b = blockOf(Number(newEnd.slice(0, 4)), y0), out = []; for (let v = blockOf(y0, y0); v < b; v += 5) out.push(blockCell(v)); return out.reverse(); }
  return [];
}
const ordOfEnd = (type, iso) => (type === 'periodique' ? periodOf(iso) : type === 'annuel' ? Number(iso.slice(0, 4)) : blockOf(Number(iso.slice(0, 4)), Number(new Date().toISOString().slice(0, 4))));
// Complète les lignes jusqu'à minLines avec des cases libres du même niveau, AVANT l'objectif ; jamais d'erreur : sans case libre, moins de lignes.
function completer(plan, type, newEnd, today, occupiedOrds, minLines) {
  if (!(minLines > plan.lines.length) || plan.mode === 'dessous') return plan; // les lignes du DESSOUS sont d'un autre niveau : on ne les mélange pas
  const have = new Set(plan.lines.map((c) => c.ord)), free = beforeCells(type, newEnd, today).filter((c) => !have.has(c.ord) && !(occupiedOrds && occupiedOrds.has(c.ord)) && c.endDate >= today);
  const add = free.slice(0, Math.min(MAX_LINES, minLines) - plan.lines.length); // du plus proche de l'objectif au plus lointain
  if (!add.length) return plan;
  const lines = plan.lines.concat(add).sort((a, b) => a.ord - b.ord);
  return { mode: plan.mode === 'aucun' ? 'ajouts' : plan.mode, gap: plan.gap, lines, ajouts: add.length };
}

// Règle complète : renvoie { mode: 'aucun' | 'dessous' | 'trou' | 'jalons', gap (nombre de cases du trou), lines }.
function planTrou(type, newEnd, nearestEnd, today) {
  const cells = gapCells(type, newEnd, nearestEnd, today), n = cells.length;
  if (!n) return { mode: 'aucun', gap: 0, lines: [] };
  if (n <= 2) return { mode: 'dessous', gap: n, lines: belowOf(type, cells, today) };
  if (n <= MAX_LINES) return { mode: 'trou', gap: n, lines: cells };
  return { mode: 'jalons', gap: n, lines: evenPick(cells, MAX_LINES) };
}

// ---- Existants : fin de l'objectif du MÊME niveau le plus proche avant le nouveau, dans la même colonne ----
function typeOfRow(r) {
  const m = parseMeta(r);
  if (m.cadence === 'hebdomadaire' || m.inner === 'hebdomadaires') return 'hebdomadaire';
  if (r.level === 'secteur' || m.cadence === 'periodique') return 'periodique';
  const span = (Date.parse(r.endDate + 'T00:00:00Z') - Date.parse(r.startDate + 'T00:00:00Z')) / 86400000;
  return span > 370 ? 'pluriannuel' : 'annuel';
}
function nearestBefore(userId, body, type) {
  const level = ['activite', 'pole', 'secteur'].includes(body.level) ? body.level : 'activite';
  const pk = level === 'activite' ? null : (body.poleKey || null), ck = level === 'secteur' ? (body.categoryKey || null) : null;
  const rows = db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND activityId = ? AND isMacro = 0').all(userId, Number(body.activityId))
    .filter((r) => !parseMeta(r).abandoned && (r.level || 'activite') === level && (r.poleKey || null) === pk && (r.categoryKey || null) === ck && typeOfRow(r) === type && r.endDate < body.endDate);
  return rows.reduce((best, r) => (!best || r.endDate > best ? r.endDate : best), null);
}
function occupiedOrds(userId, body, type) {
  const level = ['activite', 'pole', 'secteur'].includes(body.level) ? body.level : 'activite';
  const pk = level === 'activite' ? null : (body.poleKey || null), ck = level === 'secteur' ? (body.categoryKey || null) : null, set = new Set();
  db.prepare('SELECT * FROM user_objectives WHERE userId = ? AND activityId = ? AND isMacro = 0').all(userId, Number(body.activityId))
    .filter((r) => !parseMeta(r).abandoned && (r.level || 'activite') === level && (r.poleKey || null) === pk && (r.categoryKey || null) === ck && typeOfRow(r) === type)
    .forEach((r) => set.add(ordOfEnd(type, r.endDate)));
  return set;
}
function proposer(userId, body, today) {
  const type = ['pluriannuel', 'annuel', 'periodique', 'hebdomadaire'].includes(body && body.type) ? body.type : null;
  if (!type || !O.isDay(body.endDate)) return { mode: 'aucun', gap: 0, lines: [] };
  const act = db.prepare('SELECT a.id FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.id = ?').get(userId, Number(body.activityId));
  if (!act) return { mode: 'aucun', gap: 0, lines: [] };
  const plan = planTrou(type, body.endDate, nearestBefore(userId, body, type), today);
  const minLines = Math.max(0, Math.min(MAX_LINES, Number(body.minLines) || 0));
  return minLines ? completer(plan, type, body.endDate, today, occupiedOrds(userId, body, type), minLines) : plan;
}

module.exports = { MIN_PROPOSITIONS, beforeCells, completer, MAX_LINES, REPLI_PERIODES, evenPick, gapCells, belowOf, planTrou, proposer, typeOfRow, periodCell, weekCell, yearCell };
