// PORTÉE D'APPARTENANCE PAR CATÉGORIE (19 nov. 2026, modèle validé par Émilien) : source unique, jamais recopiée.
// Un membre appartient à UNE ou plusieurs catégories (activité '_', pôle ou secteur) et à tout ce qui est en dessous :
//   activité = tout (comportement de tous les membres existants) ; pôle = ce pôle et ses secteurs ; secteur = ce secteur seulement.
// Table member_scopes (une ligne par membre et par catégorie). SANS aucune ligne, un membre = portée activité (profils existants, membres ajoutés
// par les anciens chemins : rien ne casse). Une ligne '-' (« aucune catégorie ») marque un membre dont on a retiré la dernière catégorie : il reste
// dans l'activité (rien n'est supprimé, ni historique ni données) mais ne voit plus rien tant qu'on ne l'ajoute pas ailleurs.
// Un responsable de catégorie (category_managers) est implicitement membre de celle-ci et de ce qui est dessous ; un responsable d'activité
// (activity_managers) et le propriétaire ont la portée activité. Deux notions distinctes :
//   - scope()   : où je TRAVAILLE / ce que je vois de la structure (arbre, Chrono, tâches) ;
//   - managed() : ce que je vois des DONNÉES DES AUTRES (Bilan, statistiques d'un membre) = la portée que je GÈRE (responsable ou propriétaire).
// Un simple membre ne voit que ses propres données individuelles.
const db = require('../db');
require('./responsables'); // crée activity_managers / category_managers (lues ici)

const ACTIVITE = '_';
const AUCUNE = '-';

db.exec(`CREATE TABLE IF NOT EXISTS member_scopes (
  activityId INTEGER NOT NULL,
  userId TEXT NOT NULL,
  categoryKey TEXT NOT NULL,
  addedBy TEXT,
  addedAt TEXT NOT NULL,
  PRIMARY KEY (activityId, userId, categoryKey)
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_member_scopes_user ON member_scopes(userId)');
// Invitation avec portée (pôle ou secteur) : colonne facultative, NULL = portée activité (comportement d'avant).
try {
  if (!db.prepare('PRAGMA table_info(activity_invites)').all().some((c) => c.name === 'scopeKey')) db.exec('ALTER TABLE activity_invites ADD COLUMN scopeKey TEXT');
} catch (e) { console.error('[portee] colonne scopeKey', e.message); }

// Migration SANS PERTE (idempotente) : chaque membre actuel sans ligne de portée devient « portée activité » explicite ('_'). Rien n'est supprimé ni modifié ailleurs.
function migrer() {
  try {
    const r = db.prepare(`INSERT OR IGNORE INTO member_scopes (activityId, userId, categoryKey, addedBy, addedAt)
      SELECT m.activityId, m.userId, '${ACTIVITE}', NULL, ? FROM activity_members m
      WHERE NOT EXISTS (SELECT 1 FROM member_scopes s WHERE s.activityId = m.activityId AND s.userId = m.userId)`).run(new Date().toISOString());
    return Number(r.changes) || 0;
  } catch (e) { console.error('[portee] migration', e.message); return 0; }
}
migrer();

function err(code, msg) { const e = new Error(msg); e.statusCode = code; return e; }
const R = () => require('./responsables');

function ownerOf(activityId) { const a = db.prepare('SELECT ownerId FROM activities WHERE id = ?').get(Number(activityId)); return a ? a.ownerId : null; }
function isMember(userId, activityId) { return !!db.prepare('SELECT 1 FROM activity_members WHERE activityId = ? AND userId = ?').get(Number(activityId), userId); }
function isActivityManager(userId, activityId) {
  return ownerOf(activityId) === userId || !!db.prepare('SELECT 1 FROM activity_managers WHERE activityId = ? AND userId = ?').get(Number(activityId), userId);
}
// Une clé de pôle + les clés de ses secteurs (actifs ou gelés : le passé reste lisible).
function expand(activityId, key) {
  const out = [String(key)];
  db.prepare('SELECT key FROM activity_goal_categories WHERE activityId = ? AND parentKey = ?').all(Number(activityId), String(key)).forEach((r) => out.push(r.key));
  return out;
}
function levelOf(activityId, key) {
  if (key == null || key === '' || key === ACTIVITE) return 'activite';
  const row = db.prepare('SELECT parentKey FROM activity_goal_categories WHERE activityId = ? AND key = ?').get(Number(activityId), String(key));
  return row && row.parentKey ? 'secteur' : 'pole';
}
function make(all, roots) {
  const keys = new Set();
  if (!all) roots.forEach((k) => expand(roots.activityId, k).forEach((x) => keys.add(x)));
  return {
    all, roots: all ? [] : roots.slice(), keys,
    has(key) { return all || (key != null && key !== '' && keys.has(String(key))); },
  };
}
// Portée de TRAVAIL de userId dans l'activité : { all, roots:[clés], keys:Set (racines + secteurs), has(key) }. Non-membre : rien.
function scope(userId, activityId) {
  const id = Number(activityId);
  const none = () => { const s = make(false, []); s.roots.activityId = id; return s; };
  if (!isMember(userId, id) && ownerOf(id) !== userId) return none();
  if (isActivityManager(userId, id)) return make(true, []);
  const rows = db.prepare('SELECT categoryKey FROM member_scopes WHERE activityId = ? AND userId = ?').all(id, userId).map((r) => r.categoryKey);
  if (!rows.length || rows.includes(ACTIVITE)) return make(true, []); // aucune ligne = portée activité (profils existants)
  const roots = rows.filter((k) => k !== AUCUNE);
  db.prepare('SELECT categoryKey FROM category_managers WHERE activityId = ? AND userId = ?').all(id, userId).forEach((r) => { if (!roots.includes(r.categoryKey)) roots.push(r.categoryKey); });
  roots.activityId = id;
  return make(false, roots);
}
// Portée GÉRÉE (données des autres) : propriétaire / responsable d'activité = tout ; sinon les catégories dont il est responsable (+ dessous) ; sinon rien.
function managed(userId, activityId) {
  const id = Number(activityId);
  if (isActivityManager(userId, id)) return make(true, []);
  const roots = isMember(userId, id) ? db.prepare('SELECT categoryKey FROM category_managers WHERE activityId = ? AND userId = ?').all(id, userId).map((r) => r.categoryKey) : [];
  roots.activityId = id;
  return make(false, roots);
}
const estResponsable = (userId, activityId) => { const m = managed(userId, activityId); return m.all || m.roots.length > 0; };

// Filtre commun : liste d'objets portant une clé de catégorie -> ne garde que ce que la portée couvre (null = « sans catégorie » : portée activité seulement).
function filterByKey(list, sc, getKey) { return sc.all ? list : list.filter((x) => sc.has(getKey ? getKey(x) : x.key)); }

// Choix de catégorie du Chrono / de l'historique : un membre limité ne choisit qu'au plus son niveau et ceux d'en dessous.
// `key` = clé choisie (ou null), `current` = clé déjà posée (tolérée : lecture d'un ancien rattachement), opts.require = une catégorie est exigée (arrêt, saisie manuelle).
// Renvoie { categoryKey } ou { error: { status, body } }.
function checkChoice(userId, activityId, key, current, opts) {
  const sc = scope(userId, activityId);
  if (sc.all) return { categoryKey: key };
  if (!sc.roots.length) return { error: { status: 403, body: { error: 'Tu n’as plus de pôle ni de secteur dans cette activité.' } } };
  if (key == null) {
    if (!(opts && opts.require)) return { categoryKey: null };
    if (sc.roots.length === 1) return { categoryKey: sc.roots[0] }; // un seul pôle/secteur possible : posé d'office
    return { error: { status: 400, body: { error: 'Choisis ton pôle ou ton secteur.' } } };
  }
  if (sc.has(key) || (current && String(current) === String(key))) return { categoryKey: key };
  return { error: { status: 403, body: { error: 'Ce pôle ou ce secteur est hors de ta portée.' } } };
}

// ---- Appartenance : lecture / ajout / retrait (routes dans server/routes/membres.js) ----
function activite(activityId) {
  const a = db.prepare('SELECT id, name, ownerId FROM activities WHERE id = ? AND active = 1').get(Number(activityId));
  if (!a) throw err(404, 'Activité introuvable.');
  return a;
}
function normKey(a, key) {
  if (key == null || key === '' || key === ACTIVITE) return ACTIVITE;
  if (!require('./goals').isValidCategoryOrSecteurForActivity(a.id, String(key))) throw err(404, 'Pôle ou secteur introuvable pour cette activité.');
  return String(key);
}
function nomDe(id) { const u = db.prepare('SELECT name FROM users WHERE id = ?').get(id); return u ? u.name : ''; }
function libelle(a, key) { if (key === ACTIVITE) return a.name; try { return require('./goals').categoryLabelFor(a.id, key) || key; } catch (e) { return key; } }
const RANG_NIVEAU = { activite: 3, pole: 2, secteur: 1 };

// Qui appartient à la catégorie `key` (avec la manière : propre, via l'activité, via le pôle, responsable) + candidats à l'ajout.
function membresDe(userId, activityId, key) {
  const a = activite(activityId), k = normKey(a, key), n = R().niveauDe(a, k === ACTIVITE ? null : k);
  if (!isMember(userId, a.id) && a.ownerId !== userId) throw err(403, 'Tu ne fais pas partie de cette activité.');
  const moi = R().rangSur(userId, a, n);
  const vide = { activityId: a.id, key: k, niveau: n.niveau, name: libelle(a, k), canOpen: false, canAdd: false, members: [], candidates: [] };
  if (moi <= 0) return vide;
  const etat = R().etat(userId, a, n), rangResp = new Map(etat.responsables.map((r) => [r.id, r.rang]));
  const propre = RANG_NIVEAU[n.niveau];
  const ids = new Set(db.prepare('SELECT userId FROM activity_members WHERE activityId = ?').all(a.id).map((r) => r.userId));
  ids.add(a.ownerId);
  const members = [], candidates = [];
  [...ids].forEach((uid) => {
    const sc = scope(uid, a.id), rows = db.prepare('SELECT categoryKey FROM member_scopes WHERE activityId = ? AND userId = ?').all(a.id, uid).map((r) => r.categoryKey);
    const direct = rows.includes(k) || (k !== ACTIVITE && db.prepare('SELECT 1 FROM category_managers WHERE activityId = ? AND categoryKey = ? AND userId = ?').get(a.id, k, uid));
    const couvre = sc.all || sc.has(k);
    if (couvre) {
      const via = uid === a.ownerId ? 'proprietaire' : direct ? 'categorie' : sc.all ? 'activite' : 'dessus';
      const rang = uid === a.ownerId ? 4 : (rangResp.get(uid) || 0);
      members.push({ id: uid, name: nomDe(uid), owner: uid === a.ownerId, manager: rang > 0, via, removable: !!direct && uid !== a.ownerId && moi > rang });
    } else {
      // Candidat : membre de l'activité d'un niveau égal ou inférieur (ses racines sont des pôles/secteurs de niveau <= celui visé).
      const bas = sc.roots.some((r) => RANG_NIVEAU[levelOf(a.id, r)] <= propre);
      if (bas || !sc.roots.length) candidates.push({ id: uid, name: nomDe(uid) });
    }
  });
  const canAdd = moi > 0;
  return { activityId: a.id, key: k, niveau: n.niveau, name: libelle(a, k), canOpen: true, canAdd, members, candidates: canAdd ? candidates : [] };
}

function ajouter(userId, activityId, key, targetId) {
  const a = activite(activityId), k = normKey(a, key), n = R().niveauDe(a, k === ACTIVITE ? null : k);
  if (R().rangSur(userId, a, n) <= 0) throw err(403, 'Seul un responsable de cette catégorie (ou d’un niveau au-dessus) peut y ajouter un membre.');
  const t = String(targetId || '');
  if (!t || (!isMember(t, a.id) && a.ownerId !== t)) throw err(400, 'Cette personne ne fait pas partie de l’activité : invite-la d’abord (invitation avec pôle ou secteur).');
  if (t === a.ownerId) throw err(400, 'Le propriétaire appartient déjà à tout.');
  const sc = scope(t, a.id);
  if (sc.all || sc.has(k)) throw err(409, 'Cette personne appartient déjà à cette catégorie.');
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM member_scopes WHERE activityId = ? AND userId = ? AND categoryKey = ?').run(a.id, t, AUCUNE);
    db.prepare('INSERT OR IGNORE INTO member_scopes (activityId, userId, categoryKey, addedBy, addedAt) VALUES (?, ?, ?, ?, ?)').run(a.id, t, k, userId, new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return membresDe(userId, a.id, k);
}

function retirer(userId, activityId, key, targetId) {
  const a = activite(activityId), k = normKey(a, key), n = R().niveauDe(a, k === ACTIVITE ? null : k);
  const moi = R().rangSur(userId, a, n);
  if (moi <= 0) throw err(403, 'Seul un responsable de cette catégorie (ou d’un niveau au-dessus) peut en retirer un membre.');
  const t = String(targetId || '');
  if (t === a.ownerId) throw err(400, 'Le propriétaire ne se retire jamais.');
  if (k === ACTIVITE) throw err(400, 'Pour retirer quelqu’un de l’activité entière, utilise l’exclusion de l’activité.');
  const cur = membresDe(userId, a.id, k).members.find((m) => m.id === t);
  if (!cur) throw err(404, 'Cette personne n’appartient pas à cette catégorie.');
  if (cur.via === 'activite' || cur.via === 'dessus') throw err(400, 'Cette personne appartient à cette catégorie par un niveau au-dessus : retire-la de ce niveau.');
  if (!cur.removable) throw err(403, 'Seul un responsable d’un niveau supérieur peut retirer ce membre.');
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM member_scopes WHERE activityId = ? AND userId = ? AND categoryKey = ?').run(a.id, t, k);
    db.prepare('DELETE FROM category_managers WHERE activityId = ? AND categoryKey = ? AND userId = ?').run(a.id, k, t); // un responsable retiré de la catégorie ne l'est plus
    const reste = db.prepare('SELECT COUNT(*) AS n FROM member_scopes WHERE activityId = ? AND userId = ?').get(a.id, t).n
      + db.prepare('SELECT COUNT(*) AS n FROM category_managers WHERE activityId = ? AND userId = ?').get(a.id, t).n;
    if (!reste) db.prepare('INSERT OR IGNORE INTO member_scopes (activityId, userId, categoryKey, addedBy, addedAt) VALUES (?, ?, ?, ?, ?)').run(a.id, t, AUCUNE, userId, new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return membresDe(userId, a.id, k);
}

// Appartenances de tous les membres d'une activité (vue d'ensemble pour les responsables) : [{ id, name, owner, manager, all, scopes:[{ key, label, niveau }] }].
// Un responsable ne voit que les membres dont la portée croise la sienne ; un simple membre ne voit que lui-même.
function membres(userId, activityId) {
  const a = activite(activityId);
  if (!isMember(userId, a.id) && a.ownerId !== userId) throw err(403, 'Tu ne fais pas partie de cette activité.');
  const mg = managed(userId, a.id), ids = new Set(db.prepare('SELECT userId FROM activity_members WHERE activityId = ?').all(a.id).map((r) => r.userId));
  ids.add(a.ownerId);
  const out = [];
  [...ids].forEach((uid) => {
    const sc = scope(uid, a.id);
    const visible = uid === userId || mg.all || (mg.roots.length && (sc.all || sc.roots.some((r) => mg.has(r)) || mg.roots.some((r) => sc.has(r))));
    if (!visible) return;
    const manager = uid === a.ownerId || isActivityManager(uid, a.id) || !!db.prepare('SELECT 1 FROM category_managers WHERE activityId = ? AND userId = ?').get(a.id, uid);
    out.push({ id: uid, name: nomDe(uid), owner: uid === a.ownerId, manager, all: sc.all, scopes: sc.all ? [] : sc.roots.map((r) => ({ key: r, label: libelle(a, r), niveau: levelOf(a.id, r) })) });
  });
  return { activityId: a.id, canManage: mg.all || mg.roots.length > 0, members: out };
}

// Invitation d'un nouveau membre avec portée : le responsable doit gérer la catégorie visée ; sans portée (activité entière), seul un membre de portée activité peut inviter (comportement d'avant).
function peutInviter(userId, activityId, scopeKey) {
  const a = activite(activityId);
  if (scopeKey == null || scopeKey === '' || scopeKey === ACTIVITE) return scope(userId, a.id).all;
  const k = normKey(a, scopeKey);
  return R().rangSur(userId, a, R().niveauDe(a, k)) > 0;
}
// À l'acceptation d'une invitation : pose la ligne de portée (rien si portée activité).
function poserALAcceptation(activityId, userId, scopeKey, addedBy) {
  db.prepare('DELETE FROM member_scopes WHERE activityId = ? AND userId = ?').run(Number(activityId), userId); // d'anciennes lignes d'un départ passé ne ressuscitent pas
  if (scopeKey == null || scopeKey === '' || scopeKey === ACTIVITE) {
    db.prepare('INSERT OR IGNORE INTO member_scopes (activityId, userId, categoryKey, addedBy, addedAt) VALUES (?, ?, ?, ?, ?)').run(Number(activityId), userId, ACTIVITE, addedBy || null, new Date().toISOString());
    return;
  }
  db.prepare('INSERT OR IGNORE INTO member_scopes (activityId, userId, categoryKey, addedBy, addedAt) VALUES (?, ?, ?, ?, ?)').run(Number(activityId), userId, String(scopeKey), addedBy || null, new Date().toISOString());
}

// ---- Activités PARTAGÉES (2 membres ou plus) : objectifs réservés aux responsables, tâches reçues = les siennes, création de tâches réservée (décision d'Émilien, 19 nov. 2026) ----
// Une activité à un seul membre reste libre : aucune de ces règles ne s'y applique.
function estPartagee(activityId) { return db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(Number(activityId)).n >= 2; }
function refus(code, message) { const e = err(403, message); e.errCode = code; return e; }
// Écrire (créer, modifier le contenu, supprimer) une tâche de la catégorie `key` : propriétaire, responsable d'activité, ou responsable dont la portée gérée couvre la catégorie.
function peutEcrireTache(userId, activityId, key) {
  if (!estPartagee(activityId)) return true;
  const mg = managed(userId, activityId);
  return mg.all || (key != null && key !== '' && mg.has(key));
}
function exigerEcritureTache(userId, activityId, key) {
  if (!peutEcrireTache(userId, activityId, key)) throw refus('TACHE_RESERVEE_RESPONSABLES', 'Seuls les responsables peuvent créer ou modifier des tâches ici.');
}
// Une tâche existante est lisible par : responsable de sa portée (ou propriétaire), le membre à qui elle est attribuée ou qui l'a faite.
function peutLireTache(userId, activityId, key, item) {
  if (!estPartagee(activityId)) return true;
  const mg = managed(userId, activityId);
  return mg.all || (key != null && mg.has(key)) || (item && (item.plannedUserId === userId || item.doneBy === userId));
}
// Modifier une tâche existante : le contenu (tout sauf `done`) est réservé aux responsables ; un membre ne coche que ses tâches attribuées.
function exigerModificationTache(userId, activityId, key, item, body) {
  if (!estPartagee(activityId) || peutEcrireTache(userId, activityId, key)) return;
  const contenu = Object.keys(body || {}).some((k) => k !== 'done');
  if (contenu) throw refus('TACHE_RESERVEE_RESPONSABLES', 'Seuls les responsables peuvent créer ou modifier des tâches ici.');
  if (item.plannedUserId !== userId) throw refus('TACHE_NON_ATTRIBUEE', 'Cette tâche ne t’est pas attribuée.');
}
// Tâches reçues : un membre ne reçoit que celles qui lui sont attribuées (ou qu'il a faites) ; un responsable, celles de sa portée gérée en plus. `getKey(task)` = clé de catégorie de la tâche.
function filterTasks(list, viewerId, activityId, getKey) {
  if (!viewerId || !estPartagee(activityId)) return list;
  const mg = managed(viewerId, activityId);
  if (mg.all) return list;
  return list.filter((t) => t.plannedUserId === viewerId || t.doneBy === viewerId || (mg.roots.length > 0 && mg.has(getKey ? getKey(t) : t.key)));
}
// Objectifs d'une activité partagée : réservés aux responsables, limités à leur portée gérée ; un simple membre n'en reçoit aucun.
function objectifVisible(userId, activityId, poleKey, categoryKey) {
  if (!estPartagee(activityId)) return true;
  const mg = managed(userId, activityId);
  if (mg.all) return true;
  const k = categoryKey || poleKey;
  return !!k && mg.has(k);
}
function exigerObjectif(userId, activityId, poleKey, categoryKey) {
  if (!objectifVisible(userId, activityId, poleKey, categoryKey)) throw refus('OBJECTIF_RESERVE_RESPONSABLES', 'Les objectifs d’une activité partagée sont réservés aux responsables.');
}

module.exports = { peutLireTache, exigerModificationTache, estPartagee, peutEcrireTache, exigerEcritureTache, filterTasks, objectifVisible, exigerObjectif, ACTIVITE, AUCUNE, migrer, scope, managed, estResponsable, isActivityManager, filterByKey, checkChoice, membresDe, membres, ajouter, retirer, peutInviter, poserALAcceptation, levelOf, expand };
