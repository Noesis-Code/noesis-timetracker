// Budget hebdomadaire (« Prévu ») d'un niveau (activité / pôle / secteur) pour l'étape « Temps » de la création d'un objectif (9 nov. 2026, décision d'Émilien).
// Le « Prévu » est un BUDGET d'heures par semaine de l'activité, du pôle ou du secteur (pas seulement de l'objectif). Sources existantes réutilisées :
//  - capacité hebdomadaire de la personne : users.weeklyCapacityMinutes (manuelle) sinon moyenne Chrono (weekplanner.getWeeklyCapacity) = ligne « Toutes tes activités » ;
//  - prévu d'un pôle : goal_capacity_overrides (lu par la planification ; tempsmembres.plannedMin) ; prévu d'une activité : somme de ses pôles ou dernière ligne d'historique (tempsmembres.plannedMin) ;
//  - passé : heures Chrono par semaine, médiane des 4 dernières semaines complètes (même calcul que l'historique de départ de la création : objectifs.weeklyHoursHistory).
// Table ADDITIVE temps_budgets (migration idempotente, rien de supprimé) : budget stocké d'un niveau par personne ; sans ligne, on lit les sources ci-dessus. Les budgets de pôle sont aussi écrits dans
// goal_capacity_overrides pour que la planification les voie. Calcul sans IA ; rien n'est écrit avant l'appel avec apply = true (« Valider »).
const db = require('../db');
const goals = require('./goals');
const weekplanner = require('./weekplanner');
const tempsmembres = require('./tempsmembres');

db.exec(`CREATE TABLE IF NOT EXISTS temps_budgets (
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  key TEXT NOT NULL DEFAULT '',
  weeklyMinutes INTEGER NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (userId, activityId, key)
)`);

const MAX_MIN = 168 * 60; // seul plafond : les heures d'une semaine
function err(msg, status) { return Object.assign(new Error(msg), { statusCode: status || 400 }); }
function today() { return require('../lib/dates').userToday(); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(iso) { const w = new Date(iso + 'T00:00:00Z').getUTCDay(); return addDays(iso, -((w + 6) % 7)); }
function median(v) { const s = v.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

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
function stored(userId, activityId, key) {
  const r = db.prepare("SELECT weeklyMinutes AS m FROM temps_budgets WHERE userId = ? AND activityId = ? AND key = ?").get(userId, Number(activityId), key || '');
  return r ? r.m : null;
}
// Budget d'un nœud : valeur stockée, sinon sources existantes (tempsmembres), sinon null (inconnu).
function budgetOf(userId, activityId, key) {
  const s = stored(userId, activityId, key);
  if (s !== null) return s;
  const poles = goals.categoriesForActivity(activityId) || [];
  if (!key) { const v = tempsmembres.plannedMin(activityId, null, userId); return v === undefined ? null : v; }
  if (poles.some((p) => p.key === key)) { const v = tempsmembres.plannedMin(activityId, key, userId); return v === undefined ? null : v; }
  return null; // secteur : pas encore de budget
}
function setBudget(userId, activityId, key, minutes) {
  const m = Math.round(minutes);
  if (!(m >= 0 && m <= MAX_MIN)) throw err('Un budget va de 0 à 168 heures par semaine.');
  db.prepare("INSERT INTO temps_budgets (userId, activityId, key, weeklyMinutes, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(userId, activityId, key) DO UPDATE SET weeklyMinutes = excluded.weeklyMinutes, updatedAt = excluded.updatedAt")
    .run(userId, Number(activityId), key || '', m, new Date().toISOString());
  if (key && (goals.categoriesForActivity(activityId) || []).some((p) => p.key === key)) { // budget de pôle : aussi lu par la planification
    db.prepare("INSERT INTO goal_capacity_overrides (activityId, category, userId, weeklyMinutes, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(activityId, category, userId) DO UPDATE SET weeklyMinutes = excluded.weeklyMinutes, updatedAt = excluded.updatedAt")
      .run(Number(activityId), key, userId, m, new Date().toISOString());
  }
}

// État d'un niveau : ligne du dessus (lecture seule), ligne du niveau, lignes voisines, options.
function etat(userId, spec) {
  const act = inScope(userId, spec.activityId), aid = act.id;
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
  const node = (key) => ({ prevuMin: budgetOf(userId, aid, key), passeMin: passeMin(userId, aid, key) });
  const sumKnown = (keys) => keys.reduce((s, k) => s + (budgetOf(userId, aid, k) || 0), 0);
  if (level === 'activite') {
    const me = node(null);
    out.up = { kind: 'total', label: null, prevuMin: cap.minutes, passeMin: passeMin(userId, null, null) };
    out.me = Object.assign({ key: null, label: act.name }, me);
    out.others = userActivities(userId).filter((x) => x.id !== aid).map((x) => ({ key: 'a' + x.id, label: x.name, prevuMin: budgetOf(userId, x.id, null), passeMin: passeMin(userId, x.id, null) }));
    out.modes = ['ajouter'].concat(manual ? ['autres'] : []);
  } else {
    const siblings = level === 'pole' ? poles.filter((p) => p.key !== poleKey) : sects.filter((s) => s.key !== catKey);
    const upKey = level === 'pole' ? null : poleKey;
    const upNode = node(upKey);
    const allSibKeys = (level === 'pole' ? poles : sects).map((x) => x.key);
    const childrenSum = sumKnown(allSibKeys);
    const upPrevu = upNode.prevuMin !== null ? upNode.prevuMin : (childrenSum || null);
    out.up = { kind: level === 'pole' ? 'activite' : 'pole', label: level === 'pole' ? act.name : label(poleKey), prevuMin: upPrevu, passeMin: upNode.passeMin };
    out.me = Object.assign({ key: level === 'pole' ? poleKey : catKey, label: level === 'pole' ? label(poleKey) : label(catKey) }, node(level === 'pole' ? poleKey : catKey));
    out.others = siblings.map((x) => ({ key: x.key, label: x.label, prevuMin: budgetOf(userId, aid, x.key), passeMin: passeMin(userId, aid, x.key) }));
    out.restMin = Math.max(0, (upPrevu || 0) - childrenSum);
    out.restLabel = level === 'pole' ? 'Reste de l’activité' : 'Reste du pôle';
    out.modes = ['ajouter', 'reste', 'autres'];
  }
  out.valueMin = out.me.prevuMin !== null ? out.me.prevuMin : out.me.passeMin; // valeur par défaut : le Prévu existant, à défaut le Passé
  // lignes qui ont du temps (« Prendre sur… »)
  out.takeLines = { autres: (out.others || []).filter((x) => (x.prevuMin || 0) > 0).map((x) => ({ key: x.key, label: x.label, avantMin: x.prevuMin })),
    reste: out.restMin > 0 ? [{ key: 'reste', label: out.restLabel, avantMin: out.restMin }] : [] };
  out.modes = out.modes.filter((m) => m === 'ajouter' || (out.takeLines[m] && out.takeLines[m].length));
  return out;
}

// Plan : effets d'un changement de valeur. apply = true (« Valider ») écrit, sinon simple aperçu (rien n'est modifié).
function plan(userId, body, apply) {
  const e = etat(userId, body);
  const newMin = Math.round(Number(body.newMin));
  if (!Number.isFinite(newMin) || newMin < 0 || newMin > MAX_MIN) throw err('Un budget va de 0 à 168 heures par semaine.');
  const old = e.valueMin || 0, delta = newMin - old, aid = e.activityId;
  const res = { ok: true, deltaMin: delta, increase: delta > 0, oldMin: old, newMin, effects: [], lines: [], balanced: true };
  const cap = weekplanner.getWeeklyCapacity(userId) || { minutes: null, source: null };
  const chain = []; // niveaux du dessus qui grandissent de la différence (Ajouter)
  if (e.level === 'secteur') chain.push({ key: e.poleKey, label: e.up.label, kind: 'pole', prevuMin: e.up.prevuMin });
  if (e.level !== 'activite') chain.push({ key: null, label: (db.prepare('SELECT name FROM activities WHERE id = ?').get(aid) || {}).name, kind: 'activite', prevuMin: e.level === 'pole' ? e.up.prevuMin : budgetOf(userId, aid, null) });
  const totalBefore = cap.minutes;
  const mode = delta > 0 ? String(body.mode || '') : '';
  if (delta > 0 && !['ajouter', 'reste', 'autres'].includes(mode)) { res.balanced = false; res.needsMode = true; }
  if (delta > 0 && mode && mode !== 'ajouter' && !e.modes.includes(mode)) throw err('Cette possibilité n’existe pas ici.');
  if (delta > 0 && mode === 'ajouter') {
    res.effects.push({ level: e.level, label: e.me.label, beforeMin: old, afterMin: newMin });
    chain.forEach((c) => res.effects.push({ level: c.kind, label: c.label, beforeMin: c.prevuMin || 0, afterMin: (c.prevuMin || 0) + delta }));
    res.effects.push({ level: 'total', label: null, beforeMin: totalBefore || 0, afterMin: (totalBefore || 0) + delta });
  } else if (delta > 0 && (mode === 'reste' || mode === 'autres')) {
    const apres = body.apres && typeof body.apres === 'object' ? body.apres : {};
    res.lines = e.takeLines[mode].map((l) => { const a = apres[l.key] === undefined ? l.avantMin : Math.round(Number(apres[l.key])); return { key: l.key, label: l.label, avantMin: l.avantMin, apresMin: a }; });
    const bad = res.lines.some((l) => !(l.apresMin >= 0 && l.apresMin <= l.avantMin));
    const taken = res.lines.reduce((s, l) => s + (l.avantMin - l.apresMin), 0);
    res.balanced = !bad && taken === delta; // le total du niveau du dessus reste constant
    res.takenMin = taken;
  }
  if (apply) {
    if (delta > 0 && !mode) throw err('Choisis d’où vient ce temps.');
    if (delta > 0 && mode !== 'ajouter' && !res.balanced) throw err('Le total du niveau du dessus doit rester constant : équilibre les heures.');
    const nodeKey = e.level === 'activite' ? null : (e.level === 'pole' ? e.poleKey : e.categoryKey);
    db.exec('BEGIN');
    try {
      setBudget(userId, aid, nodeKey, newMin); // le niveau lui-même (une baisse ne touche rien d'autre : le temps libéré reste libre)
      if (delta > 0 && mode === 'ajouter') { // les niveaux du dessus grandissent de la différence ; la capacité manuelle aussi
        chain.forEach((c) => setBudget(userId, aid, c.key, (c.prevuMin || 0) + delta));
        if (cap.source === 'manual') weekplanner.setWeeklyCapacity(userId, (cap.minutes || 0) + delta);
      }
      if (delta > 0 && (mode === 'reste' || mode === 'autres')) { // le total du niveau du dessus reste constant
        if (mode === 'reste' && e.level !== 'activite') { const pk = e.level === 'pole' ? null : e.poleKey; if (stored(userId, aid, pk) === null) setBudget(userId, aid, pk, e.up.prevuMin || 0); } // le parent est fixé : le reste se calcule
        res.lines.forEach((l) => {
          if (l.key === 'reste') return; // le reste se déduit du parent
          if (e.level === 'activite') setBudget(userId, Number(l.key.slice(1)), null, l.apresMin); else setBudget(userId, aid, l.key, l.apresMin);
        });
      }
      db.exec('COMMIT');
    } catch (x) { try { db.exec('ROLLBACK'); } catch (y) { /* rien d'ouvert */ } throw x; }
  }
  return res;
}

module.exports = { etat, plan, budgetOf, setBudget, passeMin, MAX_MIN };
