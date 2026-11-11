// Création d'objectif : préchargement du rattachement et des questions du Niveau (11 nov. 2026). Garde contre la régression du commit 8e7751a6 :
// fetchParent DOIT renvoyer sa promesse (refreshHints fait fetchParent().then), loadRatt DOIT mémoriser la sienne (form.ratt.p) pour que « Suivant » l'attende. Usage : node test/creation-prechargement-test.js
const fs = require('fs'), path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/objectifs-creer.js'), 'utf8').replace(/\r\n/g, '\n');
const body = (name) => { const a = js.indexOf('    function ' + name + '('); const b = js.indexOf('\n    }\n', a); return a < 0 ? '' : js.slice(a, b + 6); };
const fp = body('fetchParent'), lr = body('loadRatt');
assert(/return api\('POST', '\/api\/objectifs\/rattachement'/.test(fp) && !/var rp = api/.test(fp), 'fetchParent renvoie la promesse de la requête (refreshHints en dépend)');
assert(/var rp = api\('POST', '\/api\/objectifs\/rattachement'/.test(lr), 'loadRatt garde sa promesse dans rp');
assert(/\.catch\(function \(\) \{\}\);\s*form\.ratt\.p = rp;\s*return rp;/.test(lr), 'loadRatt mémorise form.ratt.p et la renvoie (Suivant attend le rattachement : form.parentId posé)');
assert(/if \(form\.ratt && form\.ratt\.key === key\) return form\.ratt\.p \|\| Promise\.resolve\(\);/.test(lr), 'un deuxième appel avec la même clé attend la demande en vol');
// comportement : exécute les deux fonctions extraites avec un faux api
const run = (async () => {
  let calls = 0;
  const form = { activityId: 1, title: 't', dateOk: true, endFixed: true, endDate: '2027-01-01' };
  const api = (m, u) => new Promise((r) => { calls++; setTimeout(() => r({ candidate: { id: 7, title: 'Parent' }, rel: 'apres' }), 20); });
  const rattKey = () => 'k', rattKey2 = rattKey, rattBody = () => ({});
  const loadRatt = new Function('form', 'api', 'rattKey', 'rattKey2', 'rattBody', lr.replace(/^\s*function loadRatt\(\)/, 'return function loadRatt()'))(form, api, rattKey, rattKey2, rattBody);
  const p1 = loadRatt(), p2 = loadRatt();
  await p2; await p1;
  assert(calls === 1 && form.parentId === 7, 'deux appels : une seule requête, et l’attente de la seconde pose form.parentId');
  const fetchParent = new Function('form', 'api', 'rattKey', 'rattKey2', 'rattBody', fp.replace(/^\s*function fetchParent\(\)/, 'return function fetchParent()'))(form, api, rattKey, rattKey2, rattBody);
  const r = fetchParent();
  assert(r && typeof r.then === 'function', 'fetchParent() renvoie une promesse (jamais undefined)');
  const v = await r; assert(v && v.id === 7, 'fetchParent résout le parent proposé');
  if (failed) { console.log('\n' + failed + ' échec(s)'); process.exit(1); }
  console.log('\ntout passe');
})();
