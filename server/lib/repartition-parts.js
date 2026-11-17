// RÉPARTITION DES TÂCHES PAR MEMBRE : calcul PUR (aucune base, aucun I/O), 18 nov. 2026, décision d'Émilien.
// Une catégorie (activité '', pôle, secteur) peut porter des PARTS en pour cent par membre (« toi 60 %, Gaspard 40 % »).
//  - HÉRITAGE : une catégorie sans réponse reprend la part de la catégorie du dessus.
//  - CALCUL : la part d'une catégorie = moyenne des parts de ses sous-catégories PONDÉRÉE par leur temps alloué ; elle doit retomber sur la part de la catégorie du dessus.
//  - ÉQUILIBRAGE : quand une part change, on PROPOSE d'ajuster les autres sous-catégories (même parent) pour retomber sur la part du dessus.
//    Impossible (moins de 0 % ou plus de 100 % quelque part) : aucune erreur, on propose de modifier la part de la catégorie du dessus.
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

// Après le changement de la part de changedKey : { statut: 'rien' | 'ok' | 'proposition' | 'impossible', lignes: [{ key, avant, apres }], suggestion?: { key, avant, apres } }.
//  - 'ok' : la moyenne pondérée retombe déjà sur la part du dessus ; 'proposition' : lignes à valider une à une (les autres sous-catégories du même dessus) ;
//  - 'impossible' : aucun ajustement des autres ne suffit ; suggestion = modifier la part de la catégorie du dessus (activité comprise) pour qu'elle suive la moyenne.
function ajuster(nodes, members, changedKey) {
  const m = byKey(nodes), ch = m[changedKey];
  if (!ch || ch.parent == null || !m[ch.parent] || members.length < 2) return { statut: 'rien', lignes: [] };
  const parentKey = ch.parent, target = effective(nodes, parentKey);
  if (!target) return { statut: 'rien', lignes: [] };
  const T = target.shares, kids = childrenOf(nodes, parentKey);
  const cur = computed(nodes, parentKey, members);
  if (cur && same(cur, T, members)) return { statut: 'ok', lignes: [] };
  const w = weightsOf(kids), W = w.reduce((a, b) => a + b, 0);
  const iCh = kids.findIndex((k) => k.key === changedKey), eCh = effective(nodes, changedKey);
  const wo = W - w[iCh];
  const q = {}; let possible = wo > 0 && !!eCh;
  members.forEach((u) => { if (!possible) return; q[u] = (W * (T[u] || 0) - w[iCh] * (eCh.shares[u] || 0)) / wo; if (q[u] < -1e-9 || q[u] > 100 + 1e-9) possible = false; });
  if (!possible) {
    const apres = round100(cur || T, members), avant = {}; members.forEach((u) => { avant[u] = T[u] || 0; });
    return { statut: 'impossible', lignes: [], suggestion: { key: parentKey, avant, apres } };
  }
  const apres = round100(q, members), lignes = [];
  kids.forEach((k) => {
    if (k.key === changedKey) return;
    const e = effective(nodes, k.key), avant = e ? e.shares : {};
    if (!e || !same(avant, apres, members)) { const a = {}; members.forEach((u) => { a[u] = avant[u] || 0; }); lignes.push({ key: k.key, avant: a, apres: Object.assign({}, apres) }); }
  });
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
