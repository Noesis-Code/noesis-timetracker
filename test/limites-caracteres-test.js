// Usage : node test/limites-caracteres-test.js — limites de taille et caractères spéciaux (Basic n°16), serveur réel sur données temporaires.
// Titre de tâche, nom d'activité, note de chrono/historique, message de discussion : 10 000 caractères refusés avec un message clair
// (jamais de 500, jamais de troncature), emoji (ZWJ, drapeaux), RTL, HTML/JS, très long mot, contrôles et sauts de ligne.
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;

const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}'; // 👨‍👩‍👧‍👦 : 7 points de code, 11 unités UTF-16
const FLAG = '\u{1F1E8}\u{1F1E6}';                                        // 🇨🇦 : 2 points de code
const RTL = 'مرحبا بالعالم שלום עולם';
const XSS = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', "' onmouseover='alert(1)"];
const WORD = 'W'.repeat(250);

(async () => {
  const s = await startServer();
  try {
    const u = await newUser(s.base, 'lim');
    const { c, activityId: A } = u;
    const base = `/api/activities/${A}/goals/categories`;
    const pole = (await c.post(base, { label: 'Pôle limites' })).body.categories.find((x) => x.label === 'Pôle limites').key;
    const ok = (r) => r.status < 500;

    // --- Titre de tâche (création) : 300 caractères visibles maximum ---
    const mk = (label) => c.post(`${base}/${pole}/tasks`, { label });
    let r = await mk('x'.repeat(10000));
    assert(r.status === 400 && /trop long.*300/.test(r.body.error), '10 000 caractères : refus 400 avec message clair (' + (r.body && r.body.error) + ')');
    r = await mk('😀'.repeat(300));
    assert(r.status === 201 && r.body.label === '😀'.repeat(300), '300 emoji (600 unités UTF-16) : acceptés, intacts');
    r = await mk('😀'.repeat(301));
    assert(r.status === 400, '301 emoji : refus (jamais coupé en deux)');
    r = await mk(FAMILY.repeat(40));
    assert(r.status === 201 && r.body.label === FAMILY.repeat(40), 'séquences ZWJ (famille) : conservées intactes');
    r = await mk(FLAG.repeat(30) + ' ' + FLAG);
    assert(r.status === 201 && r.body.label === FLAG.repeat(30) + ' ' + FLAG, 'drapeaux : conservés intacts');
    r = await mk(RTL);
    assert(r.status === 201 && r.body.label === RTL, 'caractères de droite à gauche : conservés');
    for (const x of XSS) { r = await mk(x); assert(r.status === 201 && r.body.label === x, 'HTML/JS stocké tel quel (échappé à l\'affichage) : ' + x.slice(0, 22)); }
    r = await mk(WORD);
    assert(r.status === 201 && r.body.label === WORD, 'très long mot sans espace : accepté');
    r = await mk('ligne1\nligne2\r\nligne3');
    assert(r.status === 201 && r.body.label === 'ligne1 ligne2 ligne3', 'sauts de ligne d\'un titre : remplacés par des espaces');
    r = await mk('a\u0000b\u0007c\u001bd‎e');
    assert(r.status === 201 && r.body.label === 'abcd‎e', 'caractères de contrôle retirés (NUL, BEL, ESC), marque de direction conservée');
    for (const bad of [12345, {}, [], true, null, '   ', '\u0000\u0001']) {
      r = await mk(bad);
      assert(r.status === 400 || r.status === 201 && false, 'titre non texte ou vide refusé en 400 : ' + JSON.stringify(bad));
    }

    // --- Titre de tâche (modification) ---
    const id = (await mk('à renommer')).body.id;
    const ren = (label) => c.put(`/api/sub-project-items/${id}`, { label });
    r = await ren('y'.repeat(10000));
    assert(r.status === 400 && /trop long/.test(r.body.error), 'renommer en 10 000 caractères : 400 clair');
    r = await ren(FAMILY.repeat(40) + ' <b>x</b>');
    assert(r.status === 200 && r.body.label === FAMILY.repeat(40) + ' <b>x</b>', 'renommer avec ZWJ + HTML : intact');
    r = await ren('un\ndeux');
    assert(r.status === 200 && r.body.label === 'un deux', 'renommer avec saut de ligne : espace');
    r = await ren(42);
    assert(r.status === 400, 'renommer avec un nombre : 400, pas 500');

    // --- Nom d'activité : 120 caractères visibles ---
    r = await c.post('/api/activities', { name: 'n'.repeat(10000) });
    assert(r.status === 400 && /trop long.*120/.test(r.body.error), "nom d'activité de 10 000 caractères : 400 clair");
    r = await c.post('/api/activities', { name: '😀'.repeat(120) });
    assert(r.status === 201 && r.body.name === '😀'.repeat(120), "nom de 120 emoji : accepté intact");
    r = await c.post('/api/activities', { name: '😀'.repeat(121) });
    assert(r.status === 400, 'nom de 121 emoji : refusé');
    r = await c.post('/api/activities', { name: FAMILY + ' ' + RTL });
    assert(r.status === 201 && r.body.name === FAMILY + ' ' + RTL, 'nom avec ZWJ + RTL : intact');
    const aid2 = r.body.id;
    r = await c.post('/api/activities', { name: '<script>alert(1)</script>' });
    assert(r.status === 201 && r.body.name === '<script>alert(1)</script>', "nom HTML : stocké tel quel");
    for (const bad of [123, {}, []]) { r = await c.post('/api/activities', { name: bad }); assert(r.status === 400, 'nom non texte : 400 (' + JSON.stringify(bad) + ')'); }
    r = await c.post('/api/activities', { name: 'deux\nlignes' });
    assert(r.status === 201 && r.body.name === 'deux lignes', "saut de ligne d'un nom : espace");
    r = await c.put(`/api/activities/${aid2}`, { name: 'z'.repeat(10000) });
    assert(r.status === 400 && /trop long/.test(r.body.error), 'renommer une activité en 10 000 caractères : 400');
    r = await c.put(`/api/activities/${aid2}`, { name: 77 });
    assert(r.status === 400, 'renommer une activité avec un nombre : 400');
    r = await c.put(`/api/activities/${aid2}`, { name: 'Renommée ' + FLAG });
    assert(r.status === 200 && r.body.name === 'Renommée ' + FLAG, 'renommage avec drapeau : intact');

    // --- Capture libre (« j'ai une tâche ») : mode sans IA, mêmes règles ---
    assert((await c.put(`/api/profile/${u.id}/ai-mode`, { mode: 'absence' })).status === 200, 'mode « absence » (sans IA) choisi');
    const cap = (label) => c.post('/api/goals/capture', { activityIds: [A], label });
    r = await cap('c'.repeat(10000));
    assert(r.status === 400 && /trop long/.test(r.body.error), 'capture de 10 000 caractères : 400 clair');
    for (const bad of [12345, {}, [], null]) { r = await cap(bad); assert(r.status === 400, 'capture non texte : 400 (' + JSON.stringify(bad) + ')'); }
    r = await cap('Appeler ' + FAMILY + ' ' + FLAG + ' ' + RTL + ' <b>x</b>\nsuite');
    assert(ok(r) && (r.status === 201), 'capture ZWJ/drapeau/RTL/HTML/saut de ligne : ni erreur ni 500 (' + r.status + ')');
    const created = JSON.stringify(r.body);
    assert(created.includes('Appeler ' + FAMILY + ' ' + FLAG + ' ' + RTL + ' <b>x</b> suite'), 'capture : titre intact, saut de ligne remplacé par une espace');

    // --- Note de chrono (arrêt) : 5 000 caractères visibles ---
    await c.post('/api/timer/start', { activityId: A });
    r = await c.post('/api/timer/stop', { note: 'n'.repeat(10000) });
    assert(r.status === 400 && /Note trop longue.*5000/.test(r.body.error), 'note de chrono de 10 000 caractères : 400 clair, chrono toujours en cours');
    r = await c.get('/api/timer/status');
    assert(r.status === 200 && r.body && r.body.running === true, 'chrono non perdu après le refus');
    const noteOk = FAMILY.repeat(100) + '\n' + FLAG + ' ' + RTL + '\n<img src=x onerror=alert(1)>\n' + '😀'.repeat(4000);
    r = await c.post('/api/timer/stop', { note: noteOk + '\u0000' });
    assert(ok(r) && r.status === 200, 'note avec ZWJ/RTL/HTML/4000 emoji : arrêt accepté (' + r.status + ')');
    let hist = await c.get('/api/history?period=week');
    const list = Array.isArray(hist.body) ? hist.body : (hist.body && (hist.body.entries || hist.body.items)) || [];
    const saved = list.find((e) => e.note === noteOk);
    assert(!!saved, 'note enregistrée sans aucune troncature, sauts de ligne conservés, contrôle retiré');
    await c.post('/api/timer/start', { activityId: A });
    r = await c.post('/api/timer/stop', { note: 12345 });
    assert(r.status === 400, 'note non texte à l\'arrêt : 400, pas 500');
    r = await c.post('/api/timer/stop', {});
    assert(r.status === 200, 'arrêt sans note : accepté');

    // --- Note de l'historique (ajout / modification) ---
    const now = Date.now();
    const when = (h0, h1) => ({ startTime: new Date(now - h0 * 3600e3).toISOString(), endTime: new Date(now - h1 * 3600e3).toISOString() });
    r = await c.post('/api/history', Object.assign({ activityId: A, note: 'h'.repeat(10000) }, when(8, 7)));
    assert(r.status === 400 && /Note trop longue/.test(r.body.error), 'ajout manuel avec note de 10 000 caractères : 400 clair');
    r = await c.post('/api/history', Object.assign({ activityId: A, note: 99 }, when(8, 7)));
    assert(r.status === 400, 'ajout manuel avec note numérique : 400');
    r = await c.post('/api/history', Object.assign({ activityId: A, note: FAMILY + '\n' + RTL }, when(8, 7)));
    assert(r.status === 201, 'ajout manuel avec ZWJ/RTL/saut de ligne : 201');
    const hid = r.body.id;
    r = await c.put(`/api/history/${hid}`, { note: 'm'.repeat(10000) });
    assert(r.status === 400 && /Note trop longue/.test(r.body.error), 'modifier une note en 10 000 caractères : 400 clair');
    r = await c.put(`/api/history/${hid}`, { note: { x: 1 } });
    assert(r.status === 400, 'modifier une note avec un objet : 400, pas 500');
    r = await c.put(`/api/history/${hid}`, { note: FLAG.repeat(2000) });
    assert(r.status === 200, 'modifier une note avec 2 000 drapeaux : 200');
    hist = await c.get('/api/history?period=week');
    const l2 = Array.isArray(hist.body) ? hist.body : (hist.body && (hist.body.entries || hist.body.items)) || [];
    assert(l2.some((e) => e.id === hid && e.note === FLAG.repeat(2000)), 'note de 2 000 drapeaux relue intacte');

    // --- Message de discussion (activité partagée) : 2 000 caractères visibles ---
    const { DatabaseSync } = require('node:sqlite'); const dbc = new DatabaseSync(require('path').join(s.dir, 'noesis.db'));
    const b = await newUser(s.base, 'limB');
    dbc.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#8b5cf6',?)").run(A, b.id, new Date().toISOString());
    const say = (body) => c.post('/api/community/activity-messages', { activityId: A, body });
    r = await say('m'.repeat(10000));
    assert(r.status === 400 && /trop long.*2000/.test(r.body.error), 'message de 10 000 caractères : 400 clair');
    r = await say('😀'.repeat(2000));
    assert(r.status === 201 && r.body.body === '😀'.repeat(2000), '2 000 emoji (4 000 unités UTF-16) : acceptés intacts');
    r = await say('😀'.repeat(2001));
    assert(r.status === 400, '2 001 emoji : refusés');
    r = await say(FAMILY + '\n' + RTL + '\n<script>alert(1)</script>\u0000');
    assert(r.status === 201 && r.body.body === FAMILY + '\n' + RTL + '\n<script>alert(1)</script>', 'message ZWJ/RTL/HTML multi-ligne : intact, contrôle retiré');
    r = await say({ x: 1 });
    assert(r.status === 400, 'message objet : 400, pas 500');
    r = await say(WORD.repeat(7));
    assert(r.status === 201, 'très long mot sans espace (1 750 caractères) : accepté');
    const got = await b.c.get(`/api/community/activity-messages?activityId=${A}`);
    assert(got.status === 200 && got.body.messages.some((m) => m.body === '😀'.repeat(2000)), "l'autre membre relit le message de 2 000 emoji intact");

    // --- Export Loi 25 : tout ressort tel quel, JSON valide ---
    const ex = await c.get('/api/profile/export');
    assert(ex.status === 200 && ex.body && ex.body.user, 'export : 200 avec ces textes');
    const exTxt = JSON.stringify(ex.body);
    assert(exTxt.includes(FAMILY.repeat(40)) && exTxt.includes('<script>alert(1)</script>') && exTxt.includes(RTL), 'export : ZWJ, RTL et HTML présents intacts');
    assert(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(exTxt), "export : aucune moitié d'emoji (substitut isolé)");

    // --- Jamais d'erreur 500 nulle part, même pour des corps absurdes ---
    const bodies = [{}, { label: null }, { name: null }, { note: [] }, { body: 5 }, { label: 'x'.repeat(200000) }];
    for (const bd of bodies) {
      for (const [m, url] of [['post', `${base}/${pole}/tasks`], ['post', '/api/activities'], ['post', '/api/timer/stop'], ['post', '/api/community/activity-messages'], ['post', '/api/history']]) {
        const rr = await c[m](url, bd);
        if (rr.status >= 500) assert(false, 'aucune erreur 500 : ' + url + ' ' + JSON.stringify(bd).slice(0, 40) + ' -> ' + rr.status);
      }
    }
    assert(true, 'corps absurdes : aucune erreur 500');
  } finally { s.stop(); }
  console.log(T.failed ? `\n${T.failed} échec(s)` : '\nTout est vert');
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
