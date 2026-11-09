// Case déjà occupée (9 nov. 2026) : un objectif existe déjà dans la même colonne (activité/pôle/secteur) et à la même ligne du temps -> avertissement ; « Remplacer » ARCHIVE l'ancien
// (abandonné, réversible par « réactiver »), il n'est jamais supprimé : ses données, sous-objectifs et tâches sont conservés (S6). Serveur en processus (aucun réseau).
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

  // Remplacer : l'ancien est archivé (abandonné), jamais supprimé ; ses sous-objectifs et ses données restent
  const kid = o.creer('u1', { title: 'Sous-objectif', activityId: act, startDate: today, endDate: addDays(today, 15), level: 'secteur', poleKey, categoryKey: secKey, parentId: old.id });
  const kidCell = o.occupant('u1', { activityId: act, level: 'secteur', poleKey, categoryKey: secKey, endDate: addDays(today, 15) });
  assert(kidCell && kidCell.id !== undefined, 'les deux objectifs occupent la case (même période)');
  const before = db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n;
  const neu = mk({ title: 'Nouvel objectif', endDate: addDays(today, 20), inner: 'hebdomadaires', replaceId: old.id });
  const after = db.prepare('SELECT COUNT(*) AS n FROM user_objectives').get().n;
  const row = db.prepare('SELECT * FROM user_objectives WHERE id = ?').get(old.id);
  assert(after === before + 1 && !!row, 'Remplacer ne supprime rien : l’ancien objectif existe toujours');
  assert(JSON.parse(row.metaJson).abandoned === true, 'l’ancien est archivé (abandonné), donc retiré de l’arbre');
  assert(db.prepare('SELECT parentId FROM user_objectives WHERE id = ?').get(kid.id).parentId === old.id, 'ses sous-objectifs sont conservés');
  assert(cell().id !== old.id && neu.id > old.id, 'l’ancien objectif n’occupe plus la case (retiré de l’arbre)');
  o.abandonner('u1', old.id, false);
  assert(!JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(old.id).metaJson).abandoned, 'réversible : « réactiver » restaure l’ancien');

  // replaceId qui n'est pas l'occupant : ignoré (jamais d'archivage arbitraire)
  const other = o.creer('u1', { title: 'Ailleurs', activityId: act, startDate: today, endDate: addDays(today, 20 + 56), level: 'secteur', poleKey, categoryKey: secKey });
  mk({ title: 'Autre case', endDate: addDays(today, 20 + 120), replaceId: other.id });
  assert(!JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(other.id).metaJson).abandoned, 'replaceId hors de la case : rien n’est archivé');

  // Interface : avertissement R28 (violet, jamais rouge), Remplacer / Annuler
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
  const a = src.indexOf("api('POST', '/api/objectifs/case'"), b = src.indexOf('    form._show = show;');
  const blk = src.slice(a, b);
  assert(a > 0 && blk.includes("tr('Un objectif existe déjà à cette date. Le remplacer ?')") && blk.includes("label: tr('Remplacer')") && blk.includes("label: tr('Annuler'), quiet: true"), 'avertissement : « Un objectif existe déjà à cette date. Le remplacer ? », boutons Remplacer / Annuler');
  assert(!/danger/.test(blk) && blk.includes('TMT.ui.confirm('), 'TMT.ui.confirm, aucun bouton rouge');
  assert(src.includes('replaceId: replaceId || undefined'), 'le remplacement passe par la création (atomique côté serveur)');
  console.log(failed ? '\nobjectif-case-test : ' + failed + ' ÉCHEC(S)' : '\nobjectif-case-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
