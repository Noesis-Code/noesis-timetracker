// 18 nov. 2026 : (1) l'interrupteur « Arbre des objectifs » masque l'activité à TOUS les niveaux de l'arbre (colonnes comprises) ;
// (2) Stratégie et Répartition des tâches vivent dans la fiche d'une catégorie, plus dans Réglages > activité ;
// (3) « Comparer le chrono / les tâches » retirés (interface, route, sérialisation) ; les colonnes restent en base.
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-reglcat-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
const http = require('http');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const express = require('express');
const router = require('../server/routes/activities');
const objectifs = require('../server/lib/objectifs');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  db.prepare("INSERT INTO users (id, name, createdAt, theme) VALUES ('u1', 'u1', datetime('now'), 'dark')").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Cachée', 'u1', '')").run().lastInsertRowid;
  const act2 = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Visible', 'u1', '')").run().lastInsertRowid;
  const mem = db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')");
  mem.run(act); mem.run(act2);
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.userId = 'u1'; next(); }); app.use('/api', router);
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/api';
  const put = async (body) => (await fetch(base + '/activities/' + act, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

  let r = await put({ treeHidden: true });
  assert(r.treeHidden === true, 'treeHidden enregistré et renvoyé');
  let st = objectifs.structure('u1');
  assert(st.hidden.indexOf(act) >= 0 && st.hidden.indexOf(act2) < 0, 'la structure renvoie hidden (seulement l\'activité masquée)');
  r = await put({ compareChrono: true, compareTasks: true });
  assert(r.compareChrono === undefined && r.compareTasks === undefined, 'plus de compareChrono / compareTasks dans la réponse');
  assert(db.prepare('SELECT compareChrono AS c FROM activity_members WHERE activityId = ?').get(act).c === 0, 'la route ignore ces champs (colonnes conservées en base)');
  r = await put({ treeHidden: false });
  assert(r.treeHidden === false && objectifs.structure('u1').hidden.length === 0, 'rouvert : l\'activité revient (aucun objectif supprimé)');

  // Côté client (source) : les colonnes viennent de struct.activities ; le filtre doit la toucher aussi, pas seulement items
  const arbre = read('public/js/objectifs-arbre.js');
  assert(/struct\.activities\.filter\(function \(a\) \{ return hid\.indexOf\(a\.id\) < 0; \}\)/.test(arbre), 'arbre : struct.activities est filtrée par hidden (colonnes, choix de création, ordre)');
  const creer = read('public/js/objectifs-creer.js'), app_ = read('public/app.js');
  assert(/TMT\.buildStrategieBlock\(act\.id, catKey, false\)/.test(creer) && /TMT\.buildRepartitionBlock\(act\.id, catKey, false\)/.test(creer), 'fiche d\'une catégorie : Stratégie et Répartition des tâches');
  assert(!/plainRow\(t\('Stratégie'\)/.test(app_) && !/plainRow\(t\('Répartition des tâches'\)/.test(app_), 'Réglages > activité : lignes Stratégie et Répartition retirées');
  assert(!/fields\.appendChild\(buildStrategieBlock/.test(app_), 'éditeur de catégories : plus de doublon (une fonction, un endroit)');
  assert(!/Comparer le chrono|Comparer les tâches|compareChrono|compareTasks/.test(app_ + read('public/js/stats-avance.js')), 'client : interrupteurs Comparer retirés');
  srv.close();
  if (failed) { console.log('\nreglages-categorie-test : ' + failed + ' échec(s)'); process.exit(1); }
  console.log('\nreglages-categorie-test : OK');
  process.exit(0);
})().catch((e) => { console.log('ERREUR', e.stack); process.exit(1); });
