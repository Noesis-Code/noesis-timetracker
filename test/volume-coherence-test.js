// Fiabilité Basic : (1) gros volume (≈ 5000 entrées sur 2 ans) : temps CPU du serveur par route sous un plafond ;
// (2) coupure / fusion / suppression d'une entrée passée : mêmes totaux dans toutes les vues ;
// (3) suppression d'une activité qui a de l'historique : conserver = rien ne bouge, supprimer = disparaît partout, autres membres intacts.
// Usage : node test/volume-coherence-test.js (voir docs/volume-coherence-2026-10-21.md)
process.env.TZ = 'America/Toronto';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const MIN = 60e3;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Temps CPU (utilisateur + système) du processus serveur, en ms, lu dans /proc ; null hors Linux.
function cpuMs(pid) {
  try {
    const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const p = f.slice(f.lastIndexOf(')') + 2).split(' ');
    return (Number(p[11]) + Number(p[12])) * 10; // utime, stime en ticks de 10 ms
  } catch (e) { return null; }
}

(async () => {
  const s = await startServer();
  const raw = new DatabaseSync(path.join(s.dir, 'noesis.db'));
  raw.exec('PRAGMA busy_timeout = 5000');
  try {
    // ===== (1) Gros volume =====
    const u = await newUser(s.base, 'vol');
    const other = await newUser(s.base, 'vol2');
    const c = u.c;
    const acts = [u.activityId];
    for (let i = 0; i < 5; i++) acts.push((await c.post('/api/activities', { name: 'Vol' + i })).body.id);
    raw.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#8b5cf6',?)").run(u.activityId, other.id, new Date().toISOString());
    const ins = raw.prepare('INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek) VALUES (?,?,?,?,?,?,?,?)');
    raw.exec('BEGIN');
    const now = Date.now();
    for (let i = 0; i < 5000; i++) {
      const st = new Date(now - 730 * 864e5 + Math.floor(i / 7) * 864e5 * (730 / 715) + (8 + (i % 7) * 2) * 36e5);
      const mine = i % 5 !== 0;
      ins.run(mine ? u.id : other.id, mine ? acts[i % acts.length] : u.activityId, '', st.toISOString(), new Date(st.getTime() + 3000e3).toISOString(), 3000, st.toISOString().slice(0, 10), 'x');
    }
    raw.exec('COMMIT');
    const A = u.activityId;
    const routes = ['/api/history?period=week', '/api/history?period=month', '/api/history?period=year', '/api/stats?granularity=day', '/api/stats?granularity=week', '/api/stats?granularity=month',
      '/api/stats/timesheet?period=week', '/api/stats/timesheet?period=month', '/api/stats/timesheet?period=year', '/api/stats/today', '/api/stats/week-so-far',
      '/api/profile/export', `/api/community/activity-stats?activityId=${A}`, `/api/community/activity-timesheet?activityId=${A}`, '/api/activities'];
    const CEIL = 400; // ms de CPU serveur par route (≈ 10 à 20 fois la mesure ; la vue Mois valait ~10 s avant correctif)
    for (const r of routes) {
      await c.get(r); // échauffement (compilation, caches)
      const before = cpuMs(s.child.pid);
      const res = await c.get(r);
      const after = cpuMs(s.child.pid);
      assert(res.status === 200, `volume : ${r} répond 200`);
      if (before !== null) assert(after - before <= CEIL, `volume : ${r} utilise ${after - before} ms de CPU (<= ${CEIL})`);
    }
    const q = `index`;
    const plan = raw.prepare("EXPLAIN QUERY PLAN SELECT * FROM time_entries WHERE userId = 'x' AND isoDate BETWEEN 'a' AND 'b'").all().map((x) => x.detail).join(' ');
    assert(/USING (COVERING )?INDEX/.test(plan) && !/SCAN/.test(plan), `volume : requête par (userId, isoDate) indexée (${plan})`);
    void q;

    // ===== (2) Coupure / fusion / suppression : invariance entre toutes les vues =====
    const v = await newUser(s.base, 'inv');
    const w = await newUser(s.base, 'inv2');
    raw.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#8b5cf6',?)").run(v.activityId, w.id, new Date().toISOString());
    const Y = new Date().getFullYear() - 1;
    const at = (m, d, h, mi) => new Date(Y, m - 1, d, h, mi || 0);
    const post = async (cl, act, a, b) => {
      const r = await cl.post('/api/history', { activityId: act, startTime: a.toISOString(), endTime: b.toISOString() });
      if (r.status !== 201) throw new Error('POST ' + r.status + ' ' + JSON.stringify(r.body));
      return r.body.id;
    };
    const A2 = v.activityId;
    const e1 = await post(v.c, A2, at(5, 4, 9), at(5, 4, 12));       // 3 h
    const e2 = await post(v.c, A2, at(5, 5, 14), at(5, 5, 15, 30));  // 1 h 30
    const e3 = await post(v.c, A2, at(5, 6, 8), at(5, 6, 8, 45));    // 45 min
    await post(w.c, A2, at(5, 4, 10), at(5, 4, 11));                 // autre membre : 1 h (Communauté seulement)
    const gross = (180 + 90 + 45) * 60;
    const grossAll = gross + 3600;
    const day = ymd(Y, 5, 4);
    async function views() {
      const hist = (await v.c.get(`/api/history?period=year&date=${Y}-06-15`)).body;
      const chart = (await v.c.get('/api/stats?granularity=month')).body.dailyBreakdown;
      const yr = (await v.c.get(`/api/stats/timesheet?period=year&yearOffset=1`)).body;
      const catStats = (await v.c.get(`/api/category-stats?activityId=${A2}&from=${ymd(Y, 1, 1)}&to=${ymd(Y, 12, 31)}`)).body;
      const ex = (await v.c.get('/api/profile/export')).body;
      const com = (await v.c.get(`/api/community/activity-stats?activityId=${A2}&period=year&date=${Y}-06-15`)).body;
      const sum = (arr, f) => arr.reduce((n, x) => n + f(x), 0);
      return {
        'Historique': sum(hist, (h) => h.durationSeconds),
        'Graphique': sum(chart, (p) => p.totalSeconds),
        'Feuille Année (ligne)': sum(yr.rows, (r) => r.totalSeconds),
        'Feuille Année (mois)': sum(yr.monthTotals, (x) => x),
        'Feuille Année (répartition)': yr.breakdown.totalSeconds,
        'Répartition': catStats.totalSeconds,
        'Export': sum(ex.timeEntries.filter((t) => Number(t.activityId) === A2), (t) => t.durationSeconds),
        'Communauté (tous membres)': com.breakdown.totalSeconds,
      };
    }
    async function same(label, mine) {
      const vs = await views();
      const bad = Object.entries(vs).filter(([k, val]) => val !== (k.startsWith('Communauté') ? mine + 3600 : mine));
      assert(bad.length === 0, `${label} : toutes les vues = ${mine} s` + (bad.length ? ' ; écarts : ' + JSON.stringify(bad) : ''));
    }
    await same('départ', gross);
    // Coupure de e1 (3 h) en deux : on raccourcit la première (PUT) et on ajoute la seconde (POST) sans trou ni recouvrement.
    assert((await v.c.put(`/api/history/${e1}`, { startTime: at(5, 4, 9).toISOString(), endTime: at(5, 4, 10, 20).toISOString() })).status === 200, 'coupure : première moitié raccourcie');
    await same('coupure (en cours)', gross - (100 * 60)); // 3 h -> 1 h 20 : la seconde moitié n'existe pas encore
    const e1b = await post(v.c, A2, at(5, 4, 10, 20), at(5, 4, 12));
    await same('coupure en deux', gross);
    // Fusion : les deux moitiés redeviennent une entrée (prolonger la première puis supprimer la seconde).
    assert((await v.c.del(`/api/history/${e1b}`)).status === 200, 'fusion : seconde moitié supprimée');
    assert((await v.c.put(`/api/history/${e1}`, { endTime: at(5, 4, 12).toISOString() })).status === 200, 'fusion : première prolongée');
    await same('fusion', gross);
    // Suppression
    assert((await v.c.del(`/api/history/${e2}`)).status === 200, 'suppression : entrée supprimée');
    await same('suppression', gross - 90 * 60);
    // Déplacement d'une entrée sur un autre jour (modifie isoDate) : même total
    assert((await v.c.put(`/api/history/${e3}`, { startTime: at(7, 1, 8).toISOString(), endTime: at(7, 1, 8, 45).toISOString() })).status === 200, 'déplacement : entrée changée de jour');
    await same('déplacement', gross - 90 * 60);
    void day; void grossAll;

    // ===== (3) Suppression d'une activité qui a de l'historique =====
    for (const keep of [true, false]) {
      const x = await newUser(s.base, 'del' + (keep ? 'k' : 'p'));
      const y = await newUser(s.base, 'del2' + (keep ? 'k' : 'p'));
      const AD = x.activityId;
      raw.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#8b5cf6',?)").run(AD, y.id, new Date().toISOString());
      const other2 = (await x.c.post('/api/activities', { name: 'Autre' })).body.id;
      await post(x.c, AD, at(3, 3, 9), at(3, 3, 11));      // 2 h sur l'activité supprimée
      await post(x.c, other2, at(3, 3, 13), at(3, 3, 14)); // 1 h ailleurs
      await post(y.c, AD, at(3, 3, 9), at(3, 3, 10));      // 1 h de l'autre membre
      const totals = async () => {
        const hist = (await x.c.get(`/api/history?period=year&date=${Y}-06-15`)).body.reduce((n, h) => n + h.durationSeconds, 0);
        const yr = (await x.c.get('/api/stats/timesheet?period=year&yearOffset=1')).body;
        const ex = (await x.c.get('/api/profile/export')).body.timeEntries.reduce((n, t) => n + t.durationSeconds, 0);
        const chart = (await x.c.get('/api/stats?granularity=month')).body.dailyBreakdown.reduce((n, p) => n + p.totalSeconds, 0);
        const theirs = (await y.c.get('/api/stats/timesheet?period=year&yearOffset=1')).body.breakdown.totalSeconds;
        return { hist, feuille: yr.breakdown.totalSeconds, ex, chart, theirs };
      };
      const before = await totals();
      assert(before.hist === 10800 && before.feuille === 10800 && before.ex === 10800 && before.chart === 10800 && before.theirs === 3600, `suppression d'activité (${keep ? 'conserver' : 'supprimer'}) : état de départ cohérent`);
      const del = await x.c.del(`/api/activities/${AD}?keepHistory=${keep ? 1 : 0}`);
      assert(del.status === 200 && typeof del.body.message === 'string' && del.body.message.length > 10, `suppression d'activité (${keep ? 'conserver' : 'supprimer'}) : message clair ("${del.body && del.body.message}")`);
      const after = await totals();
      const expMine = keep ? 10800 : 3600;
      assert(after.hist === expMine && after.feuille === expMine && after.ex === expMine && after.chart === expMine, `suppression d'activité (${keep ? 'conserver' : 'supprimer'}) : Historique, Feuille, Export et Graphique = ${expMine} s (reçu ${JSON.stringify(after)})`);
      assert(after.theirs === 3600, 'suppression d\'activité : les enregistrements de l\'autre membre sont intacts');
      const list = (await x.c.get('/api/activities')).body;
      assert(!list.some((a) => a.id === AD), 'suppression d\'activité : disparaît de la liste');
      const rows = raw.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE activityId = ? AND userId = ?').get(AD, x.id).n;
      assert(rows === (keep ? 1 : 0), `suppression d'activité (${keep ? 'conserver' : 'supprimer'}) : ${rows} ligne(s) en base pour la personne`);
    }
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
