// Planificateur de semaines (15 oct. 2026, lot A, aucune UI).
// - planWeeks : orchestrateur PUR (aucune base, aucune IA, aucun effet de bord).
//   Il ne fait que PROPOSER (deleguer / reporter / non_planifiable), jamais appliquer.
// - get/setWeeklyCapacity : capacite hebdomadaire par utilisateur (minutes, toutes
//   activites confondues). Cible manuelle prioritaire, sinon moyenne chronometree.

// NB : les weekKey doivent etre au format zero-rempli YYYY-Www (ex. 2026-W05) : le tri est lexical.
const AVG_DAYS = 28;
const MAX_WEEK_MINUTES = 10080;

function cmpItems(a, b) {
  // echeance (la semaine, deja groupee) puis importance decroissante puis id.
  const ia = Number(a.importance) || 0, ib = Number(b.importance) || 0;
  if (ia !== ib) return ib - ia;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

function mins(v) { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; }

function planWeeks({ weeks = [], capacities = {}, members = [], carryLimitWeeks = 1 } = {}) {
  const memberList = Array.from(new Set(members.map(String))).sort();
  const cap = (u) => mins(capacities[u]);
  const limit = Math.max(0, Math.floor(Number(carryLimitWeeks) || 0));
  const sorted = weeks.map((w) => ({
    weekKey: String(w.weekKey),
    items: (w.items || []).map((i) => ({ ...i, minutes: mins(i.minutes), ownerUserId: String(i.ownerUserId) })),
  })).sort((a, b) => (a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : 0));

  // Passe 1 : par semaine et par membre, ce qui reste et ce qui deborde.
  const state = sorted.map((w) => {
    const items = w.items.slice().sort(cmpItems);
    const owners = Array.from(new Set(items.map((i) => i.ownerUserId)));
    const kept = [], overflow = [], residual = {};
    for (const u of new Set([...owners, ...memberList])) residual[u] = cap(u);
    for (const u of owners) {
      const mine = items.filter((i) => i.ownerUserId === u);
      let load = mine.reduce((s, i) => s + i.minutes, 0);
      const out = new Set();
      // On retire d'abord les moins importants (fin de liste), jamais un element pinned.
      for (let k = mine.length - 1; k >= 0 && load > cap(u); k--) {
        if (mine[k].pinned) continue;
        out.add(mine[k].id); load -= mine[k].minutes;
      }
      residual[u] = cap(u) - load;
      for (const i of mine) (out.has(i.id) ? overflow : kept).push(i);
    }
    return { weekKey: w.weekKey, items, kept, overflow, residual };
  });

  // Passe 2 : propositions, dans l'ordre chronologique, en reservant la capacite.
  const out = state.map((st, wi) => {
    const proposals = [];
    for (const it of st.items.filter((i) => st.overflow.includes(i))) {
      let done = null;
      const cands = memberList.filter((m) => m !== it.ownerUserId && (st.residual[m] || 0) >= it.minutes)
        .sort((a, b) => (st.residual[b] - st.residual[a]) || (a < b ? -1 : 1));
      if (cands.length) {
        const to = cands[0];
        st.residual[to] -= it.minutes;
        done = { type: 'deleguer', itemId: it.id, minutes: it.minutes, fromUserId: it.ownerUserId, toUserId: to, weekKey: st.weekKey };
      } else {
        for (let d = 1; d <= limit && wi + d < state.length; d++) {
          const nx = state[wi + d];
          if ((nx.residual[it.ownerUserId] || 0) >= it.minutes) {
            nx.residual[it.ownerUserId] -= it.minutes;
            done = { type: 'reporter', itemId: it.id, minutes: it.minutes, userId: it.ownerUserId, fromWeekKey: st.weekKey, toWeekKey: nx.weekKey };
            break;
          }
        }
      }
      proposals.push(done || { type: 'non_planifiable', itemId: it.id, minutes: it.minutes, userId: it.ownerUserId, weekKey: st.weekKey });
    }
    return {
      weekKey: st.weekKey,
      placements: st.kept.map((i) => ({ itemId: i.id, userId: i.ownerUserId, minutes: i.minutes, pinned: !!i.pinned })),
      proposals,
    };
  });
  return { weeks: out };
}

// --- Capacite par utilisateur (acces base, hors planWeeks) ---

function historyAverageMinutes(userId, db) {
  const d = new Date(Date.now() - AVG_DAYS * 86400000).toISOString();
  const r = db.prepare('SELECT COALESCE(SUM(durationSeconds),0) AS s FROM time_entries WHERE userId = ? AND startTime >= ?').get(userId, d);
  const m = Math.round(r.s / 60 / (AVG_DAYS / 7));
  return m > 0 ? m : null;
}

function getWeeklyCapacity(userId) {
  const db = require('../db');
  const row = db.prepare('SELECT weeklyCapacityMinutes AS m FROM users WHERE id = ?').get(userId);
  if (!row) return null;
  const historyMinutes = historyAverageMinutes(userId, db);
  if (row.m != null) return { minutes: row.m, source: 'manual', historyMinutes };
  return { minutes: historyMinutes, source: historyMinutes != null ? 'history' : null, historyMinutes };
}

function setWeeklyCapacity(userId, minutes) {
  const db = require('../db');
  let v = null;
  if (minutes !== null && minutes !== undefined && minutes !== '') {
    v = Number(minutes);
    if (!Number.isInteger(v) || v < 0 || v > MAX_WEEK_MINUTES) {
      throw Object.assign(new Error('Capacité invalide : entier de minutes entre 0 et ' + MAX_WEEK_MINUTES + ', ou null.'), { statusCode: 400 });
    }
  }
  const r = db.prepare('UPDATE users SET weeklyCapacityMinutes = ? WHERE id = ?').run(v, userId);
  if (!r.changes) throw Object.assign(new Error('Profil introuvable.'), { statusCode: 404 });
  return getWeeklyCapacity(userId);
}

module.exports = { planWeeks, getWeeklyCapacity, setWeeklyCapacity, MAX_WEEK_MINUTES };
