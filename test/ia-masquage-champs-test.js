// Loi 25 : le masquage ne doit rien altérer des champs qui doivent rester intacts dans les prompts
// (identifiants de secteur, dates ISO, montants, heures). 30 cas réels de test/fixtures/task-precision/cases.json.
// Usage : node test/ia-masquage-champs-test.js
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { scrubText, scrubBody } = require('../server/lib/aiscrub');
const fx = require('./fixtures/task-precision/cases.json');

// 30 cas : d'abord ceux qui contiennent des chiffres (quantités, montants, heures, dates), puis des libellés ordinaires.
const withDigits = fx.cases.filter((c) => /\d/.test(c.label));
const others = fx.cases.filter((c) => !/\d/.test(c.label));
const picked = withDigits.slice(0, 20).concat(others.slice(0, 10));
assert(picked.length === 30, '30 cas retenus');

const sectorKeys = Object.values(fx.contexts).flatMap((x) => x.candidates.map((k) => k.key));
const bad = [];
picked.forEach((c, i) => {
  const key = sectorKeys[i % sectorKeys.length];
  const iso = '2026-10-' + String(1 + (i % 28)).padStart(2, '0');
  const prompt = 'Secteur : ' + key + ' (id ' + (1000 + i) + ')\nÉchéance : ' + iso + 'T14:30:00.000Z\nBudget : ' + (1250 + i) + ',50 $\nDurée : ' + (i % 5) + 'h30 / ' + (45 + i) + ' min\nTâche : ' + c.label;
  const texts = [c.label, prompt];
  texts.forEach((t) => { if (scrubText(t) !== t) bad.push(c.id + ' : ' + JSON.stringify(t)); });
  const body = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 50, system: 'Secteurs : ' + sectorKeys.join(', '), messages: [{ role: 'user', content: prompt }] });
  if (scrubBody(body) !== body) bad.push(c.id + ' : corps de requête modifié');
});
assert(bad.length === 0, 'sortie identique à l\'entrée pour les 30 cas (libellé seul, prompt complet, corps de requête)' + (bad.length ? ' — altérés : ' + bad.join(' | ') : ''));
console.log(failed ? 'ÉCHEC' : 'OK');
process.exit(failed ? 1 : 0);
