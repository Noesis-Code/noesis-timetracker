// « Connecter mon IA » — serveur MCP distant, LECTURE SEULE (19 oct. 2026).
// POST /mcp : Streamable HTTP, JSON-RPC 2.0 sans état. Authentification par
// jeton personnel (Authorization: Bearer ...), voir server/lib/aitokens.js.
// Aucun outil n'écrit : les fonctions appelées ici sont des lectures.
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
// Jamais de suppression ni de modification du texte d'une tâche existante.
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
      const item = goalstasks.addCategoryTask(a.id, userId, target, label, { dueDate: todayLocal() });
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
        serverInfo: { name: 'timetracker', version: '1.0.0' },
        instructions: "TimeTracker, lecture seule : les tâches et objectifs de l'utilisateur. Commence par lister_activites. Propose un plan, ne décide pas à sa place.",
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

router.post('/mcp', (req, res) => {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  const auth = m ? aitokens.authenticate(m[1]) : null;
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
});

router.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Utilise POST.' }));
router.delete('/mcp', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Utilise POST.' }));

// ---------------------------------------------------------------- jetons (Réglages)
router.get('/api/ai-tokens', requireAuth, (req, res) => {
  res.json({ tokens: aitokens.listTokens(req.userId), max: aitokens.MAX_ACTIVE, url: req.protocol + '://' + req.get('host') + '/mcp' });
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
