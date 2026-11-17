// STRATÉGIE D'UNE CATÉGORIE (18 nov. 2026, décision d'Émilien) : un panneau « Stratégie » PAR CATÉGORIE (activité, pôle, secteur), dans la gestion des catégories. Il remplace les champs but / échéance / priorités
// de l'ancienne fiche de l'activité (ses données restent en base, jamais supprimées, S6). Questions FACULTATIVES, une à la fois (4 au plus selon les réponses) :
//  1. construire (projet) ou progresser ?  2. si progresser : monter, descendre ou maintenir ?  3. quelle famille progresse (une des 13 de familles-objectifs.js, ou « autre ») ?
//  4. rythme : régulier, par paliers espacés ou à mon rythme.   Si projet : date d'arrivée fixe (événement, planification à rebours) oui / non ; « quelque chose à corriger avant de construire » oui / non (phase Réformer).
// HÉRITAGE secteur -> pôle -> activité, champ par champ, si vide. Sans réponse : lecture silencieuse de la description (objectifs-type.js), comme avant. Les réponses PRIMENT sur la lecture silencieuse et alimentent
// objectifs-type.js (type, sens), la famille de l'objectif (estimateur.js, donc objectifs-delais.js), la création d'objectifs et le rangement des tâches (taches-place.js : stratégie par type, rythme).
// Clé de l'activité elle-même : '_' (stockée ''). Aucune donnée d'une autre table n'est touchée.
const db = require('../db');

db.exec(`CREATE TABLE IF NOT EXISTS category_strategies (
  activityId INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  kind TEXT,
  sens TEXT,
  famille TEXT,
  rythme TEXT,
  dateFixe INTEGER,
  reformer INTEGER,
  updatedAt TEXT NOT NULL,
  updatedBy TEXT,
  PRIMARY KEY (activityId, key)
)`);

const KINDS = ['projet', 'progression'];
const SENS = ['monter', 'descendre', 'maintenir'];
const RYTHMES = ['regulier', 'espaces', 'libre'];
const FIELDS = ['kind', 'sens', 'famille', 'rythme', 'dateFixe', 'reformer'];
const storeKey = (key) => (key === '_' || key == null ? '' : String(key));

// Les 13 familles avec tableau de délais (« info suffisante ») + « autre » : [{ id, label }].
function familles() {
  try {
    const F = require('./familles-objectifs'), D = require('./objectifs-delais');
    return D.FAMILLES_AVEC_DELAIS.map((id) => { const f = F.byId(id); return { id, label: (f && f.label) || id }; }).concat([{ id: 'autre', label: 'Autre' }]);
  } catch (e) { return [{ id: 'autre', label: 'Autre' }]; }
}

function own(activityId, key) {
  const r = db.prepare('SELECT * FROM category_strategies WHERE activityId = ? AND key = ?').get(activityId, storeKey(key));
  const out = { kind: null, sens: null, famille: null, rythme: null, dateFixe: null, reformer: null, updatedAt: null };
  if (!r) return out;
  out.kind = r.kind || null; out.sens = r.sens || null; out.famille = r.famille || null; out.rythme = r.rythme || null;
  out.dateFixe = r.dateFixe == null ? null : !!r.dateFixe; out.reformer = r.reformer == null ? null : !!r.reformer; out.updatedAt = r.updatedAt;
  return out;
}
const isEmpty = (s) => FIELDS.every((f) => s[f] == null);

// Chaîne d'héritage de la plus proche à la plus large : secteur -> pôle -> activité.
function chain(activityId, key) {
  const out = [], k = storeKey(key);
  if (k) {
    out.push({ key: k, nom: 'propre' });
    let pole = null;
    try { pole = require('./goals').parentKeyFor(activityId, k) || null; } catch (e) { pole = null; }
    if (pole) out.push({ key: pole, nom: 'pôle' });
  }
  out.push({ key: '', nom: 'activité' });
  return out;
}

// Réponses effectives : champ par champ, la plus proche réponse non vide ; origine = d'où vient le type.
function effective(activityId, key) {
  const eff = { kind: null, sens: null, famille: null, rythme: null, dateFixe: null, reformer: null, origine: null };
  chain(activityId, key).forEach((c) => {
    const s = own(activityId, c.key);
    FIELDS.forEach((f) => { if (eff[f] == null && s[f] != null) { eff[f] = s[f]; if (f === 'kind') eff.origine = c.nom; } });
  });
  return eff;
}

// body : champs à poser ; null ou '' efface le champ (retour à la lecture silencieuse). Renvoie { own, effective }.
function set(activityId, key, userId, body) {
  const b = body || {}, cur = own(activityId, key), next = Object.assign({}, cur);
  const bad = (m) => { const e = new Error(m); e.statusCode = 400; return e; };
  const clear = (v) => v === null || v === '';
  if (b.kind !== undefined) { if (!clear(b.kind) && !KINDS.includes(b.kind)) throw bad('Type inconnu.'); next.kind = clear(b.kind) ? null : b.kind; }
  if (b.sens !== undefined) { if (!clear(b.sens) && !SENS.includes(b.sens)) throw bad('Sens inconnu.'); next.sens = clear(b.sens) ? null : b.sens; }
  if (b.famille !== undefined) { if (!clear(b.famille) && !familles().some((f) => f.id === b.famille)) throw bad('Famille inconnue.'); next.famille = clear(b.famille) ? null : b.famille; }
  if (b.rythme !== undefined) { if (!clear(b.rythme) && !RYTHMES.includes(b.rythme)) throw bad('Rythme inconnu.'); next.rythme = clear(b.rythme) ? null : b.rythme; }
  if (b.dateFixe !== undefined) next.dateFixe = clear(b.dateFixe) ? null : b.dateFixe === true;
  if (b.reformer !== undefined) next.reformer = clear(b.reformer) ? null : b.reformer === true;
  // Changer le type vide les réponses qui ne le concernent plus (progression : sens, famille, rythme ; projet : date fixe, réformer).
  if (b.kind !== undefined && next.kind !== cur.kind) {
    const vide = (f) => { if (b[f] === undefined) next[f] = null; }; // jamais un champ donné dans le même envoi
    if (next.kind === 'projet') { vide('sens'); vide('famille'); vide('rythme'); }
    if (next.kind === 'progression') { vide('dateFixe'); vide('reformer'); }
  }
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO category_strategies (activityId, key, kind, sens, famille, rythme, dateFixe, reformer, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(activityId, key) DO UPDATE SET kind = excluded.kind, sens = excluded.sens, famille = excluded.famille, rythme = excluded.rythme, dateFixe = excluded.dateFixe, reformer = excluded.reformer, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`)
    .run(activityId, storeKey(key), next.kind, next.sens, next.famille, next.rythme, next.dateFixe == null ? null : (next.dateFixe ? 1 : 0), next.reformer == null ? null : (next.reformer ? 1 : 0), now, userId || null);
  return { own: own(activityId, key), effective: effective(activityId, key) };
}

// Sens pour objectifs-type.js : « descendre » = sens inverse (la plus grande valeur d'abord) ; monter et maintenir = sens normal.
const sensPourType = (s) => (s === 'descendre' ? 'inverse' : 'normal');

module.exports = { own, effective, set, isEmpty, familles, chain, sensPourType, KINDS, SENS, RYTHMES };
