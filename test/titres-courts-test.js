// Titres COURTS (18 nov. 2026, Émilien) : tout titre d'objectif créé par l'app tient en 5 mots au plus, le texte complet passe dans la description (« faire »), avec ou sans IA.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-titres-courts-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
delete process.env.ANTHROPIC_API_KEY;
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const aicache = require('../server/lib/aicache');
const o = require('../server/lib/objectifs');
const I = require('../server/lib/objectifs-inferieurs');
const words = (t) => String(t).trim().split(/\s+/).length;
db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
categories.addCategory(act, 'Production'); const poleKey = goals.categoriesForActivity(act)[0].key;
(async () => {
  const long = 'Rédiger et publier la première version complète du guide de démarrage pour les nouveaux clients.';
  const s = I.shortTitle(long, 'Détail');
  assert(words(s.title) <= 5 && !/[.,;]$/.test(s.title) && s.faire.startsWith(long) && /Détail$/.test(s.faire), 'titre de 15 mots : 5 mots au plus, texte complet en tête de la description');
  const eg = 'Atteindre le niveau intermédiaire en anglais pour voyager', e = I.shortTitle(eg, '');
  assert(e.title === 'Atteindre niveau intermédiaire anglais voyager' && !/(le|en|pour)/.test(e.title) && e.faire.startsWith(eg), 'sans mots de liaison, description complète (' + e.title + ')');
  const c = I.shortTitle('Préparer le plan', 'x');
  assert(c.title === 'Préparer le plan' && c.faire === 'x', 'titre court : inchangé');
  assert(!/\b(de|du|la|le|pour)$/.test(I.shortTitle('Écrire le plan de la nouvelle offre', '').title), 'jamais un article ou une préposition en dernier mot');

  const today = require('../server/lib/dates').userToday(), y = Number(today.slice(0, 4)) + 1;
  const par = o.creer('u1', { title: 'Lancer la boutique', activityId: act, level: 'pole', poleKey, startDate: today, endDate: y + '-09-01', hoursPerWeek: 3 });
  // Sans IA : repli, titres courts
  const p0 = await I.genererPour('u1', par.id, today);
  assert(!p0.skip && p0.rows.every((r) => words(r.title) <= 5), 'sans IA : tous les titres de repli sont courts (' + p0.rows.map((r) => r.title).join(' | ') + ')');
  assert(p0.rows.every((r) => !r.faire || r.faire.length > 0) && p0.rows.some((r) => /Lancer la boutique/.test(r.faire || r.title)), 'sans IA : rien de perdu (le titre du parent reste lisible)');
  // Avec IA : titre de 12 mots
  process.env.ANTHROPIC_API_KEY = 'test';
  const realFetch = global.fetch;
  const longT = 'Concevoir et valider avec trois clients pilotes le parcours complet de commande en ligne';
  global.fetch = async (url, init) => {
    const b = JSON.parse(init.body), p = JSON.parse(b.messages[0].content);
    const reply = { confidence: 90, chiffre: null, contexte: null, lignes: p.lignes.map((l) => ({ n: l.n, titre: longT + ' ' + l.n, faire: 'Faire le parcours', resultat: 'Parcours validé', avancement: 'Étapes faites', choix: null })) };
    return { ok: true, status: 200, clone() { return this; }, json: async () => ({ model: b.model, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(reply) }] }) };
  };
  try {
    aicache.memoClear();
    const p1 = await I.genererPour('u1', par.id, today);
    assert(!p1.skip && p1.ai && p1.rows.length > 0, 'IA simulée : proposition faite');
    assert(p1.rows.every((r) => words(r.title) <= 5), 'IA : titre de 14 mots réduit à 5 mots au plus (' + p1.rows[0].title + ')');
    const rp = await I.plan('u1', { trou: true, parentId: par.id, type: 'annuel', title: 'Lancer la boutique', description: '', activityId: act, level: 'pole', poleKey, startDate: today, endDate: y + '-09-01', rateMin: 180 }, today); // même fonction que POST /api/objectifs/inferieurs/proposition
    assert(!rp.skip && rp.rows.every((r) => words(r.title) <= 5 && r.faire.startsWith(longT)), 'proposition (route) : titres courts, texte complet dans la description');
    assert(p1.rows.every((r, i) => r.faire.startsWith(longT)), 'IA : le titre complet part en tête de la description, rien n’est perdu');
  } finally { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }
  console.log(failed ? '\ntitres-courts-test : ' + failed + ' ÉCHEC(S)' : '\ntitres-courts-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
