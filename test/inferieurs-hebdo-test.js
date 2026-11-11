// Périodique => HEBDOMADAIRES (11 nov. 2026) : la dernière page propose les semaines de la période ; chaque hebdomadaire se range au MÊME niveau que son périodique (secteur, pôle seul, activité sans catégorie), sans créer de secteur de plus pour le pôle ou l'activité.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-inf-hebdo-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), categories = require('../server/lib/categories'), goals = require('../server/lib/goals'), aicache = require('../server/lib/aicache'), O = require('../server/lib/objectifs'), I = require('../server/lib/objectifs-inferieurs');
const T = require('../server/lib/dates').userToday();
const addDays = (iso, n) => O.addDays(iso, n);
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(id); return id; };
const aSect = mkAct('Avec secteurs'), aPole = mkAct('Pôles seuls'), aNone = mkAct('Sans catégorie');
const pS = categories.addCategory(aSect, 'Pôle S'); const pSKey = (pS && pS.key) || goals.categoriesForActivity(aSect)[0].key;
const sS = categories.addCategory(aSect, 'Secteur S', pSKey); const sSKey = (sS && sS.key) || goals.secteursForPole(aSect, pSKey)[0].key;
const pP = categories.addCategory(aPole, 'Pôle P'); const pPKey = (pP && pP.key) || goals.categoriesForActivity(aPole)[0].key;
const nSect = (a, p) => goals.secteursForPole(a, p).length;
(async () => {
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL;
  const realFetch = global.fetch, seen = [];
  global.fetch = async (url, init) => { const b = JSON.parse(init.body), payload = JSON.parse(b.messages[0].content); seen.push(payload);
    const out = { confidence: 90, chiffre: null, lignes: payload.lignes.map((l) => ({ n: l.n, titre: 'Avancer ' + l.periode, faire: 'Faire', resultat: 'Résultat', avancement: 'Terminé', choix: null })) };
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b.model, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(out) }] }) }; };
  const end = addDays(T, 20);
  const cases = [
    { nom: 'secteur', act: aSect, parent: { level: 'secteur', poleKey: pSKey, categoryKey: sSKey, inner: 'periodiques' }, lvl: 'secteur' },
    { nom: 'pôle seul', act: aPole, parent: { level: 'pole', poleKey: pPKey, cadence: 'periodique' }, lvl: 'pole' },
    { nom: 'activité sans catégorie', act: aNone, parent: { level: 'activite', cadence: 'periodique' }, lvl: 'activite' },
  ];
  try {
    for (const c of cases) {
      aicache.memoClear();
      const p = O.creer('u1', Object.assign({ title: 'Périodique ' + c.nom, activityId: c.act, startDate: T, endDate: end }, c.parent));
      const sectBefore = c.lvl === 'pole' ? nSect(c.act, pPKey) : null;
      const body = { type: 'periodique', title: p.title, activityId: c.act, level: c.lvl, poleKey: c.parent.poleKey || null, categoryKey: c.parent.categoryKey || null, startDate: T, endDate: end, rateMin: 120 };
      const r = await I.plan('u1', body, T);
      assert(!r.skip && r.level === 'semaine' && r.rows.length >= 1 && r.rows.length <= 4 && r.rows.every((x) => x.kind === 'nouveau' && x.weeks === 1 && /^S\d+$/.test(x.label) && x.hoursMin === 120), c.nom + ' : une ligne par semaine de la période (4 au plus), heures = rythme saisi');
      assert(seen[seen.length - 1].niveauInferieur === 'hebdomadaire', c.nom + ' : demande IA « hebdomadaire »');
      const parent = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(p.id);
      const ap = I.appliquer('u1', { parentId: p.id, weekly: true, rateMin: 120, rows: r.rows.map((x) => ({ kind: 'nouveau', title: x.title, description: 'd', weeks: 1, hoursMin: x.hoursMin, endDate: x.endDate, poleKey: x.poleKey, categoryKey: x.categoryKey })) });
      const kids = ap.created.map((id) => db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(id));
      const metaK = (k) => JSON.parse(k.metaJson || '{}');
      assert(kids.length === r.rows.length && kids.every((k) => (k.level || 'activite') === c.lvl && (k.poleKey || null) === (parent.poleKey || null) && (k.categoryKey || null) === (parent.categoryKey || null) && k.parentId === p.id), c.nom + ' : chaque hebdomadaire est créé au même niveau que son périodique, sous lui');
      assert(kids.every((k) => c.lvl === 'secteur' ? metaK(k).inner === 'hebdomadaires' : metaK(k).cadence === 'hebdomadaire'), c.nom + ' : type hebdomadaire (inner ou cadence)');
      if (c.lvl === 'pole') assert(nSect(c.act, pPKey) === sectBefore, 'pôle seul : aucun secteur créé');
      const r2 = await I.plan('u1', body, T);
      assert(r2.skip === true, c.nom + ' : semaines déjà détaillées → étape sautée');
    }
  } finally { global.fetch = realFetch; }
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
  assert(src.includes("function infMode() { var t = typeOf(); return t === 'periodique' ? 'weekly' : t === 'hebdomadaire' ? null :") && src.includes("type: infMode() === 'weekly' ? 'periodique' : undefined") && src.includes("weekly: p.level === 'semaine' ? true : undefined"), 'écran : périodique → hebdomadaires ; hebdomadaire → rien ; pluriannuel / annuel inchangés');
  if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); } console.log('\ntout passe');
})().catch((e) => { console.log('  FAIL erreur', e && e.stack); process.exit(1); });
