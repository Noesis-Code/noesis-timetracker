// Algorithme de création v46, bloc « 4 · RÉORGANISER : COHÉRENCE, PUIS TEMPS » (schéma v47, nœuds b1 à b9). Module PUR : aucune lecture de base, aucune écriture ; la proposition est affichée dans « Modifications proposées ».
// Les objectifs DÉPLACÉS sont ceux qui SUIVENT le nouvel objectif (jamais ceux à date fixée, jamais le passé, jamais un objectif atteint) ; la date du nouvel objectif et les HEURES fixées par la personne ne sont JAMAIS modifiées.
// b1 choisir les objectifs à déplacer (délais respectés, type) · b2 cohérence avec les objectifs liés (lié, non lié, DOUTE = lié : déplacés ensemble) · b3-b4 déplacer aussi les liés, le moins possible ·
// b5-b6 allonger ou raccourcir une durée (jamais les heures fixées) · b7 cohérence cassée ? · b8-b9 trois tours au plus, puis la meilleure option. AUCUN message d'erreur : le résultat dit seulement ce qui ne concorde pas (`violations`).
const MAX_TOURS = 3;
const DAY = 86400000;
const toMs = (d) => Date.parse(d + 'T00:00:00Z');
const addDays = (d, n) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);
const days = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY) + 1; // durée inclusive
const live = (o) => !o.abandoned && !o.atteint;

// objectif = { id, level, poleKey, categoryKey, startDate, endDate, dateFixe, hoursPerWeek, famille, abandoned, atteint }
// ctx = { today, delaiMinimal(o) -> semaines ou null (objectifs-delais.js, famille connue), lie(a, b) -> 'lie' | 'non_lie' | 'doute' (moteur de liens), limite -> date au-delà de laquelle rien ne doit finir (cadre du parent) }
function mobiles(n, existants, ctx) {
  // b1 : suivent le nouvel objectif (ils finissent après sa fin), vivants, à venir, sans date fixée, de la même colonne ou liés (doute = lié).
  const lie = ctx.lie || (() => 'lie');
  const col = (o) => (o.level || 'activite') === (n.level || 'activite') && (n.level === 'activite' || (o.poleKey || null) === (n.poleKey || null)) && (n.level !== 'secteur' || (o.categoryKey || null) === (n.categoryKey || null));
  const memeNiveau = (o) => (o.level || 'activite') === (n.level || 'activite');
  return existants.filter((o) => live(o) && !o.dateFixe && o.endDate >= ctx.today && o.endDate > n.endDate && (o.id == null || o.id !== n.id) && memeNiveau(o) && (col(o) || lie(n, o) !== 'non_lie'))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : (a.id || 0) - (b.id || 0)));
}

// Un tour : on avance un curseur après le nouvel objectif ; un objectif qui chevauche est décalé (durée gardée) ; au tour 2 on raccourcit jusqu'au délai minimal, au tour 3 jusqu'à une semaine.
function tour(n, list, murs, ctx, t) {
  let cursor = addDays(n.endDate, 1);
  const out = [];
  list.forEach((o) => {
    const dur = days(o.startDate, o.endDate), min = Math.min(dur, Math.max(7, (ctx.delaiMinimal && ctx.delaiMinimal(o) ? ctx.delaiMinimal(o) * 7 : 7)));
    let start = o.startDate < cursor ? cursor : o.startDate, len = dur;
    const wall = murs.filter((m) => m.date >= start).sort((a, b) => (a.date < b.date ? -1 : 1))[0]; // prochain mur (objectif à date fixée) : on ne le dépasse pas
    const room = wall ? days(start, addDays(wall.date, -1)) : Infinity;
    if (room < len) len = t === 1 ? len : t === 2 ? Math.max(min, Math.min(len, room)) : Math.max(7, Math.min(len, room)); // tour 1 : durée gardée ; 2 : jusqu'au délai ; 3 : jusqu'à une semaine
    const end = addDays(start, len - 1);
    out.push({ id: o.id, avant: { startDate: o.startDate, endDate: o.endDate }, apres: { startDate: start, endDate: end }, duree: len, dureeAvant: dur });
    cursor = addDays(end, 1);
  });
  return out;
}
function violations(plan, murs, ctx, list) {
  const v = [];
  plan.forEach((m, i) => {
    const o = list[i], wall = murs.find((w) => w.date >= m.apres.startDate && w.date <= m.apres.endDate);
    if (wall) v.push({ id: m.id, raison: 'chevauche un objectif à date fixée' });
    if (ctx.limite && m.apres.endDate > ctx.limite) v.push({ id: m.id, raison: 'dépasse le cadre du parent' });
    const min = ctx.delaiMinimal && ctx.delaiMinimal(o);
    if (min && m.duree < min * 7) v.push({ id: m.id, raison: 'délai minimal non respecté' });
  });
  return v;
}
// Renvoie { moves, tours, violations, ok } : `moves` ne contient que les objectifs réellement déplacés ou raccourcis. Aucune exception.
function reorganiser(n, existants, ctx) {
  try {
    const list = mobiles(n, existants, ctx);
    const murs = existants.filter((o) => live(o) && o.dateFixe && o.endDate > n.endDate && (o.id == null || o.id !== n.id)).map((o) => ({ date: o.startDate, id: o.id }));
    let best = null;
    for (let t = 1; t <= MAX_TOURS; t += 1) {
      const plan = tour(n, list, murs, ctx, t), v = violations(plan, murs, ctx, list);
      if (!best || v.length < best.v.length) best = { plan, v, t };
      if (!v.length) break; // b7 : cohérence tenue, on s'arrête
    }
    const moves = best.plan.filter((m) => m.apres.startDate !== m.avant.startDate || m.apres.endDate !== m.avant.endDate);
    return { moves, tours: best.t, violations: best.v, ok: best.v.length === 0 };
  } catch (e) { return { moves: [], tours: 0, violations: [], ok: true }; } // jamais d'erreur affichée
}
module.exports = { MAX_TOURS, mobiles, reorganiser };
