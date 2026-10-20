#!/usr/bin/env node
// Liste les fichiers de test jamais exécutés par la suite : test/*-test.js et test/fonctionnel-*.js absents de test/run-tests.js
// (les tests de trade-tracker/test sont tous lancés par run.js, qui lit le dossier). Sortie : un nom par ligne.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const runner = fs.readFileSync(path.join(root, 'test', 'run-tests.js'), 'utf8');
const files = fs.readdirSync(path.join(root, 'test')).filter((n) => /-test\.js$/.test(n) || /^fonctionnel-.*\.js$/.test(n)).sort();
const orphans = files.filter((n) => !runner.includes("'" + n + "'"));
module.exports = { files, orphans };
if (require.main === module) { for (const n of orphans) console.log(n); }
