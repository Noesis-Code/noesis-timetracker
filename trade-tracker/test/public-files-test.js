// Garde-fou : aucun fichier de public/ ne doit être vide (régression silencieuse déjà vue : styles.css et screen-compare.js à 0 octet).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'public');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root);
assert(files.length > 10, 'public/ introuvable ou presque vide');
const empty = files.filter((f) => fs.statSync(f).size < 1).map((f) => path.relative(root, f));
assert.deepStrictEqual(empty, [], 'Fichiers vides dans public/ : ' + empty.join(', '));
for (const must of ['styles.css', 'tokens.css', 'js/screen-compare.js', 'js/app.js', 'index.html'])
  assert(fs.statSync(path.join(root, must)).size > 500, must + ' tronqué');
console.log('public-files ok');
