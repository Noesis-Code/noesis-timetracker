// « Prévu » (heures par semaine) d'un niveau (activité / pôle / secteur) pour l'étape « Temps » de la création d'un objectif (9 nov. 2026, décision d'Émilien).
// MODÈLE : les heures vivent SUR L'OBJECTIF (metaJson.hoursPerWeek existant), valables pour la période de cet objectif : la case de l'arbre = niveau + période (objectifs.occupant). AUCUNE table de budget.
//  - Prévu d'un niveau = hoursPerWeek de l'objectif qui occupe sa case, sinon (au premier écran) le Passé ; ligne du dessus = l'objectif PARENT sur la même période (pôle pour un secteur, activité pour un pôle) ;
//    au niveau activité : capacité hebdomadaire de la personne (manuelle, sinon moyenne Chrono : weekplanner.getWeeklyCapacity).
//  - Cases voisines (« Prendre sur… ») = autres secteurs du pôle / autres pôles de l'activité / autres activités, sur la même période ; sans objectif (ou à 0 h), elles ne sont pas listées.
//  - Passé : médiane des 4 dernières semaines complètes du Chrono (même calcul que l'historique de départ de la création).
// Rien n'est écrit avant l'appel avec apply = true (« Valider ») ; le niveau choisi n'a pas encore d'objectif : sa valeur part avec la création (hoursPerWeek), les écritures ne touchent que le parent et les voisins.
const db = require('../db');
const goals = require('./goals');
const weekplanner = require('./weekplanner');

const MAX_MIN = 168 * 60; // seul plafond : les heures d'une semaine
function err(msg, status) { return Object.assign(new Error(msg), { statusCode: status || 400 }); }
function today() { return require('./dates').userToday(); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(iso) { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return addDays(iso, -((w + 6) % 7)); }
function median(v) { const s = v.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function objectifs() { return require('./objectifs'); } // chargé à l'appel (évite une dépendance circulaire)

function userActivities(userId) {
  return db.prepare('SELECT a.id, a.name FROM activities a JOIN activity_members m ON m.activityId = a.id WHERE m.userId = ? AND a.active = 1 ORDER BY a.name').all(userId);
}
function inScope(userId, activityId) {
  const a = userActivities(userId).find((x) => x.id === Number(activityId));
  if (!a) throw err('Choisis une de tes activités.');
  return a;
}
// Clés de catégorie comptées pour un nœud : un pôle cumule ses secteurs ; un secteur est seul ; l'activité (null) = tout.
function keysOf(activityId, key) {
  if (!key) return null;
  const poles = goals.categoriesForActivity(activityId) || [];
  if (poles.some((p) => p.key === key)) return [key].concat((goals.secteursForPole(activityId, key) || []).map((s) => s.key));
  return [key];
}
// Passé : médiane (4 dernières semaines complètes) des minutes chronométrées par semaine ; arrondi à la demi-heure comme l'historique de départ de la création.
function passeMin(userId, activityId, key) {
  const mon = mondayOf(today()), v = [];
  const keys = activityId == null ? null : keysOf(activityId, key);
  for (let k = 1; k <= 4; k += 1) {
    const s = addDays(mon, -7 * k), e = addDays(s, 6);
    let q = 'SELECT COALESCE(SUM(durationSeconds), 0) AS s FROM time_entries WHERE userId = ? AND isoDate BETWEEN ? AND ?', args = [userId, s, e];
    if (activityId != null) { q += ' AND activityId = ?'; args.push(Number(activityId)); }
    if (keys) { q += ' AND goalCategory IN (' + keys.map(() => '?').join(',') + ')'; args = args.concat(keys); }
    v.push(db.prepare(q).get(...args).s / 60);
  }
  const m = median(v);
  return m > 0 ? Math.round(m / 30) * 30 : null;
}
function metaOf(id) { const r = db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(id); try { return JSON.parse((r && r.metaJson) || '{}'); } catch (e) { return {}; } }
// Case de l'arbre (niveau + période) : l'objectif qui l'occupe et ses heures par semaine (minutes, ou null si aucune).
function cell(userId, aid, level, pk, ck, endDate) {
  const o = objectifs().occupant(userId, { activityId: aid, level, poleKey: pk, categoryKey: ck, endDate });
  if (!o) return null;
  const h = Number(metaOf(o.id).hoursPerWeek);
  return { id: o.id, min: h > 0 ? Math.round(h * 60) : null };
}
function writeHours(id, minutes) {
  const meta = metaOf(id); meta.hoursPerWeek = Math.max(0, Math.round(minutes / 60 * 100) / 100);
  db.prepare('UPDATE user_objectives SET metaJson = ? WHERE id = ?').run(JSON.stringify(meta), id);
}

// État d'un niveau : ligne du dessus (lecture seule), ligne du niveau, cases voisines, options.
function etat(userId, spec) {
  const act = inScope(userId, spec.activityId), aid = act.id, end = spec.endDate;
  const poles = goals.categoriesForActivity(aid) || [];
  const level = ['activite', 'pole', 'secteur'].includes(spec.level) ? spec.level : 'activite';
  const cap = weekplanner.getWeeklyCapacity(userId) || { minutes: null, source: null, historyMinutes: null };
  const manual = cap.source === 'manual';
  const poleKey = level === 'activite' ? null : spec.poleKey || null;
  const catKey = level === 'secteur' ? spec.categoryKey || null : null;
  if (level !== 'activite' && !poles.some((p) => p.key === poleKey)) throw err('Choisis un pôle de cette activité.');
  const sects = poleKey ? (goals.secteursForPole(aid, poleKey) || []) : [];
  if (level === 'secteur' && !sects.some((s) => s.key === catKey)) throw err('Choisis un secteur de ce pôle.');
  const label = (k) => { const x = poles.concat(sects).find((p) => p.key === k); return x ? x.label : k; };
  const out = { level, activityId: aid, poleKey, categoryKey: catKey, manualCapacity: manual, maxMin: MAX_MIN };
  const ownNum = spec.ownMin === undefined || spec.ownMin === null || spec.ownMin === '' ? null : Math.round(Number(spec.ownMin));
  const meCell = cell(userId, aid, level, poleKey, catKey, end);
  const mePrevu = Number.isFinite(ownNum) && ownNum >= 0 ? ownNum : (meCell ? meCell.min : null);
  let others;
  if (level === 'activite') {
    out.up = { kind: 'total', label: null, prevuMin: cap.minutes, passeMin: passeMin(userId, null, null) };
    out.me = { key: null, label: act.name, prevuMin: mePrevu, passeMin: passeMin(userId, aid, null) };
    others = userActivities(userId).filter((x) => x.id !== aid).map((x) => { const c = cell(userId, x.id, 'activite', null, null, end); return { key: 'a' + x.id, label: x.name, avantMin: c ? c.min : null, objectifId: c ? c.id : null }; });
    out.modes = ['ajouter', 'autres']; // « Prendre sur les autres activités » : toujours proposé
  } else {
    const upCell = level === 'pole' ? cell(userId, aid, 'activite', null, null, end) : cell(userId, aid, 'pole', poleKey, null, end);
    const upKey = level === 'pole' ? null : poleKey;
    out.up = { kind: level === 'pole' ? 'activite' : 'pole', label: level === 'pole' ? act.name : label(poleKey), prevuMin: upCell ? upCell.min : null, passeMin: passeMin(userId, aid, upKey) };
    out.me = { key: level === 'pole' ? poleKey : catKey, label: label(level === 'pole' ? poleKey : catKey), prevuMin: mePrevu, passeMin: passeMin(userId, aid, level === 'pole' ? poleKey : catKey) };
    const sib = level === 'pole' ? poles.filter((p) => p.key !== poleKey) : sects.filter((s) => s.key !== catKey);
    others = sib.map((x) => { const c = level === 'pole' ? cell(userId, aid, 'pole', x.key, null, end) : cell(userId, aid, 'secteur', poleKey, x.key, end); return { key: x.key, label: x.label, avantMin: c ? c.min : null, objectifId: c ? c.id : null }; });
    const used = others.reduce((s, x) => s + (x.avantMin || 0), 0) + (mePrevu || 0);
    out.restMin = out.up.prevuMin === null ? 0 : Math.max(0, out.up.prevuMin - used);
    out.restLabel = level === 'pole' ? 'Reste de l’activité' : 'Reste du pôle';
    out.modes = ['ajouter', 'reste', 'autres'];
  }
  out.others = others;
  out.valueMin = out.me.prevuMin !== null ? out.me.prevuMin : out.me.passeMin; // valeur par défaut : le Prévu existant, à défaut le Passé
  const lines = others.filter((x) => (x.avantMin || 0) > 0 && x.objectifId); // une case voisine sans objectif n'est pas listée
  out.takeLines = { autres: lines.map((x) => ({ key: x.key, label: x.label, avantMin: x.avantMin, objectifId: x.objectifId })),
    reste: (out.restMin || 0) > 0 ? [{ key: 'reste', label: out.restLabel, avantMin: out.restMin }] : [] };
  out.modes = out.modes.filter((m) => m === 'ajouter' || (level === 'activite' && m === 'autres') || (out.takeLines[m] && out.takeLines[m].length));
  return out;
}

// Plan : effets d'un changement de valeur. apply = true (« Valider ») écrit, sinon simple aperçu (rien n'est modifié).
function plan(userId, body, apply) {
  const e = etat(userId, body);
  const newMin = Math.round(Number(body.newMin));
  if (!Number.isFinite(newMin) || newMin < 0 || newMin > MAX_MIN) throw err('Un budget va de 0 à 168 heures par semaine.');
  const old = e.valueMin || 0, delta = newMin - old, aid = e.activityId, end = body.endDate;
  const res = { ok: true, deltaMin: delta, increase: delta > 0, oldMin: old, newMin, effects: [], lines: [], balanced: true };
  const cap = weekplanner.getWeeklyCapacity(userId) || { minutes: null, source: null };
  const chain = []; // cases du dessus qui ont un objectif : elles grandissent de la différence (Ajouter)
  if (e.level === 'secteur') { const c = cell(userId, aid, 'pole', e.poleKey, null, end); if (c) chain.push({ id: c.id, label: e.up.label, kind: 'pole', prevuMin: c.min || 0 }); }
  if (e.level !== 'activite') { const c = cell(userId, aid, 'activite', null, null, end); if (c) chain.push({ id: c.id, label: (db.prepare('SELECT name FROM activities WHERE id = ?').get(aid) || {}).name, kind: 'activite', prevuMin: c.min || 0 }); }
  const mode = delta > 0 ? String(body.mode || '') : '';
  if (delta > 0 && !['ajouter', 'reste', 'autres'].includes(mode)) { res.balanced = false; res.needsMode = true; }
  if (delta > 0 && mode && mode !== 'ajouter' && !e.modes.includes(mode)) throw err('Cette possibilité n’existe pas ici.');
  if (delta > 0 && mode === 'ajouter') {
    res.effects.push({ level: e.level, label: e.me.label, beforeMin: old, afterMin: newMin });
    chain.forEach((c) => res.effects.push({ level: c.kind, label: c.label, beforeMin: c.prevuMin, afterMin: c.prevuMin + delta }));
    res.effects.push({ level: 'total', label: null, beforeMin: cap.minutes || 0, afterMin: (cap.minutes || 0) + delta });
  } else if (delta > 0 && (mode === 'reste' || mode === 'autres')) {
    const apres = body.apres && typeof body.apres === 'object' ? body.apres : {};
    res.lines = e.takeLines[mode].map((l) => { const a = apres[l.key] === undefined ? l.avantMin : Math.round(Number(apres[l.key])); return { key: l.key, label: l.label, avantMin: l.avantMin, apresMin: a, objectifId: l.objectifId || null }; });
    const bad = res.lines.some((l) => !(l.apresMin >= 0 && l.apresMin <= l.avantMin));
    const taken = res.lines.reduce((s, l) => s + (l.avantMin - l.apresMin), 0);
    res.balanced = !bad && taken === delta && res.lines.length > 0; // le total du niveau du dessus reste constant
    res.takenMin = taken;
  }
  if (apply) {
    if (delta > 0 && !mode) throw err('Choisis d’où vient ce temps.');
    if (delta > 0 && mode !== 'ajouter' && !res.balanced) throw err('Le total du niveau du dessus doit rester constant : équilibre les heures.');
    db.exec('BEGIN');
    try {
      // le niveau choisi n'a pas (encore) d'objectif : sa valeur part avec la création ; une baisse ne touche rien d'autre (le temps libéré reste libre)
      if (delta > 0 && mode === 'ajouter') {
        chain.forEach((c) => writeHours(c.id, c.prevuMin + delta));
        if (cap.source === 'manual') weekplanner.setWeeklyCapacity(userId, (cap.minutes || 0) + delta);
      }
      if (delta > 0 && mode === 'autres') res.lines.forEach((l) => { if (l.objectifId) writeHours(l.objectifId, l.apresMin); }); // les heures des cases voisines
      db.exec('COMMIT');
    } catch (x) { try { db.exec('ROLLBACK'); } catch (y) { /* rien d'ouvert */ } throw x; }
  }
  return res;
}

module.exports = { etat, plan, passeMin, MAX_MIN };
