// Tests de la correction orthographique silencieuse (IA simulée). Usage : node test/silentspellfix-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-sf-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const sf = require('../server/lib/silentspellfix');

(async () => {
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own','own',datetime('now'))").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
  const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
  const label = (id) => db.prepare('SELECT label FROM sub_project_items WHERE id = ?').get(id).label;
  const mkTask = (l) => goalstasks.addCategoryTask(act, 'own', key, l, {});

  let calls = 0, answer = null;
  sf.setCaller(async (t) => { calls++; if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(t) : answer; });

  // correction appliquée, après l'enregistrement
  answer = 'Écrire le rapport pour Jean.';
  const t1 = mkTask('ecrire le rapport pour Jean');
  assert(label(t1.id) === 'ecrire le rapport pour Jean', 'enregistrée telle quelle d\'abord');
  assert(await sf.fixItemLabel(t1.id) === true && label(t1.id) === 'Écrire le rapport pour Jean.', 'correction appliquée');

  // rejet si trop différent
  answer = 'Rédiger complètement un autre document important';
  const t2 = mkTask('ecrire le rapport');
  assert(await sf.fixItemLabel(t2.id) === false && label(t2.id) === 'ecrire le rapport', 'rejet si trop différent');
  assert(sf.isPureSpellingFix('Appeler 3 clients', 'Appeler 4 clients') === false, 'nombre modifié rejeté');
  assert(sf.isPureSpellingFix('Envoyer le PDF', 'Envoyer le PNG') === false, 'sigle modifié rejeté');
  assert(sf.isPureSpellingFix('Les client sont la', 'Les clients sont là'), 'accords/accents acceptés');

  // IA en erreur
  answer = new Error('boom');
  const t3 = mkTask('apeler le cliant');
  assert(await sf.fixItemLabel(t3.id) === false && label(t3.id) === 'apeler le cliant', 'IA en erreur : inchangé');

  // inchangé : aucune écriture
  answer = 'Tâche correcte';
  const t4 = mkTask('Tâche correcte');
  assert(await sf.fixItemLabel(t4.id) === false, 'inchangé : aucune écriture');

  // titre modifié entre-temps : pas d'écrasement
  answer = async (t) => { db.prepare('UPDATE sub_project_items SET label = ? WHERE id = ?').run('Autre titre', t5.id); return 'Appeler le client'; };
  const t5 = mkTask('apeler le client');
  assert(await sf.fixItemLabel(t5.id) === false && label(t5.id) === 'Autre titre', 'titre changé entre-temps : pas écrasé');

  // cache : même texte, pas de nouvel appel
  answer = 'Planifier la réunion'; const before = calls;
  await sf.fixText('planifier la reunion', 'own'); await sf.fixText('planifier la reunion', 'own');
  assert(calls === before + 1, 'cache par texte');

  // désactivation
  process.env.SPELLFIX = 'off'; const c1 = calls;
  assert(await sf.fixText('un texte fote', 'own') === null && calls === c1, 'SPELLFIX=off');
  delete process.env.SPELLFIX;

  // changeproposals masque les corrections orthographiques
  const cp = require('../server/lib/changeproposals');
  const ctx = cp.buildContext('own', act);
  const open = ctx.open.find((t) => t.id === t3.id);
  const mk = (after) => cp.validate(JSON.stringify({ changes: [{ target: 'task', id: open.id, field: 'text', after, reason: 'x' }] }), ctx);
  assert(mk('Appeler le client').length === 0, 'proposition orthographique non générée');
  assert(mk('Appeler le client demain avec le devis signé').length === 1, 'autre proposition de texte conservée');

  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})();
