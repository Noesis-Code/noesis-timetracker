// Réduction de prompts IA : description de pôle écrite une fois par pôle (classement) ; exemples par utilisateur bornés (N=5, 250 caractères).
// Usage : node test/ia-prompts-reduction-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-prompts-red-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const classify = require('../server/lib/goalstaskclassify');
const ex = require('../server/lib/goalsclassifyexamples');
const db = require('../server/db');
const tok = (s) => Math.ceil(s.length / 4);

const cats = [];
const poles = [['ventes', 'Ventes', 'Tout ce qui fait entrer des clients et du chiffre d affaires : prospection, devis, suivi.'], ['admin', 'Administration', 'Comptabilité, factures, contrats, obligations légales et assurances.']];
poles.forEach(([k, l, d]) => ['a', 'b', 'c', 'd'].forEach((s) => cats.push({ key: k + '.' + s, label: l + ' → Secteur ' + s, description: 'Secteur ' + s, poleDescription: d })));
cats.push({ key: 'solo', label: 'Perso', description: 'Divers', poleDescription: '' });

// Référence : ancien format (description de pôle sur chaque ligne)
const oldList = cats.map((c) => `- ${c.key} : ${c.label}` + (c.description ? ` — ${c.description}` : '') + (c.poleDescription ? ` (pôle : ${c.poleDescription})` : '')).join('\n');
const strict = classify.buildPrompt('Payer la facture', cats, [], { allowUncertain: false });
const conf = classify.buildPrompt('Payer la facture', cats, [], { allowUncertain: true, confidence: true });
const oldStrict = strict.replace(/Catégories disponibles \(clé : libellé\) :\n[\s\S]*?\n\n/, 'Catégories disponibles (clé : libellé) :\n' + oldList + '\n\n');
console.log('  jetons classement (9 catégories, 2 pôles x 4 secteurs) : avant ' + tok(oldStrict) + ' -> après ' + tok(strict));
assert(tok(strict) < tok(oldStrict), 'prompt de classement plus court');
poles.forEach(([, , d]) => assert(strict.split(d).length - 1 === 1, 'description de pôle présente une seule fois : ' + d.slice(0, 20)));
cats.forEach((c) => assert(strict.includes('- ' + c.key + ' : ' + c.label + ' — ' + c.description), 'ligne conservée ' + c.key));
assert(strict.includes('Tâche à classer : "Payer la facture"') && conf.includes('cléA | 90') && classify.buildPrompt('x', cats, [], { allowUncertain: true }).includes('INCERTAIN'), 'consignes de réponse inchangées');
// Un pôle réapparaissant après un autre pôle reprend sa description
const mixed = classify.buildPrompt('x', [cats[0], cats[4], cats[1]], [], {});
assert(mixed.split(poles[0][2]).length - 1 === 2, 'description répétée si un autre pôle s\'intercale');

// Exemples par utilisateur : N <= 5 et bloc <= 250 caractères, jamais d'un autre utilisateur
const now = new Date().toISOString();
['u1', 'u2', 'u3'].forEach((u) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(u, u, now));
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('a', 'u1', ?)").run(now).lastInsertRowid;
const keys = cats.map((c) => ({ key: c.key, label: c.label }));
for (let i = 0; i < 40; i++) ex.recordCorrection(act, 'u1', 'Tâche très longue numéro ' + i + ' ' + 'x'.repeat(100), 'ventes.a');
ex.recordCorrection(act, 'u2', 'autre utilisateur', 'ventes.b');
const r1 = ex.recentExamples(act, keys, undefined, 'u1');
const size = r1.reduce((n, e) => n + e.label.length + e.categoryLabel.length + 6, 0);
assert(r1.length <= ex.INJECT_COUNT && r1.length >= 1, 'exemples <= ' + ex.INJECT_COUNT + ' (' + r1.length + ')');
assert(size <= ex.MAX_BLOCK_CHARS, 'bloc <= ' + ex.MAX_BLOCK_CHARS + ' caractères (' + size + ')');
assert(!r1.some((e) => /autre utilisateur/.test(e.label)), 'aucun exemple d\'un autre utilisateur');
for (let i = 0; i < 10; i++) ex.recordCorrection(act, 'u3', 'Court ' + i, 'ventes.a');
const r3 = ex.recentExamples(act, keys, 99, 'u3');
assert(r3.length <= 99 && r3.reduce((n, e) => n + e.label.length + e.categoryLabel.length + 6, 0) <= ex.MAX_BLOCK_CHARS, 'même un limit élevé reste borné par les caractères');
assert(ex.recentExamples(act, keys, undefined, null).length === 0, 'sans utilisateur : aucun exemple');
const withEx = classify.buildPrompt('x', cats, r1, {});
console.log('  jetons du bloc d\'exemples (pire cas) : ' + tok(withEx) + ' - ' + tok(strict.replace('Payer la facture', 'x')) + ' = ~' + (tok(withEx) - tok(classify.buildPrompt('x', cats, [], {}))));
assert(tok(withEx) - tok(classify.buildPrompt('x', cats, [], {})) <= 100, 'bloc d\'exemples <= 100 jetons (en-tête compris)');
try { db.prepare('DELETE FROM goal_classify_examples WHERE activityId = ?').run(act); } catch (e) {}
if (failed) { console.log(failed + ' échec(s)'); process.exit(1); }
console.log('OK');
