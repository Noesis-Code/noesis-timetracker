// Résumé annuel des grands objectifs (fausse IA) : à la demande, cache par jeu d'objectifs, repli sur les titres. Usage : node test/objectifs-resume-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-resume-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs');
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
  // ---- titre commun d'un macro (macro-titre) ----
  const act2 = Number(db.prepare("INSERT INTO activities (name, ownerId, active, createdAt) VALUES ('Titre 2', ?, 1, '2026-11-01T00:00:00.000Z')").run(u).lastInsertRowid);
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, ?, '#674EA7', '2026-11-01T00:00:00.000Z')").run(act2, u);
  const t1 = mk('Titre un'), t2 = mk('Titre deux'), t3 = mk('Titre trois');
  const o2a = o.creer(u, { title: 'Autre colonne A', activityId: act2, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true }), o2b = o.creer(u, { title: 'Autre colonne B', activityId: act2, startDate: '2026-11-09', endDate: '2027-03-01', noBridge: true });
  let tcalls = 0, tprompt = '';
  R.setCaller(null); R.setTitleCaller(async (p) => { tcalls++; tprompt = p; return '« Un grand objectif commun »\nligne en trop'; });
  let tt = await R.titreMacro(u, { columns: [{ activityId: act }, { activityId: act2 }] });
  assert(tt.source === 'ia' && tt.title === 'Un grand objectif commun' && tt.title.indexOf('\n') < 0, 'titre : une seule ligne, sans guillemets, première ligne seulement');
  assert((tprompt.match(/^- /gm) || []).length === 4 && /Titre trois/.test(tprompt) && /Titre deux/.test(tprompt) && /Autre colonne A/.test(tprompt) && /Autre colonne B/.test(tprompt) && !/^- Titre un$/m.test(tprompt), 'les deux objectifs les plus récents par colonne reliée (4 titres, le plus ancien écarté)');
  const before = tcalls; await R.titreMacro(u, { columns: [{ activityId: act }, { activityId: act2 }] });
  assert(tcalls === before, 'cache par hash des titres : aucun nouvel appel');
  tt = await R.titreMacro(u, { childIds: [t1.id, o2a.id] });
  assert(tt.source === 'ia' && /Titre un/.test(tprompt) && /Autre colonne A/.test(tprompt), 'avec childIds : titre à partir de ces objectifs');
  R.setTitleCaller(async () => { throw new Error('panne'); });
  tt = await R.titreMacro(u, { childIds: [t2.id, o2b.id] });
  assert(tt.source === 'titres' && tt.title === 'Titre deux · Autre colonne B', 'repli sans IA : titres joints par « · »');
  R.setTitleCaller(async () => 'x'.repeat(300));
  tt = await R.titreMacro(u, { childIds: [t3.id, o2a.id] });
  assert(tt.title.length <= 140, 'titre limité à 140 caractères');
  const longJoin = [t1, t2, t3].map(() => 'y'.repeat(80));
  R.setTitleCaller(async () => null);
  db.prepare('UPDATE user_objectives SET title = ? WHERE id = ?').run('z'.repeat(100), t1.id); db.prepare('UPDATE user_objectives SET title = ? WHERE id = ?').run('w'.repeat(100), t2.id);
  tt = await R.titreMacro(u, { childIds: [t1.id, t2.id] });
  assert(tt.source === 'titres' && tt.title.length <= 140, 'repli : limité à 140 caractères');
  e = await bad(() => R.titreMacro(u, {})); assert(e && e.statusCode === 400, 'sans objectif ni colonne : 400');
  e = await bad(() => R.titreMacro('autre', { childIds: [t1.id] })); assert(e && e.statusCode === 404, 'objectif d’un autre compte : 404');
  assert(db.prepare("SELECT COUNT(*) AS n FROM user_objectives WHERE isMacro = 1").get().n === 0, 'ne crée rien');
  // voie 2 (Expansion, ici : staging sans paiement) : appel réel (fausse API), modèle léger, journalisé, mis en cache
  R.setTitleCaller(null); R.setCaller(null); process.env.ANTHROPIC_API_KEY = 'k';
  let api = 0; global.fetch = async (url, init) => { api++; const b = JSON.parse(init.body); return { ok: true, status: 200, clone() { return this; }, async json() { return { model: b.model, usage: { input_tokens: 400, output_tokens: 20 }, content: [{ type: 'text', text: 'Titre IA commun' }] }; } }; };
  db.prepare('UPDATE user_objectives SET title = ? WHERE id = ?').run('Frais un', t1.id);
  tt = await R.titreMacro(u, { childIds: [t1.id, o2a.id] });
  assert(tt.source === 'ia' && tt.title === 'Titre IA commun' && api === 1 && tt.iaPersonnelle === false, 'Expansion : titre IA (fausse API), modèle léger');
  assert(db.prepare("SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage_log WHERE feature = 'macro-titre' AND userId = ?").get(u).n === 1, 'appel journalisé sous « macro-titre »');
  await R.titreMacro(u, { childIds: [t1.id, o2a.id] }); assert(api === 1, 'Expansion : cache agressif, jeu de titres inchangé = aucun nouvel appel');
  // voie 1 (compte gratuit, par défaut) : zéro appel Anthropic, crédit gratuit intact
  process.env.EXPANSION_SANS_PAIEMENT = '0';
  const spentBefore = db.prepare("SELECT COALESCE(SUM(costUsd), 0) AS s FROM ai_usage_log WHERE userId = ?").get(u).s;
  let fcalls = 0; R.setCaller(async () => { fcalls++; return 'x'; }); R.setTitleCaller(async () => { fcalls++; return 'x'; });
  db.prepare('UPDATE user_objectives SET title = ? WHERE id = ?').run('Gratuit un', t1.id);
  const api1 = api;
  tt = await R.titreMacro(u, { childIds: [t1.id, o2a.id] });
  assert(tt.source === 'titres' && tt.title === 'Gratuit un · Autre colonne A' && tt.iaPersonnelle === false, 'compte gratuit : le grand objectif = accumulation des titres reliés');
  let rs = await R.resumeAnnuel(u, act, 2027);
  assert(rs.source === 'titres' && /Livrer la version 2/.test(rs.text) && rs.iaPersonnelle === false, 'compte gratuit : résumé annuel = liste des titres');
  assert(api === api1 && fcalls === 0, 'compte gratuit : zéro appel au fournisseur et zéro appel de génération');
  assert(db.prepare("SELECT COALESCE(SUM(costUsd), 0) AS s FROM ai_usage_log WHERE userId = ?").get(u).s === spentBefore, 'compte gratuit : le crédit gratuit n’est pas consommé par ces fonctions');
  // voie 2 : Expansion payante (accès accordé) : IA intégrée
  const access = require('../server/lib/offer1access'); access.grantAccess(u, 'test');
  R.setCaller(null); R.setTitleCaller(null);
  db.prepare('UPDATE user_objectives SET title = ? WHERE id = ?').run('Payant un', t1.id);
  tt = await R.titreMacro(u, { childIds: [t1.id, o2a.id] });
  assert(tt.source === 'ia' && api === api1 + 1, 'Expansion payante : IA intégrée');
  await R.titreMacro(u, { childIds: [t1.id, o2a.id] }); assert(api === api1 + 1, 'Expansion payante : second appel identique servi par le cache');
  db.prepare('UPDATE user_objectives SET title = ? WHERE id = ?').run('Payant deux', t1.id);
  await R.titreMacro(u, { childIds: [t1.id, o2a.id] }); assert(api === api1 + 2, 'régénération seulement si le jeu de titres change');
  // voie 3 : IA personnelle branchée (jeton actif), sans Expansion : Noèsis ne rappelle pas Anthropic
  access.revokeAccess(u);
  db.prepare("INSERT INTO ai_tokens (userId, label, tokenHash, createdAt) VALUES (?, 'ma-ia', 'hash-resume-test', datetime('now'))").run(u);
  const api2 = api;
  tt = await R.titreMacro(u, { childIds: [t1.id, o2a.id] }); rs = await R.resumeAnnuel(u, act, 2027);
  assert(tt.source === 'titres' && tt.iaPersonnelle === true && rs.source === 'titres' && rs.iaPersonnelle === true && api === api2, 'IA personnelle branchée : zéro appel Noèsis, iaPersonnelle indiqué à l’interface');
  db.prepare("UPDATE ai_tokens SET revokedAt = datetime('now') WHERE tokenHash = 'hash-resume-test'").run();
  tt = await R.titreMacro(u, { childIds: [t1.id, o2a.id] }); assert(tt.iaPersonnelle === false, 'jeton retiré : plus d’IA personnelle');
  // outil de lecture du connecteur (lecture seule)
  const mcpSrc = fs.readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'mcp.js'), 'utf8');
  assert(/arbre_objectifs: \{[\s\S]{0,1800}grand_objectif/.test(mcpSrc) && !/arbre_objectifs: \{[\s\S]{0,300}write: true/.test(mcpSrc), 'connecteur : outil de lecture arbre_objectifs (sans écriture)');
  const lst = o.liste(u, 'tous'); assert(lst.every((x) => typeof x.isBig === 'boolean' && x.activity && x.endDate), 'liste() porte les champs lus par le connecteur (isBig, activité, échéance)');
  const rt2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
  assert(rt2.includes("router.post('/objectifs/macro/titre'"), 'route POST /objectifs/macro/titre');
  // délier = retirer l'extension ; échéance du macro >= enfants
  const mac = o.creer(u, { title: 'Macro colonnes', activityId: act, startDate: '2026-11-09', endDate: '2027-03-01', isMacro: true, noBridge: true });
  const k1 = o.creer(u, { title: 'Fils colonne 1', activityId: act, startDate: '2026-11-09', endDate: '2027-03-01', parentId: mac.id, noBridge: true }), k2 = o.creer(u, { title: 'Fils colonne 2', activityId: act2, startDate: '2026-11-09', endDate: '2027-02-01', parentId: mac.id, noBridge: true });
  assert(o.get(u, mac.id).macroColumns.length === 2, 'macro étendu sur deux colonnes');
  o.lier(u, k2.id, null);
  assert(o.get(u, mac.id).macroColumns.length === 1 && o.get(u, k2.id).parentId === null, 'délier un enfant retire l’extension sur sa colonne');
  e = await bad(() => o.modifierEcheance(u, mac.id, '2027-01-01')); assert(e && /au moins celle/.test(e.message), 'échéance du macro >= celle de ses enfants');
  // route
  const rt = require('fs').readFileSync(require('path').join(__dirname, '..', 'server', 'routes', 'objectifs.js'), 'utf8');
  assert(rt.indexOf("'/objectifs/resume-annuel'") > 0 && rt.indexOf("'/objectifs/resume-annuel'") < rt.indexOf("'/objectifs/:id'"), 'route GET /objectifs/resume-annuel déclarée avant /objectifs/:id');
  console.log(failed ? `\n${failed} échec(s)` : '\nTous les contrôles passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
