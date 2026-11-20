// CAPACITÉ DE TÂCHES D'UNE PERSONNE = SA PART DES HEURES DES OBJECTIFS EN COURS (décision d'Émilien, 20 nov. 2026 : « la capacité de l'objectif est la capacité de chaque personne »). Voir docs/objectifs/heures-et-taches.md.
// Source unique : goalsauto.capacityMinutesForMember l'appelle en PREMIER ; null = la personne n'a aucune heure d'objectif sur la période (l'ancienne chaîne prend le relais). Lecture seule, aucune écriture.
//
// INVARIANT DE SOMME (Émilien, 20 nov. 2026), du haut vers le bas : le total de l'activité = la somme des heures de ses pôles ; le total d'un pôle = la somme de ses secteurs ; le total d'un secteur ou d'un pôle sans secteur = la somme des parts de ses membres.
// Un parent n'est JAMAIS additionné à ses enfants : il EST leur somme. Défaut = répartition ÉGALE à chaque niveau ; un enfant qui porte ses propres heures (objectif posé sur lui) garde les siennes, le reste du parent se répartit également entre les enfants sans heures propres.
const db = require('../db');

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const today = () => require('./dates').userToday();

// Heures PROPRES (minutes par semaine) des objectifs en cours d'un nœud : niveau 'activite' (pôle et secteur null), 'pole' (secteur null) ou 'secteur'. Ni macro, ni abandonné, ni sans heures, qui couvrent le jour.
// Un objectif parent d'un autre objectif du MÊME nœud (étapes) est écarté : ses heures sont celles de ses étapes.
function objectifsDuNoeud(rows, level, poleKey, catKey) {
  const own = rows.filter((r) => r.level === level && (level === 'activite' || r.poleKey === poleKey) && (level !== 'secteur' || r.categoryKey === catKey));
  const parents = new Set();
  own.forEach((o) => { let p = o.parentId, g = 0; while (p && g++ < 10) { parents.add(p); const up = db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(p); p = up && up.parentId; } });
  return own.filter((o) => !parents.has(o.id));
}
function lireObjectifs(activityId, day) {
  const out = [];
  db.prepare("SELECT id, userId, COALESCE(level,'activite') AS level, poleKey, categoryKey, parentId, metaJson FROM user_objectives WHERE activityId = ? AND isMacro = 0 AND startDate <= ? AND endDate >= ?").all(Number(activityId), day, day).forEach((r) => {
    let m = {}; try { m = JSON.parse(r.metaJson || '{}'); } catch (e) { m = {}; }
    const h = Number(m.hoursPerWeek);
    if (m.abandoned || m.atteintConfirme || !(h > 0)) return; // atteint (confirmé par la personne, 20 nov. 2026) : ses heures sont libérées
    out.push({ id: r.id, userId: r.userId, level: r.level, poleKey: r.poleKey || null, categoryKey: r.categoryKey || null, parentId: r.parentId || null, minutes: Math.round(h * 60) });
  });
  return out;
}
const somme = (list) => list.reduce((a, o) => a + o.minutes, 0);

// ARBRE D'ALLOCATION de l'activité : { total, poles: [{ key, own, total, feuilles: [{ cat (null = le pôle lui-même), minutes }] }], ecarts }.
// `seulement` : userId à qui limiter les objectifs (activité personnelle). Répartition descendante : budget du dessus moins les heures propres des enfants, divisé également entre les enfants sans heures propres.
function arbre(activityId, day, seulement) {
  const goals = require('./goals'), d = isDay(day) ? day : today();
  let rows = lireObjectifs(activityId, d);
  if (seulement) rows = rows.filter((o) => o.userId === seulement);
  const poles = goals.categoriesForActivity(activityId) || [];
  const ecarts = [];
  const propre = (level, pk, ck) => { const l = objectifsDuNoeud(rows, level, pk, ck); return l.length ? somme(l) : null; };
  const secteurs = (pk) => goals.secteursForPole(activityId, pk) || [];
  // Heures explicites d'un pôle : les siennes, sinon la somme de ses secteurs qui en portent.
  const explicitePole = (pk) => { const o = propre('pole', pk, null); if (o != null) return o; return secteurs(pk).reduce((a, s) => a + (propre('secteur', pk, s.key) || 0), 0); };
  const aPropre = (pk) => propre('pole', pk, null) != null || secteurs(pk).some((s) => propre('secteur', pk, s.key) != null);
  const ownAct = propre('activite', null, null);
  // 1. Activité -> pôles
  const alloc = {};
  const sansPropre = poles.filter((p) => !aPropre(p.key)), propres = poles.filter((p) => aPropre(p.key));
  propres.forEach((p) => { alloc[p.key] = explicitePole(p.key); });
  const sommePropres = propres.reduce((a, p) => a + alloc[p.key], 0);
  if (ownAct != null) {
    sansPropre.forEach((p) => { alloc[p.key] = Math.max(0, ownAct - sommePropres) / sansPropre.length; });
    if (Math.round(ownAct) !== Math.round(sansPropre.length ? Math.max(ownAct, sommePropres) : sommePropres)) ecarts.push({ niveau: 'activite', total: ownAct, somme: sommePropres });
    else if (ownAct < sommePropres) ecarts.push({ niveau: 'activite', total: ownAct, somme: sommePropres });
  } else sansPropre.forEach((p) => { alloc[p.key] = 0; });
  // 2. Pôle -> secteurs (feuilles)
  const out = poles.map((p) => {
    const ss = secteurs(p.key), total = alloc[p.key] || 0, own = propre('pole', p.key, null), feuilles = [];
    if (!ss.length) feuilles.push({ cat: null, minutes: total });
    else {
      const prop = ss.filter((s) => propre('secteur', p.key, s.key) != null), vides = ss.filter((s) => propre('secteur', p.key, s.key) == null);
      const sp = prop.reduce((a, s) => a + propre('secteur', p.key, s.key), 0);
      prop.forEach((s) => feuilles.push({ cat: s.key, minutes: propre('secteur', p.key, s.key) }));
      vides.forEach((s) => feuilles.push({ cat: s.key, minutes: Math.max(0, total - sp) / vides.length }));
      if (own != null && ((!vides.length && Math.round(own) !== Math.round(sp)) || own < sp)) ecarts.push({ niveau: 'pole', key: p.key, total: own, somme: sp });
      if (own != null && !vides.length && own > sp) feuilles.push({ cat: null, minutes: own - sp }); // heures du pôle non réparties : restent sur le pôle (écart signalé), jamais perdues ni comptées deux fois
    }
    return { key: p.key, own, total: feuilles.reduce((a, f) => a + f.minutes, 0), feuilles };
  });
  return { total: out.reduce((a, p) => a + p.total, 0), poles: out, ecarts };
}

// Part (0 à 1) d'une personne sur la catégorie `catKey` (secteur) ou le pôle. Activité à un seul membre : 100 %.
// Activité partagée : pour cent de la Répartition en vigueur (repartition-membres, héritage vers le haut) ; sans répartition posée, parts ÉGALES entre les membres dont la portée couvre la catégorie.
function partDe(activityId, poleKey, catKey, userId) {
  const rm = require('./repartition-membres'), ms = rm.membres(activityId);
  if (ms.length < 2) return 1;
  const parts = rm.partsEnVigueur(activityId, catKey, poleKey);
  if (parts) return Math.max(0, Number(parts[userId]) || 0) / 100;
  const pt = require('./portee'), key = catKey || poleKey;
  const couvre = ms.filter((m) => { const s = pt.scope(m.userId, activityId); return s.all || s.has(key); }).map((m) => m.userId);
  return couvre.includes(userId) ? 1 / couvre.length : 0;
}
const estPartagee = (activityId) => db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(Number(activityId)).n >= 2;

// Minutes par semaine de la personne sur ce pôle = somme, sur les feuilles du pôle (secteurs, ou le pôle sans secteur), de heures de la feuille x part de la personne. null = aucune heure d'objectif ou aucune part posée (repli) ;
// 0 = la Répartition donne explicitement 0 % à la personne (aucune tâche planifiable, PAS de repli).
function weeklyShareMinutes(activityId, poleKey, userId, day) {
  try {
    const shared = estPartagee(activityId), t = arbre(activityId, day, shared ? null : userId), p = t.poles.find((x) => x.key === poleKey);
    if (!p) return null;
    const rm = require('./repartition-membres');
    let total = 0, zero = false;
    p.feuilles.forEach((f) => {
      if (!(f.minutes > 0)) return;
      const part = partDe(Number(activityId), poleKey, f.cat, userId);
      if (part === 0 && shared && rm.membres(Number(activityId)).some((m) => m.userId === userId) && rm.partsEnVigueur(Number(activityId), f.cat, poleKey)) zero = true;
      total += f.minutes * part;
    });
    total = Math.round(total);
    return total > 0 ? total : (zero ? 0 : null);
  } catch (e) { return null; } // jamais d'échec du planning pour une lecture d'heures : repli sur l'ancienne chaîne
}

// TOTAL des heures par semaine d'une catégorie (tous membres confondus) : '' ou '_' = activité (= somme des pôles), clé de pôle (= somme de ses secteurs), clé de secteur. null sans heures.
// C'est ce total que l'ajustement du temps divise entre les membres (repartition-membres.lire : objectifsHeures / heuresParMembre).
function totalMinutes(activityId, key, day) {
  try {
    const t = arbre(activityId, day, null), k = key === '_' || key == null ? '' : String(key);
    let v = 0;
    if (!k) v = t.total;
    else { const p = t.poles.find((x) => x.key === k); if (p) v = p.total; else t.poles.forEach((x) => x.feuilles.forEach((f) => { if (f.cat === k) v = f.minutes; })); }
    return v > 0 ? Math.round(v) : null;
  } catch (e) { return null; }
}
// Écarts d'invariant : niveaux où les heures propres d'un objectif ne sont pas égales à la somme de ses enfants (à régler par Ajouter/Déplacer). Lecture seule.
function ecarts(activityId, day) { try { return arbre(activityId, day, null).ecarts; } catch (e) { return []; } }

// Vrai si la personne a une part d'heures d'objectif sur ce pôle (ou sur un pôle de l'activité si poleKey est absent).
function aDesHeures(activityId, userId, poleKey) {
  try {
    const poles = poleKey ? [{ key: poleKey }] : (require('./goals').categoriesForActivity(activityId) || []);
    return poles.some((p) => weeklyShareMinutes(activityId, p.key, userId) != null);
  } catch (e) { return false; }
}

module.exports = { totalMinutes, ecarts, aDesHeures, weeklyShareMinutes, arbre, partDe };
