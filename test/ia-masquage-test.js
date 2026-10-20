// Loi 25 : masquage des coordonnées avant envoi au modèle + validation de la reformulation. Usage : node test/ia-masquage-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-scrub-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_DAY_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const { scrubText: s, scrubBody } = require('../server/lib/aiscrub');
const M = '[masqué]';
['jeanne.t+x@exemple.org', 'Écris à a@b.co svp'].forEach((t) => assert(s(t).includes(M) && !/@/.test(s(t)), 'courriel : ' + t));
['514-555-0187', '(514) 555-0187', '514 555 0187', '514.555.0187', '5145550187', '1-800-555-0187', '+1 514 555 0187', 'Appelle le 438-555-0100 demain', '+33 6 12 34 56 78']
  .forEach((t) => assert(s(t).includes(M) && !/\d{3}/.test(s(t).replace(/\[masqué\]/g, '')), 'téléphone : ' + t));
assert(s('carte 4111 1111 1111 1111 ok') === 'carte ' + M + ' ok', 'carte Visa (Luhn)');
assert(s('4111-1111-1111-1111') === M, 'carte avec tirets');
assert(s('NAS 046 454 286') === 'NAS ' + M, 'NAS valide espacé');
assert(s('046454286') === M, 'NAS valide continu');
['Rendez-vous à 14h30', 'À 14:30 le 2026-10-20', 'le 20/10/2026', '20 octobre 2026', 'Budget 1 250,50 $', '12 500 $ en 2026', '1234.56', 'Objectif : 150 ventes', 'Tâche 3 sur 12', 'ref 123456789', 'code postal H2X 1Y4', '75.5 % de 10000', 'du 2026-10-01 au 2026-12-31', '9,99 $ x 100']
  .forEach((t) => assert(s(t) === t, 'faux positif évité : ' + t));
const body = JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 5, messages: [{ role: 'user', content: [{ type: 'text', text: 'Mon courriel est a@b.co' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: '5145550187AAAA' } }] }], system: 'Tel 514-555-0187' });
const out = JSON.parse(scrubBody(body));
assert(out.messages[0].content[0].text === 'Mon courriel est ' + M && out.system === 'Tel ' + M && out.model === 'claude-haiku-4-5', 'corps de requête masqué (texte, système)');
assert(out.messages[0].content[1].source.data === '5145550187AAAA', 'données base64 intactes');
assert(scrubBody('pas du json') === 'pas du json', 'corps illisible inchangé');

// Point d'appel commun : le réseau ne voit que le texte masqué, la réponse est intacte
(async () => {
  const aibudget = require('../server/lib/aibudget');
  let sent = '';
  global.fetch = async (url, init) => { sent = init.body; return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'écrivez à z@z.org' }] }) }; };
  const res = await aibudget.fetchAnthropic('test', 'https://x', { method: 'POST', body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 5, messages: [{ role: 'user', content: 'mon tel 514-555-0187, a@b.co' }] }) });
  const j = await res.json();
  assert(!/514|a@b/.test(sent) && sent.includes(M), 'fetchAnthropic envoie le texte masqué');
  assert(j.content[0].text === 'écrivez à z@z.org', 'réponse du modèle non modifiée');

  const { validRewrite, proposeRewrite } = require('../server/lib/goalsrewrite');
  assert(validRewrite('Lancer la boutique en ligne', 'lancer boutique') === true, 'reformulation valide');
  assert(validRewrite('', 'x') === false, 'vide refusé');
  assert(validRewrite('Je ne peux pas reformuler ce texte.', 'lancer boutique') === false, 'refus FR rejeté');
  assert(validRewrite("I'm sorry, I can't help with that.", 'lancer boutique') === false, 'refus EN rejeté');
  assert(validRewrite('Désolé, je ne peux pas aider.', 'ventes') === false, 'désolé rejeté');
  assert(validRewrite('x'.repeat(300), 'ventes') === false, 'trop long vs original rejeté');
  let reply = 'Je ne peux pas aider avec cela.';
  global.fetch = async () => ({ ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-sonnet-4-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: reply }] }) });
  process.env.NOESIS_REWRITE_FAST_MODEL = 'off';
  assert((await proposeRewrite('lancer boutique', 'u-scrub')) === null, 'refus du modèle -> repli sur le texte original (null)');
  reply = 'Lancer la boutique en ligne';
  assert((await proposeRewrite('lancer boutique en ligne vite', 'u-scrub2')) === 'Lancer la boutique en ligne', 'sortie valide conservée');
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTout est vert');
  process.exit(failed ? 1 : 0);
})();
