// Rapport hebdomadaire de coût IA par fonction, LECTURE SEULE, court, en français (enveloppe de ai-cost-report.js 7).
// Usage : NOESIS_DATA_DIR=... node scripts/ai-cost-weekly.js   |   node scripts/ai-cost-weekly.js --from export.json
// Montants affichés en USD (coût réel de l'API) ; seuils en CAD, convertis (server/lib/fx.js).
// Alerte : total 7 j > AI_WEEKLY_ALERT_CAD (défaut 5 CAD ; l'ancienne AI_WEEKLY_ALERT_USD reste acceptée, en USD) ; fonction en hausse de plus de 50 % (et > 0,25 $) vs la semaine précédente.
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const args = process.argv.slice(2);
const fi = args.indexOf('--from');
const fromFile = fi >= 0 ? args.splice(fi, 2)[1] : null;
const fx = require('../server/lib/fx');
const alertUsdFixed = (() => { const u = Number(process.env.AI_WEEKLY_ALERT_USD), c = Number(process.env.AI_WEEKLY_ALERT_CAD); return Number.isFinite(u) && u > 0 ? u : fx.toUsd(Number.isFinite(c) && c > 0 ? c : 5); })();
// AI_ALERT_ADAPTIVE=1 (désactivé par défaut) : seuil = 3,50 CAD x comptes actifs sur 7 jours (server/lib/aialertthreshold.js). Sinon seuil fixe inchangé.
const adaptive = process.env.AI_ALERT_ADAPTIVE === '1';
const p2 = (n) => String(n).padStart(2, '0');
const local = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return local(d); };
const fmt = fx.fmtUsd;

// Agrège [{feature, calls, cost}] par fonction (replis regroupés) sur [from, to] inclus.
function aggregate(rows, from, to) {
  const o = {};
  rows.forEach((r) => {
    if (!r.day || r.day < from || r.day > to) return;
    const f = String(r.feature || '').replace(/:repli$/, '');
    const a = o[f] || (o[f] = { calls: 0, cost: 0 });
    a.calls += Number(r.calls) || 0; a.cost += Number(r.costUsd) || 0;
  });
  return o;
}
function weeklyReport(rows, opts) {
  const cur = aggregate(rows, back(6), back(0)), prev = aggregate(rows, back(13), back(7));
  const sum = (o) => Object.values(o).reduce((s, a) => s + a.cost, 0);
  const tc = sum(cur), tp = sum(prev), hasPrev = Object.keys(prev).length > 0;
  const out = [fx.fxLine(), 'Coût IA, 7 derniers jours : ' + fmt(tc) + ' (' + Object.values(cur).reduce((s, a) => s + a.calls, 0) + ' appels)'];
  if (hasPrev) out.push('Semaine précédente : ' + fmt(tp) + (tp ? ' (' + (tc >= tp ? '+' : '') + Math.round(100 * (tc - tp) / tp) + ' %)' : ''));
  else out.push('Semaine précédente : pas de données.');
  const alerts = [];
  if (tc > opts.alertUsd) alerts.push('total ' + fmt(tc) + ' au-dessus du seuil ' + fmt(opts.alertUsd) + ' (' + fx.fmtCad(fx.toCad(opts.alertUsd)) + ')');
  Object.keys(cur).sort((a, b) => cur[b].cost - cur[a].cost).forEach((f) => {
    const c = cur[f], p = prev[f];
    let cmp = '';
    if (hasPrev) {
      if (!p) cmp = '  nouveau';
      else if (p.cost > 0) cmp = '  ' + (c.cost >= p.cost ? '+' : '') + Math.round(100 * (c.cost - p.cost) / p.cost) + ' %';
      if ((!p && c.cost > 0.25) || (p && p.cost > 0 && c.cost > 0.25 && c.cost > 1.5 * p.cost)) alerts.push(f + ' en hausse (' + fmt(c.cost) + (p ? ' vs ' + fmt(p.cost) : '') + ')');
    }
    out.push('  ' + f.padEnd(30) + fmt(c.cost).padStart(11) + String(c.calls).padStart(6) + ' app.' + cmp);
  });
  out.push(alerts.length ? 'ALERTE : ' + alerts.join(' ; ') : 'Aucune alerte.');
  return out.join('\n');
}
function loadRows() {
  if (fromFile) {
    if (!fs.existsSync(fromFile)) { console.log('Fichier introuvable : ' + fromFile); process.exit(0); }
    let rows;
    try { rows = JSON.parse(fs.readFileSync(fromFile, 'utf8').replace(/^﻿/, '')); } catch (e) { console.log('Export JSON illisible : ' + e.message); process.exit(1); }
    if (rows && !Array.isArray(rows) && Array.isArray(rows.rows)) rows = rows.rows;
    if (!Array.isArray(rows)) { console.log('Export illisible : tableau attendu.'); process.exit(1); }
    return rows;
  }
  const dir = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'noesis.db');
  if (!fs.existsSync(file)) { console.log('Aucune base : ' + file); process.exit(0); }
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare('SELECT userId, day, feature, calls, costUsd FROM ai_usage_log WHERE day >= ?').all(back(13)); }
  catch (e) { console.log('Aucun journal IA (ai_usage_log) dans cette base.'); process.exit(0); }
}
if (require.main === module) {
  const rows = loadRows();
  const comptes = new Set(rows.filter((r) => r.day >= back(6) && r.userId && r.userId !== 'system').map((r) => r.userId)).size;
  console.log(weeklyReport(rows, { alertUsd: adaptive && comptes ? require('../server/lib/aialertthreshold').seuilAlerte(comptes).semaineUsd : alertUsdFixed }));
}
module.exports = { weeklyReport };
