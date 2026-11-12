// Nature (Développer | Maintenir) et phases (Réformer, Cadrage, Réalisation, Finition) des tâches : calcul EN SILENCE, jamais de phase sur la maintenance. Usage : node test/nature-phases-test.js
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-nature-phases-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
const fs = require('fs'), path = require('path');
let failed = 0; const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db'), K = require('../server/lib/taskkind');
// colonne en base
assert(db.prepare('PRAGMA table_info(sub_project_items)').all().some((c) => c.name === 'taskPhase'), 'colonne taskPhase en base (migration additive, idempotente)');
// phases d'après le titre (développement)
const dev = (label) => K.compute({ label, objectiveMatched: true, repeatCount: 0, sectorShare: null });
assert(dev('Définir le plan de la page de vente').phase === 'cadrage' && dev('Étudier les options de prix').phase === 'cadrage', 'cadrage : définir, planifier, étudier');
assert(dev('Rédiger le texte de la page').phase === 'realisation' && dev('Construire la maquette').phase === 'realisation', 'réalisation : rédiger, construire');
assert(dev('Relire et publier la page').phase === 'finition' && dev('Finaliser le dossier').phase === 'finition', 'finition : relire, publier, finaliser');
assert(dev('Faire des choses').phase === null, 'sans signal net : aucune phase (aucun défaut « Réalisation » affiché ou stocké)');
// jamais de phase sur la maintenance
const m = K.compute({ label: 'Payer la facture de téléphone', repeatCount: 3, recurrence: true, sectorShare: null });
assert(m.kind === 'maintenance' && m.phase === null, 'maintenance : jamais de phase');
// écriture / lecture : la phase n'est écrite que sous Développer
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#A04B52', '')").run(act);
const goals = require('../server/lib/goals'), goalstasks = require('../server/lib/goalstasks');
const pk = (goals.addCategory(act, 'Pôle') && goals.categoriesForActivity(act)[0].key);
const mk = (label) => goalstasks.addCategoryTask(act, 'u1', pk, label).id;
const a = mk('Définir le plan'), b = mk('Payer la facture'), c = mk('Repenser toute la stratégie');
K.write(a, dev('Définir le plan')); K.write(b, m); K.write(c, dev('Repenser toute la stratégie'));
K.setPhase(c, 'reformer'); K.setPhase(b, 'reformer'); // réformer sur la maintenance : refusé
const ph = K.readPhaseMany([a, b, c]);
assert(ph[a] === 'cadrage' && ph[b] === null && ph[c] === 'reformer', 'écrit sous Développer seulement ; Réformer = première phase ; refusé sur la maintenance');
// rien de visible : aucune sortie du serveur ni de l'interface ne porte la phase
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
const shown = walk(path.join(__dirname, '..', 'public')).filter((f) => /\.(js|html)$/.test(f)).filter((f) => fs.readFileSync(f, 'utf8').includes('taskPhase'));
assert(shown.length === 0, 'aucune étiquette, aucun champ : « taskPhase » n\'apparaît dans aucun fichier de l\'interface');
console.log(failed ? '\n' + failed + ' échec(s)' : 'nature-phases-test OK'); process.exit(failed ? 1 : 0);
