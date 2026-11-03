// Réseau personnel privé (CRM + graphe). Usage : node test/reseau-perso-test.js
const { startServer, makeCounter, newUser } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
const DAY = 86400000;

(async () => {
  const s = await startServer();
  try {
    const A = await newUser(s.base, 'na'); const B = await newUser(s.base, 'nb');
    for (const u of [A, B]) await u.c.put(`/api/profile/${u.id}/modules`, { modules: { community: true, profile: true } });
    const mk = async (o) => (await A.c.post('/api/network/contacts', o)).body;

    // --- Création et validation ---
    assert((await A.c.post('/api/network/contacts', { name: '  ' })).status === 400, 'nom vide refusé');
    assert((await A.c.post('/api/network/contacts', { name: 'x'.repeat(81) })).status === 400, 'nom trop long refusé');
    assert((await A.c.post('/api/network/contacts', { name: 'X', strength: 6 })).status === 400, 'force hors 1-5 refusée');
    assert((await A.c.post('/api/network/contacts', { name: 'X', strength: 2.5 })).status === 400, 'force non entière refusée');
    assert((await A.c.post('/api/network/contacts', { name: 'X', interests: 'AI' })).status === 400, 'étiquettes non tableau refusées');
    assert((await A.c.post('/api/network/contacts', { name: 'X', interests: Array.from({ length: 11 }, (_, i) => 't' + i) })).status === 400, '11 étiquettes refusées');
    assert((await A.c.post('/api/network/contacts', { name: 'X', skills: ['y'.repeat(31)] })).status === 400, 'étiquette de 31 caractères refusée');
    assert((await A.c.post('/api/network/contacts', { name: 'X', followUpAt: 'pas une date' })).status === 400, 'relance invalide refusée');
    const ana = await A.c.post('/api/network/contacts', { name: 'Ana Roy', company: 'Mines Nord', role: 'Géologue', whereMet: 'PDAC 2026', city: 'Montréal', interests: ['Mining', 'mining', 'Macro'], skills: ['Technical Geology'], strength: 5 });
    assert(ana.status === 201 && ana.body.strength === 5 && ana.body.interests.length === 2 && ana.body.degree === 0 && ana.body.notesCount === 0, 'création : étiquettes dédoublonnées, défauts');
    const bob = await mk({ name: 'Bob Lévesque', company: 'Mines Nord', city: 'Québec', interests: ['Mining', 'Macro'], skills: ['Capital Raising'], whereMet: 'VRIC' });
    const cat = await mk({ name: 'Cathy Tran', company: 'Orbite', city: 'Montréal', interests: ['AI'], skills: ['Design'], strength: 4 });
    await mk({ name: 'Dan Pelletier', company: 'Orbite', interests: ['AI'], strength: 1 });
    assert(bob.strength === 3, 'force par défaut = 3');

    // --- Privé ---
    assert((await B.c.get('/api/network/contacts')).body.contacts.length === 0, 'autre compte : liste vide');
    assert((await B.c.get(`/api/network/contacts/${ana.body.id}`)).status === 404, 'autre compte : fiche 404');
    assert((await B.c.put(`/api/network/contacts/${ana.body.id}`, { name: 'Pirate' })).status === 404, 'autre compte : modification 404');
    assert((await B.c.del(`/api/network/contacts/${ana.body.id}`)).status === 404, 'autre compte : suppression 404');
    assert((await B.c.post(`/api/network/contacts/${ana.body.id}/notes`, { body: 'x' })).status === 404, 'autre compte : note 404');
    const bc = await B.c.post('/api/network/contacts', { name: 'Zed' });
    assert((await B.c.put('/api/network/edges', { a: ana.body.id, b: bc.body.id, linked: true })).status === 404, 'autre compte : lien vers le contact d\'autrui refusé');
    assert((await B.c.get('/api/network/graph')).body.nodes.length === 1, 'autre compte : graphe à lui seul');
    assert((await B.c.get('/api/network/overview')).body.contacts === 1, 'autre compte : synthèse à lui seul');

    // --- Notes ---
    const n1 = await A.c.post(`/api/network/contacts/${ana.body.id}/notes`, { body: 'Parle de lithium au café' });
    assert(n1.status === 201 && n1.body.id, 'note créée');
    assert((await A.c.post(`/api/network/contacts/${ana.body.id}/notes`, { body: '  ' })).status === 400, 'note vide refusée');
    assert((await A.c.post(`/api/network/contacts/${ana.body.id}/notes`, { body: 'x'.repeat(2001) })).status === 400, 'note de 2001 caractères refusée');
    let det = (await A.c.get(`/api/network/contacts/${ana.body.id}`)).body;
    assert(det.notes.length === 1 && det.notesCount === 1 && det.lastTouchAt, 'fiche : note listée, dernier contact mis à jour');
    assert((await A.c.get('/api/network/contacts?q=lithium')).body.contacts.length === 1, 'recherche dans le texte des notes');
    assert((await B.c.del(`/api/network/notes/${n1.body.id}`)).status === 404, 'autre compte : suppression de note 404');
    assert((await A.c.del(`/api/network/notes/${n1.body.id}`)).status === 200, 'note supprimée');

    // --- Filtres ---
    const q = async (qs) => (await A.c.get('/api/network/contacts?' + qs)).body.contacts.map((c) => c.name);
    assert((await q('q=mines+geologue')).join() === 'Ana Roy', 'q : mots (ET) sur plusieurs champs');
    assert((await q('q=quebec')).join() === 'Bob Lévesque', 'q : insensible aux accents');
    assert((await q('interest=MACRO')).length === 2, 'interest : égalité sans casse');
    assert((await q('interest=Mining,Macro&skill=capital%20raising')).join() === 'Bob Lévesque', 'interest + skill multiples (ET)');
    assert((await q('company=mines%20nord')).length === 2 && (await q('city=montreal')).length === 2, 'company, city');
    assert((await q('met=vric')).join() === 'Bob Lévesque', 'met');
    assert((await q('strength=4')).join() === 'Cathy Tran' && (await q('minStrength=4')).length === 2, 'strength, minStrength');
    assert((await q('idleDays=1')).length === 0, 'idleDays : contacts créés à l\'instant exclus');

    // --- Arêtes ---
    const link = (a, b, linked) => A.c.put('/api/network/edges', { a, b, linked });
    assert((await link(ana.body.id, ana.body.id, true)).status === 400, 'lien à soi-même refusé');
    assert((await link(ana.body.id, 99999, true)).status === 404, 'lien vers un contact inexistant refusé');
    assert((await A.c.put('/api/network/edges', { a: ana.body.id, b: bob.id, linked: 'oui' })).status === 400, 'linked non booléen refusé');
    assert((await link(bob.id, ana.body.id, true)).body.ok && (await link(ana.body.id, bob.id, true)).body.ok, 'lien créé (deux fois, sans doublon)');
    det = (await A.c.get(`/api/network/contacts/${ana.body.id}`)).body;
    assert(det.degree === 1 && det.connections.length === 1 && det.connections[0].id === bob.id, 'fiche : connexions');

    // --- Synthèse ---
    const ov = (await A.c.get('/api/network/overview')).body;
    assert(ov.contacts === 4 && ov.strong === 2 && ov.addedThisMonth === 4 && ov.pctThisMonth === null && ov.edges === 1 && ov.recent.length === 4, 'synthèse : totaux, croissance nulle (rien avant)');

    // --- Insights ---
    await link(bob.id, cat.id, true); // Ana - Bob - Cathy : Ana et Cathy partagent Bob
    const ins = (await A.c.get('/api/network/insights')).body;
    const key = (x, y) => [x, y].sort().join();
    const pair = ins.intros.find((i) => key(i.a.id, i.b.id) === key(ana.body.id, cat.id));
    assert(pair && pair.via.length === 1 && pair.via[0].id === bob.id, 'intro : deux contacts non reliés avec un contact en commun');
    assert(!ins.intros.some((i) => key(i.a.id, i.b.id) === key(ana.body.id, bob.id)), 'intro : paire déjà reliée exclue');
    const eve = await mk({ name: 'Eve Martel', interests: ['Mining', 'Macro'] });
    assert((await A.c.get('/api/network/insights')).body.intros.some((i) => (i.a.id === eve.id || i.b.id === eve.id) && i.shared.length === 2), 'intro : 2 étiquettes communes sans contact commun');
    assert(ins.bridges.length === 1 && ins.bridges[0].id === bob.id && ins.bridges[0].clusters === 2, 'pont : Bob sépare le graphe');
    assert(ins.underConnected.some((c) => c.id === cat.id) && !ins.underConnected.some((c) => c.id === bob.id), 'à mieux relier : fort et peu relié');
    // Relances : l'inactivité dépend de dates passées, vérifiée en base ; ici échéance et contacts récents.
    const fresh = await mk({ name: 'Inès Fort', strength: 5 });
    const weak = await mk({ name: 'Fred Faible', strength: 1 });
    const due = await mk({ name: 'Gina Echeance', strength: 3, followUpAt: new Date(Date.now() - 3 * DAY).toISOString() });
    const fu = (await A.c.get('/api/network/insights')).body.followUps;
    assert(fu.length === 1 && fu[0].reason === 'echeance' && fu[0].contact.id === due.id && fu[0].sinceDays === 3, 'relance : échéance dépassée');
    assert(!fu.some((f) => f.contact.id === fresh.id || f.contact.id === weak.id), 'relance : contacts récents ou de force 1 absents');
    await A.c.put(`/api/network/contacts/${due.id}`, { touch: true, followUpAt: null });
    assert((await A.c.get('/api/network/insights')).body.followUps.length === 0, 'relance : disparaît quand le contact est touché et l\'échéance retirée');

    // --- Mise à jour, tags, suppression ---
    const up = await A.c.put(`/api/network/contacts/${cat.id}`, { role: 'Cheffe', strength: 2 });
    assert(up.status === 200 && up.body.role === 'Cheffe' && up.body.strength === 2 && up.body.name === 'Cathy Tran', 'mise à jour partielle');
    assert((await A.c.put(`/api/network/contacts/${cat.id}`, { strength: 9 })).status === 400, 'mise à jour : force invalide refusée');
    const tg = (await A.c.get('/api/network/tags')).body;
    assert(tg.interests[0].count === 3 && tg.companies[0].count === 2 && tg.events.length >= 2 && tg.cities.length >= 2, 'tags : triés par fréquence');
    const gr = (await A.c.get('/api/network/graph')).body;
    assert(gr.nodes.length === 8 && gr.edges.length === 2 && gr.edges.every((e) => e.a < e.b), 'graphe : noeuds et arêtes (a < b)');
    assert((await A.c.del(`/api/network/contacts/${bob.id}`)).status === 200, 'contact supprimé');
    assert((await A.c.get('/api/network/graph')).body.edges.length === 0, 'suppression : ses liens disparaissent');
    assert((await A.c.get(`/api/network/contacts/${bob.id}`)).status === 404, 'contact supprimé introuvable');

    // --- Module désactivé ---
    await B.c.put(`/api/profile/${B.id}/modules`, { modules: { community: false, profile: false } });
    const offB = await B.c.get('/api/network/overview');
    assert(offB.status === 403 && offB.body.code === 'module_off', 'module éteint : 403 module_off');

    // --- Ville de travail (globe : habitation d'abord, sinon travail) ---
    const wc = await A.c.post('/api/network/contacts', { name: 'Globe Test', city: 'Longueuil', workCity: 'Montréal' });
    assert(wc.status === 201, 'contact avec ville de travail créé');
    const wcId = wc.body.id || (wc.body.contact && wc.body.contact.id);
    const wg = (await A.c.get('/api/network/graph')).body.nodes.find((n) => n.name === 'Globe Test');
    assert(wg && wg.city === 'Longueuil' && wg.workCity === 'Montréal', 'le graphe expose habitation et travail');
    assert((await A.c.get('/api/network/contacts?city=montreal')).body.contacts.some((c) => c.name === 'Globe Test'), 'filtre ville : trouve aussi par la ville de travail');
    if (wcId) await A.c.del('/api/network/contacts/' + wcId);

    // --- Limite de 500 contacts ---
    const total = (await A.c.get('/api/network/overview')).body.contacts;
    let last = 201;
    for (let i = total; i < 500 && last === 201; i++) last = (await A.c.post('/api/network/contacts', { name: 'Bulk ' + i })).status;
    assert(last === 201 && (await A.c.get('/api/network/overview')).body.contacts === 500, '500 contacts atteints');
    assert((await A.c.post('/api/network/contacts', { name: 'Un de trop' })).status === 400, '501e contact refusé');
    assert((await A.c.get('/api/network/contacts')).body.contacts.length === 500, 'liste limitée à 500');
  } finally { s.stop(); }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
