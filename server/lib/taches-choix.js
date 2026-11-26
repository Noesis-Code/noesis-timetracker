// CHOIX DE LA CATÉGORIE ET DE L'OBJECTIF D'UNE TÂCHE (18 nov. 2026, schéma « Rangement d'une tâche » v10, blocs 1 à 4).
//  1. A-t-elle une date ? Oui : on ne garde que les objectifs qui couvrent cette date. Non : tous les objectifs à venir (même dans 5 ans).
//  2. Quelle catégorie ? La personne ne la choisit pas : l'IA la propose par le sens.
//  3. Une tâche existante la regroupe-t-elle ? (« acheter les carottes » -> « faire les courses ») : elle devient une étape de cette tâche (même objectif).
//  4. Quel objectif ? UN SEUL appel IA avec l'arbre de la catégorie ; pertinence par le sens, descente pluriannuel -> annuel -> périodique -> semaine (le jugement porte sur les
//     périodiques puis l'annuel, jamais sur la semaine). TOUJOURS UNE SEULE proposition : jamais deux choix, jamais « je ne sais pas ». Doute ou objectif trop vague = l'échéance la plus proche.
//     Aucun objectif ne convient = la tâche reste dans sa catégorie.
// Modèle rapide d'abord, modèle fort si la confiance est sous le seuil (goalstaskclassify). Mémoire exacte (même titre déjà rangé par la personne) : aucun appel IA. Plafond gratuit : respecté par callModel.
// Jamais bloquant : toute erreur donne une proposition par règles (repli). Rien n'est écrit ici : le panneau de validation applique (appliquer).
const db = require('../db');
const A = require('./taches-apprentissage');
require('./taches-rangement'); // crée les colonnes objectiveId / parentItemId / chainRank (lues ci-dessous)

const MAX_OBJECTIFS = 25, MAX_TACHES = 25, MAX_CATS = 25;
const today = () => new Date().toISOString().slice(0, 10);
const parseMeta = (r) => { try { return JSON.parse((r && r.metaJson) || '{}'); } catch (e) { return {}; } };

// Les catégories (pôles et secteurs) de l'activité : [{ key, label, description }].
function categories(activityId) {
  try {
    return require('./goals').categoriesForActivity(activityId).slice(0, MAX_CATS).map((c) => ({ key: c.key, label: c.label || c.key, description: String(c.description || '').slice(0, 160) }));
  } catch (e) { return []; }
}
// Les objectifs candidats : non abandonnés, non atteints, à venir ; avec une date, seulement ceux qui la couvrent.
function objectifs(userId, activityId, date) {
  try {
    const t = today();
    const rows = db.prepare('SELECT id, title, startDate, endDate, level, poleKey, categoryKey, parentId, metaJson FROM user_objectives WHERE userId = ? AND activityId = ? AND isMacro = 0 AND endDate >= ? ORDER BY endDate, id').all(userId, activityId, t);
    return rows.filter((r) => !parseMeta(r).abandoned).filter((r) => !date || (r.startDate <= date && date <= r.endDate)).slice(0, MAX_OBJECTIFS)
      .map((r) => { const m = parseMeta(r); return { id: r.id, title: r.title, endDate: r.endDate, level: r.level || 'activite', categoryKey: r.categoryKey || r.poleKey || null, description: String(m.description || '').slice(0, 140), type: m.type || null }; });
  } catch (e) { return []; }
}
// Tâches ouvertes de l'activité qui peuvent regrouper la nouvelle (les plus récentes d'abord, sans étape déjà regroupée sous une autre).
function tachesRegroupantes(activityId, excludeId) {
  try {
    return db.prepare(`SELECT i.id, i.label FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId
      WHERE p.activityId = ? AND i.done = 0 AND i.parentItemId IS NULL AND i.id != ? ORDER BY i.id DESC LIMIT ?`).all(activityId, Number(excludeId) || 0, MAX_TACHES);
  } catch (e) { return []; }
}

function buildPrompt(ctx) {
  const lines = [];
  lines.push('Une personne vient d\'écrire cette tâche :');
  lines.push('"' + ctx.label + '"' + (ctx.date ? ' (date : ' + ctx.date + ')' : ''));
  lines.push('Choisis UNE catégorie, UN objectif et, si une tâche existante la regroupe, cette tâche. Réponds toujours par UNE seule proposition, jamais deux choix, jamais « je ne sais pas ».');
  lines.push('Catégories (clé : nom — description) :');
  ctx.cats.forEach((c) => lines.push('- ' + c.key + ' : ' + c.label + (c.description ? ' — ' + c.description : '')));
  lines.push('Objectifs (id | catégorie | niveau | titre | échéance | type) :');
  if (!ctx.objs.length) lines.push('(aucun)');
  ctx.objs.forEach((o) => lines.push(o.id + ' | ' + (o.categoryKey || '-') + ' | ' + o.level + ' | ' + o.title + ' | ' + o.endDate + (o.type ? ' | ' + o.type : '')));
  if (ctx.taches.length) { lines.push('Tâches ouvertes qui peuvent regrouper celle-ci (id | titre) :'); ctx.taches.forEach((t) => lines.push(t.id + ' | ' + String(t.label).slice(0, 80))); }
  if (ctx.exemples.length) { lines.push('Tes corrections récentes (à suivre en priorité pour des tâches semblables) :'); ctx.exemples.forEach((e) => lines.push('- « ' + e.label + ' » -> ' + e.value)); }
  if (ctx.aide) lines.push('Aide : pour un titre de ce genre, la majorité des personnes choisit la catégorie ' + ctx.aide.value + '.');
  lines.push('Règles : juge le SENS de la tâche, pas les mots communs. Descends du plus grand objectif au plus petit : juge les objectifs annuels et périodiques, jamais la semaine. Si tu doutes ou si l\'objectif est trop vague, prends celui dont l\'échéance arrive en premier. Si aucun objectif ne convient, objectif = 0. Une tâche n\'est regroupée (parent) que si elle est clairement une étape de l\'autre ; sinon parent = 0.');
  lines.push('Réponds sur une seule ligne, sans autre texte : catégorie | objectif | parent | confiance (0 à 100). Exemple : c2 | 14 | 0 | 85');
  return lines.join('\n');
}
// « c2 | 14 | 0 | 85 » -> { categoryKey, objectiveId, parentItemId, confidence } ; clés et identifiants vérifiés contre le contexte.
function parseAnswer(text, ctx) {
  const parts = String(text || '').split('\n').find((l) => l.includes('|')) || '';
  const p = parts.split('|').map((x) => x.trim());
  if (p.length < 2) return null;
  const key = ctx.cats.find((c) => c.key === p[0] || c.label.toLowerCase() === p[0].toLowerCase());
  const obj = ctx.objs.find((o) => String(o.id) === p[1].replace(/\D/g, ''));
  const par = ctx.taches.find((t) => String(t.id) === (p[2] || '').replace(/\D/g, ''));
  const conf = Number((p[3] || '').replace(/\D/g, ''));
  if (!key && !obj) return null;
  return { categoryKey: key ? key.key : null, objectiveId: obj ? obj.id : null, parentItemId: par ? par.id : null, confidence: Number.isFinite(conf) && conf > 0 ? Math.min(100, conf) : null };
}
// Repli par règles : la catégorie aidée par les motifs globaux, sinon celle de la dernière tâche ouverte, sinon la première ; l'objectif de cette catégorie à l'échéance la plus proche.
function repli(ctx, activityId) {
  let categoryKey = ctx.aide && ctx.cats.find((c) => c.key === ctx.aide.value) ? ctx.aide.value : null;
  if (!categoryKey) { try { const r = db.prepare('SELECT p.goalCategory AS k FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId WHERE p.activityId = ? AND p.goalCategory IS NOT NULL ORDER BY i.id DESC LIMIT 1').get(activityId); if (r && ctx.cats.find((c) => c.key === r.k)) categoryKey = r.k; } catch (e) { /* repli suivant */ } }
  if (!categoryKey && ctx.cats[0]) categoryKey = ctx.cats[0].key;
  const proches = ctx.objs.filter((o) => !categoryKey || !o.categoryKey || o.categoryKey === categoryKey).sort((a, b) => (a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : a.id - b.id));
  return { categoryKey, objectiveId: proches[0] ? proches[0].id : null, parentItemId: null, confidence: null };
}

// userId, activityId, label ; opts : { date, itemId, ai (tests : (prompt, { tier }) -> texte), categoryKey (catégorie imposée, ex. connecteur) }.
// Renvoie TOUJOURS { categoryKey, objectiveId, parentItemId, source: 'memoire' | 'ia' | 'ia-fort' | 'regles', confidence }.
async function choisirCategorieObjectif(userId, activityId, label, opts) {
  const o = opts || {};
  const clean = String(label || '').trim();
  const ctx = { label: clean, date: o.date || null, cats: categories(activityId), objs: objectifs(userId, activityId, o.date), taches: tachesRegroupantes(activityId, o.itemId), exemples: [], aide: null };
  try {
    ctx.exemples = A.recentExamples(userId, activityId, 'category', 3).concat(A.recentExamples(userId, activityId, 'objective', 3)).slice(0, 6);
    ctx.aide = A.globalSuggestion(clean, 'category');
  } catch (e) { /* sans aide */ }
  // Mémoire exacte : même titre déjà rangé par la personne -> même place, sans appel IA.
  try {
    const mc = A.lastChoiceFor(userId, activityId, clean, 'category'), mo = A.lastChoiceFor(userId, activityId, clean, 'objective');
    const cat = mc && ctx.cats.find((c) => c.key === mc), obj = mo && ctx.objs.find((x) => x.title === mo);
    if (cat || obj) return { categoryKey: cat ? cat.key : (o.categoryKey || null), objectiveId: obj ? obj.id : null, parentItemId: null, source: 'memoire', confidence: 100 };
  } catch (e) { /* suite */ }
  if (o.categoryKey && ctx.cats.find((c) => c.key === o.categoryKey)) { ctx.cats = ctx.cats.filter((c) => c.key === o.categoryKey); ctx.objs = ctx.objs.filter((x) => !x.categoryKey || x.categoryKey === o.categoryKey); }
  // Un seul appel IA : modèle rapide, puis fort si la confiance est basse.
  let ai = o.ai || null, minConf = 80, fast = null;
  if (!ai) {
    try {
      const cl = require('./goalstaskclassify');
      if (cl.configured()) { fast = cl.fastModel(); minConf = cl.minConfidence(); ai = (prompt, t) => cl.callModel(prompt, 60, t && t.tier === 'fort' ? 'rangement-tache:repli' : 'rangement-tache', t && t.tier === 'fort' ? undefined : fast); }
    } catch (e) { ai = null; }
  }
  if (ai && ctx.cats.length) {
    try {
      const prompt = buildPrompt(ctx);
      let r = parseAnswer(await ai(prompt, { tier: 'rapide' }), ctx), fort = false;
      if (!r || r.confidence == null || r.confidence < minConf) { const r2 = parseAnswer(await ai(prompt, { tier: 'fort' }), ctx); if (r2) { r = r2; fort = true; } }
      if (r) {
        const rep = repli(ctx, activityId);
        // Doute ou objectif absent de la réponse : l'objectif à l'échéance la plus proche de la catégorie choisie ; aucun objectif dans la catégorie : reste sans objectif.
        const categoryKey = r.categoryKey || rep.categoryKey;
        let objectiveId = r.objectiveId;
        if (!objectiveId && !r.parentItemId && (r.confidence != null && r.confidence < minConf)) objectiveId = repli(Object.assign({}, ctx, { aide: { value: categoryKey } }), activityId).objectiveId;
        return { categoryKey, objectiveId, parentItemId: r.parentItemId, source: fort ? 'ia-fort' : 'ia', confidence: r.confidence };
      }
    } catch (e) { /* repli */ }
  }
  return Object.assign(repli(ctx, activityId), { source: 'regles' });
}

// Applique une proposition validée : liens de la tâche (objectif, étape de), rang laissé tel quel. Rien d'autre.
function appliquer(itemId, proposal) {
  const R = require('./taches-rangement');
  const patch = {};
  if (proposal && 'objectiveId' in proposal) patch.objectiveId = proposal.objectiveId;
  if (proposal && 'parentItemId' in proposal) patch.parentItemId = proposal.parentItemId;
  return R.setLink(itemId, patch);
}

// Correction manuelle d'une tâche (objectif, étape de, rang, nature, phase) : le changement est appliqué ET appris (journal de la personne, motifs anonymes avec consentement).
// body : { itemId, field: 'objective' | 'group' | 'rank' | 'nature' | 'phase', to }. La personne doit être membre de l'activité de la tâche. Renvoie le lien final.
function corriger(userId, body) {
  const R = require('./taches-rangement'), tk = require('./taskkind');
  const fail = (m, s) => { const e = new Error(m); e.statusCode = s || 400; return e; };
  const itemId = Number(body && body.itemId), field = String((body && body.field) || '');
  const it = db.prepare('SELECT i.id, i.label, p.activityId FROM sub_project_items i JOIN sub_projects p ON p.id = i.subProjectId WHERE i.id = ?').get(itemId);
  if (!it || !db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(it.activityId, userId)) throw fail('Tâche introuvable.', 404);
  const before = R.readLink(it.id) || {};
  const to = body.to == null || body.to === '' ? null : body.to;
  if (field === 'objective') {
    let title = null;
    if (to != null) { const o = db.prepare('SELECT id, title FROM user_objectives WHERE id = ? AND userId = ?').get(Number(to), userId); if (!o) throw fail('Objectif introuvable.', 404); title = o.title; }
    const was = before.objectiveId ? (db.prepare('SELECT title FROM user_objectives WHERE id = ?').get(before.objectiveId) || {}).title || null : null;
    R.setLink(it.id, { objectiveId: to == null ? null : Number(to) });
    if (title) A.recordCorrection(userId, it.activityId, it.label, 'objective', was, title);
  } else if (field === 'group') {
    let title = null;
    if (to != null) { const p = db.prepare('SELECT i.id, i.label FROM sub_project_items i JOIN sub_projects sp ON sp.id = i.subProjectId WHERE i.id = ? AND sp.activityId = ?').get(Number(to), it.activityId); if (!p) throw fail('Tâche regroupante introuvable.', 404); title = p.label; }
    R.setLink(it.id, { parentItemId: to == null ? null : Number(to) });
    if (title) A.recordCorrection(userId, it.activityId, it.label, 'group', null, title);
  } else if (field === 'rank') {
    R.setLink(it.id, { chainRank: to == null ? null : Number(to) });
    A.recordCorrection(userId, it.activityId, it.label, 'rank', before.chainRank, to);
  } else if (field === 'nature') {
    if (!tk.KINDS.includes(to)) throw fail('Nature inconnue.');
    const was = tk.read(it.id).kind;
    tk.setNature(it.id, to, it.label);
    A.recordCorrection(userId, it.activityId, it.label, 'nature', was, to);
  } else if (field === 'phase') {
    if (to != null && !tk.PHASES.includes(to)) throw fail('Phase inconnue.');
    const was = db.prepare('SELECT taskPhase FROM sub_project_items WHERE id = ?').get(it.id).taskPhase;
    tk.setPhase(it.id, to);
    A.recordCorrection(userId, it.activityId, it.label, 'phase', was, to);
  } else if (field === 'responsable') {
    if (to != null && !db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(it.activityId, String(to))) throw fail('Seul un membre de l\u2019activité peut être exécutant.');
    const was = db.prepare('SELECT plannedUserId FROM sub_project_items WHERE id = ?').get(it.id).plannedUserId;
    db.prepare('UPDATE sub_project_items SET plannedUserId = ? WHERE id = ?').run(to == null ? null : String(to), it.id);
    A.recordCorrection(userId, it.activityId, it.label, 'responsable', was, to == null ? null : String(to));
  } else throw fail('Champ inconnu.');
  return R.readLink(it.id);
}

// Proposition complète d'un rangement (18 nov. 2026, bloc 7 du schéma v11) : catégorie, objectif, tâche regroupante ET responsable. TOUJOURS UNE SEULE proposition, correctible ; la correction est apprise.
// Responsable : un seul membre = lui ; sinon les parts voulues décident, puis le responsable de catégorie avec héritage (taches-responsable.js).
async function choisir(userId, activityId, label, opts) {
  const p = await choisirCategorieObjectif(userId, activityId, label, opts);
  try {
    let poleKey = null; try { poleKey = require('./goals').parentKeyFor(activityId, p.categoryKey) || null; } catch (e) { /* pôle lui-même */ }
    const r = require('./taches-responsable').proposer(userId, activityId, { itemId: opts && opts.itemId, label, categoryKey: p.categoryKey, poleKey });
    p.responsableId = r.userId; p.responsableSource = r.source;
  } catch (e) { p.responsableId = userId; p.responsableSource = 'regles'; }
  return p;
}

module.exports = { corriger, choisir, appliquer, buildPrompt, parseAnswer, repli, categories, objectifs, tachesRegroupantes };
