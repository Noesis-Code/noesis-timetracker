// Algorithme de création d'un objectif (schéma v46, 16 nov. 2026, Émilien) — ÉTAPE 1 : blocs « 1 · PARENT », « 2 · MURS », « Départ = fin du mur ».
// Module PUR : aucune lecture de base ; les objectifs existants sont passés en paramètre. Rien n'est écrit ici.
// objectif = { id, level: 'activite'|'pole'|'secteur', poleKey, categoryKey, startDate, endDate, dateFixe, abandoned, atteint }
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const RANK = { secteur: 0, pole: 1, activite: 2 };
const rank = (o) => RANK[o.level || 'activite'];
const live = (o) => !o.abandoned && !o.atteint;

// « Date fixée » = case « Date fixe » cochée OU date modifiée par la personne (échéance proposée ≠ échéance choisie).
function isDateFixed(o) { return !!(o && (o.dateFixe === true || (o.proposedEnd && o.endDate && o.proposedEnd !== o.endDate))); }

// Un objectif supérieur est dans la lignée du nouveau : activité = tous ; pôle = même pôle (pour un secteur) ; jamais un inférieur.
function superiorOf(n, o) {
  if (rank(o) <= rank(n)) return false;
  if (o.level === 'activite') return true;
  return (o.poleKey || null) === (n.poleKey || null); // o est un pôle, n un secteur
}
// Même niveau = même colonne de l'arbre (pôle : même pôle ; secteur : même pôle et même catégorie), à d'autres dates.
function sameLevel(n, o) {
  if (o.id != null && o.id === n.id) return false;
  if ((o.level || 'activite') !== (n.level || 'activite')) return false;
  if (n.level === 'pole') return (o.poleKey || null) === (n.poleKey || null);
  if (n.level === 'secteur') return (o.poleKey || null) === (n.poleKey || null) && (o.categoryKey || null) === (n.categoryKey || null);
  return true;
}
const contains = (o, d) => o.startDate <= d && d <= o.endDate;
const follows = (o, d) => o.startDate > d;
// Premier qui contient la case, sinon le plus proche qui la suit.
function pick(list, d) {
  const inside = list.filter((o) => contains(o, d)).sort((a, b) => (a.endDate < b.endDate ? -1 : 1) || (a.id - b.id));
  if (inside.length) return inside[0];
  const after = list.filter((o) => follows(o, d)).sort((a, b) => (a.startDate < b.startDate ? -1 : 1) || (a.id - b.id));
  return after[0] || null;
}
// 1 · PARENT : un supérieur qui contient la case ou la suit ; sinon un objectif de même niveau À DATE FIXÉE qui la contient ou la suit ; jamais un inférieur.
function findParent(n, objs) {
  const L = objs.filter(live);
  return pick(L.filter((o) => superiorOf(n, o)), n.endDate) || pick(L.filter((o) => sameLevel(n, o) && isDateFixed(o)), n.endDate);
}
// Cas A : il a un parent. B : pas de parent mais date fixée (il est parent des inférieurs). C : ni l'un ni l'autre (il suit).
function classify(n, objs) {
  const parent = findParent(n, objs);
  if (parent) return { cas: 'A', parent };
  return { cas: isDateFixed(n) ? 'B' : 'C', parent: null };
}
// 2 · MURS. unrelated(a, b) : 'lie' | 'sans_rapport' ; DOUTE = lié (jamais un mur). Branché plus tard sur le moteur de liens ; ici toujours « lié ».
const defaultUnrelated = () => 'lie';
function walls(n, objs, cas, today, unrelated) {
  const un = unrelated || defaultUnrelated, L = objs.filter((o) => live(o) && (o.id == null || o.id !== n.id));
  const before = (o) => o.endDate < n.endDate; // précède : finit avant l'échéance du nouveau (un objectif qui la contient n'est pas « avant »)
  const w = [{ date: today, why: 'aujourd’hui' }];
  if (cas === 'A' || cas === 'B') {
    L.filter((o) => superiorOf(n, o) && before(o) && !contains(o, n.endDate)).forEach((o) => w.push({ date: o.endDate, why: 'supérieur précédent', id: o.id }));
    L.filter((o) => sameLevel(n, o) && isDateFixed(o) && before(o)).forEach((o) => w.push({ date: o.endDate, why: 'même niveau à date fixée', id: o.id }));
  } else {
    L.filter((o) => (sameLevel(n, o) || superiorOf(n, o)) && before(o) && !contains(o, n.endDate)).forEach((o) => w.push({ date: o.endDate, why: 'précédent même niveau ou supérieur', id: o.id }));
    const lower = L.filter((o) => rank(o) < rank(n) && before(o));
    lower.filter(isDateFixed).forEach((o) => w.push({ date: o.endDate, why: 'inférieur à date fixée', id: o.id }));
    // Sans rapport (rare) : un objectif de même niveau sans rapport est un mur ; un inférieur sans rapport n'en est un que si son précédent de même niveau l'est aussi, sinon ignoré.
    lower.filter((o) => !isDateFixed(o) && un(n, o) === 'sans_rapport').forEach((o) => {
      const prev = lower.filter((p) => sameLevel(o, p) && p.endDate < o.endDate).sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];
      if (prev && un(n, prev) === 'sans_rapport') w.push({ date: o.endDate, why: 'inférieur sans rapport', id: o.id });
    });
    L.filter((o) => sameLevel(n, o) && !isDateFixed(o) && before(o) && un(n, o) === 'sans_rapport').forEach((o) => w.push({ date: o.endDate, why: 'même niveau sans rapport', id: o.id }));
  }
  return w;
}
// Départ du nouvel objectif = LENDEMAIN de la fin du mur le plus tardif (aujourd’hui si le mur est aujourd’hui), jamais dans le passé, jamais de vide ; jamais après sa propre échéance.
function computeStart(n, objs, today, unrelated) {
  const { cas, parent } = classify(n, objs), w = walls(n, objs, cas, today, unrelated);
  const wall = w.reduce((a, b) => (b.date > a.date ? b : a));
  const raw = wall.why === 'aujourd’hui' ? wall.date : addDays(wall.date, 1), start = raw > n.endDate ? n.endDate : raw;
  return { cas, parent, walls: w, wall, start };
}
module.exports = { findParent, classify, walls, computeStart, isDateFixed, superiorOf, sameLevel };
