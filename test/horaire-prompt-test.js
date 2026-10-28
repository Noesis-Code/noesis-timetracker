// Module « Horaire » : prompt pour l'IA du gestionnaire (server/lib/horaire-prompt.js, fonction pure) et route
// GET /api/horaire/weeks/:lundi/prompt (401 sans session, 403 module éteint, chaque compte ne voit que ses données).
// Champs employé : quarts souhaités min/max et contrainte (validation, import CSV, export Loi 25).
// Usage : node test/horaire-prompt-test.js
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-horaire-prompt-');
const http = require('http');
const express = require('express');

let failed = 0;
function assert(c, l) { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } }

// ---- Fonction pure ----
const { buildPrompt } = require('../server/lib/horaire-prompt');
const W = '2026-11-02'; // lundi
const input = {
  weekStart: W,
  positions: [{ id: 1, name: 'Serveur' }],
  employees: [
    { id: 11, name: 'Bruno', wantShiftsMin: 3, wantShiftsMax: 4, constraintNote: null },
    { id: 10, name: 'Alice', wantShiftsMin: 5, wantShiftsMax: 5, constraintNote: 'Doit avoir une journée de repos après chaque quart ; jamais de double.' },
  ],
  qualifications: [{ employeeId: 10, positionId: 1, rank: 1 }, { employeeId: 11, positionId: 1, rank: 2 }],
  availabilities: [
    { employeeId: 10, day: '2026-11-02', start: '10:00', end: '15:00' },
    { employeeId: 10, day: '2026-11-07', start: '16:00', end: '23:00' },
    { employeeId: 11, day: '2026-11-03', start: '10:00', end: '23:00' },
    { employeeId: 11, day: '2026-11-08', start: '17:00', end: '01:00' },
  ],
  needs: [
    { positionId: 1, weekday: 0, start: '11:00', end: '15:00', count: 1 },
    { positionId: 1, weekday: 5, start: '17:00', end: '23:00', count: 2 },
  ],
  events: [{ day: '2026-11-07', label: 'Mariage', needs: [{ positionId: 1, start: '17:00', end: '23:00', count: 3 }] }],
};
const out = buildPrompt(input);
const lines = out.split('\n');
const sec = (title, next) => lines.slice(lines.indexOf(title) + 1, lines.indexOf(next) - 1);
assert(lines[0].startsWith('Tu es l\'assistant du maître d\'hôtel d\'un restaurant.') && lines[0].includes('Groupe 1 = priorité la plus haute.'), 'consigne en tête');
assert(JSON.stringify(sec('1. SEMAINE', '2. BESOINS PAR SERVICE')) === JSON.stringify(['Du lundi 2/11/2026 au dimanche 8/11/2026.']), 'semaine du lundi au dimanche (J/M/AAAA)');
assert(JSON.stringify(sec('2. BESOINS PAR SERVICE', '3. PERSONNEL')) === JSON.stringify([
  '- Lundi matin : 1 serveur à 11 h 00',
  '- Samedi soir : 3 serveurs à 17 h 00',
]), 'besoins : événement du samedi appliqué à la place du modèle normal');
assert(JSON.stringify(sec('3. PERSONNEL', '4. CHANGEMENTS DE CETTE SEMAINE')) === JSON.stringify([
  '- Groupe 1 | Alice | Serveur | disponible : lundi matin, samedi soir | quarts souhaités : 5 | Doit avoir une journée de repos après chaque quart ; jamais de double.',
  '- Groupe 2 | Bruno | Serveur | disponible : mardi matin, mardi soir, dimanche soir | quarts souhaités : 3 à 4',
]), 'personnel trié par groupe : matin/soir, min=max vs min à max, contrainte');
assert(JSON.stringify(sec('4. CHANGEMENTS DE CETTE SEMAINE', '5. RÈGLES (dans l\'ordre d\'importance)')) === JSON.stringify(['- Mariage : samedi 7/11/2026']), 'changements : événement de la semaine');
assert(lines.includes('1. (Stricte) Ne jamais placer un serveur en dehors de ses disponibilités.') && lines.some((l) => l.startsWith('9. (Dernier recours)')), 'règles 1 à 9');
assert(lines.includes('6. FORMAT DE TA RÉPONSE') && lines.some((l) => l.startsWith('E. Vérification')), 'format A à E');
const multi = buildPrompt(Object.assign({}, input, { positions: [{ id: 1, name: 'Serveur' }, { id: 2, name: 'Hôte' }], events: [] }));
assert(multi.includes('- Samedi soir : Serveur : 2 personnes à 17 h 00') && multi.includes('4. CHANGEMENTS DE CETTE SEMAINE\nAucun\n'), 'plusieurs postes : préfixe du poste ; sans événement : « Aucun »');

// ---- Prompt d'inscription (fonction pure) ----
const { buildRegistrationPrompt } = require('../server/lib/horaire-prompt');
const reg = buildRegistrationPrompt({ weekStart: W, assignments: [
  { employeeName: 'Bruno', positionName: 'Serveur', day: '2026-11-08', start: '17:00', end: '01:00' },
  { employeeName: 'Fictif, Albert', positionName: 'Hôte', day: '2026-11-02', start: '11:00', end: '15:00' },
] }).split('\n');
assert(reg.indexOf('- Albert Fictif ; 2026-11-02 ; lundi ; 11:00 ; 15:00 ; Hôte') >= 0 && reg.indexOf('- Bruno ; 2026-11-08 ; dimanche ; 17:00 ; 01:00 ; Serveur') > reg.indexOf('- Albert Fictif ; 2026-11-02 ; lundi ; 11:00 ; 15:00 ; Hôte'),
  'inscription : quarts triés par jour, « Nom, Prénom » écrit « Prénom Nom »');
assert(reg.includes('SEMAINE : du lundi 2026-11-02 au dimanche 2026-11-08.') && buildRegistrationPrompt({ weekStart: W, assignments: [] }).includes('- Aucun quart.'), 'inscription : semaine après les consignes ; sans quart : « Aucun quart. »');
const custom = buildRegistrationPrompt({ weekStart: W, instructions: 'Consignes à moi.\n', assignments: [{ employeeName: 'Bruno', positionName: 'Serveur', day: W, start: '17:00', end: '23:00' }] });
assert(custom.startsWith('Consignes à moi.\n\nSEMAINE : ') && custom.includes('- Bruno ; 2026-11-02 ; lundi ; 17:00 ; 23:00 ; Serveur'), 'inscription : consignes personnalisées, puis semaine et quarts toujours ajoutés');

// ---- Données, import CSV, export ----
const db = require('../server/db');
const h = require('../server/lib/horaire');
const M = require('../server/lib/modules');
const now = new Date().toISOString();
['uA', 'uB'].forEach((id) => db.prepare('INSERT INTO users (id, name, createdAt) VALUES (?, ?, ?)').run(id, id, now));
const r1 = h.importEmployeesCsv('uA', 'nom;max;postes;quarts min;quarts max;contrainte\nAlice;30;Serveur:1;5;5;Jamais de double\nBruno;;Serveur:2 | Hôte:1;3;4;\n');
const emps = h.listEmployees('uA');
const alice = emps.find((e) => e.name === 'Alice'), bruno = emps.find((e) => e.name === 'Bruno');
assert(r1.created === 2 && alice.wantShiftsMin === 5 && alice.wantShiftsMax === 5 && h.listEmployeeRules('uA').some((x) => x.employeeId === alice.id && x.rule === 'free' && x.text === 'Jamais de double'), 'import CSV : quarts min/max, contrainte devenue règle libre');
assert(bruno.wantShiftsMin === 3 && bruno.wantShiftsMax === 4 && bruno.constraintNote === null && h.listQualifications('uA').filter((q) => q.employeeId === bruno.id).length === 2, 'import CSV : postes bornés avant les colonnes suivantes');
const r2 = h.importEmployeesCsv('uA', 'nom;quarts min;quarts max\nAlice;6;4\n');
assert(r2.skipped.length === 1 && h.ownEmployee('uA', alice.id).wantShiftsMin === 5, 'import CSV : min > max refusé');
const r3c = h.importEmployeesCsv('uA', 'nom;heures min;heures max;cible\nBruno;18;24;20\nAlice;30;30;12\n');
assert(r3c.updated === 2 && r3c.skipped.length === 0 && h.ownEmployee('uA', bruno.id).wantHoursTarget === 20 && h.ownEmployee('uA', alice.id).wantHoursTarget === 12, 'import CSV : heures min, max et « cible » lues, cible hors du min et du max acceptée');
const ex = require('../server/lib/dataexport').buildUserExport('uA');
assert(ex.horaire.employees.some((e) => e.wantShiftsMax === 5) && ex.horaire.employeeRules.some((x) => x.text === 'Jamais de double'), 'export du compte : nouveaux champs et règles inclus');

// ---- Routes ----
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.userId = req.headers['x-user'] || null; next(); });
const session = require('../server/lib/session');
session.requireAuth = (req, res, next) => (req.userId ? next() : res.status(401).end());
app.use(require('../server/lib/modulegate').moduleGate);
app.use('/api', require('../server/routes/horaire'));
const server = app.listen(0);
const port = server.address().port;
function call(method, path, body, user) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const headers = Object.assign(user ? { 'x-user': user } : {}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {});
    const r = http.request({ port, method, path: '/api/horaire/' + path, headers }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch (e) { /* texte */ } resolve({ status: res.statusCode, body: j, text: t, type: res.headers['content-type'] || '', cache: res.headers['cache-control'] }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
(async () => {
  M.setModules('uA', { horaire: true });
  M.setModules('uB', { horaire: true });
  let r = await call('GET', 'weeks/' + W + '/prompt');
  assert(r.status === 401, 'prompt sans session : 401');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA');
  assert(r.status === 409 && r.body.error === 'Génère d\'abord l\'horaire.', 'prompt d\'inscription sans horaire enregistré : 409');
  r = await call('GET', 'weeks/2026-11-03/prompt', undefined, 'uA');
  assert(r.status === 400, 'semaine qui ne commence pas un lundi : 400');

  // ---- Prompt fixe de lecture ----
  r = await call('GET', 'import-prompt', undefined, 'uA');
  assert(r.status === 200 && /^text\/plain/.test(r.type) && r.cache === 'no-store' && r.text === require('../server/lib/horaire-prompt').IMPORT_PROMPT
    && r.text.startsWith('Tu aides le gestionnaire d\'un restaurant.') && r.text.includes('Première ligne exactement : nom;jour;début;fin;type\n') && r.text.includes('Un seul bloc de code') && r.text.endsWith('\n'), 'prompt de lecture : texte fixe, brut, non mis en cache');
  assert(!/dayforce|chatgpt|copilot/i.test(r.text), 'prompt de lecture : ni le logiciel ni l\'IA ne sont nommés');
  assert((await call('GET', 'import-prompt')).status === 401, 'prompt de lecture sans session : 401');

  // ---- Import des disponibilités avec congés, noms tolérants (noms fictifs) ----
  const elo = h.createEmployee('uA', { name: 'Élodie Fictive', constraintNote: 'Note fictive permanente' });
  const marc = h.createEmployee('uA', { name: 'Marc Imaginaire' });
  const serveur = h.listPositions('uA').find((p) => p.name === 'Serveur');
  [elo, marc].forEach((e) => h.setQualification('uA', e.id, serveur.id, 1));
  h.setAvailabilities('uA', W, marc.id, [{ day: W, start: '10:00', end: '23:00' }]);
  r = await call('POST', 'weeks/' + W + '/import/availabilities', { csv: 'nom;jour;début;fin;type\n"FICTIVE, elodie";2026-11-02;17:00;23:59;\n  marc   IMAGINAIRE ;2026-11-02;;;vacances\nmarc imaginaire;2026-11-03;;;Maladie\nPersonne Inconnue;2026-11-02;10:00;12:00;\n' }, 'uA');
  assert(r.status === 200 && r.body.employees === 2 && r.body.intervals === 1 && r.body.timeoff === 2 && r.body.unknown.join() === 'Personne Inconnue', 'import : congés lus, « Nom, Prénom », casse, accents et espaces tolérés');
  r = await call('GET', 'weeks/' + W + '/availabilities', undefined, 'uA');
  assert(r.body.timeoff.filter((t) => t.employeeId === marc.id).map((t) => t.day).join() === '2026-11-02,2026-11-03'
    && !r.body.availabilities.some((a) => a.employeeId === marc.id), 'GET : congés renvoyés ; un employé avec seulement des congés remplace sa semaine');
  assert(h.ownEmployee('uA', elo.id).constraintNote === 'Note fictive permanente', 'import des disponibilités : la note libre n\'est jamais touchée');
  r = await call('PUT', 'weeks/' + W + '/availabilities/' + elo.id, { timeoff: ['2026-11-04'] }, 'uA');
  assert(r.status === 200 && r.body.timeoff.length === 1 && r.body.availabilities.length === 1, 'PUT : case « vacances » ajoutée, plages des autres jours gardées');
  r = await call('PUT', 'weeks/' + W + '/availabilities/' + elo.id, { timeoff: ['2026-11-02'] }, 'uA');
  assert(r.status === 200 && r.body.availabilities.length === 0, 'PUT : un jour en vacances perd ses plages (une case = un état)');
  r = await call('PUT', 'weeks/' + W + '/availabilities/' + elo.id, { intervals: [{ day: W, start: '17:00', end: '23:59' }], timeoff: [] }, 'uA');
  assert(r.status === 200 && r.body.availabilities.length === 1 && r.body.timeoff.length === 0, 'PUT : case remise à « disponible »');
  assert((await call('PUT', 'weeks/' + W + '/availabilities/' + elo.id, { timeoff: ['2026-11-10'] }, 'uA')).status === 400, 'PUT : congé hors semaine refusé');
  assert((await call('PUT', 'weeks/' + W + '/availabilities/' + elo.id, {}, 'uA')).status === 400, 'PUT : ni plages ni congés refusé');
  assert((await call('PUT', 'weeks/' + W + '/availabilities/' + elo.id, { timeoff: [] }, 'uB')).status === 404, 'PUT : employé d\'un autre compte introuvable');

  // ---- Génération (congé respecté), modification manuelle, prompt d'inscription ----
  h.createNeed('uA', { positionId: serveur.id, weekday: 0, start: '17:00', end: '23:00', count: 2 });
  r = await call('POST', 'weeks/' + W + '/generate', undefined, 'uA');
  const gen1 = r.body.schedule;
  assert(gen1.assignments.length === 1 && gen1.assignments[0].employeeId === elo.id && gen1.alerts.some((a) => a.type === 'trou' && a.missing === 1), 'génération : l\'employé en vacances n\'est pas placé, trou signalé');
  r = await call('POST', 'weeks/2026-11-09/assignments', { employeeId: marc.id, positionId: serveur.id, day: '2026-11-09', start: '11:00', end: '15:00' }, 'uA');
  assert(r.status === 409, 'ajout d\'un quart dans une semaine sans horaire : 409');
  r = await call('POST', 'weeks/' + W + '/assignments', { employeeId: bruno.id, positionId: serveur.id, day: '2026-11-03', start: '11:00', end: '15:00' }, 'uA');
  const added = r.body.assignment;
  assert(r.status === 201 && added.employeeName === 'Bruno' && added.positionName === 'Serveur' && added.day === '2026-11-03', 'POST : quart ajouté à la main');
  assert((await call('POST', 'weeks/' + W + '/assignments', { employeeId: bruno.id, positionId: serveur.id, day: '2026-11-10', start: '11:00', end: '15:00' }, 'uA')).status === 400, 'POST : jour hors semaine refusé');
  assert((await call('POST', 'weeks/' + W + '/assignments', { employeeId: bruno.id, positionId: serveur.id, day: W, start: '11:00', end: '11:00' }, 'uA')).status === 400, 'POST : début = fin refusé');
  r = await call('PUT', 'weeks/' + W + '/assignments/' + added.id, { employeeId: marc.id, start: '12:00' }, 'uA');
  assert(r.status === 200 && r.body.assignment.employeeId === marc.id && r.body.assignment.start === '12:00' && r.body.assignment.end === '15:00', 'PUT : employé et début modifiés');
  assert((await call('PUT', 'weeks/' + W + '/assignments/' + added.id, { start: '25:00' }, 'uA')).status === 400, 'PUT : heure invalide refusée');
  assert((await call('PUT', 'weeks/' + W + '/assignments/' + added.id, { start: '13:00' }, 'uB')).status === 404, 'PUT : quart d\'un autre compte introuvable');
  assert((await call('PUT', 'weeks/2026-11-09/assignments/' + added.id, { start: '13:00' }, 'uA')).status === 404, 'PUT : quart d\'une autre semaine introuvable');
  assert((await call('DELETE', 'weeks/' + W + '/assignments/' + added.id, undefined, 'uB')).status === 404, 'DELETE : autre compte refusé');
  const g = (await call('GET', 'weeks/' + W, undefined, 'uA')).body.schedule;
  assert(g.assignments.length === 2 && g.assignments.some((a) => a.id === added.id && a.employeeId === marc.id), 'modification manuelle conservée (aucune régénération)');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA');
  const pl = r.text.split('\n');
  assert(r.status === 200 && /^text\/plain/.test(r.type) && r.cache === 'no-store'
    && pl.includes('- Marc Imaginaire ; 2026-11-03 ; mardi ; 12:00 ; 15:00 ; Serveur') && pl.includes('- Élodie Fictive ; 2026-11-02 ; lundi ; 17:00 ; 23:00 ; Serveur')
    && pl.includes('QUARTS À INSCRIRE (2)'), 'prompt d\'inscription : un quart par ligne (nom ; date ; jour ; début ; fin ; poste), modifications comprises');
  assert(!/dayforce|chatgpt|copilot/i.test(r.text) && !r.text.includes('Note fictive') && !r.text.includes('RÈGLES') && r.text.includes('brouillon') && r.text.includes('Déconnecte-toi')
    && r.text.includes('mode agent') && r.text.includes('Échecs'), 'prompt d\'inscription : rien de nommé, aucune note ni règle, brouillon, déconnexion, compte rendu');
  r = await call('DELETE', 'weeks/' + W + '/assignments/' + added.id, undefined, 'uA');
  assert(r.status === 200 && (await call('GET', 'weeks/' + W, undefined, 'uA')).body.schedule.assignments.length === 1, 'DELETE : quart retiré');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uB');
  assert(r.status === 409, 'autre compte : ne voit jamais l\'horaire du propriétaire (409, aucun horaire)');

  // ---- Bloc collé depuis l'IA : ``` autour, espaces, séparateur virgule ou tabulation ----
  r = await call('POST', 'weeks/' + W + '/import/availabilities', { csv: '\n  ```csv\nnom,jour,début,fin,type\nElodie Fictive,2026-11-05,10:00,15:00,\n```  \n' }, 'uA');
  assert(r.status === 200 && r.body.employees === 1 && r.body.intervals === 1 && !r.body.skipped.length, 'import : bloc de code collé (```), virgules');
  r = await call('POST', 'weeks/' + W + '/import/availabilities', { csv: '```\nnom\tjour\tdébut\tfin\ttype\nMarc Imaginaire\t2026-11-06\t\t\tabsence\n```' }, 'uA');
  assert(r.status === 200 && r.body.timeoff === 1, 'import : bloc collé, tabulations');

  // ---- Prompts modifiables par le gérant, retour à la base ----
  const P = require('../server/lib/horaire-prompt');
  r = await call('GET', 'prompts', undefined, 'uA');
  assert(r.status === 200 && r.body.importPrompt.isDefault && r.body.importPrompt.text.startsWith(P.IMPORT_PROMPT.slice(0, 40)) && r.body.entryPrompt.isDefault
    && r.body.entryPrompt.text === P.ENTRY_PROMPT && !r.body.entryPrompt.text.includes('QUARTS À INSCRIRE'), 'GET prompts : versions de base (consignes d\'inscription sans les quarts)');
  r = await call('PUT', 'prompts', { importPrompt: 'Lis mes dispos.\u0007\r\nMerci.', entryPrompt: 'Inscris ces quarts.' }, 'uA');
  assert(r.status === 200 && r.body.importPrompt.text === 'Lis mes dispos.\nMerci.' && !r.body.importPrompt.isDefault && r.body.entryPrompt.text === 'Inscris ces quarts.', 'PUT prompts : enregistrés, caractères de contrôle retirés');
  assert((await call('GET', 'import-prompt', undefined, 'uA')).text === 'Lis mes dispos.\nMerci.', 'GET import-prompt : texte personnalisé du gérant (réactivé pour la récupération)');
  await call('POST', 'weeks/' + W + '/generate', undefined, 'uA');
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA');
  assert(r.text.startsWith(P.ENTRY_PROMPT.trimEnd() + '\n\nSEMAINE : du lundi ' + W) && r.text.includes('QUARTS À INSCRIRE ('), 'prompt d\'inscription : consignes de base puis quarts');
  // Quart placé « à demander » : alerte « demander » enregistrée avec le nom
  {
    const sch = (await call('GET', 'weeks/' + W, undefined, 'uA')).body.schedule;
    const emp = h.listEmployees('uA')[0], pos = h.listPositions('uA')[0];
    if (sch && emp && pos) {
      r = await call('POST', 'weeks/' + W + '/assignments', { employeeId: emp.id, positionId: pos.id, day: W, start: '10:00', end: '14:00', ask: true }, 'uA');
      const al = (await call('GET', 'weeks/' + W, undefined, 'uA')).body.schedule.alerts;
      assert(r.status === 201 && al.some((a) => a.type === 'demander' && a.employeeId === emp.id && a.employeeName === emp.name && a.day === W), 'quart « à demander » : alerte « demander à X » enregistrée');
    }
  }
  r = await call('GET', 'import-prompt?week=2026-11-02', undefined, 'uB');
  assert(r.text.startsWith('SEMAINE À LIRE : du lundi 2 novembre au dimanche 8 novembre 2026.') && r.text.includes('pour la semaine indiquée en tête de ce message') && !r.text.includes('lundi suivant'), 'prompt de récupération : semaine affichée en tête, plus de « lundi suivant »');
  await call('PUT', 'prompts', { importPrompt: "Lis les dispos pour la semaine qui commence le lundi suivant la date d'aujourd'hui (si aujourd'hui est lundi, prends le lundi suivant)." }, 'uA');
  r = await call('GET', 'import-prompt?week=2026-11-02', undefined, 'uA');
  const ed = (await call('GET', 'prompts', undefined, 'uA')).body.importPrompt.text;
  assert(r.text.startsWith('SEMAINE À LIRE : du lundi 2 novembre') && !r.text.includes('lundi suivant') && !ed.includes('lundi suivant') && ed.includes('indiquée en tête'), 'ancien texte personnalisé : ancienne tournure remplacée à la lecture');
  assert(require('../server/lib/horaire-prompt').importPromptFor('2026-10-26').includes('du lundi 26 octobre au dimanche 1er novembre 2026'), 'prompt de récupération : « 1er »');
  await call('PUT', 'prompts', { importPrompt: 'Lis mes dispos, merci.' }, 'uA');
  r = await call('GET', 'import-prompt?week=2026-11-02', undefined, 'uA');
  assert(r.text === 'SEMAINE À LIRE : du lundi 2 novembre au dimanche 8 novembre 2026.\n\nLis mes dispos, merci.', 'prompt de récupération modifié : texte du gérant, dates de la semaine toujours en tête');
  await call('PUT', 'prompts', { importPrompt: null }, 'uA');
  r = await call('GET', 'import-prompt?week=2026-11-02', undefined, 'uA');
  assert(r.text.includes(P.IMPORT_PROMPT.slice(0, 40)) && r.text.includes('du lundi 2 novembre au dimanche 8 novembre 2026'), 'retour à la version de base : texte d’origine, dates présentes');
  r = await call('GET', 'prompts', undefined, 'uB');
  assert(r.body.importPrompt.isDefault && r.body.entryPrompt.isDefault && (await call('GET', 'import-prompt', undefined, 'uB')).text === P.IMPORT_PROMPT, 'autre compte : garde les versions de base');
  assert((await call('PUT', 'prompts', { entryPrompt: 'x'.repeat(8001) }, 'uA')).status === 400, 'PUT prompts : plus de 8 000 caractères refusé');
  assert((await call('PUT', 'prompts', { entryPrompt: 42 }, 'uA')).status === 400 && (await call('PUT', 'prompts', {}, 'uA')).status === 400, 'PUT prompts : valeur non texte ou vide refusée');
  r = await call('PUT', 'prompts', { importPrompt: null, entryPrompt: '' }, 'uA');
  assert(r.status === 200 && r.body.importPrompt.isDefault && r.body.importPrompt.text.startsWith(P.IMPORT_PROMPT.slice(0, 40)) && r.body.entryPrompt.isDefault, 'PUT prompts : null ou "" rétablit la version de base');
  assert((await call('GET', 'weeks/' + W + '/prompt', undefined, 'uA')).text.startsWith(P.ENTRY_PROMPT.trimEnd() + '\n\nSEMAINE'), 'prompt d\'inscription : consignes de base rétablies');

  // ---- Contraintes strictes de l'employé : jamais de double, repos après un quart ----
  r = await call('POST', 'employees', { name: 'Zoé Exemple', noDouble: true }, 'uA');
  assert(r.status === 201 && r.body.employee.noDouble === true && r.body.employee.restAfterShift === false, 'POST : jamais de double');
  r = await call('PUT', 'employees/' + r.body.employee.id, { restAfterShift: true, noDouble: false }, 'uA');
  assert(r.status === 200 && r.body.employee.noDouble === false && r.body.employee.restAfterShift === true, 'PUT : repos après un quart');
  assert((await call('PUT', 'employees/' + r.body.employee.id, { noDouble: 'oui' }, 'uA')).status === 400, 'PUT : valeur non booléenne refusée');
  const r3 = h.importEmployeesCsv('uA', 'nom;jamais de double;repos après un quart\nZoé Exemple;oui;non\nYves Modèle;non;oui\nXavier Test;peut-être;\n');
  const zoe = h.listEmployees('uA').find((e) => e.name === 'Zoé Exemple'), yves = h.listEmployees('uA').find((e) => e.name === 'Yves Modèle');
  assert(r3.updated === 1 && r3.created === 1 && r3.skipped.length === 1 && (() => { const rs = h.listEmployeeRules('uA'); const has = (e, k) => rs.some((x) => x.employeeId === e.id && x.rule === k); return has(zoe, 'noDouble') && !has(zoe, 'restAfterShift') && has(yves, 'restAfterShift'); })(), 'import CSV : colonnes oui/non devenues règles de l’employé, valeur illisible écartée');
  const ex2 = require('../server/lib/dataexport').buildUserExport('uA');
  assert(ex2.horaire.timeoff.length >= 1 && ex2.horaire.employeeRules.some((x) => x.rule === 'noDouble'), 'export du compte : congés et règles inclus');
  M.setModules('uB', { horaire: false, stats: true });
  r = await call('GET', 'weeks/' + W + '/prompt', undefined, 'uB');
  assert(r.status === 403 && r.body.code === 'module_off', 'module Horaire éteint : 403');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 6 }, 'uA');
  assert(r.status === 400, 'PUT : min > max existant refusé');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMax: 15 }, 'uA');
  assert(r.status === 400, 'PUT : quarts hors bornes refusés');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 4, constraintNote: 'x'.repeat(501) }, 'uA');
  assert(r.status === 400, 'PUT : contrainte trop longue refusée');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 4, wantShiftsMax: 5, constraintNote: '' }, 'uA');
  assert(r.status === 200 && r.body.employee.wantShiftsMin === 4 && r.body.employee.constraintNote === null, 'PUT : quarts modifiés, contrainte effacée');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsTarget: 6 }, 'uA');
  assert(r.status === 200 && r.body.employee.wantShiftsTarget === 6, 'PUT : cible (quarts) au-dessus du max acceptée');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsTarget: 3 }, 'uA');
  assert(r.status === 200 && r.body.employee.wantShiftsTarget === 3, 'PUT : cible (quarts) sous le min acceptée');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsTarget: 5 }, 'uA');
  assert(r.status === 200 && r.body.employee.wantShiftsTarget === 5, 'PUT : cible entre le min et le max enregistrée');
  r = await call('PUT', 'employees/' + alice.id, { sortOrder: 3 }, 'uA');
  assert(r.status === 200 && r.body.employee.sortOrder === 3, 'PUT : ordre dans la catégorie enregistré');
  assert((await call('PUT', 'employees/' + alice.id, { sortOrder: -1 }, 'uA')).status === 400, 'PUT : ordre négatif refusé');
  r = await call('POST', 'employees', { name: 'Chloé', wantShiftsMin: 2, wantShiftsMax: 3, constraintNote: 'Pas le dimanche' }, 'uA');
  assert(r.status === 201 && r.body.employee.wantShiftsMax === 3 && r.body.employee.constraintNote === 'Pas le dimanche', 'POST : nouveaux champs à la création');
  r = await call('PUT', 'employees/' + alice.id, { wantShiftsMin: 1 }, 'uB');
  assert(r.status === 403 || r.status === 404, 'autre compte : employé du propriétaire inaccessible');
  server.close();
  console.log(failed ? '\n' + failed + ' échec(s)' : '\nTous les tests passent.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
