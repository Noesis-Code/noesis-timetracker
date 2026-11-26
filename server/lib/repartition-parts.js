// RÉPARTITION DES TÂCHES PAR MEMBRE : calcul PUR (aucune base, aucun I/O), 18 nov. 2026, décision d'Émilien.
// Une catégorie (activité '', pôle, secteur) peut porter des PARTS en pour cent par membre (« toi 60 %, Gaspard 40 % »).
//  - HÉRITAGE : une catégorie sans réponse reprend la part de la catégorie du dessus.
//  - CALCUL : la part d'une catégorie = moyenne des parts de ses sous-catégories PONDÉRÉE par leur temps alloué ; elle doit retomber sur la part de la catégorie du dessus.
//  - COORDINATION (19 nov. 2026) : quand les parts d'un niveau changent, on PROPOSE d'ajuster les niveaux INFÉRIEURS ; jamais l'inverse.
// nodes : [{ key, parent (clé du dessus ; null pour l'activité), minutes (temps alloué, 0 si aucun), own: { userId: pct } | null }] ; l'activité a la clé ''.
const EPS = 0.5; // tolérance en points (les parts affichées sont entières)

const byKey = (nodes) => { const m = {}; nodes.forEach((n) => { m[n.key] = n; }); return m; };
const hasOwn = (n) => !!(n && n.own && Object.keys(n.own).length);
const childrenOf = (nodes, key) => nodes.filter((n) => n.parent === key && n.key !== key);

// Part en vigueur : la propre, sinon celle du dessus. { shares, origin } ou null si personne n'en a posé.
function effective(nodes, key) {
  const m = byKey(nodes); let k = key, guard = 0;
  while (k != null && m[k] && guard++ < 10) {
    if (hasOwn(m[k])) return { shares: Object.assign({}, m[k].own), origin: k };
    k = m[k].parent;
  }
  return null;
}
const weightsOf = (list) => { const tot = list.reduce((s, n) => s + (n.minutes > 0 ? n.minutes : 0), 0); return list.map((n) => (tot > 0 ? Math.max(0, n.minutes || 0) : 1)); };

// Moyenne pondérée par le temps des parts EN VIGUEUR des sous-catégories ; null sans sous-catégorie ou sans part.
function computed(nodes, key, members) {
  const kids = childrenOf(nodes, key); if (!kids.length) return null;
  const w = weightsOf(kids), W = w.reduce((a, b) => a + b, 0), out = {};
  members.forEach((u) => { out[u] = 0; });
  for (let i = 0; i < kids.length; i++) {
    const e = effective(nodes, kids[i].key); if (!e) return null;
    members.forEach((u) => { out[u] += (w[i] * (e.shares[u] || 0)) / W; });
  }
  return out;
}

// Arrondit à des entiers dont la somme fait 100 (plus grand reste).
function round100(shares, members) {
  const base = {}, rest = [];
  members.forEach((u) => { const v = Math.max(0, shares[u] || 0); base[u] = Math.floor(v); rest.push([u, v - base[u]]); });
  let missing = 100 - members.reduce((s, u) => s + base[u], 0);
  rest.sort((a, b) => b[1] - a[1]).forEach((r) => { if (missing > 0) { base[r[0]]++; missing--; } });
  return base;
}
const same = (a, b, members) => members.every((u) => Math.abs((a[u] || 0) - (b[u] || 0)) < EPS);

// Après le changement des parts de changedKey (19 nov. 2026, règle d'Émilien : le niveau SUPÉRIEUR change les niveaux inférieurs, JAMAIS l'inverse) : { statut: 'rien' | 'ok' | 'proposition', lignes: [{ key, avant, apres }] }.
//  - on PROPOSE d'ajuster les niveaux INFÉRIEURS (sous-catégories de tous rangs) qui ont leurs propres parts et qui diffèrent : chaque ligne se valide ou se refuse ; ceux qui n'ont rien reprennent déjà la part du dessus ;
//  - modifier un niveau inférieur ne propose jamais de modifier le niveau supérieur (ni les catégories voisines).
function ajuster(nodes, members, changedKey) {
  const m = byKey(nodes), ch = m[changedKey];
  if (!ch || members.length < 2 || !hasOwn(ch)) return { statut: 'rien', lignes: [] };
  const apres = round100(ch.own, members), lignes = [];
  const walk = (key, guard) => { if (guard > 10) return; childrenOf(nodes, key).forEach((k) => { if (hasOwn(k) && !same(k.own, apres, members)) { const av = {}; members.forEach((u) => { av[u] = k.own[u] || 0; }); lignes.push({ key: k.key, avant: av, apres: Object.assign({}, apres) }); } walk(k.key, guard + 1); }); };
  walk(changedKey, 0);
  return { statut: lignes.length ? 'proposition' : 'ok', lignes };
}

// Responsable d'une tâche selon les parts : la part en vigueur de la catégorie ; renvoie { userId, tie } ou null sans part.
// load : { userId: minutes de travail ouvert dans la catégorie }. Le membre le plus en dessous de sa part reçoit la tâche ; égalité : preferred, sinon premier de la liste.
function attribuer(shares, members, load, preferred) {
  if (!shares) return null;
  const tot = members.reduce((s, u) => s + (shares[u] || 0), 0); if (!(tot > 0)) return null;
  const L = members.reduce((s, u) => s + ((load && load[u]) || 0), 0);
  const ranked = members.map((u, i) => ({ u, i, g: (shares[u] || 0) / tot - (L > 0 ? ((load && load[u]) || 0) / L : 0) }))
    .sort((a, b) => (b.g - a.g) || ((a.u === preferred ? -1 : 0) - (b.u === preferred ? -1 : 0)) || (a.i - b.i));
  return { userId: ranked[0].u, tie: !!(ranked[1] && Math.abs(ranked[1].g - ranked[0].g) < 1e-9) };
}

module.exports = { effective, computed, ajuster, attribuer, round100, EPS };
