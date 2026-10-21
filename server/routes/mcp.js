// « Connecter mon IA » — serveur MCP distant : lectures, plus écritures gratuites réservées aux jetons « écriture ».
// POST /mcp : Streamable HTTP, JSON-RPC 2.0 sans état. Authentification par
// jeton personnel (Authorization: Bearer ... ou POST /mcp/t/<jeton>), voir server/lib/aitokens.js.
// Les écritures (outils `write`) agissent sur le compte du jeton seulement, sont journalisées (lib/aiwritelog.js) et réversibles.
// Gestion des jetons depuis Réglages : /api/ai-tokens (session de l'utilisateur).
const express = require('express');
const db = require('../db');
const aitokens = require('../lib/aitokens');
const goals = require('../lib/goals');
const goalstasks = require('../lib/goalstasks');
const goalsauto = require('../lib/goalsauto');
const sp = require('../lib/subprojects');
const push = require('../lib/push');
const { requireAuth } = require('../lib/session');

const router = express.Router();
const PROTOCOL_VERSION = '2025-03-26';

// ---------------------------------------------------------------- données
function todayLocal() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function isDay(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

function userActivities(userId) {
  return db.prepare(`SELECT a.id, a.name FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE m.userId = ? AND a.active = 1 ORDER BY a.name`).all(userId);
}
// Activité demandée, uniquement si l'utilisateur en est membre.
function memberActivity(userId, activityId) {
  const id = Number(activityId);
  if (!Number.isInteger(id)) throw toolError('activityId requis (voir lister_activites).');
  const a = db.prepare(`SELECT a.id, a.name FROM activities a JOIN activity_members m ON m.activityId = a.id
    WHERE a.id = ? AND m.userId = ?`).get(id, userId);
  if (!a) throw toolError("Activité introuvable ou tu n'en es pas membre.");
  return a;
}
function toolError(message) { return Object.assign(new Error(message), { toolError: true }); }

function poleLabels(activityId) {
  const m = {};
  goals.categoriesForActivity(activityId).forEach((p) => { m[p.key] = p.label; });
  return m;
}
function poleMatches(activityId, wanted) {
  if (!wanted) return null;
  const w = String(wanted).trim().toLowerCase();
  const hit = goals.categoriesForActivity(activityId).find((p) => p.key.toLowerCase() === w || String(p.label).toLowerCase() === w);
  return hit ? hit.key : '__aucun__';
}
// Une tâche confiée à un autre membre n'est pas « à l'utilisateur ».
function mine(task, userId) { return !task.plannedUserId || task.plannedUserId === userId; }

function formatTask(t, labels, activity) {
  return {
    id: t.id, activityId: activity.id, activite: activity.name, tache: t.label,
    pole: labels[t.poleKey] || t.poleKey, secteur: t.key === t.poleKey ? null : t.groupLabel,
    echeance: t.dueDate, terminee: !!t.done, terminee_le: t.doneAt || null,
  };
}

const tools = {
  lister_activites: {
    description: "Liste les activités (projets) dont l'utilisateur est membre, avec leurs pôles.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run(userId) {
      return userActivities(userId).map((a) => ({
        activityId: a.id, nom: a.name,
        poles: goals.categoriesForActivity(a.id).map((p) => ({ cle: p.key, nom: p.label })),
      }));
    },
  },
  lister_taches: {
    description: "Liste les tâches de l'utilisateur d'une activité. Les secteurs remontent à leur pôle. Filtres : statut (a_faire par défaut, terminees, toutes), du/au (échéance AAAA-MM-JJ), pole (nom ou clé).",
    inputSchema: {
      type: 'object',
      properties: {
        activityId: { type: 'integer', description: "Identifiant de l'activité (lister_activites)." },
        statut: { type: 'string', enum: ['a_faire', 'terminees', 'toutes'] },
        du: { type: 'string', description: 'Échéance minimale AAAA-MM-JJ.' },
        au: { type: 'string', description: 'Échéance maximale AAAA-MM-JJ.' },
        pole: { type: 'string', description: 'Nom ou clé du pôle.' },
      },
      required: ['activityId'], additionalProperties: false,
    },
    run(userId, args) {
      const a = memberActivity(userId, args.activityId);
      const statut = args.statut || 'a_faire';
      if (!['a_faire', 'terminees', 'toutes'].includes(statut)) throw toolError('statut invalide.');
      if (args.du != null && !isDay(args.du)) throw toolError('du : format AAAA-MM-JJ attendu.');
      if (args.au != null && !isDay(args.au)) throw toolError('au : format AAAA-MM-JJ attendu.');
      const labels = poleLabels(a.id);
      const pole = poleMatches(a.id, args.pole);
      const list = goalstasks.allTasksWithGroup(a.id).filter((t) => mine(t, userId))
        .filter((t) => statut === 'toutes' || (statut === 'terminees' ? t.done : !t.done))
        .filter((t) => !pole || t.poleKey === pole)
        .filter((t) => !args.du || (t.dueDate && t.dueDate >= args.du))
        .filter((t) => !args.au || (t.dueDate && t.dueDate <= args.au));
      return { aujourdhui: todayLocal(), nombre: list.length, taches: list.slice(0, 300).map((t) => formatTask(t, labels, a)) };
    },
  },
  objectifs: {
    description: "Objectifs d'une activité. horizon : annuel (les objectifs des périodes de l'année), periodique (période en cours), hebdomadaire (semaines de la période en cours). pole facultatif.",
    inputSchema: {
      type: 'object',
      properties: {
        activityId: { type: 'integer' },
        horizon: { type: 'string', enum: ['annuel', 'periodique', 'hebdomadaire'] },
        pole: { type: 'string' },
      },
      required: ['activityId', 'horizon'], additionalProperties: false,
    },
    run(userId, args) {
      const a = memberActivity(userId, args.activityId);
      if (!['annuel', 'periodique', 'hebdomadaire'].includes(args.horizon)) throw toolError('horizon invalide.');
      const only = poleMatches(a.id, args.pole);
      const out = [];
      goals.categoriesForActivity(a.id).forEach((p) => {
        if (only && p.key !== only) return;
        const plan = goals.planningForActivity(a.id, p.key);
        const periods = plan.periods.map((per) => ({
          periode: per.periodNumber, debut: per.startDate, fin: per.endDate, courante: !!per.isCurrent,
          objectif: per.mainGoalText || null, description: per.mainGoalDescription || null,
          estimation_minutes: per.mainGoalEstimateMinutes == null ? null : per.mainGoalEstimateMinutes, statut: per.mainGoalStatus || null,
          semaines: per.weeklies.filter((w) => !w.assignedUserId || w.assignedUserId === userId).map((w) => ({
            semaine: w.weekIndex, objectif: w.text || null, estimation_minutes: w.estimateMinutes == null ? null : w.estimateMinutes, statut: w.status || null,
          })),
        }));
        let sel;
        if (args.horizon === 'annuel') sel = periods.map((x) => { const c = Object.assign({}, x); delete c.semaines; return c; });
        else sel = periods.filter((x) => x.courante).map((x) => {
          if (args.horizon === 'periodique') { const c = Object.assign({}, x); delete c.semaines; return c; }
          return { periode: x.periode, debut: x.debut, fin: x.fin, semaines: x.semaines };
        });
        out.push({ pole: p.label, [args.horizon === 'annuel' ? 'periodes' : 'periode_courante']: sel });
      });
      return { activityId: a.id, activite: a.name, horizon: args.horizon, poles: out };
    },
  },
  plan_du_jour_donnees: {
    description: "Données pour proposer un plan du jour : tâches du jour, tâches en retard, tâches à venir, et capacité hebdomadaire (minutes) par pôle. L'IA propose, l'utilisateur décide.",
    inputSchema: { type: 'object', properties: { activityId: { type: 'integer' } }, required: ['activityId'], additionalProperties: false },
    run(userId, args) {
      const a = memberActivity(userId, args.activityId);
      const today = todayLocal();
      const labels = poleLabels(a.id);
      const pending = goalstasks.allTasksWithGroup(a.id).filter((t) => !t.done && mine(t, userId))
        .map((t) => Object.assign({}, t, { dueDate: t.dueDate || today }));
      const fmt = (t) => formatTask(t, labels, a);
      const cap = [];
      goals.categoriesForActivity(a.id).forEach((p) => {
        let m = null;
        try { m = goalsauto.capacityMinutesForMember(a.id, p.key, userId); } catch (e) { m = null; }
        cap.push({ pole: p.label, capacite_hebdo_minutes: m });
      });
      return {
        activityId: a.id, activite: a.name, aujourdhui: today,
        du_jour: pending.filter((t) => t.dueDate === today).map(fmt),
        en_retard: pending.filter((t) => t.dueDate < today).map(fmt),
        a_venir: pending.filter((t) => t.dueDate > today).sort((x, y) => (x.dueDate < y.dueDate ? -1 : 1)).slice(0, 30).map(fmt),
        capacite: cap,
      };
    },
  },
};

// Outils d'ÉCRITURE : exposés seulement avec un jeton créé avec la portée d'écriture.
// Outils historiques ci-dessous ; les outils d'organisation libre (21 oct. 2026) suivent plus bas.
const MAX_NOTE = 280;
Object.assign(tools, {
  marquer_tache_faite: {
    write: true,
    description: "Coche une tâche de l'utilisateur comme faite (jamais l'inverse, jamais de modification du texte).",
    inputSchema: { type: 'object', properties: { taskId: { type: 'integer' } }, required: ['taskId'], additionalProperties: false },
    run(userId, args) {
      const item = sp.getItem(Number(args.taskId));
      if (!item) throw toolError('Tâche introuvable.');
      const access = sp.checkSubProjectAccess(userId, item.subProjectId);
      if (access.error) throw toolError('Tâche introuvable.');
      if (item.plannedUserId && item.plannedUserId !== userId) throw toolError("Cette tâche est confiée à un autre membre.");
      if (item.done) return { taskId: item.id, deja_faite: true };
      try { sp.updateItem(item.id, { done: true }, userId); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible de cocher cette tâche.'); }
      return { taskId: item.id, tache: item.label, terminee: true };
    },
  },
  ajouter_tache_note: {
    write: true,
    description: "Ajoute une tâche-note préfixée « 🤖 » (type question : « Question de l'IA : … », ou recap : « Récap : … ») dans une activité de l'utilisateur. 280 caractères maximum.",
    inputSchema: {
      type: 'object',
      properties: { activityId: { type: 'integer' }, type: { type: 'string', enum: ['question', 'recap'] }, texte: { type: 'string' }, pole: { type: 'string' } },
      required: ['activityId', 'type', 'texte'], additionalProperties: false,
    },
    run(userId, args) {
      const a = memberActivity(userId, args.activityId);
      if (!['question', 'recap'].includes(args.type)) throw toolError('type invalide (question ou recap).');
      const texte = String(args.texte == null ? '' : args.texte).replace(/\s+/g, ' ').trim();
      if (!texte) throw toolError('texte requis.');
      if (texte.length > MAX_NOTE) throw toolError('texte trop long (' + MAX_NOTE + ' caractères maximum).');
      const poles = goals.categoriesForActivity(a.id);
      if (!poles.length) throw toolError("Cette activité n'a pas de pôle.");
      const key = poleMatches(a.id, args.pole);
      if (key === '__aucun__') throw toolError('Pôle inconnu.');
      const pole = key ? poles.find((p) => p.key === key) : poles[0];
      const sect = goals.secteursForPole(a.id, pole.key) || [];
      const target = sect.length ? sect[0].key : pole.key;
      const label = '🤖 ' + (args.type === 'question' ? "Question de l'IA : " : 'Récap : ') + texte;
      const item = goalstasks.addCategoryTask(a.id, userId, target, label, { dueDate: todayLocal(), noSpellfix: true });
      return { taskId: item.id, activityId: a.id, tache: label };
    },
  },
  notifier: {
    write: true,
    description: "Envoie une notification push à l'utilisateur (10 par jour au maximum).",
    inputSchema: { type: 'object', properties: { titre: { type: 'string' }, message: { type: 'string' } }, required: ['message'], additionalProperties: false },
    run(userId, args, ctx) {
      const message = String(args.message == null ? '' : args.message).trim().slice(0, 140);
      if (!message) throw toolError('message requis.');
      const titre = String(args.titre || 'Mon IA').trim().slice(0, 50);
      if (!aitokens.takeNotifSlot(ctx.tokenId)) throw toolError('Limite atteinte : ' + aitokens.NOTIF_PER_DAY + ' notifications par jour.');
      push.sendToUsers([userId], { title: '🤖 ' + titre, body: message, tag: 'ai-' + ctx.tokenId, url: '/' });
      return { envoyee: true };
    },
  },
});

// ---------------------------------------------------------------- écriture libre (21 oct. 2026)
// Décision d'Émilien : l'IA de l'utilisateur peut organiser (tâches, objectifs, plan du jour) gratuitement,
// avec SON jeton, sur SON compte uniquement. Aucun appel IA de Noèsis, jamais de suppression définitive :
// chaque écriture est journalisée (ai_write_log) avec l'état d'avant et `annuler_modification` le rétablit.
const wlog = require('../lib/aiwritelog');
const textlimits = require('../lib/textlimits');
const MAX_BATCH = 30;
const MAX_GOAL = 300;
const MAX_DESC = 1000;

function checkDay(s, nom) {
  if (!isDay(s)) throw toolError(nom + ' : format AAAA-MM-JJ attendu.');
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw toolError(nom + ' : date inexistante.');
  const t = todayLocal();
  const lo = String(Number(t.slice(0, 4)) - 1) + t.slice(4), hi = String(Number(t.slice(0, 4)) + 5) + t.slice(4);
  if (s < lo || s > hi) throw toolError(nom + ' : entre un an avant et cinq ans après aujourd\'hui.');
  return s;
}
function checkTitle(raw) {
  const c = textlimits.clean(raw, { max: textlimits.LIMITS.TASK_TITLE, word: 'Titre' });
  if (c.error) throw toolError(c.error);
  if (!c.text) throw toolError('Titre requis.');
  return c.text;
}
function checkText(raw, max, word) {
  const c = textlimits.clean(raw, { max, word, kind: 'text' });
  if (c.error) throw toolError(c.error);
  return c.text;
}
function checkIds(list, nom) {
  if (!Array.isArray(list) || !list.length) throw toolError(nom + ' : liste non vide requise.');
  if (list.length > MAX_BATCH) throw toolError(nom + ' : ' + MAX_BATCH + ' éléments maximum.');
  const ids = list.map(Number);
  if (ids.some((n) => !Number.isInteger(n)) || new Set(ids).size !== ids.length) throw toolError(nom + ' : identifiants entiers distincts requis.');
  return ids;
}
// Tâche de l'utilisateur (membre de son activité, non confiée à un autre, non verrouillée).
function ownTask(userId, taskId) {
  const item = sp.getItemRaw(Number(taskId));
  if (!item) throw toolError('Tâche introuvable.');
  const access = sp.checkSubProjectAccess(userId, item.subProjectId);
  if (access.error) throw toolError('Tâche introuvable.');
  if (item.plannedUserId && item.plannedUserId !== userId) throw toolError('Cette tâche est confiée à un autre membre.');
  try { sp.assertItemEditable(item); } catch (e) { throw toolError(e.message); }
  return { item, activityId: sp.getSubProject(item.subProjectId).activityId };
}
// Pôle ou secteur d'une activité, par nom ou clé.
function resolveTarget(activityId, wanted) {
  const w = String(wanted == null ? '' : wanted).trim().toLowerCase();
  if (!w) throw toolError('pole requis (nom ou clé d\'un pôle ou d\'un secteur, voir lister_activites).');
  for (const p of goals.categoriesForActivity(activityId)) {
    if (p.key.toLowerCase() === w || String(p.label).toLowerCase() === w) return { key: p.key, pole: p, secteurs: goals.secteursForPole(activityId, p.key) || [] };
    for (const s of (goals.secteursForPole(activityId, p.key) || [])) {
      if (s.key.toLowerCase() === w || String(s.label).toLowerCase() === w) return { key: s.key, pole: p, secteurs: [] };
    }
  }
  throw toolError('Pôle ou secteur inconnu.');
}
function poleAndSecteurs(activityId, wanted) { // pôle ou secteur pour une TÂCHE : un pôle à secteurs n'en reçoit pas directement
  const t = resolveTarget(activityId, wanted);
  if (t.secteurs.length) throw toolError('Ce pôle a des secteurs : choisis-en un (' + t.secteurs.map((s) => s.label).join(', ') + ').');
  return t;
}
function periodNumber(v) { const n = Number(v); if (!Number.isInteger(n) || n < 1 || n > 39) throw toolError('periode : entier de 1 à 39.'); return n; }
function periodRow(activityId, key, n) { return db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(activityId, key, n); }
function setPositions(pairs) {
  db.exec('BEGIN');
  try { pairs.forEach(([id, pos]) => db.prepare('UPDATE sub_project_items SET position = ? WHERE id = ?').run(pos, id)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}
const done = (data, logId) => Object.assign({}, data, { journal: logId });

Object.assign(tools, {
  creer_tache: {
    write: true, journal: true,
    description: "Ajoute une tâche (titre 300 caractères max) dans un pôle ou secteur de l'utilisateur, avec une échéance facultative AAAA-MM-JJ. Correction d'orthographe de Noèsis désactivée.",
    inputSchema: { type: 'object', properties: { activityId: { type: 'integer' }, titre: { type: 'string' }, pole: { type: 'string', description: 'Pôle (ou secteur si le pôle en a).' }, echeance: { type: 'string' } }, required: ['activityId', 'titre', 'pole'], additionalProperties: false },
    run(userId, args, ctx) {
      const a = memberActivity(userId, args.activityId);
      const titre = checkTitle(args.titre);
      const t = poleAndSecteurs(a.id, args.pole);
      const extra = { noSpellfix: true };
      if (args.echeance != null && args.echeance !== '') extra.dueDate = checkDay(args.echeance, 'echeance');
      let item;
      try { item = goalstasks.addCategoryTask(a.id, userId, t.key, titre, extra); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible d\'ajouter la tâche.'); }
      const logId = wlog.record(ctx, 'creer_tache', a.id, item.id, null, { label: titre, dueDate: extra.dueDate || null });
      return done({ taskId: item.id, activityId: a.id, tache: titre }, logId);
    },
  },
  modifier_tache: {
    write: true, journal: true,
    description: "Change le titre (300 caractères max) et/ou l'échéance (AAAA-MM-JJ) d'une tâche de l'utilisateur. Réversible avec annuler_modification.",
    inputSchema: { type: 'object', properties: { taskId: { type: 'integer' }, titre: { type: 'string' }, echeance: { type: 'string' } }, required: ['taskId'], additionalProperties: false },
    run(userId, args, ctx) {
      const { item, activityId } = ownTask(userId, args.taskId);
      const fields = {};
      if (args.titre !== undefined) fields.label = checkTitle(args.titre);
      if (args.echeance !== undefined) fields.dueDate = checkDay(args.echeance, 'echeance');
      if (!Object.keys(fields).length) throw toolError('Rien à modifier (titre ou echeance).');
      try { sp.updateItem(item.id, fields, userId, { noSpellfix: true }); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible de modifier cette tâche.'); }
      const logId = wlog.record(ctx, 'modifier_tache', activityId, item.id, { label: item.label, dueDate: item.dueDate }, { label: fields.label || item.label, dueDate: fields.dueDate || item.dueDate });
      return done({ taskId: item.id, tache: fields.label || item.label, echeance: fields.dueDate || item.dueDate }, logId);
    },
  },
  ordonner_taches: {
    write: true, journal: true,
    description: "Fixe l'ordre d'une liste de tâches de l'utilisateur appartenant au MÊME secteur (ou pôle sans secteur), de la première à la dernière. 30 maximum.",
    inputSchema: { type: 'object', properties: { taskIds: { type: 'array', items: { type: 'integer' } } }, required: ['taskIds'], additionalProperties: false },
    run(userId, args, ctx) {
      const ids = checkIds(args.taskIds, 'taskIds');
      const rows = ids.map((id) => ownTask(userId, id));
      if (new Set(rows.map((r) => r.item.sectionId)).size !== 1) throw toolError('Toutes les tâches doivent être dans le même secteur.');
      const slots = rows.map((r) => r.item.position).sort((x, y) => x - y);
      const before = {}; rows.forEach((r) => { before[r.item.id] = r.item.position; });
      const after = {}; ids.forEach((id, i) => { after[id] = slots[i]; });
      setPositions(ids.map((id, i) => [id, slots[i]]));
      const logId = wlog.record(ctx, 'ordonner_taches', rows[0].activityId, null, before, after);
      return done({ ordre: ids }, logId);
    },
  },
  planifier_jour: {
    write: true, journal: true,
    description: "Plan du jour : place des tâches de l'utilisateur sur un jour (échéance AAAA-MM-JJ). 30 maximum. Liste de tâches, jamais un horaire à créneaux.",
    inputSchema: { type: 'object', properties: { jour: { type: 'string' }, taskIds: { type: 'array', items: { type: 'integer' } } }, required: ['jour', 'taskIds'], additionalProperties: false },
    run(userId, args, ctx) {
      const jour = checkDay(args.jour, 'jour');
      const ids = checkIds(args.taskIds, 'taskIds');
      const rows = ids.map((id) => ownTask(userId, id));
      const before = {}; rows.forEach((r) => { before[r.item.id] = r.item.dueDate; });
      rows.forEach((r) => { try { sp.updateItem(r.item.id, { dueDate: jour }, userId, { noSpellfix: true }); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible de planifier.'); } });
      const logId = wlog.record(ctx, 'planifier_jour', rows[0].activityId, null, before, { jour });
      return done({ jour, taches: ids.length }, logId);
    },
  },
  retirer_tache: {
    write: true, journal: true,
    description: "Retire une tâche de l'utilisateur de ses listes. Une copie complète reste au journal : annuler_modification la rétablit (30 jours). Pas de suppression définitive.",
    inputSchema: { type: 'object', properties: { taskId: { type: 'integer' } }, required: ['taskId'], additionalProperties: false },
    run(userId, args, ctx) {
      const { item, activityId } = ownTask(userId, args.taskId);
      const logId = wlog.record(ctx, 'retirer_tache', activityId, item.id, item, null);
      try { sp.deleteItem(item.id); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible de retirer cette tâche.'); }
      return done({ taskId: item.id, retiree: true, pour_la_rétablir: 'annuler_modification journal=' + logId }, logId);
    },
  },
  definir_objectif_periodique: {
    write: true, journal: true,
    description: "Écrit l'objectif d'une période (1 à 39, voir objectifs) pour un pôle ou secteur. Texte 300 caractères max, description 1000 max. Remplace le texte actuel, qui reste au journal (annuler_modification).",
    inputSchema: { type: 'object', properties: { activityId: { type: 'integer' }, pole: { type: 'string' }, periode: { type: 'integer' }, texte: { type: 'string' }, description: { type: 'string' } }, required: ['activityId', 'pole', 'periode', 'texte'], additionalProperties: false },
    run(userId, args, ctx) {
      const a = memberActivity(userId, args.activityId);
      const t = resolveTarget(a.id, args.pole);
      const n = periodNumber(args.periode);
      const texte = checkText(args.texte, MAX_GOAL, 'Objectif');
      if (!texte) throw toolError('texte requis (un objectif ne se supprime pas par ce connecteur).');
      const description = args.description === undefined ? undefined : checkText(args.description, MAX_DESC, 'Description');
      const old = periodRow(a.id, t.key, n);
      const before = old ? { text: old.mainGoalText || '', description: old.mainGoalDescription || '', minutes: old.mainGoalEstimateSource === 'manual' ? old.mainGoalEstimateMinutes : null } : { text: '', description: '', minutes: null };
      try { goals.setMainGoal(a.id, t.key, n, texte, description); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible d\'écrire cet objectif.'); }
      const logId = wlog.record(ctx, 'definir_objectif_periodique', a.id, null, Object.assign({ key: t.key, periode: n }, before), { text: texte });
      return done({ activityId: a.id, pole: t.key, periode: n, objectif: texte }, logId);
    },
  },
  definir_objectif_hebdomadaire: {
    write: true, journal: true,
    description: "Écrit l'objectif d'une semaine (1 à 4) d'une période pour un pôle ou secteur. Texte 300 caractères max. Un objectif confié à un autre membre est refusé. Réversible (annuler_modification).",
    inputSchema: { type: 'object', properties: { activityId: { type: 'integer' }, pole: { type: 'string' }, periode: { type: 'integer' }, semaine: { type: 'integer' }, texte: { type: 'string' }, description: { type: 'string' } }, required: ['activityId', 'pole', 'periode', 'semaine', 'texte'], additionalProperties: false },
    run(userId, args, ctx) {
      const a = memberActivity(userId, args.activityId);
      const t = resolveTarget(a.id, args.pole);
      const n = periodNumber(args.periode);
      const w = Number(args.semaine);
      if (!Number.isInteger(w) || w < 1 || w > 4) throw toolError('semaine : entier de 1 à 4.');
      const texte = checkText(args.texte, MAX_GOAL, 'Objectif');
      if (!texte) throw toolError('texte requis (un objectif ne se supprime pas par ce connecteur).');
      const description = args.description === undefined ? undefined : checkText(args.description, MAX_DESC, 'Description');
      const per = periodRow(a.id, t.key, n);
      const old = per ? db.prepare('SELECT * FROM goal_weekly WHERE periodId = ? AND weekIndex = ? AND carriedOverFromId IS NULL').get(per.id, w) : null;
      if (old && old.assignedUserId && old.assignedUserId !== userId) throw toolError('Cet objectif est confié à un autre membre.');
      let res;
      try { res = goals.setWeekly(a.id, t.key, n, w, texte, description); } catch (e) { throw toolError(e.statusCode ? e.message : 'Impossible d\'écrire cet objectif.'); }
      const logId = wlog.record(ctx, 'definir_objectif_hebdomadaire', a.id, res.id, { key: t.key, periode: n, semaine: w, existait: !!old, text: old ? old.text : '', description: old ? old.description || '' : '' }, { text: texte });
      return done({ activityId: a.id, pole: t.key, periode: n, semaine: w, objectif: texte }, logId);
    },
  },
  annuler_modification: {
    write: true, journal: true,
    description: "Annule une écriture du journal (le numéro `journal` renvoyé par chaque outil d'écriture), de moins de 30 jours, une seule fois. Rétablit l'état d'avant.",
    inputSchema: { type: 'object', properties: { journal: { type: 'integer' } }, required: ['journal'], additionalProperties: false },
    run(userId, args, ctx) {
      const u = wlog.undoable(userId, args.journal);
      if (u.error) throw toolError(u.error);
      const { row, before, after } = u;
      const act = row.activityId == null ? null : memberActivity(userId, row.activityId).id; // toujours membre de l'activité
      try {
        switch (row.tool) {
          case 'creer_tache': {
            const { item } = ownTask(userId, row.targetId);
            if (item.done) throw toolError('Cette tâche a été cochée depuis : elle reste.');
            wlog.record(ctx, 'annuler_modification', act, row.targetId, item, null);
            sp.deleteItem(item.id); break;
          }
          case 'modifier_tache': {
            const { item } = ownTask(userId, row.targetId);
            sp.updateItem(item.id, { label: before.label, dueDate: before.dueDate }, userId, { noSpellfix: true }); break;
          }
          case 'ordonner_taches': {
            Object.keys(before).forEach((id) => { ownTask(userId, id); });
            setPositions(Object.keys(before).map((id) => [Number(id), before[id]])); break;
          }
          case 'planifier_jour': {
            Object.keys(before).forEach((id) => { ownTask(userId, id); });
            Object.keys(before).forEach((id) => sp.updateItem(Number(id), { dueDate: before[id] }, userId, { noSpellfix: true })); break;
          }
          case 'retirer_tache': {
            if (sp.getItemRaw(before.id)) throw toolError('Cette tâche existe déjà.');
            const sec = sp.getSection(before.sectionId);
            if (!sec || sp.checkSubProjectAccess(userId, before.subProjectId).error) throw toolError('Le rangement d\'origine n\'existe plus.');
            const cols = Object.keys(before);
            db.prepare('INSERT INTO sub_project_items (' + cols.join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')').run(...cols.map((c) => before[c])); break;
          }
          case 'definir_objectif_periodique':
            goals.setMainGoal(act, before.key, before.periode, before.text, before.description, before.minutes == null ? undefined : before.minutes); break;
          case 'definir_objectif_hebdomadaire':
            if (before.existait) goals.setWeekly(act, before.key, before.periode, before.semaine, before.text, before.description);
            else goals.deleteWeekly(act, before.key, before.periode, before.semaine);
            break;
          default: throw toolError('Cette entrée ne peut pas être annulée.');
        }
      } catch (e) { if (e.toolError) throw e; throw toolError(e.statusCode ? e.message : 'Annulation impossible.'); }
      wlog.markUndone(row.id);
      return { annulee: row.id, outil: row.tool };
    },
  },
});

// Modules : module requis par outil (défaut roadmap ; lister_activites = noyau ; notifier = notifications).
// Un outil dont le module est désactivé pour l'utilisateur disparaît de tools/list et refuse l'appel ; « Assistant IA » désactivé = tout le MCP refusé (voir handleMcpPost).
for (const n of Object.keys(tools)) tools[n].module = n === 'lister_activites' ? 'core' : (n === 'notifier' ? 'notifications' : 'roadmap');
const toolOn = (userId, name) => modules.isEnabled(userId, tools[name].module);

// ---------------------------------------------------------------- JSON-RPC
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } }; }

function handleRpc(msg, ctx) {
  const userId = ctx.userId;
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Requête invalide.');
  const isNotification = msg.id === undefined;
  const ok = (result) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'timetracker', version: '1.1.0' },
        instructions: "TimeTracker : les tâches et objectifs de l'utilisateur. Commence par lister_activites. Avec un jeton en écriture, tu peux organiser (créer, modifier, ordonner, planifier, objectifs) mais seulement à la demande de l'utilisateur, jamais de ta propre initiative ; chaque écriture renvoie un numéro de journal pour annuler_modification.",
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: Object.keys(tools).filter((n) => !tools[n].write || ctx.canWrite).map((name) => ({ name, description: tools[name].description, inputSchema: tools[name].inputSchema, annotations: { readOnlyHint: !tools[name].write } })) });
    case 'tools/call': {
      const p = msg.params || {};
      const tool = Object.prototype.hasOwnProperty.call(tools, p.name) ? tools[p.name] : null;
      if (!tool) return isNotification ? null : rpcError(msg.id, -32602, 'Outil inconnu : ' + p.name);
      if (tool.write && !ctx.canWrite) { const e = new Error("Ce jeton est en lecture seule."); e.forbidden = true; throw e; }
      if (tool.journal && !wlog.takeWriteSlot(ctx.tokenId)) return ok({ isError: true, content: [{ type: 'text', text: 'Limite atteinte : ' + wlog.WRITES_PER_MINUTE + ' écritures par minute et ' + wlog.WRITES_PER_DAY + ' par 24 h.' }] });
      try {
        const data = tool.run(userId, p.arguments && typeof p.arguments === 'object' ? p.arguments : {}, ctx);
        return ok({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
      } catch (err) {
        if (!err.toolError) console.error('[mcp] outil', p.name, err.message);
        return ok({ isError: true, content: [{ type: 'text', text: err.toolError ? err.message : 'Erreur serveur.' }] });
      }
    }
    default:
      return isNotification ? null : rpcError(msg.id, -32601, 'Méthode inconnue : ' + msg.method);
  }
}

function handleMcpPost(req, res, token) {
  const auth = token ? aitokens.authenticate(token) : null;
  if (!auth) {
    res.set('WWW-Authenticate', 'Bearer realm="timetracker"');
    return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Jeton invalide ou révoqué.' } });
  }
  if (!aitokens.rateOk(auth.tokenId)) {
    res.set('Retry-After', '60');
    return res.status(429).json(rpcError(null, -32002, 'Trop d\'appels : 60 par minute maximum.'));
  }
  aitokens.touch(auth.tokenId);
  const body = req.body;
  const batch = Array.isArray(body);
  let forbidden = false;
  const replies = (batch ? body : [body]).map((x) => { try { return handleRpc(x, auth); } catch (e) { if (e.forbidden) { forbidden = true; return null; } throw e; } }).filter(Boolean);
  // Journal sans le jeton.
  console.log('[mcp] jeton#' + auth.tokenId + ' ' + (batch ? body : [body]).map((x) => x && x.method).join(','));
  if (forbidden) return res.status(403).json(rpcError(null, -32003, "Ce jeton est en lecture seule : crée un jeton avec l'écriture autorisée."));
  if (!replies.length) return res.status(202).end();
  res.json(batch ? replies : replies[0]);
}

router.post('/mcp', (req, res) => {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  handleMcpPost(req, res, m ? m[1] : null);
});

// Jeton dans l'URL (connecteur personnalisé de claude.ai, sans en-tête Authorization). Le jeton ne doit
// JAMAIS être journalisé (aucun journal HTTP n'existe ; ne jamais écrire req.url / originalUrl ici).
const urlTokenGuard = (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  next();
};
router.post('/mcp/t/:token', urlTokenGuard, (req, res) => handleMcpPost(req, res, req.params.token));
router.get('/mcp/t/:token', urlTokenGuard, (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Utilise POST.' }));
router.delete('/mcp/t/:token', urlTokenGuard, (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Utilise POST.' }));
router.options('/mcp/t/:token', urlTokenGuard, (req, res) => res.status(204).set({ Allow: 'POST, OPTIONS', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id, Mcp-Protocol-Version' }).end());

router.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Utilise POST.' }));
router.delete('/mcp', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Utilise POST.' }));

// ---------------------------------------------------------------- jetons (Réglages)
router.get('/api/ai-tokens', requireAuth, (req, res) => {
  res.json({ tokens: aitokens.listTokens(req.userId), max: aitokens.MAX_ACTIVE, url: req.protocol + '://' + req.get('host') + '/mcp', origin: req.protocol + '://' + req.get('host') });
});
router.post('/api/ai-tokens', requireAuth, (req, res) => {
  try {
    res.json(aitokens.createToken(req.userId, req.body && req.body.label, !!(req.body && req.body.canWrite)));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('[mcp] création jeton', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});
router.delete('/api/ai-tokens/:id', requireAuth, (req, res) => {
  if (!aitokens.revokeToken(req.userId, req.params.id)) return res.status(404).json({ error: 'Jeton introuvable.' });
  res.json({ ok: true });
});

module.exports = router;
