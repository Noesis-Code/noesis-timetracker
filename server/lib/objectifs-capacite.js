// CAPACITÉ DE TÂCHES D'UNE PERSONNE = SA PART DES HEURES DES OBJECTIFS EN COURS (décision d'Émilien, 20 nov. 2026 : « la capacité de l'objectif est la capacité de chaque personne »). Voir docs/objectifs/heures-et-taches.md.
// Source unique : goalsauto.capacityMinutesForMember l'appelle en PREMIER ; null = la personne n'a aucune heure d'objectif sur la période (l'ancienne chaîne prend le relais). Lecture seule, aucune écriture.
const db = require('../db');

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const today = () => require('./dates').userToday();

// Objectifs EN COURS d'un pôle (niveau pôle ou secteur sous ce pôle) qui couvrent le jour, avec leurs heures par semaine. Ni macro, ni abandonné, ni sans heures.
// Un objectif parent d'un autre objectif compté (étapes) est écarté : ses heures sont déjà celles de ses étapes.
function objectifsEnCours(activityId, poleKey, day) {
  const rows = db.prepare("SELECT id, userId, level, poleKey, categoryKey, parentId, startDate, endDate, metaJson FROM user_objectives WHERE activityId = ? AND isMacro = 0 AND poleKey = ? AND level IN ('pole','secteur') AND startDate <= ? AND endDate >= ?").all(Number(activityId), String(poleKey), day, day);
  const out = [];
  rows.forEach((r) => {
    let m = {}; try { m = JSON.parse(r.metaJson || '{}'); } catch (e) { m = {}; }
    const h = Number(m.hoursPerWeek);
    if (m.abandoned || !(h > 0)) return;
    out.push({ id: r.id, userId: r.userId, level: r.level, categoryKey: r.categoryKey || null, parentId: r.parentId || null, minutes: Math.round(h * 60) });
  });
  const parents = new Set();
  out.forEach((o) => { let p = o.parentId, guard = 0; while (p && guard++ < 10) { parents.add(p); const up = db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(p); p = up && up.parentId; } });
  return out.filter((o) => !parents.has(o.id));
}

// Objectifs EN COURS de niveau ACTIVITÉ (sans pôle) : leurs heures sont RÉPARTIES ÉGALEMENT entre les pôles de l'activité par défaut (décision d'Émilien, 20 nov. 2026) ; modifiables ensuite par des sous-objectifs
// ou Ajouter/Déplacer. Un objectif activité qui est l'ancêtre d'un objectif de pôle ou de secteur en cours est écarté (ses heures sont déjà celles de ses étapes). Retourne [{ userId, minutes }] déjà divisés par le nombre de pôles.
function objectifsActivite(activityId, day) {
  const nPoles = (require('./goals').categoriesForActivity(activityId) || []).length;
  if (!nPoles) return [];
  const rows = db.prepare("SELECT id, userId, metaJson FROM user_objectives WHERE activityId = ? AND isMacro = 0 AND COALESCE(level,'activite') = 'activite' AND startDate <= ? AND endDate >= ?").all(Number(activityId), day, day);
  if (!rows.length) return [];
  const anc = new Set();
  db.prepare("SELECT parentId FROM user_objectives WHERE activityId = ? AND isMacro = 0 AND level IN ('pole','secteur') AND startDate <= ? AND endDate >= ? AND parentId IS NOT NULL").all(Number(activityId), day, day).forEach((r) => { let p = r.parentId, g = 0; while (p && g++ < 10) { anc.add(p); const up = db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(p); p = up && up.parentId; } });
  const out = [];
  rows.forEach((r) => { let m = {}; try { m = JSON.parse(r.metaJson || '{}'); } catch (e) { m = {}; } const h = Number(m.hoursPerWeek); if (m.abandoned || !(h > 0) || anc.has(r.id)) return; out.push({ userId: r.userId, minutes: Math.round(h * 60) / nPoles }); });
  return out;
}

// Part (0 à 1) d'une personne sur un objectif de la catégorie `catKey` (secteur) ou du pôle. Activité à un seul membre : 100 % de SES objectifs.
// Activité partagée : pour cent de la Répartition en vigueur (repartition-membres, héritage vers le haut) ; sans répartition posée, parts ÉGALES entre les membres dont la portée couvre la catégorie.
function partDe(activityId, poleKey, catKey, userId, objectifUserId) {
  const rm = require('./repartition-membres'), ms = rm.membres(activityId);
  if (ms.length < 2) return objectifUserId === userId ? 1 : 0;
  const parts = rm.partsEnVigueur(activityId, catKey, poleKey);
  if (parts) return Math.max(0, Number(parts[userId]) || 0) / 100;
  const pt = require('./portee'), key = catKey || poleKey;
  const couvre = ms.filter((m) => { const s = pt.scope(m.userId, activityId); return s.all || s.has(key); }).map((m) => m.userId);
  return couvre.includes(userId) ? 1 / couvre.length : 0;
}

// 0 = la Répartition donne explicitement 0 % à la personne (aucune tâche planifiable, PAS de repli) ; null = pas d'heure d'objectif ou aucune part posée (repli).
// Minutes par semaine de la personne sur ce pôle (somme sur les objectifs en cours de sa part ; un pôle = le plus grand des deux niveaux, pour ne pas compter deux fois les heures d'un secteur déjà dans celles de son pôle), ou null sans heures.
function weeklyShareMinutes(activityId, poleKey, userId, day) {
  try {
    const d = isDay(day) ? day : today();
    const shared = db.prepare('SELECT COUNT(*) AS n FROM activity_members WHERE activityId = ?').get(Number(activityId)).n >= 2;
    let rows = objectifsEnCours(activityId, poleKey, d);
    if (!shared) rows = rows.filter((o) => o.userId === userId); // activité personnelle : ses objectifs seulement
    let pole = 0, sect = 0, act = 0, zero = false;
    const note = (part, cat) => { if (part === 0 && shared && require('./repartition-membres').membres(Number(activityId)).some((m) => m.userId === userId) && require('./repartition-membres').partsEnVigueur(Number(activityId), cat, poleKey)) zero = true; return part; }; // part explicitement à 0 % dans la Répartition (≠ aucune part posée)
    (shared ? objectifsActivite(activityId, d) : objectifsActivite(activityId, d).filter((o) => o.userId === userId)).forEach((o) => { act += o.minutes * note(partDe(Number(activityId), poleKey, null, userId, o.userId), null); });
    rows.forEach((o) => {
      const cat = o.level === 'secteur' ? o.categoryKey : null, part = note(partDe(Number(activityId), poleKey, cat, userId, o.userId), cat);
      if (o.level === 'secteur') sect += o.minutes * part; else pole += o.minutes * part;
    });
    const total = Math.round(Math.max(pole, sect) + act);
    return total > 0 ? total : (zero ? 0 : null); // 0 = part explicitement à 0 % : aucune tâche planifiable, pas de repli ; null = aucune heure / aucune part : repli
  } catch (e) { return null; } // jamais d'échec du planning pour une lecture d'heures : repli sur l'ancienne chaîne
}

// TOTAL des heures par semaine des objectifs en cours d'une catégorie (tous membres confondus, même règle de non double compte) : '' ou '_' = activité (somme des pôles), clé de pôle, clé de secteur. null sans heures.
// C'est ce total que l'ajustement du temps divise entre les membres (repartition-membres.lire : objectifsHeures / heuresParMembre).
function totalMinutes(activityId, key, day) {
  try {
    const d = isDay(day) ? day : today(), goals = require('./goals'), k = key === '_' || key == null ? '' : String(key);
    const actPart = () => objectifsActivite(activityId, d).reduce((a, o) => a + o.minutes, 0);
    const poleSum = (pk, only) => { let pole = 0, sect = 0; objectifsEnCours(activityId, pk, d).forEach((o) => { if (o.level === 'secteur') { if (!only || o.categoryKey === only) sect += o.minutes; } else if (!only) pole += o.minutes; }); return Math.max(pole, sect) + (only ? 0 : actPart()); };
    let t = 0;
    if (!k) (goals.categoriesForActivity(activityId) || []).forEach((p) => { t += poleSum(p.key); });
    else if ((goals.categoriesForActivity(activityId) || []).some((p) => p.key === k)) t = poleSum(k);
    else { const pk = (goals.categoriesForActivity(activityId) || []).map((p) => p.key).find((p) => (goals.secteursForPole(activityId, p) || []).some((x) => x.key === k)); t = pk ? poleSum(pk, k) : 0; }
    return t > 0 ? t : null;
  } catch (e) { return null; }
}

// Vrai si la personne a une part d'heures d'objectif sur ce pôle (ou sur un pôle de l'activité si poleKey est absent).
function aDesHeures(activityId, userId, poleKey) {
  try {
    const poles = poleKey ? [{ key: poleKey }] : (require('./goals').categoriesForActivity(activityId) || []);
    return poles.some((p) => weeklyShareMinutes(activityId, p.key, userId) != null);
  } catch (e) { return false; }
}

module.exports = { totalMinutes, aDesHeures, weeklyShareMinutes, objectifsEnCours, partDe };
