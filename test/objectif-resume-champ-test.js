// « Résumé » d'un objectif (facultatif, sous « Avancé », 300 au plus, retiré si vide) : stocké dans metaJson.resume, renvoyé par get()/liste, jamais lu par l'IA.
// Usage : node test/objectif-resume-champ-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-resume-champ-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), O = require('../server/lib/objectifs');
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Act', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const base = { title: 'Objectif A', activityId: act, level: 'activite', startDate: '2027-01-04', endDate: '2027-06-28', hoursPerWeek: 3, weekTasks: [], noBridge: true };
const o0 = O.creer('u1', base);
assert(o0.resume === '', 'sans résumé : champ vide, rien stocké');
const o1 = O.creer('u1', Object.assign({}, base, { title: 'Objectif B', resume: '  Ce que   verront\nles responsables.  ' }));
assert(o1.resume === 'Ce que verront les responsables.', 'à la création : résumé nettoyé et renvoyé sous « resume »');
const o2 = O.creer('u1', Object.assign({}, base, { title: 'Objectif C', resume: 'x'.repeat(500) }));
assert(o2.resume.length === 300, 'à la création : 300 caractères au plus');
assert(O.resumer('u1', o0.id, 'Un résumé').resume === 'Un résumé' && O.get('u1', o0.id).resume === 'Un résumé', 'modification : le résumé s’enregistre');
assert(JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(o0.id).metaJson).resume === 'Un résumé', 'stocké dans metaJson.resume');
let e = null; try { O.resumer('u1', o0.id, 'y'.repeat(301)); } catch (x) { e = x; }
assert(e && O.get('u1', o0.id).resume === 'Un résumé', 'modification : plus de 300 refusé, ancien résumé gardé');
assert(O.resumer('u1', o0.id, '   ').resume === '' && !('resume' in JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(o0.id).metaJson)), 'vide : clé retirée des métadonnées');
assert(O.liste('u1').some((o) => o.id === o1.id && o.resume === 'Ce que verront les responsables.'), 'la liste renvoie le résumé');
// jamais lu par l'IA : aucune lecture de « resume » dans les prompts/IA
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', f), 'utf8');
const lectures = fs.readdirSync(path.join(__dirname, '..', 'server', 'lib')).filter((f) => f.endsWith('.js') && /^objectifs?/.test(f) || /^(goals|crosssector|dailysuggestion)/.test(f)).filter((f) => /\.resume\b|\bresume:/.test(src(f)) && f !== 'objectifs.js');
assert(lectures.length === 0, 'aucun module d’IA ne lit le résumé' + (lectures.length ? ' : ' + lectures.join(', ') : ''));
assert(!/descOf[^\n]*resume/.test(src('objectifs.js')), 'descOf (prompt de rattachement) ne lit pas le résumé');
// interface : champ sous « Avancé » (replié par défaut), création et modification
const ui = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8');
assert(/if \(advOpen\) \{[^\n]*resumeField\(form\)/.test(ui) && /advInner\.appendChild\(resumeField\(form, sync\)\)/.test(ui), 'le champ n’est peint que sous « Avancé » (création et modification)');
assert(/advOpen = false/.test(ui) && /advOpenE = false/.test(ui), 'Avancé replié par défaut');
assert(/maxLength = 300/.test(ui) && /'\/resume'/.test(ui), 'champ limité à 300 ; route PUT /resume');
const cnt = (t) => ui.split(t).length - 1;
assert(cnt("descHead('Description pour Noèsis', 'Sert à ranger tes tâches et à proposer des objectifs')") === 2, 'titre « Description pour Noèsis » + aide : à la création et à la modification');
assert(ui.includes("advBox.appendChild(descHead('Suite de la description pour Noèsis')); advBox.appendChild(guideBox);") && ui.indexOf("advBox.appendChild(guideBox)") < ui.indexOf("advBox.appendChild(resumeField(form))"), 'sous Avancé (création) : « Suite de la description pour Noèsis » puis « Résumé pour les membres », jamais mêlés');
assert(ui.includes("tr('Résumé pour les membres')") && ui.includes("Lu seulement par les responsables d'un niveau inférieur"), 'libellé « Résumé pour les membres » + aide');
console.log(failed ? failed + ' échec(s)' : 'OK'); process.exit(failed ? 1 : 0);
