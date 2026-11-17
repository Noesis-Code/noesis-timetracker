// PLACE D'UNE TÂCHE DANS SON OBJECTIF (18 nov. 2026, schéma « Rangement d'une tâche » v11, blocs 5, 6, 8 ; lot 2).
//  5. Importance : la STRATÉGIE dépend du TYPE de l'objectif. Projet (construction) : phases réformer (rang 2), cadrage (rang 3), réalisation ou finition (rang 4) ; maintenance urgente = rang 1.
//     Progression : paliers, la petite valeur d'abord (5 km avant 10 km), diminution = sens inverse ; maintenance urgente = rang 1.
//  6. Rang dans la chaîne : jamais avant son prérequis (palier précédent, phase précédente) ; sans signal net : ordre d'ajout.
//  8. Place : semaine par semaine dans le cadre de l'objectif (cadreDeDecalage : semaines du périodique, puis périodes de la même année, pluriannuel : fin du bloc de 5 ans). S'il ne reste pas de place,
//     la progression efficace passe en premier et les tâches moins utiles reculent suivant la COURBE de l'objectif (délai réel de la personne, sinon tableau général, jamais d'une seule case). Rien ne trouve de
//     place dans le cadre : DÉPASSEMENT dans son objectif, AUCUN transfert d'heures vers un autre objectif.
// Tout est une PROPOSITION unique (jamais deux choix) : proposer() n'écrit rien, appliquer() écrit ce que la personne valide et APPREND chaque correction (journal du lot 1, champ « place »).
// Les fonctions pures (quantite, importance, ordonner, planifier) n'ont aucune base ni réseau.
const db = require('../db');
require('./taskkind'); // crée les colonnes taskKind, maintUrgent, taskPhase (lues ci-dessous)
require('./taches-rangement'); // crée objectiveId, chainRank

const DEFAULT_MINUTES = 30;
const MAX_WEEKS = 260;
const PHASES = ['reformer', 'cadrage', 'realisation', 'finition'];
const DAY_MS = 86400000;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const posInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (day) => { const w = new Date(day + 'T00:00:00Z').getUTCDay(); return addDays(day, -((w + 6) % 7)); };
const today = () => { try { return require('./dates').userToday(); } catch (e) { return new Date().toISOString().slice(0, 10); } };

// ---- Fonctions pures ----

// Quantité d'un titre de progression : « courir 5 km » -> { valeur: 5, unite: 'km' } ; « semi-marathon » -> 21,0975 km ; sans unité reconnue : null (un nombre seul n'est pas un palier).
const UNITES = { km: 'km', kilometre: 'km', kilometres: 'km', kg: 'kg', kilo: 'kg', kilos: 'kg', lb: 'lb', livre: 'livre', livres: 'livre', page: 'page', pages: 'page', h: 'h', heure: 'h', heures: 'h', min: 'min', minute: 'min', minutes: 'min', mot: 'mot', mots: 'mot', rep: 'rep', reps: 'rep', serie: 'serie', series: 'serie' };
function quantite(label) {
  const t = norm(label);
  if (/semi[ -]?marathon/.test(t)) return { valeur: 21.0975, unite: 'km' };
  if (/\bmarathon\b/.test(t)) return { valeur: 42.195, unite: 'km' };
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*([a-z]+)\b/);
  if (!m || !UNITES[m[2]]) return null;
  const valeur = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(valeur) ? { valeur, unite: UNITES[m[2]] } : null;
}

const phaseIdx = (phase) => { const i = PHASES.indexOf(phase); return i < 0 ? 2 : i; }; // sans phase : réalisation (neutre)

// Importance d'une tâche : { rang 1..4 }. t : { taskKind, maintUrgent, phase, reform }. strategie : 'projet' | 'progression'.
function importance(t, strategie) {
  if (t.taskKind === 'maintenance' && t.maintUrgent) return 1;
  if (t.phase === 'reformer' || t.reform) return 2;
  if (strategie !== 'progression' && t.taskKind === 'developpement' && t.phase === 'cadrage') return 3;
  return 4;
}

// Clé de chaîne : projet = indice de phase ; progression = quantité (négative si sens inverse) ; sinon null (ordre d'ajout).
function cleChaine(t, strategie, sens) {
  if (strategie === 'progression') { const q = quantite(t.label); return q ? (sens === 'inverse' ? -q.valeur : q.valeur) : null; }
  return t.phase ? phaseIdx(t.phase) : null;
}

// Ordre de la chaîne : d'abord l'importance (rang), puis l'ordre d'ajout ; dans un même rang, les tâches qui ont une clé de chaîne sont REMISES dans l'ordre de leur clé,
// mais seulement dans les emplacements que ces tâches occupaient (les tâches sans clé gardent leur place d'ajout : « s'inscrire à la course » ne passe pas après « courir 10 km » parce qu'elle n'a pas de chiffre).
// Prérequis : une clé plus petite passe toujours avant une clé plus grande du même rang.
function ordonner(taches, strategie, sens) {
  const base = taches.map((t) => Object.assign({}, t, { rang: importance(t, strategie), cle: cleChaine(t, strategie, sens) })).sort((a, b) => a.rang - b.rang || a.id - b.id);
  const out = base.slice();
  [1, 2, 3, 4].forEach((r) => {
    const slots = [];
    out.forEach((t, i) => { if (t.rang === r && t.cle != null) slots.push(i); });
    const sorted = slots.map((i) => out[i]).sort((a, b) => a.cle - b.cle || a.id - b.id);
    slots.forEach((i, k) => { out[i] = sorted[k]; });
  });
  return out;
}

// Planification pure : semaines = ['AAAA-MM-JJ' (lundi), ...] ; cap = minutes par semaine (null = sans limite) ; delai(prevCle, cle) -> semaines (≥ 1) entre deux paliers.
// Chaque tâche prend la première semaine libre à partir de : le palier précédent + le délai (progression) ou la semaine de la phase précédente (projet).
// date : la semaine de sa date est sa LIMITE ; au-delà -> apresDate. Aucune semaine libre dans le cadre -> dernière semaine, depasse = true (aucun transfert d'heures).
function planifier(ordonnees, semaines, cap, strategie, delai) {
  const n = semaines.length, load = new Array(n).fill(0), out = [];
  let prev = null;
  const idxOfDate = (d) => { if (!isDay(d) || !n) return null; const m = mondayOf(d); const i = semaines.indexOf(m); return i >= 0 ? i : (m < semaines[0] ? 0 : n - 1); };
  ordonnees.forEach((t) => {
    const minutes = Number(t.minutes) > 0 ? Number(t.minutes) : DEFAULT_MINUTES;
    let minIdx = 0;
    if (t.cle != null && prev) {
      const g = strategie === 'progression' ? (delai ? delai(prev.cle, t.cle) : 1) : 0;
      const gap = strategie === 'progression' ? (g === 0 ? 0 : Math.max(1, Math.round(g || 1))) : 0; // 0 : « à mon rythme », aucun écart minimal imposé (l'ordre de la chaîne reste)
      minIdx = prev.idx + (t.cle === prev.cle ? 0 : gap);
    }
    let idx = -1;
    for (let i = Math.min(minIdx, n - 1); i < n; i += 1) { if (cap == null || load[i] === 0 || load[i] + minutes <= cap) { idx = i; break; } }
    const depasse = idx < 0;
    if (depasse) idx = n - 1;
    const lim = idxOfDate(t.date);
    load[idx] += minutes;
    if (t.cle != null) prev = { idx, cle: t.cle };
    out.push({ id: t.id, rang: t.rang, cle: t.cle, idx, semaine: semaines[idx], depasse, apresDate: lim != null && idx > lim });
  });
  return out;
}

// Semaines du cadre : du lundi de max(aujourd'hui, début) au dernier lundi avant min(fin, fin du cadre).
function semainesDuCadre(objectif, cadre, aujourdhui) {
  const from = mondayOf(objectif.startDate > aujourdhui ? objectif.startDate : aujourdhui);
  const end = cadre && cadre.end && cadre.end < objectif.endDate ? cadre.end : objectif.endDate;
  const out = [];
  for (let d = from; d <= end && out.length < MAX_WEEKS; d = addDays(d, 7)) out.push(d);
  return out.length ? out : [mondayOf(aujourdhui)];
}

// ---- Lecture (base) ----
const parseMeta = (r) => { try { return JSON.parse((r && r.metaJson) || '{}'); } catch (e) { return {}; } };

function tachesDeLObjectif(objectiveId, itemId) {
  const rows = db.prepare(`SELECT i.id, i.label, i.done, i.dueDate, i.chainRank, i.taskKind, i.maintUrgent, i.taskPhase, i.medianMinutes, i.plannedUserId
    FROM sub_project_items i WHERE (i.objectiveId = ? OR i.id = ?) AND i.done = 0 ORDER BY i.id`).all(objectiveId, itemId || 0);
  return rows.map((r) => ({ id: r.id, label: r.label, date: r.dueDate && isDay(String(r.dueDate).slice(0, 10)) ? String(r.dueDate).slice(0, 10) : null, chainRank: r.chainRank || null,
    taskKind: r.taskKind || null, maintUrgent: !!r.maintUrgent, phase: r.taskPhase || null, minutes: r.medianMinutes || null, plannedUserId: r.plannedUserId || null }));
}

// Type de l'objectif (projet ou progression) : celui de sa catégorie ; sans type net, la présence de paliers chiffrés dans ses tâches décide ; sinon projet (neutre).
async function strategieDe(activityId, categoryKey, taches, opts) {
  if (opts && (opts.type === 'projet' || opts.type === 'progression')) return { strategie: opts.type, sens: opts.sens || null };
  let t = null;
  try { if (categoryKey) t = await require('./objectifs-type').typeEffectif(activityId, categoryKey, opts && opts.typeOpts); } catch (e) { t = null; }
  if (t && (t.type === 'projet' || t.type === 'progression')) return { strategie: t.type, sens: t.sens || null };
  const chiffrees = taches.filter((x) => quantite(x.label)).length;
  return { strategie: chiffrees >= 2 ? 'progression' : 'projet', sens: null };
}

// Délai (semaines) entre deux paliers : l'écart RÉEL de la personne (puis de l'ensemble, ≥ 5 personnes consentantes), sinon le tableau général, sinon 1.
function delaiDe(userId, famille, heuresParSemaine, rythme) {
  return (de, vers) => {
    try {
      if (rythme === 'libre') return 0; // « à mon rythme » (panneau Stratégie) : pas d'écart minimal entre paliers
      if (rythme === 'regulier') return 1; // « régulier » : un palier par semaine au plus
      if (!famille) return 1;
      const perso = require('./taches-apprentissage').personalDelay(userId, famille, de, vers);
      if (perso && perso.semaines > 0) return Math.max(1, Math.round(perso.semaines));
      const r = require('./objectifs-delais').delaiMinimal(famille, de, vers, { heuresParSemaine: heuresParSemaine || undefined });
      return r && r.semaines > 0 ? r.semaines : 1;
    } catch (e) { return 1; }
  };
}

// PROPOSITION de place (rien n'est écrit) : body { itemId, objectiveId? } -> { rangement, decales, chaine, depassements, responsableId } ou { rangement: null, raison }.
//  rangement : la semaine de la tâche ; decales : les tâches de l'objectif qui changent de semaine ({ id, label, avant, apres }) ; chaine : la progression entière affichée (5, 10, 15, 20 km) ;
//  depassements : tâches qui ne trouvent aucune place dans le cadre (dépassement, aucun transfert d'heures) ou qui passent après leur date.
async function proposer(userId, body, opts) {
  const itemId = posInt(body && body.itemId);
  const it = itemId && db.prepare('SELECT i.id, i.label, i.objectiveId, p.activityId, p.goalCategory FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId WHERE i.id = ?').get(itemId);
  if (!it || !db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(it.activityId, userId)) { const e = new Error('Tâche introuvable.'); e.statusCode = 404; throw e; }
  const objectiveId = posInt(body && body.objectiveId) || it.objectiveId;
  const obj = objectiveId && db.prepare('SELECT * FROM user_objectives WHERE id = ? AND userId = ?').get(objectiveId, userId);
  if (!obj) return { rangement: null, raison: 'sans objectif', decales: [], chaine: [], depassements: [] };
  const R = require('./taches-rangement');
  const meta = parseMeta(obj);
  const cadre = R.cadreDeDecalage(obj.id);
  const semaines = semainesDuCadre(obj, cadre, today());
  const taches = tachesDeLObjectif(obj.id, it.id);
  const { strategie, sens } = await strategieDe(it.activityId, obj.categoryKey || obj.poleKey || it.goalCategory || null, taches, opts);
  const hpw = meta.hoursPerWeek != null && Number(meta.hoursPerWeek) > 0 ? Number(meta.hoursPerWeek) : null;
  const cap = hpw ? Math.round(hpw * 60) : null;
  const ordre = ordonner(taches, strategie, sens);
  let rythme = null;
  try { rythme = require('./categorie-strategie').effective(it.activityId, obj.categoryKey || obj.poleKey || it.goalCategory || null).rythme; } catch (e) { rythme = null; }
  const plan = planifier(ordre, semaines, cap, strategie, delaiDe(userId, obj.objectif_famille || null, hpw, rythme));
  const byId = new Map(taches.map((t) => [t.id, t]));
  const idxAvant = (t) => (t.date ? (semaines.indexOf(mondayOf(t.date)) >= 0 ? semaines.indexOf(mondayOf(t.date)) : null) : null);
  const planById = new Map(plan.map((p) => [p.id, p]));
  const decales = [];
  plan.forEach((p) => {
    if (p.id === it.id) return;
    const t = byId.get(p.id), avant = idxAvant(t);
    if (avant != null && avant !== p.idx) decales.push({ id: p.id, label: t.label, avant: semaines[avant], apres: p.semaine });
  });
  const moi = planById.get(it.id);
  const chaine = plan.filter((p) => p.cle != null).map((p, k) => { const t = byId.get(p.id), q = quantite(t.label); return { id: p.id, rang: k + 1, label: t.label, valeur: q ? q.valeur : null, unite: q ? q.unite : null, semaine: p.semaine, nouvelle: p.id === it.id }; });
  const depassements = plan.filter((p) => p.depasse || p.apresDate).map((p) => ({ id: p.id, label: byId.get(p.id).label, semaine: p.semaine, raison: p.depasse ? 'aucune place dans le cadre : reste dans son objectif en dépassement' : 'après sa date' }));
  let responsableId = null;
  try { responsableId = (require('./taches-responsable').proposer(userId, it.activityId, { itemId: it.id, label: it.label, categoryKey: obj.categoryKey || null, poleKey: obj.poleKey || null }) || {}).userId || null; } catch (e) { responsableId = userId; }
  // Membres de l'activité (seulement s'il y en a plusieurs : sinon la tâche est à lui et la ligne « Responsable » n'est pas affichée).
  let membres = [];
  try { const ids = require('./taches-responsable').members(it.activityId); if (ids.length > 1) membres = ids.map((id) => ({ id, name: (db.prepare('SELECT name FROM users WHERE id = ?').get(id) || {}).name || '' })); } catch (e) { membres = []; }
  const responsable = membres.find((m) => m.id === responsableId) || null;
  return { objectiveId: obj.id, objectifTitre: obj.title, tache: it.label, membres, responsable, strategie, sens, semainesDuCadre: semaines.length, cadre: cadre ? { start: cadre.start, end: cadre.end } : null,
    rangement: moi ? { itemId: it.id, semaine: moi.semaine, rang: plan.findIndex((p) => p.id === it.id) + 1 } : null, decales, chaine, depassements, responsableId,
    lignes: plan.map((p, k) => ({ id: p.id, semaine: p.semaine, rang: k + 1 })) };
}

// APPLICATION de ce que la personne a validé : body { itemId, objectiveId, lignes: [{ id, semaine, rang }], proposition?: { lignes }, responsableId? }.
// Pose l'objectif, la date (lundi de la semaine) et le rang de chaque ligne validée ; toute ligne que la personne a changée par rapport à la proposition est APPRISE (champ « place »).
// Jamais d'heures modifiées. Renvoie { appliquees }.
function appliquer(userId, body) {
  const fail = (m, s) => { const e = new Error(m); e.statusCode = s || 400; return e; };
  const itemId = posInt(body && body.itemId);
  const it = itemId && db.prepare('SELECT i.id, i.label, p.activityId FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId WHERE i.id = ?').get(itemId);
  if (!it || !db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(it.activityId, userId)) throw fail('Tâche introuvable.', 404);
  const objectiveId = posInt(body.objectiveId);
  if (objectiveId && !db.prepare('SELECT 1 FROM user_objectives WHERE id = ? AND userId = ?').get(objectiveId, userId)) throw fail('Objectif introuvable.', 404);
  const A = require('./taches-apprentissage'), R = require('./taches-rangement');
  const prop = new Map(((body.proposition && body.proposition.lignes) || []).map((l) => [Number(l.id), l.semaine]));
  const sel = db.prepare('SELECT i.id, i.label, i.dueDate FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId WHERE i.id = ? AND p.activityId = ?');
  let n = 0;
  (Array.isArray(body.lignes) ? body.lignes : []).slice(0, 200).forEach((l) => {
    const row = sel.get(Number(l.id), it.activityId);
    if (!row || !isDay(l.semaine)) return;
    const semaine = mondayOf(l.semaine);
    db.prepare('UPDATE sub_project_items SET dueDate = ?, dueDateAuto = 0 WHERE id = ?').run(semaine, row.id);
    if (Number(l.rang) > 0) R.setLink(row.id, { chainRank: Number(l.rang) });
    const voulue = prop.get(row.id);
    if (voulue && voulue !== semaine) A.recordCorrection(userId, it.activityId, row.label, 'place', voulue, semaine);
    n += 1;
  });
  if (objectiveId) R.setLink(it.id, { objectiveId });
  if (body.responsableId != null && body.responsableId !== '') {
    if (!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(it.activityId, String(body.responsableId))) throw fail('Seul un membre de l’activité peut être responsable.');
    db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run(String(body.responsableId), it.id);
  }
  return { appliquees: n };
}

module.exports = { quantite, importance, cleChaine, ordonner, planifier, semainesDuCadre, strategieDe, proposer, appliquer, mondayOf, addDays, PHASES };
