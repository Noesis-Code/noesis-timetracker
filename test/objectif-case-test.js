// Case déjà occupée (9 nov. 2026) : un objectif existe déjà dans la même colonne (activité/pôle/secteur) et à la même ligne du temps -> avertissement ; « Remplacer » SUPPRIME l'ancien (suppression existante, après l'enregistrement du nouveau)
// (sous-objectifs détachés, jamais supprimés). Serveur en processus (aucun réseau).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-case-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
const pole = categories.addCategory(act, 'Production'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(act)[0].key;
const pole2 = categories.addCategory(act, 'Vente'); const poleKey2 = (pole2 && pole2.key) || goals.categoriesForActivity(act).filter((p) => p.key !== poleKey)[0].key;
const sec = categories.addCategory(act, 'Atelier bois', poleKey); const secKey = (sec && sec.key) || goals.secteursForPole(act, poleKey)[0].key;
const mk = (extra) => o.creer('u1', Object.assign({ title: 'Obj ' + Math.random().toString(36).slice(2, 6), activityId: act, startDate: today, level: 'secteur', poleKey, categoryKey: secKey }, extra));
const cell = (extra) => o.occupant('u1', Object.assign({ activityId: act, level: 'secteur', poleKey, categoryKey: secKey, endDate: addDays(today, 20) }, extra));

(async () => {
  assert(cell() === null, 'case libre : aucun occupant');
  const old = mk({ title: 'Ancien objectif', endDate: addDays(today, 20), inner: 'hebdomadaires' });
  const occ = cell();
  assert(occ && occ.id === old.id && occ.title === 'Ancien objectif', 'case occupée : même activité, pôle, secteur et période');
  assert(cell({ endDate: addDays(today, 20 + 56) }) === null, 'autre période : case libre');
  assert(cell({ poleKey: poleKey2, categoryKey: null, level: 'pole' }) === null, 'autre colonne (autre pôle) : case libre');
  assert(cell({ level: 'pole', categoryKey: null }) === null, 'autre niveau : case libre');
  assert(o.occupant('autre-utilisateur', { activityId: act, level: 'secteur', poleKey, categoryKey: secKey, endDate: addDays(today, 20) }) === null, 'un autre utilisateur ne voit pas la case');

  // Remplacer (décision d'Émilien) : l'ancien est SUPPRIMÉ avec la suppression existante, SEULEMENT une fois le nouveau enregistré ; ses sous-objectifs sont détachés (jamais supprimés)
  const kid = o.creer('u1', { title: 'Sous-objectif', activityId: act, startDate: today, endDate: addDays(today, 15), level: 'secteur', poleKey, categoryKey: secKey, parentId: old.id });
  assert(kid.parentId === old.id, 'départ : le sous-objectif est rattaché à l’ancien objectif');
  // échec de l'enregistrement du nouveau (échéance passée) : rien n'est supprimé
  let failedCreate = false; try { mk({ title: 'Échec', endDate: addDays(today, -3), inner: 'hebdomadaires', replaceId: old.id }); } catch (e) { failedCreate = true; }
  assert(failedCreate && !!db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(old.id), 'échec de l’enregistrement : l’ancien objectif reste');
  const before = db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n;
  const neu = mk({ title: 'Nouvel objectif', endDate: addDays(today, 20), inner: 'hebdomadaires', replaceId: old.id });
  const after = db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n;
  assert(!db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(old.id) && after === before, 'Remplacer : l’ancien objectif est supprimé, le nouveau enregistré');
  const kidRow = db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(kid.id);
  assert(!!kidRow && kidRow.parentId !== old.id, 'son sous-objectif est conservé et détaché (jamais supprimé)');
  assert(cell() && cell().id !== old.id && neu.id > old.id, 'la case est occupée par le nouvel objectif seulement');

  // replaceId qui n'est pas l'occupant : ignoré (jamais de suppression arbitraire)
  const other = o.creer('u1', { title: 'Ailleurs', activityId: act, startDate: today, endDate: addDays(today, 20 + 56), level: 'secteur', poleKey, categoryKey: secKey });
  mk({ title: 'Autre case', endDate: addDays(today, 20 + 120), replaceId: other.id });
  assert(!!db.prepare('SELECT 1 FROM user_objectives WHERE id = ?').get(other.id), 'replaceId hors de la case : rien n’est supprimé');

  // Interface : avertissement (R28), Remplacer en rouge, Annuler en violet ; rien n'est supprimé avant « Terminer » (la suppression part avec la création, côté serveur)
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
  const a = src.indexOf("api('POST', '/api/objectifs/case'"), b = src.indexOf('    form._show = show;');
  const blk = src.slice(a, b);
  assert(a > 0 && blk.includes("tr('Un objectif existe déjà à cette date. Le remplacer le supprimera définitivement.')") && blk.includes("label: tr('Remplacer'), danger: true") && blk.includes("{ value: false, label: tr('Annuler') }"), 'avertissement : texte exact, Remplacer en rouge (danger), Annuler en violet (bouton principal)');
  assert(blk.includes('TMT.ui.confirm(') && !/'DELETE'/.test(blk) && src.includes('replaceId: replaceId || undefined'), 'aucun appel de suppression à la fenêtre : la suppression part avec la création enregistrée');
  console.log(failed ? '\nobjectif-case-test : ' + failed + ' ÉCHEC(S)' : '\nobjectif-case-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
