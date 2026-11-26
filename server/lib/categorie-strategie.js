// STRATÉGIE D'UNE CATÉGORIE (18 nov. 2026, décision d'Émilien) puis MODÈLE MODULABLE (19 nov. 2026) : un document de stratégie PAR CATÉGORIE (activité, pôle, secteur), dans la fiche de la catégorie.
// Note de conception : docs/ia/strategie-modele.md. Le document remplace les champs but / échéance / priorités de l'ancienne fiche (leurs données restent en base, jamais supprimées, S6).
// SIX FAMILLES : nature, temps, taches, objectifs, personne, ajustement (règles signal -> seuil -> action). La stratégie ne contient NI le résultat visé NI l'horizon (ils vivent dans les objectifs de l'arbre).
// DEFAUTS = tout ce que Noèsis a décidé (valeurs reprises EXACTEMENT du code existant) ; chaque niveau ne stocke que ce qu'il surcharge (document CREUX, JSON versionné `docJson`).
// RÉSOLUTION (héritage DESCENDANT) : défauts Noèsis < activité < pôle < secteur, fusion profonde, avec l'origine de chaque valeur. Un niveau n'écrit JAMAIS que sa propre ligne : le niveau inférieur ne modifie jamais le supérieur.
// Les anciennes colonnes kind/sens/famille/rythme/dateFixe/reformer RESTENT et sont tenues à jour (nature) : migration sans perte, anciens clients et lecteurs (objectifs-type, estimateur, taches-place) inchangés.
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
if (!db.prepare('PRAGMA table_info(category_strategies)').all().some((c) => c.name === 'docJson')) db.exec('ALTER TABLE category_strategies ADD COLUMN docJson TEXT');

const KINDS = ['projet', 'progression'];
const SENS = ['monter', 'descendre', 'maintenir'];
const RYTHMES = ['regulier', 'espaces', 'libre'];
const STRUCTURES = ['lineaire', 'paliers', 'libre'];
const PHASES = ['reformer', 'developper', 'maintenir'];
const DECOUPAGES = ['aucun', 'periodes', 'semaines'];
const NIVEAUX = ['debutant', 'intermediaire', 'avance'];
const MODES = ['propose', 'auto'];
const FREQUENCES = ['hebdo', 'mensuel', 'periode'];
const FIELDS = ['kind', 'sens', 'famille', 'rythme', 'dateFixe', 'reformer']; // nature : les six champs historiques
const FAMILLES_DOC = ['nature', 'temps', 'taches', 'objectifs', 'personne', 'ajustement'];
const storeKey = (key) => (key === '_' || key == null ? '' : String(key));

// Signaux du catalogue : unité et moteur (true = le moteur existant en lit un seuil aujourd'hui). Actions : « proposer », jamais décider.
const SIGNAUX = {
  chrono_vs_prevu: { unite: '%', moteur: true }, planifie_vs_prevu: { unite: '%', moteur: true }, retard_periode: { unite: '%', moteur: true }, surcharge_jour: { unite: '%', moteur: true },
  taches_en_retard: { unite: 'n', moteur: false }, taches_reportees: { unite: 'n', moteur: false }, regularite: { unite: 'j', moteur: false }, duree_reelle_vs_estimee: { unite: '%', moteur: false },
  objectif_atteint: { unite: 'sem', moteur: false }, difficulte_declaree: { unite: 'n', moteur: false }, objectif_modifie: { unite: 'n', moteur: false },
};
const ACTIONS = ['proposer_temps', 'reporter_suivante', 'marquer', 'proposer_taches', 'proposer_reduction', 'proposer_revision', 'avertir'];

// DEFAUTS : les valeurs décidées par Noèsis, reprises du code (objectifs-ecart.js, objectifs-ajuste.js, goalsperiodlate.js, goalsoverload.js). Les autres variables n'ont pas de défaut (vides = comportement actuel).
const DEFAUTS_DOC = {
  v: 1, nature: {}, temps: {}, taches: {}, objectifs: {}, personne: {},
  ajustement: {
    mode: 'propose',
    regles: {
      'chrono-ecart': { signal: 'chrono_vs_prevu', seuil: 20, duree: 4, action: 'proposer_temps', actif: true },
      'planifie-ecart': { signal: 'planifie_vs_prevu', seuil: 20, duree: 0, action: 'proposer_temps', actif: true },
      'retard-periode': { signal: 'retard_periode', seuil: 20, duree: 0, action: 'reporter_suivante', actif: true },
      'surcharge-jour': { signal: 'surcharge_jour', seuil: 20, duree: 0, action: 'marquer', actif: true },
    },
  },
};
const DEFAUTS = JSON.parse(JSON.stringify(DEFAUTS_DOC));
const REGLES_NOESIS = Object.keys(DEFAUTS.ajustement.regles);
const isUserRule = (id) => /^u_[a-z0-9]{1,12}$/.test(id);
const MAX_REGLES_MOI = 12;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function flat(o, p, out) { out = out || {}; Object.keys(o || {}).forEach((k) => { const path = p ? p + '.' + k : k; if (isObj(o[k])) flat(o[k], path, out); else out[path] = o[k]; }); return out; }
function unflat(m) {
  const o = {};
  Object.keys(m).forEach((path) => { const parts = path.split('.'); let c = o; parts.slice(0, -1).forEach((p) => { if (!isObj(c[p])) c[p] = {}; c = c[p]; }); c[parts[parts.length - 1]] = m[path]; });
  return o;
}

function bad(m, code) { const e = new Error(m); e.statusCode = 400; e.code = code || 'strategie_valeur_invalide'; return e; }
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const enumV = (label, list) => (v) => { if (!list.includes(v)) throw bad(label + ' inconnu.'); return v; };
const intV = (label, lo, hi) => (v) => { if (!isNum(v, lo, hi) || !Number.isInteger(v)) throw bad(label + ' : entier de ' + lo + ' à ' + hi + '.'); return v; };
const numV = (label, lo, hi) => (v) => { if (!isNum(v, lo, hi)) throw bad(label + (hi === Infinity ? ' : nombre de ' + lo + ' ou plus.' : ' : nombre de ' + lo + ' à ' + hi + '.')); return Math.round(v * 100) / 100; };
const boolV = (label) => (v) => { if (typeof v !== 'boolean') throw bad(label + ' : oui ou non.'); return v; };
const strV = (label, max) => (v) => { if (typeof v !== 'string') throw bad(label + ' : texte attendu.'); const s = v.trim().slice(0, max); return s; };
const iso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Familles de la nature : les 13 familles d'objectifs avec tableau de délais (« info suffisante ») + « autre » : [{ id, label }].
function familles() {
  try {
    const F = require('./familles-objectifs'), D = require('./objectifs-delais');
    return D.FAMILLES_AVEC_DELAIS.map((id) => { const f = F.byId(id); return { id, label: (f && f.label) || id }; }).concat([{ id: 'autre', label: 'Autre' }]);
  } catch (e) { return [{ id: 'autre', label: 'Autre' }]; }
}

const SCHEMA = {
  nature: {
    kind: enumV('Type', KINDS), sens: enumV('Sens', SENS), rythme: enumV('Rythme', RYTHMES), dateFixe: boolV('Date fixe'), reformer: boolV('Réformer'),
    famille: (v) => { if (!familles().some((f) => f.id === v)) throw bad('Famille inconnue.'); return v; },
    unite: strV('Unité', 40), structure: enumV('Structure', STRUCTURES),
  },
  temps: {
    heuresSemaine: numV('Heures par semaine', 0, Infinity),
    jours: (v) => { if (!Array.isArray(v) || v.length > 7 || v.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw bad('Jours : de 1 à 7.'); return Array.from(new Set(v)).sort(); },
    pauses: (v) => { if (!Array.isArray(v) || v.length > 12 || v.some((p) => !isObj(p) || !iso(p.from) || !iso(p.to) || p.to < p.from)) throw bad('Pauses : 12 au plus, dates valides.'); return v.map((p) => ({ from: p.from, to: p.to })); },
  },
  taches: {
    parSemaine: intV('Tâches par semaine', 0, 100), tailleMin: intV('Taille', 5, 480), maintenance: boolV('Maintenance'),
    phases: (v) => { if (!Array.isArray(v) || v.some((p) => !PHASES.includes(p))) throw bad('Phases inconnues.'); return Array.from(new Set(v)); },
  },
  objectifs: { decoupage: enumV('Découpage', DECOUPAGES), jalons: intV('Jalons', 0, 12) },
  personne: { niveau: enumV('Niveau', NIVEAUX), dispoHeures: numV('Disponibilités', 0, 168), contraintes: strV('Contraintes', 300) },
  ajustement: { mode: enumV('Mode', MODES), frequence: enumV('Fréquence', FREQUENCES), ampleurMaxPct: intV('Ampleur', 1, 100) },
};
const REGLE_CHAMPS = {
  signal: (v) => { if (!SIGNAUX[v]) throw bad('Signal inconnu.'); return v; }, action: enumV('Action', ACTIONS),
  seuil: numV('Seuil', 0, 1000), duree: intV('Durée', 0, 52), actif: boolV('Actif'), label: strV('Nom', 60),
};

// ---- Lecture : document creux d'un niveau (migration sans perte des colonnes historiques si pas encore de docJson) ----
function legacyNature(r) {
  const n = {};
  if (r.kind) n.kind = r.kind; if (r.sens) n.sens = r.sens; if (r.famille) n.famille = r.famille; if (r.rythme) n.rythme = r.rythme;
  if (r.dateFixe != null) n.dateFixe = !!r.dateFixe; if (r.reformer != null) n.reformer = !!r.reformer;
  return n;
}
function parseDoc(r) {
  let d = null;
  try { d = r.docJson ? JSON.parse(r.docJson) : null; } catch (e) { d = null; }
  if (!isObj(d)) d = { v: 1, nature: legacyNature(r) };
  FAMILLES_DOC.forEach((f) => { if (!isObj(d[f])) d[f] = {}; });
  d.v = 1; // hook : les versions futures migrent ici
  return d;
}
function migrate() { // UNE fois par ligne : le document reprend les champs actuels (kind/sens/famille/rythme/dateFixe/reformer) dans « nature ». Les colonnes restent.
  db.prepare('SELECT * FROM category_strategies WHERE docJson IS NULL').all().forEach((r) => {
    db.prepare('UPDATE category_strategies SET docJson = ? WHERE activityId = ? AND key = ?').run(JSON.stringify(parseDoc(r)), r.activityId, r.key);
  });
}
migrate();

function ownDoc(activityId, key) {
  const r = db.prepare('SELECT * FROM category_strategies WHERE activityId = ? AND key = ?').get(activityId, storeKey(key));
  return r ? { doc: parseDoc(r), updatedAt: r.updatedAt } : { doc: parseDoc({}), updatedAt: null };
}
const docVide = (d) => Object.keys(flat(d)).filter((p) => p !== 'v').length === 0;

// Vue plate historique d'UN niveau : { kind, sens, famille, rythme, dateFixe, reformer, updatedAt } (comme avant).
function own(activityId, key) {
  const o = ownDoc(activityId, key), n = o.doc.nature || {};
  const out = { kind: null, sens: null, famille: null, rythme: null, dateFixe: null, reformer: null, updatedAt: o.updatedAt };
  FIELDS.forEach((f) => { if (n[f] != null) out[f] = n[f]; });
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

// Résolution : { doc (valeurs effectives), source (chemin -> 'noesis' | 'activité' | 'pôle' | 'propre'), modifie (chemin -> true si différent de Noèsis) }.
function resolved(activityId, key) {
  const m = flat(DEFAUTS), source = {};
  Object.keys(m).forEach((p) => { source[p] = 'noesis'; });
  chain(activityId, key).slice().reverse().forEach((c) => { // du plus large au plus proche : le plus proche gagne
    const f = flat(ownDoc(activityId, c.key).doc);
    Object.keys(f).forEach((p) => { if (p !== 'v') { m[p] = f[p]; source[p] = c.nom; } });
  });
  const doc = unflat(m); FAMILLES_DOC.forEach((f) => { if (!isObj(doc[f])) doc[f] = {}; }); doc.ajustement.regles = doc.ajustement.regles || {};
  const modifie = {}; Object.keys(source).forEach((p) => { if (p !== 'v' && source[p] !== 'noesis') modifie[p] = true; });
  return { doc, source, modifie };
}

// Réponses effectives historiques (nature), champ par champ ; origine = d'où vient le type.
function effective(activityId, key) {
  const r = resolved(activityId, key), n = r.doc.nature || {};
  const eff = { kind: null, sens: null, famille: null, rythme: null, dateFixe: null, reformer: null, origine: null };
  FIELDS.forEach((f) => { if (n[f] != null) eff[f] = n[f]; });
  const so = r.source['nature.kind']; eff.origine = eff.kind != null && so && so !== 'noesis' ? so : null;
  return eff;
}

// Règles résolues, en liste : { id, signal, seuil, duree, action, actif, label, origine ('noesis' | 'moi'), modifie, moteur (le moteur existant la lit), pasActive }.
function regles(activityId, key) {
  const r = resolved(activityId, key), out = [];
  Object.keys(r.doc.ajustement.regles).forEach((id) => {
    const x = r.doc.ajustement.regles[id]; if (!x || !x.signal || !x.action) return;
    const noesis = REGLES_NOESIS.includes(id), native = noesis && DEFAUTS.ajustement.regles[id].action === x.action;
    const moteur = noesis && native && !!(SIGNAUX[x.signal] || {}).moteur;
    out.push({ id, signal: x.signal, seuil: x.seuil == null ? 0 : x.seuil, duree: x.duree == null ? 0 : x.duree, action: x.action, actif: x.actif !== false, label: x.label || '', origine: noesis ? 'noesis' : 'moi', modifie: Object.keys(r.modifie).some((p) => p.indexOf('ajustement.regles.' + id + '.') === 0), moteur, pasActive: !moteur });
  });
  out.sort((a, b) => (a.origine === b.origine ? 0 : a.origine === 'noesis' ? -1 : 1));
  return out;
}

// Lecture d'un seuil par le moteur : { actif, seuil, duree } de la règle Noèsis `id` pour cette catégorie. SANS stratégie posée : EXACTEMENT les défauts (rien ne change). Jamais d'exception.
function regleActive(activityId, key, id) {
  const d = DEFAUTS.ajustement.regles[id];
  try {
    const x = resolved(Number(activityId), key).doc.ajustement.regles[id];
    if (x && isNum(Number(x.seuil), 0, 1000)) return { actif: x.actif !== false, seuil: Number(x.seuil), duree: Number.isInteger(x.duree) ? x.duree : d.duree };
  } catch (e) { /* repli : défauts */ }
  return { actif: d.actif, seuil: d.seuil, duree: d.duree };
}
// Clé de catégorie de l'objectif (secteur, pôle ou « _ » pour l'activité), comme partout dans l'arbre.
const keyOfObjective = (o) => (o && o.level === 'secteur' && o.categoryKey ? o.categoryKey : o && o.level === 'pole' && o.poleKey ? o.poleKey : '_');

// ---- Écriture : patch du document d'UN niveau (jamais d'un autre) ----
// patch : { nature: { kind: 'projet', famille: null (efface) }, ajustement: { mode: 'auto', regles: { 'chrono-ecart': { seuil: 30 }, u_ab12: { signal, seuil, duree, action, actif }, u_ab12: null } } }
function applyPatch(cur, patch, inherited) {
  const next = JSON.parse(JSON.stringify(cur));
  const clear = (v) => v === null || v === '';
  FAMILLES_DOC.forEach((fam) => {
    const p = patch[fam]; if (p === undefined) return;
    if (!isObj(p)) throw bad('Famille « ' + fam + ' » : objet attendu.');
    const before = next[fam].kind;
    Object.keys(p).forEach((k) => {
      if (fam === 'ajustement' && k === 'regles') return;
      if (!SCHEMA[fam] || !SCHEMA[fam][k]) throw bad('Variable inconnue : ' + fam + '.' + k + '.');
      if (clear(p[k])) delete next[fam][k]; else next[fam][k] = SCHEMA[fam][k](p[k]);
    });
    if (fam === 'nature' && p.kind !== undefined && next.nature.kind !== before) { // changer le type vide les réponses qui ne le concernent plus (jamais un champ donné dans le même envoi)
      const vide = (f) => { if (p[f] === undefined) delete next.nature[f]; };
      if (next.nature.kind === 'projet') { vide('sens'); vide('famille'); vide('rythme'); }
      if (next.nature.kind === 'progression') { vide('dateFixe'); vide('reformer'); }
    }
  });
  const pr = patch.ajustement && patch.ajustement.regles;
  if (pr !== undefined) {
    if (!isObj(pr)) throw bad('Règles : objet attendu.');
    const R = next.ajustement.regles = next.ajustement.regles || {};
    Object.keys(pr).forEach((id) => {
      const noesis = REGLES_NOESIS.includes(id);
      if (!noesis && !isUserRule(id)) throw bad('Règle inconnue : ' + id + '.');
      if (pr[id] === null) { delete R[id]; return; } // Noèsis : « Revenir à la valeur de Noèsis » ; à moi : supprimer
      if (!isObj(pr[id])) throw bad('Règle : objet attendu.');
      const e = Object.assign({}, R[id]);
      Object.keys(pr[id]).forEach((c) => {
        if (!REGLE_CHAMPS[c]) throw bad('Champ de règle inconnu : ' + c + '.');
        if (noesis && (c === 'signal' || c === 'action' || c === 'label')) throw bad('Une règle de Noèsis ne change ni de signal ni d\'action.');
        if (pr[id][c] === null) delete e[c]; else e[c] = REGLE_CHAMPS[c](pr[id][c]);
      });
      if (!noesis) {
        const heritee = (inherited && inherited[id]) || {};
        if (!(e.signal || heritee.signal) || !(e.action || heritee.action)) throw bad('Une règle a besoin d\'un signal et d\'une action.');
      }
      if (Object.keys(e).length) R[id] = e; else delete R[id];
    });
    if (Object.keys(R).filter(isUserRule).length > MAX_REGLES_MOI) throw bad('Au plus ' + MAX_REGLES_MOI + ' règles à toi.');
  }
  return next;
}

// body : champs historiques à poser à plat (kind, sens, ...) ET/OU `doc` (patch du document) ; null ou '' efface. Renvoie { own, effective }.
function set(activityId, key, userId, body) {
  const b = body || {}, cur = ownDoc(activityId, key).doc;
  const patch = isObj(b.doc) ? JSON.parse(JSON.stringify(b.doc)) : {};
  const flatNature = {}; FIELDS.forEach((f) => { if (b[f] !== undefined) flatNature[f] = b[f]; });
  if (Object.keys(flatNature).length) patch.nature = Object.assign({}, patch.nature, flatNature);
  const inherited = flat({ r: resolved(activityId, key).doc.ajustement.regles }); // seulement pour exiger signal et action d'une règle à moi
  const inh = {}; Object.keys(inherited).forEach((p) => { const m = /^r\.([^.]+)\.(.+)$/.exec(p); if (m) { inh[m[1]] = inh[m[1]] || {}; inh[m[1]][m[2]] = inherited[p]; } });
  const next = applyPatch(cur, patch, inh);
  const n = next.nature, now = new Date().toISOString();
  db.prepare(`INSERT INTO category_strategies (activityId, key, kind, sens, famille, rythme, dateFixe, reformer, docJson, updatedAt, updatedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(activityId, key) DO UPDATE SET kind = excluded.kind, sens = excluded.sens, famille = excluded.famille, rythme = excluded.rythme, dateFixe = excluded.dateFixe, reformer = excluded.reformer, docJson = excluded.docJson, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`)
    .run(activityId, storeKey(key), n.kind || null, n.sens || null, n.famille || null, n.rythme || null, n.dateFixe == null ? null : (n.dateFixe ? 1 : 0), n.reformer == null ? null : (n.reformer ? 1 : 0), JSON.stringify(next), now, userId || null);
  return { own: own(activityId, key), effective: effective(activityId, key) };
}

// Vue complète pour l'écran : document effectif, origine et drapeaux « modifié » par chemin, règles, catalogue.
function view(activityId, key) {
  const r = resolved(activityId, key);
  return {
    own: own(activityId, key), effective: effective(activityId, key), familles: familles(),
    doc: r.doc, source: r.source, modifie: r.modifie, regles: regles(activityId, key),
    defauts: DEFAUTS, signaux: Object.keys(SIGNAUX).map((id) => Object.assign({ id }, SIGNAUX[id])), actions: ACTIONS,
  };
}

// Sens pour objectifs-type.js : « descendre » = sens inverse (la plus grande valeur d'abord) ; monter et maintenir = sens normal.
const sensPourType = (s) => (s === 'descendre' ? 'inverse' : 'normal');

module.exports = { own, effective, set, isEmpty, familles, chain, sensPourType, resolved, regles, regleActive, keyOfObjective, view, DEFAUTS, SIGNAUX, ACTIONS, REGLES_NOESIS, KINDS, SENS, RYTHMES };
