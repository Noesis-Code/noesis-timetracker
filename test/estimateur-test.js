// Préparation de l'estimateur : catalogue des familles, classement silencieux, famille inconnue + UNE notification à Émilien (variable d'environnement), temps réel enregistré seulement avec consentement. Usage : node test/estimateur-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-estimateur-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const F = require('../server/lib/familles-objectifs');
// ---- catalogue ----
assert(F.FAMILLES.map((g) => g.label).join() === 'Santé,Connaissance,Art,Argent,Salariat,Entreprise,Relations,Domestique,Événement,Esprit', 'dix grandes catégories d’un mot ; « Construction » n’en est plus une');
const ev = F.FAMILLES.find((g) => g.id === 'evenement');
assert(['maison', 'cabane', 'meuble', 'renovation', 'demenagement', 'voyage', 'mariage', 'fete', 'logistique'].every((id) => ev.petites.some((p) => p.id === id)), 'sous Événement : maison, cabane, meuble, rénovation, déménagement, voyage, mariage, fête, logistique');
assert(F.PETITES.every((p) => F.INFO.includes(p.info)) && new Set(F.PETITES.map((p) => p.id)).size === F.PETITES.length, 'chaque petite catégorie porte un niveau oui / partielle / non ; identifiants uniques');
assert(F.infoDe('course') === 'oui' && F.infoDe('sommeil') === 'partielle' && F.infoDe('emploi') === 'non' && F.infoDe(null) === 'non' && F.infoDe('inconnue') === 'non', 'niveau d’information : oui / partielle / non ; sans famille = non (étapes et budget de temps, sans chiffre)');
assert(F.lexical('Courir un marathon', '') === 'course' && F.lexical('Apprendre l’anglais', '') === 'langue' && F.lexical('Zorglub quantique', '') === null, 'repli par mots-clés : une catégorie nette, sinon null (jamais un défaut)');
// ---- base ----
const db = require('../server/db'), O = require('../server/lib/objectifs'), E = require('../server/lib/estimateur');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const push = require('../server/lib/push'), sent = []; push.sendToUsers = (ids, p) => { sent.push({ ids, p }); };
const T = require('../server/lib/dates').userToday(), add = (n) => O.addDays(T, n);
const mk = (title) => O.creer('u1', { title, activityId: act, level: 'activite', startDate: T, endDate: add(200), hoursPerWeek: 5, weekTasks: [], noBridge: true });
const fam = (id) => db.prepare('SELECT objectif_famille AS f FROM user_objectives WHERE id = ?').get(id).f;
(async () => {
  assert(db.prepare('PRAGMA table_info(user_objectives)').all().some((c) => c.name === 'objectif_famille') && db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'consentEstimateur'), 'colonnes objectif_famille et consentEstimateur (migration additive)');
  // classement silencieux (sans IA : repli par mots-clés)
  process.env.OBJECTIF_INCONNU_NOTIF_USER_IDS = 'boss1';
  const a = mk('Courir un marathon'); await E.classerObjectif('u1', a.id);
  assert(fam(a.id) === 'course' && sent.length === 0, 'classé en silence dans « course » ; aucune notification');
  // rien ne convient : créé normalement, famille null, mots-clés gardés, UNE notification vers la variable d'environnement seulement
  const b = mk('Zorglub quantique des fromages'); await E.classerObjectif('u1', b.id); await E.classerObjectif('u1', b.id);
  const inc = db.prepare('SELECT * FROM objectif_famille_inconnue WHERE objectifId = ?').get(b.id);
  assert(b.id && fam(b.id) === null && inc && inc.mots.includes('zorglub') && inc.mots.includes('fromages'), 'hors catégories : objectif créé normalement, famille null, mots-clés dans objectif_famille_inconnue');
  assert(sent.length === 1 && sent[0].ids.join() === 'boss1' && sent[0].p.body === 'Objectif hors catégories : Zorglub quantique des fromages' && !sent[0].ids.includes('u1'), 'UNE seule notification, à Émilien (variable d’environnement), texte court ; jamais à l’utilisateur');
  delete process.env.OBJECTIF_INCONNU_NOTIF_USER_IDS; const c = mk('Quelque chose de bizarre xyz'); await E.classerObjectif('u1', c.id);
  assert(sent.length === 1 && !!db.prepare('SELECT 1 FROM objectif_famille_inconnue WHERE objectifId = ?').get(c.id), 'sans variable d’environnement : aucun envoi (aucun identifiant en dur), le repérage reste enregistré');
  // IA simulée : id valide, « aucune », id inventé (repli par mots-clés)
  process.env.ANTHROPIC_API_KEY = 'test'; delete process.env.NOESIS_FAST_MODEL; require('../server/lib/aicache').memoClear();
  const realFetch = global.fetch; let answer = '{"id":"langue"}';
  global.fetch = async (url, init) => { const b2 = JSON.parse(init.body); return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b2.model, usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: answer }] }) }; };
  try {
    const d = mk('Parler couramment avec mes cousins'); await E.classerObjectif('u1', d.id);
    assert(fam(d.id) === 'langue', 'avec l’IA : la petite catégorie choisie parmi la liste');
    answer = '{"id":null}'; const e = mk('Courir pour rien, l’IA dit aucune'); await E.classerObjectif('u1', e.id);
    assert(fam(e.id) === null && !!db.prepare('SELECT 1 FROM objectif_famille_inconnue WHERE objectifId = ?').get(e.id), 'l’IA dit « aucune » : famille null, jamais un défaut deviné');
    answer = '{"id":"inventee"}'; const f = mk('Apprendre l’espagnol'); await E.classerObjectif('u1', f.id);
    assert(fam(f.id) === 'langue', 'identifiant inventé : refusé, repli par mots-clés');
  } finally { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }
  // temps réel contre prévu : seulement avec consentement
  const old = O.creer('u1', { title: 'Lire dix livres', activityId: act, level: 'activite', startDate: add(-60), endDate: add(-5), hoursPerWeek: 2, weekTasks: [], noBridge: true });
  db.prepare('UPDATE user_objectives SET startDate = ?, endDate = ?, objectif_famille = ? WHERE id = ?').run(add(-60), add(-5), 'lecture', old.id);
  db.prepare("INSERT INTO time_entries (userId, activityId, note, startTime, endTime, durationSeconds, isoDate, dayOfWeek, goalCategory) VALUES ('u1', ?, '', 'a', 'b', ?, ?, 'x', NULL)").run(act, 600 * 60, add(-30));
  assert(E.consent('u1') === false && E.enregistrerTermines('u1', T) === 0 && db.prepare('SELECT COUNT(*) AS n FROM objectif_temps_reel').get().n === 0, 'sans consentement (défaut non) : rien n’est enregistré');
  E.setConsent('u1', true);
  assert(E.enregistrerTermines('u1', T) >= 1, 'avec consentement : le temps réel est enregistré à l’échéance');
  const tr = db.prepare('SELECT * FROM objectif_temps_reel WHERE objectifId = ?').get(old.id);
  assert(tr && tr.famille === 'lecture' && tr.realMin === 600 && tr.plannedMin > 0, 'ligne : famille, prévu, réel (Chrono de l’objectif)');
  assert(E.enregistrerTermines('u1', T) === 0, 'une seule ligne par objectif');
  E.setConsent('u1', false);
  // câblage et absence d'interface
  const ob = fs.readFileSync(path.join(__dirname, '..', 'server/lib/objectifs.js'), 'utf8'), rt = fs.readFileSync(path.join(__dirname, '..', 'server/routes/objectifsretard.js'), 'utf8');
  assert(ob.includes("require('./estimateur').classerObjectif(userId, id)") && rt.includes("require('../lib/estimateur').enregistrerTermines(req.userId)"), 'câblage : classement à la création, enregistrement à l’ouverture (sans consentement : rien)');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? (x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : [path.join(d, x.name)]);
  assert(walk(path.join(__dirname, '..', 'public')).filter((x) => /\.(js|html)$/.test(x)).every((x) => !/objectif_famille|consentEstimateur/.test(fs.readFileSync(x, 'utf8'))), 'aucune interface : rien de la famille ni du consentement dans public/');
  console.log(failed ? '\n' + failed + ' échec(s)' : 'estimateur-test OK'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
