// Confidentialité (Loi 25) : aucun prompt envoyé au modèle ne contient courriel, téléphone, nom de famille, nom d'utilisateur ni identifiant de compte.
// Profil d'essai rempli ; on capte le corps de CHAQUE requête réseau des appels IA réels (faux client) et on y cherche ces valeurs.
// Usage : node test/ia-confidentialite-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-confid-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging'; process.env.ANTHROPIC_API_KEY = 'fake'; process.env.AI_BUDGET_WEEK_USD = '1000';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const { grantAccess } = require('../server/lib/offer1access');
const aicache = require('../server/lib/aicache');
const aibudget = require('../server/lib/aibudget');
const classify = require('../server/lib/goalstaskclassify');
const rewrite = require('../server/lib/goalsrewrite');
const spell = require('../server/lib/silentspellfix');
const recurrence = require('../server/lib/taskrecurrence');
const place = require('../server/lib/goalscaptureplace');
const weekly = require('../server/lib/goalsweeklyauto');
const cross = require('../server/lib/crosssectorinference');
const offer = require('../server/lib/offerdelivery');
const dt = require('../server/lib/documenttasks');
const cp = require('../server/lib/changeproposals');
const offerforms = require('../server/lib/offerforms');

const UID = 'acct-7f3a9c21d4e8', FIRST = 'Jeanne', LAST = 'Tremblay', MAIL = 'jeanne.tremblay@example.org', PHONE = '514-555-0187';
const SECRETS = { 'courriel': MAIL, 'partie locale du courriel': 'jeanne.tremblay', 'téléphone': PHONE, 'téléphone (chiffres)': '5145550187', 'nom de famille': LAST, 'prénom / nom d\'utilisateur': FIRST, 'identifiant de compte': UID };
db.prepare("INSERT INTO users (id, name, lastName, phone, email, createdAt) VALUES (?,?,?,?,?,datetime('now'))").run(UID, FIRST, LAST, PHONE, MAIL);
db.prepare("INSERT INTO users (id, name, lastName, createdAt) VALUES ('mate','Marc','Gagnon',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Boutique',?, '')").run(UID).lastInsertRowid;
[UID, 'mate'].forEach((u) => db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, u));
grantAccess(UID, 'code');
const g = goals.addCategory(act, 'Production'); const key = (g && g.key) || goals.categoriesForActivity(act)[0].key;
goals.addCategory(act, 'Ventes');
const today = new Date().toISOString().slice(0, 10);
goalstasks.addCategoryTask(act, UID, key, 'Rédiger le plan', { dueDate: goals.addDays(today, 2) });
const monday = goals.mostRecentMonday(today);
let curPeriod = 1;
for (let n = 1; n <= 40; n++) {
  goals.setWeekly(act, key, n, 1, 'Sonde', undefined, 5);
  const per = db.prepare('SELECT * FROM goal_periods WHERE activityId = ? AND category = ? AND periodNumber = ?').get(act, key, n);
  if (per.startDate <= today && today <= per.endDate) {
    curPeriod = n;
    db.prepare("UPDATE goal_periods SET mainGoalText = 'Lancer la boutique en ligne' WHERE id = ?").run(per.id);
    goals.setWeekly(act, key, n, Math.max(1, Math.floor((Date.parse(monday) - Date.parse(per.startDate)) / 604800000) + 1), 'Boucler le plan', 'Consigne', 60);
    break;
  }
}
// Formulaires de l'Offre 1 (réponses libres de la personne, sans coordonnées : le code ne doit rien y ajouter)
offerforms.saveActivityForm(act, 'discovery', UID, { activite: 'Boutique de vêtements' });
offerforms.saveClientProfileForm(UID, { experience: 'Débutante' });

const bodies = [];
let reply = '{}';
global.fetch = async (url, init) => {
  bodies.push(String(init && init.body)); // corps complet : système + messages
  return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: reply }] }) };
};
const quiet = () => { const w = console.warn, e = console.error, l = console.log; console.warn = console.error = () => {}; return () => { console.warn = w; console.error = e; }; };
const safe = async (fn) => { try { return await fn(); } catch (e) { return null; } };
const mark = () => bodies.length;
const since = (m) => bodies.slice(m).join('\n').toLowerCase();

(async () => {
  const restore = quiet();
  const runs = [
    ['classement', () => classify.classifyCategory(act, 'Commander des cintres', { userId: UID })],
    ['classement strict', () => classify.classifyCategory(act, 'Appeler le fournisseur', { userId: UID, strict: true })],
    ['reformulation', () => rewrite.proposeRewrite('Faire le truc de la boutique', UID)],
    ['orthographe', () => spell.fixText('Apeller le fournisseur', UID)],
    ['récurrence', () => aibudget.runAs(UID, () => recurrence.suggest('Payer le loyer de la boutique'))],
    ['rapprochement tâche -> objectif', () => aibudget.runAs(UID, () => place.matchObjective(UID, act, key, 'Préparer le lancement de la boutique'))],
    ['objectifs hebdo', () => aibudget.runAs(UID, () => weekly.generateForPeriod(act, UID, key, curPeriod, { dryRun: true }))],
    ['inter-secteurs', () => aibudget.runAs(UID, () => cross.evaluateCrossSectorLinks(act, key, { type: 'task', text: 'Lancer la campagne de ventes' }))],
    ['document / tâches', () => aibudget.runAs(UID, () => dt.propose(UID, act, { instruction: 'Extrais', files: [{ fileName: 'a.txt', mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,' + Buffer.from('Appeler le fournisseur demain').toString('base64') }] }, { skipRate: true }))],
    ['modifications proposées', () => aibudget.runAs(UID, () => cp.generate(UID, act, { docText: 'Le plan est terminé.' }))],
    ['plan Offre 1', () => aibudget.runAs(UID, () => offer.activateActivitySubscription(act, UID))],
  ];
  const seen = {};
  for (const [name, fn] of runs) {
    aicache.memoClear();
    const m = mark(); reply = '{}';
    await safe(fn);
    seen[name] = bodies.length - m;
  }
  restore();
  for (const [name] of runs) {
    // Les prompts de chaque fonction sont relus à part pour localiser une fuite précise.
    assert(seen[name] > 0, name + ' : au moins un appel IA capté (' + seen[name] + ')');
  }
  // Recherche globale, puis par fonction
  let off = 0;
  for (const [name] of runs) {
    const txt = bodies.slice(off, off + seen[name]).join('\n').toLowerCase(); off += seen[name];
    Object.entries(SECRETS).forEach(([lab, val]) => assert(!txt.includes(String(val).toLowerCase()), name + ' : ' + lab + ' absent du prompt'));
  }
  // Témoin : le détecteur voit bien une valeur présente (pas de faux négatif par construction)
  assert(since(0).includes('boutique'), 'témoin : le contenu métier (nom de l\'activité, tâches) est bien dans les prompts captés');
  assert(since(0).includes('lancer la boutique en ligne') || since(0).includes('boucler le plan'), 'témoin : objectifs présents dans les prompts');
  process.stdout.write(failed ? '\nÉCHEC\n' : '\nOK\n'); process.exit(failed ? 1 : 0);
})();
