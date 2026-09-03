// test15.js — suite navigateur (Playwright) : sous-projets d'une activité,
// sections à la demande, sondages — et NON-RÉGRESSION de la généralisation du
// composeur de messages.
//
// Le point le plus sensible de ce chantier n'est pas le nouveau code : c'est
// que mountProfilePostsComposer (zone Discussion du Profil et zone "écrire à
// sa communauté", propriété de Profil et de Communauté) est devenu un appel
// préconfiguré de mountMessageThread. Cette suite vérifie donc autant les deux
// zones EXISTANTES que la nouvelle.
//
// Lancement : node test15.js  (serveur sur :3000, base VIERGE, playwright installé)

const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
function ok(cond, label) { if (cond) passed++; else { failed++; console.log('  ✗ ' + label); } }

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { method, path, body });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE);

  // --- Profil + activité créés par l'API, puis injectés dans le navigateur ---
  const stamp = Date.now();
  const name = 'UITest' + stamp;
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550123', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil créé');
  const activity = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'Act' + stamp })).body;
  ok(!!activity.id, '0.2 activité créée');

  // STORAGE_KEY = 'noesis_profile' dans public/app.js.
  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden')),
    '0.3 application ouverte (pas bloquée sur l\'onboarding)');

  // --- Onglet Activité, activité SOLO ---
  // ⚠️ Depuis le 3 septembre 2026 (discussion "Activité — général"), une
  // activité SOLO sans aucun sous-projet n'ouvre pas de page : elle déplie un
  // formulaire de création sur place. On crée donc le premier sous-projet par
  // l'API, puis le clic sur la ligne ouvre bien la page de l'activité.
  const sp1 = (await api(page, 'POST', '/api/activities/' + activity.id + '/sub-projects', {
    userId: user.id, name: 'Refonte',
  })).body;
  ok(!!sp1.id, '1.0 premier sous-projet créé');

  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(700);
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(1100);
  ok(await page.isVisible('#activityPage'), '1.1 la page de l\'activité s\'ouvre, même en SOLO');
  ok(await page.isVisible('#activitySubProjectsBlock'), '1.2 bloc Sous-projets présent');
  ok(!(await page.isVisible('#activityProgressWrap')), '1.4 R1 — aucune barre d\'avancement tant qu\'il n\'y a aucune tâche');
  // Activité solo : la partie "membres" est volontairement masquée.
  ok(!(await page.isVisible('#communityDiscussionBlock')), '1.5 activité solo : le fil des membres est masqué');
  ok(!(await page.isVisible('#communityActivityMembersPart')), '1.6 activité solo : les stats des membres sont masquées');

  // --- Le sous-projet est né VIDE ---
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '2.1 le sous-projet est listé');
  ok((await page.textContent('#subProjectsList .subProjectBadge')).indexOf('vide') !== -1,
    '2.2 un sous-projet sans rien affiche "vide", pas "0 %"');

  await page.click('#subProjectsList .subProjectRowHeader');
  await page.waitForTimeout(800);
  ok(await page.isVisible('#subProjectDetail'), '2.3 détail du sous-projet ouvert');
  ok(await page.evaluate(() => !!document.querySelector('#subProjectsList .subProjectRow #subProjectDetail')),
    '2.4 le détail est bien déplacé DANS la ligne sélectionnée');

  // ⭐ Aucune section par défaut
  ok((await page.$$('#subProjectSections .subProjectSection')).length === 0,
    '3.1 ⭐ aucune section n\'existe par défaut');
  ok(await page.isVisible('#subProjectEmptyHint'), '3.2 le sous-projet dit qu\'il est vide');
  ok(!(await page.isVisible('#subProjectDiscussionBlock')), '3.3 ⭐ aucune discussion affichée par défaut');
  ok(!(await page.isVisible('#subProjectProgressWrap')), '3.4 aucune barre d\'avancement');

  // --- Le bouton "Ajouter" et ses trois options ---
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#addSectionMenu'), '4.1 le menu "Ajouter" s\'ouvre');
  ok(await page.isVisible('#addSectionTasksBtn'), '4.2 option "Des tâches"');
  ok(await page.isVisible('#addSectionPollBtn'), '4.3 option "Des sondages"');
  ok(await page.isVisible('#addSectionDiscussionBtn'), '4.4 option "Une discussion"');
  ok(!(await page.evaluate(() => document.getElementById('addSectionDiscussionBtn').disabled)),
    '4.5 "Une discussion" est disponible tant qu\'il n\'y en a pas');

  // --- Section de tâches ---
  await page.click('#addSectionTasksBtn');
  await page.waitForTimeout(800);
  ok((await page.$$('#subProjectSections .subProjectTasksSection')).length === 1, '5.1 section de tâches créée');
  ok(!(await page.isVisible('#subProjectEmptyHint')), '5.2 le sous-projet n\'est plus vide');

  for (const label of ['Maquettes', 'Intégration', 'Contenus', 'Mise en ligne']) {
    await page.fill('#subProjectSections .subProjectTasksSection .subProjectItemAdd input', label);
    await page.click('#subProjectSections .subProjectTasksSection .subProjectItemAdd button');
    await page.waitForTimeout(400);
  }
  ok((await page.$$('#subProjectSections .subProjectItem')).length === 4, '5.3 quatre tâches ajoutées');

  await page.check('#subProjectSections .subProjectItem:first-child input[type="checkbox"]');
  await page.waitForTimeout(900);
  const badge = await page.textContent('#subProjectsList .subProjectBadge');
  ok(badge.indexOf('25%') !== -1, '5.4 avancement du sous-projet à 25 % (1/4) — obtenu : ' + badge);
  ok(await page.isVisible('#activityProgressWrap'), '5.5 la barre de l\'activité apparaît dès qu\'il y a des tâches');
  ok((await page.textContent('#subProjectsProgressLabel')).indexOf('25%') !== -1, '5.6 avancement de l\'ACTIVITÉ à 25 %');
  ok(await page.evaluate(() => document.getElementById('activityProgressFill').style.width) === '25%',
    '5.7 la barre est remplie à 25 %');
  ok(await page.evaluate(() => document.querySelector('#subProjectSections .subProjectItem').classList.contains('done')),
    '5.8 la tâche cochée est barrée');

  // --- Sondages : le SOCLE COMMUN, monté dans le sous-projet ---
  // ⚠️ Rien de ce bloc n'est une implémentation de ce volet : le composeur, la
  // carte de vote et les routes appartiennent à la discussion "Sondages"
  // (mountPolls, scope 'subproject'). On vérifie le BRANCHEMENT.
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);
  await page.click('#addSectionPollBtn');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#subProjectPollsBlock'), '6.1 le bloc Sondages apparaît dans le sous-projet');
  ok(await page.isVisible('#subProjectPollsEmptyHint'), '6.2 il dit qu\'il n\'y a aucun sondage');
  ok(await page.isVisible('#subProjectPollsAddBtn'), '6.3 le composeur du socle est disponible (membre de l\'activité)');

  await page.click('#subProjectPollsAddBtn');
  await page.waitForTimeout(300);
  await page.fill('#subProjectPollsQuestion', 'Quelle date ?');
  // Le socle utilise des <textarea> auto-agrandissants depuis le 3 septembre 2026.
  const pollOptionInputs = await page.$$('#subProjectPollsOptions textarea');
  ok(pollOptionInputs.length >= 2, '6.4 deux réponses proposées d\'emblée par le socle');
  await pollOptionInputs[0].fill('Le 10');
  await pollOptionInputs[1].fill('Le 17');
  await page.click('#subProjectPollsCreateBtn');
  await page.waitForTimeout(1100);
  ok((await page.$$('#subProjectPollsList .pollCard')).length === 1, '6.5 le sondage est créé et listé');
  ok((await page.textContent('#subProjectPollsList')).indexOf('Quelle date ?') !== -1, '6.6 la question est affichée');

  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('addSectionPollBtn').disabled),
    '6.7 "Des sondages" est grisée : une seule section de sondages par sous-projet');
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);

  // --- Discussion : une seule, et TOUJOURS en bas ---
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);
  await page.click('#addSectionDiscussionBtn');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#subProjectDiscussionBlock'), '7.1 la discussion apparaît');

  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('addSectionDiscussionBtn').disabled),
    '7.2 ⭐ "Une discussion" est désormais grisée : une seule par sous-projet');
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);

  // ⭐ Ordre : le fil est après toutes les sections tâches/sondage
  const discussionIsLast = await page.evaluate(() => {
    const detail = document.getElementById('subProjectDetail');
    const sections = document.getElementById('subProjectSections');
    const pollsBlock = document.getElementById('subProjectPollsBlock');
    const disc = document.getElementById('subProjectDiscussionBlock');
    const F = Node.DOCUMENT_POSITION_FOLLOWING;
    // tâches -> sondages -> discussion, dans cet ordre dans le document
    const tasksBeforePolls = !!(sections.compareDocumentPosition(pollsBlock) & F);
    const pollsBeforeDisc = !!(pollsBlock.compareDocumentPosition(disc) & F);
    // et la discussion est le dernier bloc visible du détail
    const visible = Array.from(detail.children).filter((c) => !c.classList.contains('hidden'));
    return tasksBeforePolls && pollsBeforeDisc && visible[visible.length - 1] === disc;
  });
  ok(discussionIsLast, '7.3 ⭐ ordre : tâches, puis sondages, puis la discussion TOUJOURS en bas');

  await page.fill('#subProjectMessageInput', 'On démarre lundi.');
  await page.click('#subProjectMessageSendBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#subProjectMessagesList .discussionMsg')).length === 1, '7.4 message envoyé et affiché');
  const msgText = await page.textContent('#subProjectMessagesList .discussionMsg');
  ok(msgText.indexOf('On démarre lundi.') !== -1, '7.5 le texte du message est affiché');
  ok(msgText.indexOf(name) !== -1, '7.6 multi-auteur : le nom de l\'auteur est affiché');
  ok(await page.evaluate(() => !!document.querySelector('#subProjectMessagesList .discussionMsg .discussionMsgAuthor .dot')),
    '7.7 multi-auteur : la pastille de couleur de l\'auteur est présente');

  // Le fil du sous-projet n'a rien déposé dans le fil de l'activité. Requête
  // faite HORS de la page : un 400 attendu polluerait la console et ferait
  // échouer l'assertion finale pour une erreur volontaire.
  const actRes = await page.request.get(BASE + '/api/community/activity-messages?userId=' + user.id + '&activityId=' + activity.id);
  const actBody = await actRes.json().catch(() => null);
  ok(actRes.status() === 400 || (actBody && actBody.messages && actBody.messages.length === 0),
    '7.8 le fil de l\'ACTIVITÉ n\'a rien reçu : deux systèmes distincts');

  // --- Retirer la discussion masque le fil sans effacer les messages ---
  page.once('dialog', (d) => d.accept());
  await page.click('#subProjectDiscussionRemoveBtn');
  await page.waitForTimeout(900);
  ok(!(await page.isVisible('#subProjectDiscussionBlock')), '8.1 la discussion retirée disparaît');
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);
  await page.click('#addSectionDiscussionBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#subProjectMessagesList .discussionMsg')).length === 1,
    '8.2 ⭐ les messages sont retrouvés intacts quand on remet la discussion');

  // --- Retirer la section de sondages ne détruit pas les sondages ---
  page.once('dialog', (d) => d.accept());
  await page.click('#subProjectPollsRemoveBtn');
  await page.waitForTimeout(900);
  ok(!(await page.isVisible('#subProjectPollsBlock')), '8.2b le bloc Sondages disparaît');
  await page.click('#addSubProjectSectionBtn');
  await page.waitForTimeout(200);
  await page.click('#addSectionPollBtn');
  await page.waitForTimeout(1100);
  ok((await page.$$('#subProjectPollsList .pollCard')).length === 1,
    '8.2c ⭐ le sondage est retrouvé intact quand on remet la section');

  // --- Retirer une section de tâches ---
  page.once('dialog', (d) => d.accept());
  await page.click('#subProjectSections .subProjectTasksSection .subProjectSectionHead .menuBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#subProjectSections .subProjectTasksSection')).length === 0, '8.3 la section de tâches est retirée');
  ok(!(await page.isVisible('#activityProgressWrap')),
    '8.4 R1 — plus aucune tâche : la barre d\'avancement disparaît au lieu d\'afficher 0 %');

  // --- NON-RÉGRESSION : zone "écrire à sa communauté" (Communauté) ---
  // La page d'activité est une surcouche : il faut la refermer avant de
  // changer d'onglet, sinon elle intercepte le clic.
  await page.click('#activityPageClose');
  await page.waitForTimeout(500);
  await page.click('.tabBtn[data-tab="community"]');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#communityMyPostsBlock'), '9.1 zone "écrire à sa communauté" toujours présente');
  // ⚠️ Bug trouvé par cette suite le 3 septembre 2026 : la garde du scope
  // 'profile' des sondages appelait profileRoutes.canViewProjects, qui n'était
  // pas exporté — tout sondage de profil répondait 403. Corrigé dans
  // server/routes/profile.js ; cette assertion empêche la régression.
  const profilePolls = await page.request.get(BASE + '/api/polls?userId=' + user.id + '&scope=profile&scopeId=' + user.id);
  ok(profilePolls.status() === 200, '9.1b les sondages de profil répondent 200 (garde du scope opérationnelle)');
  ok((await profilePolls.json()).canCreate === true, '9.1c et on peut en créer sur son propre profil');
  await page.fill('#communityMyPostsInput', 'Message communauté');
  await page.click('#communityMyPostsSendBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#communityMyPostsList .discussionMsg')).length === 1,
    '9.2 envoi toujours fonctionnel après la généralisation du composeur');
  ok(await page.evaluate(() => document.querySelector('#communityMyPostsList .discussionMsg').classList.contains('mine')),
    '9.3 rendu mono-auteur inchangé (.mine)');
  ok(await page.evaluate(() => !document.querySelector('#communityMyPostsList .discussionMsg .discussionMsgAuthor .dot')),
    '9.4 mono-auteur : pas de pastille de couleur, comme avant');
  ok(await page.evaluate(() => !!document.querySelector('#communityMyPostsList .attachmentMenuWrap')),
    '9.5 le trombone par message est toujours là');
  ok(await page.isVisible('#communityMyPostsAttachBtn'), '9.6 le trombone du composeur est toujours là');

  // --- NON-RÉGRESSION : zone Discussion du Profil + rafraîchissement mutuel ---
  await page.click('#whoami');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#profileDiscussionBlock'), '10.1 zone Discussion du Profil toujours présente');
  ok((await page.$$('#profileDiscussionCommunityList .discussionMsg')).length === 1,
    '10.2 le message écrit depuis Communauté apparaît aussi sur le Profil (rafraîchissement mutuel)');
  await page.fill('#profileDiscussionCommunityInput', 'Message profil');
  await page.click('#profileDiscussionCommunitySendBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#profileDiscussionCommunityList .discussionMsg')).length === 2,
    '10.3 envoi depuis le Profil toujours fonctionnel');

  // --- Activité PARTAGÉE : la partie "membres" réapparaît ---
  const other = 'UIOther' + stamp;
  const user2 = (await api(page, 'POST', '/api/profile', {
    name: other, lastName: 'Test', phone: '+15145550124', email: other + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  await api(page, 'POST', '/api/activities/' + activity.id + '/invite', { userId: user.id, pseudo: other });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + user2.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: user2.id });

  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(900);
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(1600);
  ok(await page.isVisible('#activityPage'), '11.1 activité partagée : la page s\'ouvre');
  ok(await page.isVisible('#activitySubProjectsBlock'), '11.2 les sous-projets sont là');
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '11.3 le sous-projet créé en solo est toujours là');
  // Une activité partagée retrouve son sélecteur de sections (Sous-projets /
  // Statistiques / Discussion), masqué en solo.
  ok(await page.isVisible('#activityPageSectionSwitch'), '11.4 le sélecteur de sections apparaît (activité partagée)');

  // --- Console propre ---
  const realErrors = consoleErrors.filter((e) => e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '12.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
