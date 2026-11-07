// Résumé annuel des grands objectifs (fausse IA) : à la demande, cache par jeu d'objectifs, repli sur les titres. Usage : node test/objectifs-resume-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-resume-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const R = require('../server/lib/objectifs-resume');
const u = 'res-u';
db.prepare("INSERT INTO users (id, name, createdAt) VALUES (?, ?, datetime('now'))").run(u, u);
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Résumé', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(act, u);
const mk = (title, extra) => o.creer(u, Object.assign({ title, activityId: act, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }, extra || {}));
const bad = async (fn) => { try { await fn(); return null; } catch (x) { return x; } };

(async () => {
  let calls = 0, lastPrompt = '';
  R.setCaller(async (p) => { calls++; lastPrompt = p; return 'En 2027, tu avances sur deux grands chantiers.\n- Livrer la version 1\n- Courir le semi\n- puce 3\n- puce 4 en trop'; });
  const g1 = mk('Livrer la version 1', { endDate: '2027-09-01' }), g2 = mk('Courir le semi', { endDate: '2027-05-01' }), small = mk('Petit sans enfant', { endDate: '2027-04-01' });
  mk('Étape A', { parentId: g1.id, endDate: '2027-02-01' }); mk('Étape B', { parentId: g2.id, endDate: '2027-02-01' });
  assert(small.id > 0, 'objectif sans sous-objectif créé (n’est pas un grand objectif)');
  let r = await R.resumeAnnuel(u, act, 2027);
  assert(r.source === 'ia' && r.count === 2 && /Livrer la version 1/.test(lastPrompt) && /Courir le semi/.test(lastPrompt) && !/Petit sans enfant/.test(lastPrompt) && !/Étape A/.test(lastPrompt), 'grands objectifs seulement (au moins un sous-objectif), année de l’échéance');
  assert(r.text.split('\n').length === 4 && r.text.split('\n')[0].startsWith('En 2027') && !/en trop/.test(r.text), 'sortie : une phrase et au plus 3 puces');
  assert(typeof r.generatedAt === 'string' && calls === 1, 'format { text, source, generatedAt } ; un appel');
  r = await R.resumeAnnuel(u, act, 2027); assert(calls === 1 && r.source === 'ia', 'jeu inchangé : aucun nouvel appel (cache base et mémoire)');
  assert(db.prepare('SELECT COUNT(*) AS n FROM objectifs_resume_annuel WHERE userId = ? AND year = 2027').get(u).n === 1, 'résumé stocké en base (un par utilisateur, activité et année)');
  // le jeu change : un seul nouvel appel
  db.prepare("UPDATE user_objectives SET title = 'Livrer la version 2' WHERE id = ?").run(g1.id);
  r = await R.resumeAnnuel(u, act, 2027); assert(calls === 2 && /version 2/.test(lastPrompt), 'jeu modifié (titre) : régénéré une fois');
  // une autre année : pas de grand objectif -> vide, sans appel
  r = await R.resumeAnnuel(u, act, 2029); assert(r.count === 0 && r.text === '' && calls === 2, 'année sans grand objectif : vide, aucun appel');
  // repli : IA en panne -> titres
  const g3 = mk('Grand objectif 2028', { endDate: '2028-06-01', timeLevel: 'annee' }); mk('Sous 2028', { parentId: g3.id, endDate: '2028-02-01' });
  R.setCaller(async () => { throw new Error('panne'); });
  r = await R.resumeAnnuel(u, act, 2028); assert(r.source === 'titres' && r.text === '- Grand objectif 2028' && r.generatedAt === null, 'IA en panne : repli sur la liste des titres');
  R.setCaller(async () => null);
  db.prepare("UPDATE user_objectives SET title = 'Grand objectif 2028 bis' WHERE id = ?").run(g3.id);
  r = await R.resumeAnnuel(u, act, 2028); assert(r.source === 'titres', 'IA sans réponse : repli sur les titres, rien de stocké');
  assert(db.prepare('SELECT COUNT(*) AS n FROM objectifs_resume_annuel WHERE year = 2028').get().n === 0, 'un échec n’est jamais mémorisé');
  // abandonné : ignoré
  o.abandonner(u, g3.id, true); r = await R.resumeAnnuel(u, act, 2028); assert(r.count === 0, 'grand objectif abandonné : ignoré');
  // validations
  let e = await bad(() => R.resumeAnnuel(u, act, 'abc')); assert(e && e.statusCode === 400, 'année invalide : 400');
  e = await bad(() => R.resumeAnnuel(u, 9999, 2027)); assert(e && e.statusCode === 404, 'activité inconnue : 404');
  e = await bad(() => R.resumeAnnuel('autre', act, 2027)); assert(e && e.statusCode === 404, 'activité d’un autre compte : 404');
  // le résumé ne modifie aucune saisie
  assert(o.get(u, g2.id).title === 'Courir le semi', 'le résumé ne modifie aucun objectif');
  // vraie voie (fausse API) : fetchAnthropic, modèle léger, journalisé
  R.setCaller(null); process.env.ANTHROPIC_API_KEY = 'k';
  let model = null, sent = null;
  global.fetch = async (url, init) => { const b = JSON.parse(init.body); model = b.model; sent = b; return { ok: true, status: 200, clone() { return this; }, async json() { return { model: b.model, usage: { input_tokens: 400, output_tokens: 60 }, content: [{ type: 'text', text: 'Phrase.\n- un\n- deux' }] }; } }; };
  db.prepare("UPDATE user_objectives SET title = 'Courir le semi ter' WHERE id = ?").run(g2.id);
  r = await R.resumeAnnuel(u, act, 2027);
  assert(r.source === 'ia' && /haiku/i.test(model) && sent.max_tokens === 200, 'appel réel (fausse API) : modèle léger, 200 jetons de sortie au plus');
  assert(db.prepare("SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage_log WHERE feature = 'resume-annuel' AND userId = ?").get(u).n === 1, 'appel journalisé sous « resume-annuel », compté sur la personne');
  // route
  const rt = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
  assert(rt.indexOf("'/objectifs/resume-annuel'") > 0 && rt.indexOf("'/objectifs/resume-annuel'") < rt.indexOf("'/objectifs/:id'"), 'route GET /objectifs/resume-annuel déclarée avant /objectifs/:id');
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
