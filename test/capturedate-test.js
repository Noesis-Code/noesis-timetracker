// Tests du rangement par date à la capture. Usage : node test/capturedate-test.js
const { parseDateHint } = require('../server/lib/capturedatehint');
let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }
const T = '2026-10-16'; // vendredi
const eq = (txt, kind, date) => { const r = parseDateHint(txt, T); return r && r.kind === kind && r.date === date; };
assert(eq('Appeler le client vendredi', 'day', '2026-10-16'), 'vendredi (un vendredi) = aujourd\'hui');
assert(eq('Envoyer la facture mardi', 'day', '2026-10-20'), 'mardi = 20 oct.');
assert(eq('Réunion vendredi prochain', 'day', '2026-10-23'), 'vendredi prochain = +7');
assert(eq('Préparer le rapport la semaine prochaine', 'week', '2026-10-19'), 'semaine prochaine = lundi 19');
assert(eq('Finir la maquette cette semaine', 'week', '2026-10-12'), 'cette semaine = lundi 12');
assert(eq('Rendre le dossier avant le 30', 'deadline', '2026-10-30'), 'avant le 30 = échéance 30 oct.');
assert(eq('Payer la taxe avant le 5 novembre', 'deadline', '2026-11-05'), 'avant le 5 novembre');
assert(eq('Livrer demain', 'day', '2026-10-17'), 'demain');
assert(parseDateHint('Ranger le bureau', T) === null, 'sans indice : null');
assert(parseDateHint('Faire 30 minutes de sport', T) === null, '30 minutes n\'est pas une date');
assert(parseDateHint('Vendredi', 'x') === null, 'today invalide : null');

// Placement : date manuelle prioritaire, sans indice pas « aujourd'hui » par défaut, capacité.
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-cd-'));
try { require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'dev-seed.js')], { env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT_NAME: 'staging' }), stdio: 'ignore' }); } catch (e) {}
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const db = require('../server/db');
const cp = require('../server/lib/goalscaptureplace');
const gl = require('../server/lib/goals');
let u = null, a = null;
db.prepare('SELECT userId, activityId FROM activity_members').all().forEach((r) => { if (!a && gl.categoriesForActivity(r.activityId).length) { u = { id: r.userId }; a = { id: r.activityId }; } });
if (!a) { const r0 = db.prepare('SELECT userId, activityId FROM activity_members LIMIT 1').get(); if (r0) { try { gl.addCategory(r0.activityId, 'PoleTest'); } catch (e) {} if (gl.categoriesForActivity(r0.activityId).length) { u = { id: r0.userId }; a = { id: r0.activityId }; } } }
if (!a) { console.log('  (u=' + !!u + ') (pas de données de base : tests de placement ignorés)'); }
else {
  const goals = require('../server/lib/goals');
  const gt = require('../server/lib/goalstasks');
  let cat = null;
  goals.categoriesForActivity(a.id).forEach((c) => { if (cat) return; const sx = goals.secteursForPole(a.id, c.key); if (!sx.length) cat = c; else cat = { key: sx[0].key }; });
  if (cat) {
    const it1 = gt.addCategoryTask(a.id, u.id, cat.key, 'Tâche manuelle vendredi');
    db.prepare("UPDATE sub_project_items SET dueDate = '2030-01-02', dueDateAuto = 0 WHERE id = ?").run(it1.id);
    cp.placeCaptureDefault(u.id, a.id, cat.key, it1.id, 'Tâche manuelle vendredi', { noAssign: true });
    assert(db.prepare('SELECT dueDate FROM sub_project_items WHERE id=?').get(it1.id).dueDate === '2030-01-02', 'date manuelle jamais écrasée');
    const t = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const today = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    const dv = cp.dateForCapture(u.id, a.id, cat.key, 0, 'Appeler vendredi');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dv) && new Date(dv + 'T00:00:00Z').getUTCDay() === 5, 'vendredi => un vendredi : ' + dv);
    const dw = cp.dateForCapture(u.id, a.id, cat.key, 0, 'Préparer le rapport la semaine prochaine');
    assert(dw > today && dw <= require('../server/lib/goals').addDays(today, 14), 'semaine prochaine => dans la semaine suivante : ' + dw);
    const dn = cp.dateForCapture(u.id, a.id, cat.key, 0, 'Ranger le bureau');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(dn) && dn >= today, 'sans indice : date répartie par capacité : ' + dn);
  }
}
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('OK');
