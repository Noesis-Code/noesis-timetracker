// Plan proposé à la création, de bout en bout : proposition (règle du trou + titres IA ou repli) -> validation ligne par ligne (titre, date) -> « Terminer ». Usage : node test/plan-trou-panneau-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-plan-trou-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), aicache = require('../server/lib/aicache'), O = require('../server/lib/objectifs'), I = require('../server/lib/objectifs-inferieurs'), TR = require('../server/lib/objectifs-trou');
const T = '2027-01-20'; // « aujourd'hui » fixé : période 1 de 2027, les cas ne dépendent pas de la date du jour
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const actId = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(actId);
const pole = categories.addCategory(actId, 'Pôle A'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(actId)[0].key;
(async () => {
  const E0 = '2027-01-31', END = '2027-06-27'; // existant : fin de P1 ; nouveau : fin de P6 (trou de 4 périodes P2 à P5)
  const existing = O.creer('u1', { title: 'Existant', activityId: actId, level: 'pole', poleKey, cadence: 'periodique', startDate: T, endDate: E0, hoursPerWeek: 2, weekTasks: [] });
  const before = JSON.stringify(db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(existing.id));
  const parent = O.creer('u1', { title: 'Nouveau périodique', activityId: actId, level: 'pole', poleKey, cadence: 'periodique', startDate: T, endDate: END, hoursPerWeek: 2, weekTasks: [] });
  const expect = TR.planTrou('periodique', END, E0, T);
  const body = { trou: true, type: 'periodique', title: parent.title, activityId: actId, level: 'pole', poleKey, startDate: T, endDate: END, rateMin: 120 };
  // 1. sans IA : repli, toujours quelque chose à proposer s'il y a un trou
  const r0 = await I.plan('u1', body, T);
  if (!expect.lines.length) { assert(r0.skip, 'aucun trou : rien à proposer'); console.log(failed ? 'ÉCHEC' : 'plan-trou-panneau-test OK (aucun trou aujourd’hui)'); process.exit(failed ? 1 : 0); }
  assert(!r0.skip && r0.rows.length === expect.lines.length && r0.rows.length <= 8 && r0.mode === expect.mode && r0.ai === false, 'sans IA : lignes de la règle du trou (' + r0.mode + ', ' + r0.rows.length + ')');
  assert(r0.rows.every((x) => x.checked && x.title && x.title !== parent.title && x.hoursMin > 0 && x.endDate < END + 'Z' && x.minDate <= x.endDate && x.maxDate >= x.endDate), 'lignes cochées par défaut, titre de repli, heures héritées, bornes de date');
  // 2. avec IA : un appel, titres personnalisés, mis en cache
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL; aicache.memoClear();
  const realFetch = global.fetch; let calls = 0, sysPrompt = '';
  global.fetch = async (url, init) => { calls++; const b = JSON.parse(init.body), payload = JSON.parse(b.messages[0].content);
    sysPrompt = b.system; const out = { confidence: 90, chiffre: null, contexte: 'projet', lignes: payload.lignes.map((l) => ({ n: l.n, titre: 'Jalon ' + l.periode, faire: 'Faire', resultat: 'Résultat', avancement: 'Terminé', choix: null })) };
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b.model, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(out) }] }) }; };
  try {
    const r1 = await I.plan('u1', body, T), r2 = await I.plan('u1', body, T);
    assert(!r1.skip && r1.ai === true && r1.rows.every((x) => /^Jalon /.test(x.title)) && calls === 1, 'avec IA : titres personnalisés, UN seul appel (le second vient du cache)');
    assert(r1.contexte === 'projet' && /LARGE au PRÉCIS/.test(sysPrompt) && /RÉGULIÈRE/.test(sysPrompt) && /EN SILENCE/.test(sysPrompt), 'ordre des sous-objectifs : projet = du large au précis, progression = montée régulière ; contexte décidé par l’IA en silence (jamais montré)');
    // 3. validation ligne par ligne : une ligne décochée, un titre et une date modifiés ; « Terminer » n'écrit que le reste
    const rows = r1.rows.map((x, i) => ({ kind: 'nouveau', title: i === 1 ? 'Titre modifié' : x.title, description: 'd', weeks: x.weeks, hoursMin: x.hoursMin, endDate: i === 0 ? x.minDate : x.endDate, lineType: x.lineType, column: x.column, link: x.link, poleKey: x.poleKey, categoryKey: x.categoryKey }));
    const kept = rows.filter((_, i) => i !== rows.length - 1 || rows.length === 1);
    const ap = I.appliquer('u1', { parentId: parent.id, rateMin: 120, rows: kept });
    assert(ap.created.length === kept.length, 'Terminer : seules les lignes gardées sont écrites (' + ap.created.length + ')');
    if (kept.length > 1) assert(db.prepare('SELECT title FROM user_objectives WHERE id = ?').get(ap.created[1]).title === 'Titre modifié', 'le titre modifié est écrit');
    assert(db.prepare('SELECT endDate FROM user_objectives WHERE id = ?').get(ap.created[0]).endDate === rows[0].endDate, 'la date modifiée est écrite');
    assert(JSON.stringify(db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(existing.id)) === before, 'l’objectif écrit par la personne n’est jamais touché');
    // 4. une ligne ne dépasse jamais l'objectif créé ; type inconnu refusé
    let refused = false; try { I.appliquer('u1', { parentId: parent.id, rows: [{ kind: 'nouveau', title: 'X', weeks: 1, hoursMin: 60, endDate: O.addDays(END, 7), lineType: 'periodique', column: r1.rows[0].column }] }); } catch (e) { refused = true; }
    assert(refused, 'une ligne au-delà de l’échéance de l’objectif est refusée');
  } finally { global.fetch = realFetch; }
  const ui = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8');
  assert(!/contextes*[:=]s*['"]?(projet|progression)/.test(ui) && !ui.includes('.contexte'), 'le contexte n’est jamais montré dans l’interface');
  // 5. source : le panneau
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(js.includes('function datePick(') && js.includes('inf.titles[i] = tIn.value') && js.includes("inf.dates[i] = v") && js.includes('lineType: r.lineType, column: r.column, link: r.link, endDate: inf.dates[i] || r.endDate'), 'panneau : titre et date modifiables, envoyés à « Terminer »');
  // 6. ordre des sous-objectifs modifiable à la main (poignée ≡, appui long 500 ms) : le contenu change de période, dates et heures restent
  const i0 = js.indexOf('    function infMove(from, to) {'), i1 = js.indexOf('    function infPaint()'), fn = js.slice(i0, i1);
  const inf = { plan: { rows: [{ title: 'A', faire: 'fa', resultat: 'ra', avancement: 'aa', endDate: '2027-02-01', hoursMin: 60 }, { title: 'B', faire: 'fb', resultat: 'rb', avancement: 'ab', endDate: '2027-03-01', hoursMin: 120 }, { title: 'C', faire: 'fc', resultat: 'rc', avancement: 'ac', endDate: '2027-04-01', hoursMin: 180 }] }, titles: ['A', 'B', 'C'], on: [true, false, true] };
  new Function('inf', fn + '\ninfMove(0, 2);')(inf);
  const rr = inf.plan.rows;
  assert(inf.titles.join('') === 'BCA' && rr[2].faire === 'fa' && inf.on.join() === 'false,true,true' && rr.map((r) => r.endDate).join() === '2027-02-01,2027-03-01,2027-04-01' && rr.map((r) => r.hoursMin).join() === '60,120,180', 'poignée ≡ : le contenu (titre, Faire, case cochée) change de période ; les dates et les heures restent à leur période');
  assert(js.includes("el('span', 'objRdGrab', '≡')") && js.includes('TMT.ui.holdDrag(rowEl, { holdMs: 500'), 'poignée ≡ visible et appui long 500 ms (mécanique existante)');
  console.log(failed ? '\n' + failed + ' échec(s)' : 'plan-trou-panneau-test OK'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
