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
  // ⭐ Plus AUCUNE barre large tant que les tâches ne sont pas activées, et le
  // conteneur de l'ancienne barre du détail n'existe plus du tout.
  ok(await page.evaluate(() => !document.getElementById('subProjectProgressWrap')),
    '3.4 ⭐ la barre d\'avancement du détail a disparu du document');
  ok(await page.evaluate(() => document.querySelectorAll(
    '#subProjectsList .subProjectProgressTrack').length === 0),
    '3.4b ⭐ aucune barre large tant que la fonction "tâches" n\'est pas activée');

  // --- Le bouton "Ajouter" est sur la LIGNE, à droite du nom ---
  ok(await page.evaluate(() =>
    !!document.querySelector('#subProjectsList .subProjectRowHeader .subProjectAddBtn')),
    '4.0 ⭐ le bouton "Ajouter" est dans l\'en-tête de la ligne, à droite du nom');
  // ⭐ Le nom n'apparaît qu'UNE fois : plus d'en-tête interne qui le répétait.
  ok(await page.evaluate(() => !document.getElementById('subProjectDetailName')),
    '4.0b ⭐ le nom du sous-projet n\'est plus écrit une seconde fois dans le détail');
  ok(await page.evaluate(() => !document.getElementById('subProjectSettingsBtn')),
    '4.0c ⭐ le menu "⋮" interne a disparu');

  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#addSectionMenu'), '4.1 le menu déroulant s\'ouvre');
  ok(await page.isVisible('#addSectionTasksBtn'), '4.2 option "Des tâches"');
  ok(await page.isVisible('#addSectionPollBtn'), '4.3 option "Des sondages"');
  ok(await page.isVisible('#addSectionDiscussionBtn'), '4.4 option "Une discussion"');
  // ⭐ Le menu ne propose plus QUE des ajouts : renommer et supprimer sont
  // passés dans le mode édition (appui long sur la ligne).
  ok(await page.evaluate(() => !document.getElementById('subProjectRenameBtn')),
    '4.4b ⭐ "Renommer" a quitté le menu "Ajouter"');
  ok(await page.evaluate(() => !document.getElementById('subProjectDeleteBtn')),
    '4.4c ⭐ "Supprimer" aussi');
  ok((await page.textContent('#addSectionTasksBtn')) === 'Nouvelle tâche', '4.4d libellé "Nouvelle tâche"');
  ok((await page.textContent('#addSectionPollBtn')) === 'Nouveau sondage', '4.4e libellé "Nouveau sondage"');
  ok((await page.textContent('#addSectionDiscussionBtn')) === 'Nouvelle discussion', '4.4f libellé "Nouvelle discussion"');
  // ⭐ Le menu est une carte étroite et cadrée, pas une bande pleine largeur.
  ok(await page.evaluate(() => {
    const menu = document.getElementById('addSectionMenu');
    const row = menu.closest('.subProjectRow');
    const cs = getComputedStyle(menu);
    return menu.getBoundingClientRect().width < row.getBoundingClientRect().width * 0.95 &&
      cs.borderTopWidth !== '0px';
  }), '4.4g ⭐ le menu est encadré et plus étroit que la ligne');
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
  ok(await page.isVisible('#activityProgressWrap'), '5.5 l\'anneau d\'avancement apparaît dès qu\'il y a des tâches');
  ok((await page.textContent('#activityProgressPercent')) === '25%', '5.6 ⭐ l\'anneau affiche 25 %');
  ok((await page.textContent('#activityProgressCount')).indexOf('1 / 4') !== -1,
    '5.7 ⭐ et le décompte exact des tâches (1 / 4)');
  // L'anneau est réellement rempli au quart : stroke-dashoffset ≈ 75 % de la
  // circonférence (2πr, r = 19).
  ok(await page.evaluate(() => {
    const c = 2 * Math.PI * 19;
    const off = parseFloat(document.getElementById('activityProgressRingFill').style.strokeDashoffset);
    return Math.abs(off - c * 0.75) < 1;
  }), '5.8b ⭐ l\'anneau est rempli au quart');
  ok(await page.evaluate(() => document.querySelector('#subProjectSections .subProjectItem').classList.contains('done')),
    '5.8 la tâche cochée est barrée');

  // --- Sondages : le SOCLE COMMUN, monté dans le sous-projet ---
  // ⚠️ Rien de ce bloc n'est une implémentation de ce volet : le composeur, la
  // carte de vote et les routes appartiennent à la discussion "Sondages"
  // (mountPolls, scope 'subproject'). On vérifie le BRANCHEMENT.
  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
  await page.waitForTimeout(200);
  await page.click('#addSectionPollBtn');
  await page.waitForTimeout(1000);
  ok(await page.isVisible('#subProjectPollsBlock'), '6.1 le bloc Sondages apparaît dans le sous-projet');
  // ⭐ On tombe DIRECTEMENT dans la zone de saisie, sans second clic.
  ok(await page.isVisible('#subProjectPollsForm'), '6.2 ⭐ le formulaire est ouvert d\'emblée');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'subProjectPollsQuestion'),
    '6.3 ⭐ le curseur est déjà dans la question');

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

  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
  await page.waitForTimeout(300);
  // ⭐ L'option DISPARAÎT (elle était grisée jusqu'au 3 septembre 2026) : une
  // seule section de sondages par sous-projet.
  ok(!(await page.isVisible('#addSectionPollBtn')),
    '6.7 ⭐ "Nouveau sondage" a disparu du menu : une seule section de sondages');
  ok(await page.isVisible('#addSectionDiscussionBtn'),
    '6.7b ce qui reste à ajouter est toujours proposé');
  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
  await page.waitForTimeout(200);

  // --- Discussion : une seule, et TOUJOURS en bas ---
  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
  await page.waitForTimeout(200);
  await page.click('#addSectionDiscussionBtn');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#subProjectDiscussionBlock'), '7.1 la discussion apparaît');

  // ⭐ Les trois types sont là : le bouton "Ajouter" lui-même s'efface, plutôt
  // que d'ouvrir un menu vide.
  ok(!(await page.isVisible('#subProjectsList .subProjectRowHeader .subProjectAddBtn')),
    '7.2 ⭐ plus rien à ajouter : le bouton "Ajouter" disparaît');
  ok(await page.evaluate(() => document.getElementById('addSectionDiscussionBtn')
    .classList.contains('hidden')),
    '7.2b "Nouvelle discussion" a disparu du menu : une seule par sous-projet');

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
  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
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
  // ⭐ RACCOURCI : tâches et discussion existent déjà, le sondage est la seule
  // chose qu'on puisse encore ajouter — le clic sur "Ajouter" le crée
  // directement, sans passer par un menu à une seule entrée (demande
  // d'Emilien, 3 septembre 2026).
  await page.click('#subProjectsList .subProjectRowHeader .subProjectAddBtn');
  await page.waitForTimeout(1200);
  ok(!(await page.isVisible('#addSectionMenu')),
    '8.2c ⭐ aucun menu ouvert : il ne restait que le sondage');
  ok(await page.isVisible('#subProjectPollsBlock'),
    '8.2d ⭐ la section de sondages a été créée directement');
  ok(await page.isVisible('#subProjectPollsForm'),
    '8.2e ⭐ et son formulaire est ouvert d\'emblée');
  ok((await page.$$('#subProjectPollsList .pollCard')).length === 1,
    '8.2f ⭐ le sondage est retrouvé intact quand on remet la section');

  // --- Retirer une section de tâches ---
  page.once('dialog', (d) => d.accept());
  await page.click('#subProjectSections .subProjectTasksSection .subProjectSectionHead .menuBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#subProjectSections .subProjectTasksSection')).length === 0, '8.3 la section de tâches est retirée');
  ok(!(await page.isVisible('#activityProgressWrap')),
    '8.4 R1 — plus aucune tâche : la barre d\'avancement disparaît au lieu d\'afficher 0 %');

  // --- ⭐ Une section de sondages abandonnée ne reste pas vide ---
  // Sur un sous-projet NEUF (donc sans aucun sondage) : on ajoute la section,
  // on n'écrit rien, on quitte — elle doit avoir disparu au retour. Sur un
  // sous-projet qui a déjà des sondages, la section reste évidemment : elle
  // n'est pas vide.
  const sp2 = (await api(page, 'POST', '/api/activities/' + activity.id + '/sub-projects', {
    userId: user.id, name: 'Second',
  })).body;
  // La page d'activité est une surcouche : on la referme, on la rouvre, et la
  // liste des sous-projets est rechargée avec le nouveau.
  await page.click('#activityPageClose');
  await page.waitForTimeout(500);
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(1400);
  const row2 = '#subProjectsList .subProjectRow[data-sub-project-id="' + sp2.id + '"] ';
  await page.click(row2 + '.subProjectRowHeader');
  await page.waitForTimeout(900);
  await page.click(row2 + '.subProjectAddBtn');
  await page.waitForTimeout(300);
  await page.click('#addSectionPollBtn');
  await page.waitForTimeout(1000);
  ok(await page.isVisible('#subProjectPollsBlock'), '8.5 la section de sondages est là');
  await page.click(row2 + '.subProjectRowHeader');   // on quitte sans rien écrire
  await page.waitForTimeout(1300);
  await page.click(row2 + '.subProjectRowHeader');   // on revient
  await page.waitForTimeout(1300);
  ok(!(await page.isVisible('#subProjectPollsBlock')),
    '8.6 ⭐ abandonnée sans aucun sondage, la section a disparu');

  // --- ⭐ Espace entre deux sous-projets ---
  const gap = await page.evaluate(() => {
    const el = document.getElementById('subProjectsList');
    return getComputedStyle(el).rowGap || getComputedStyle(el).gap;
  });
  ok(parseFloat(gap) > 0, '8.7 ⭐ les sous-projets sont espacés (gap = ' + gap + ')');

  // --- ⭐ Le formulaire de création est SOUS la liste ---
  ok(await page.evaluate(() => {
    const list = document.getElementById('subProjectsList');
    const card = document.getElementById('newSubProjectCard');
    return !!(list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), '8.8 ⭐ le formulaire de création vient après la liste des sous-projets');

  // --- NON-RÉGRESSION : zone "écrire à sa communauté" (Communauté) ---
  // La page d'activité est une surcouche : il faut la refermer avant de
  // changer d'onglet, sinon elle intercepte le clic.
  await page.click('#activityPageClose');
  await page.waitForTimeout(500);
  await page.click('.tabBtn[data-tab="community"]');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#communityMyPostsBlock'), '9.1 zone "écrire à sa communauté" toujours présente');
  // ⚠️ Depuis le 3 septembre 2026, cette zone n'a plus de liste à elle : les
  // messages partent dans le flux d'actualité juste en dessous. La factory doit
  // donc supporter une instance QUI N'EST QU'UN COMPOSEUR — c'est ce que cette
  // assertion protège (sans la garde, la page casse au chargement).
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
  // Le message part bien : on le retrouve dans le flux d'actualité.
  // Cette zone n'ayant plus de liste à elle, on vérifie le résultat à la
  // source : le message a bien été créé côté serveur. C'est exactement ce que
  // la généralisation du composeur ne devait pas casser.
  const myPosts = await (await page.request.get(BASE + '/api/profile/posts?userId=' + user.id)).json();
  ok(myPosts.some((m) => m.body === 'Message communauté'),
    '9.2 envoi toujours fonctionnel après la généralisation du composeur');
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

  // --- ⭐ Mode édition : appui long, glisser-déposer, renommage, suppression ---
  // ⚠️ Le geste est testé POUR DE VRAI (souris/pointeur réels), pas simulé par
  // un appel de fonction : c'est la seule façon de vérifier qu'un appui long
  // ouvre bien le mode, et surtout qu'un simple clic ne l'ouvre PAS.
  // On revient sur la page de l'activité (les sections 9 et 10 l'ont fermée
  // pour aller sur Communauté puis Profil).
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(900);
  if (!(await page.isVisible('#activityPage'))) {
    await page.click('#activitiesList .activityRow .activityRowHeader');
    await page.waitForTimeout(1400);
  }
  const rowSel = '#subProjectsList .subProjectRow';
  const firstHeader = await page.$(rowSel + ' .subProjectRowHeader');
  const boxA = await firstHeader.boundingBox();

  // Un clic bref n'ouvre pas le mode édition — il ouvre/ferme le sous-projet.
  await page.mouse.move(boxA.x + 40, boxA.y + boxA.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(600);
  ok(!(await page.$(rowSel + ' .subProjectDragHandle')),
    '12.1 ⭐ un clic bref n\'ouvre PAS le mode édition');

  // Appui long : 700 ms sans bouger.
  await page.mouse.move(boxA.x + 40, boxA.y + boxA.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(500);
  ok(!!(await page.$(rowSel + ' .subProjectDragHandle')), '12.2 ⭐ l\'appui long ouvre le mode édition');
  ok((await page.$$(rowSel + ' .subProjectNameInput')).length === 2, '12.3 chaque nom devient modifiable');
  ok((await page.$$(rowSel + ' .subProjectDeleteX')).length === 2, '12.4 une croix de suppression par ligne');
  ok(await page.isVisible('.subProjectEditBar'), '12.5 une barre explique comment en sortir');
  // La croix est bien rouge (c'est ce qu'Emilien a demandé, et ça distingue
  // l'action destructrice du reste).
  ok(await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector('.subProjectDeleteX')).color;
    const m = c.match(/\d+/g).map(Number);
    return m[0] > 150 && m[1] < 110 && m[2] < 110;
  }), '12.6 ⭐ la croix de suppression est rouge');

  // Renommage en place.
  const nameInput = await page.$(rowSel + ' .subProjectNameInput');
  await nameInput.fill('Refonte 2026');
  await nameInput.press('Enter');
  await page.waitForTimeout(900);
  const renamed = (await api(page, 'GET', '/api/activities/' + activity.id + '/sub-projects?userId=' + user.id)).body;
  ok(renamed.subProjects.some((sp) => sp.name === 'Refonte 2026'),
    '12.7 ⭐ le renommage en place est enregistré');

  // Glisser-déposer : on tire la SECONDE ligne au-dessus de la première.
  const orderBefore = (await api(page, 'GET', '/api/activities/' + activity.id + '/sub-projects?userId=' + user.id))
    .body.subProjects.map((sp) => sp.id);
  const handles = await page.$$(rowSel + ' .subProjectDragHandle');
  const h2 = await handles[1].boundingBox();
  const h1 = await handles[0].boundingBox();
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h1.x + h1.width / 2, h1.y - 12, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const orderAfter = (await api(page, 'GET', '/api/activities/' + activity.id + '/sub-projects?userId=' + user.id))
    .body.subProjects.map((sp) => sp.id);
  ok(orderAfter.join(',') === orderBefore.slice().reverse().join(','),
    '12.8 ⭐ le glisser-déposer a bien inversé l\'ordre, et il est enregistré');

  // Sortie du mode édition.
  await page.click('.subProjectEditBar .iconBtn');
  await page.waitForTimeout(900);
  ok(!(await page.$(rowSel + ' .subProjectDragHandle')), '12.9 "Terminer" referme le mode édition');

  // Suppression avec double confirmation.
  await page.mouse.move(boxA.x + 40, boxA.y + boxA.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(500);
  page.on('dialog', (d) => d.accept());
  await page.click(rowSel + ' .subProjectDeleteX');
  await page.waitForTimeout(1200);
  const left = (await api(page, 'GET', '/api/activities/' + activity.id + '/sub-projects?userId=' + user.id)).body;
  ok(left.subProjects.length === 1, '12.10 ⭐ la croix rouge supprime le sous-projet, après confirmation');

  // ============ 13. En-tête collant, barre unique, menu flottant, clôture ====
  // Demandes d'Emilien du 3 septembre 2026 (cinquième passage).
  const sp13 = (await api(page, 'POST', '/api/activities/' + activity.id + '/sub-projects', {
    userId: user.id, name: 'Collant',
  })).body;
  await page.click('#activityPageClose');
  await page.waitForTimeout(500);
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(1400);
  const r13 = '#subProjectsList .subProjectRow[data-sub-project-id="' + sp13.id + '"] ';
  await page.click(r13 + '.subProjectRowHeader');
  await page.waitForTimeout(1000);

  // ⭐ L'en-tête du sous-projet OUVERT est collant, et il porte bien le nom, la
  // croix de fermeture et le bouton "Ajouter" — les trois choses qui doivent
  // rester atteignables quand on descend dans le contenu.
  ok(await page.evaluate((sel) => {
    const stick = document.querySelector(sel + '.subProjectSticky');
    return !!stick && getComputedStyle(stick).position === 'sticky';
  }, r13), '13.1 ⭐ l\'en-tête du sous-projet ouvert est collant');
  ok(await page.evaluate((sel) => {
    const stick = document.querySelector(sel + '.subProjectSticky');
    return !!stick.querySelector('.activityRowName') &&
      !!stick.querySelector('.subProjectCloseBtn') &&
      !!stick.querySelector('.subProjectAddBtn');
  }, r13), '13.2 ⭐ il contient le nom, la croix de fermeture et "Ajouter"');
  // Un sous-projet FERMÉ ne colle pas : rien à suivre en défilant.
  ok(await page.evaluate(() => {
    const closed = document.querySelector('#subProjectsList .subProjectRow:not(:has(#subProjectDetail)) .subProjectSticky');
    return !closed || getComputedStyle(closed).position !== 'sticky';
  }), '13.3 un sous-projet fermé n\'a pas d\'en-tête collant');

  // ⭐ La croix ferme le sous-projet.
  await page.click(r13 + '.subProjectCloseBtn');
  await page.waitForTimeout(800);
  ok(await page.evaluate((sel) => {
    const row = document.querySelector(sel.trim());
    return !row.querySelector('#subProjectDetail');
  }, r13), '13.4 ⭐ la croix quitte le sous-projet');
  await page.click(r13 + '.subProjectRowHeader');
  await page.waitForTimeout(1000);

  // ⭐ Le menu "Ajouter" FLOTTE : il ne prend aucune place, donc il ne déplace
  // pas ce qu'il recouvre. On mesure la position d'un repère avant/après.
  const beforeTop = await page.evaluate(() =>
    document.getElementById('subProjectEmptyHint').getBoundingClientRect().top);
  await page.click(r13 + '.subProjectAddBtn');
  await page.waitForTimeout(400);
  const afterTop = await page.evaluate(() =>
    document.getElementById('subProjectEmptyHint').getBoundingClientRect().top);
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('addSectionMenu')).position === 'absolute'),
    '13.5 ⭐ le menu est en position absolue');
  ok(Math.abs(afterTop - beforeTop) < 2,
    '13.6 ⭐ ouvrir le menu ne pousse plus le contenu (' + beforeTop + ' -> ' + afterTop + ')');

  // ⭐ UNE SEULE barre large, et seulement une fois les tâches activées.
  await page.click('#addSectionTasksBtn');
  await page.waitForTimeout(1000);
  ok(await page.evaluate((sel) => document.querySelectorAll(sel + '.subProjectProgressTrack').length === 1, r13),
    '13.7 ⭐ une seule barre large dans tout le sous-projet');
  ok(await page.evaluate((sel) =>
    !!document.querySelector(sel + '.subProjectSticky .subProjectProgressTrack'), r13),
    '13.8 ⭐ et elle est dans l\'en-tête collant');
  ok(await page.evaluate(() =>
    !document.querySelector('#subProjectSections .subProjectProgressTrack')),
    '13.9 ⭐ plus de barre par section de tâches');

  // ============ 14. Clôture d'un sous-projet ============
  await page.click('#addSubProjectBtn');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#newSubProjectClosesAt'), '14.1 le formulaire propose une date de clôture');
  // ⭐ La croix abandonne la création ET vide ce qui avait été saisi.
  await page.fill('#newSubProjectName', 'Jetable');
  await page.click('#newSubProjectCancel');
  await page.waitForTimeout(300);
  ok(!(await page.isVisible('#newSubProjectCard')), '14.2 ⭐ la croix referme le formulaire de création');
  await page.click('#addSubProjectBtn');
  await page.waitForTimeout(300);
  ok((await page.inputValue('#newSubProjectName')) === '',
    '14.3 ⭐ et la saisie abandonnée n\'est pas rouverte telle quelle');

  await page.fill('#newSubProjectName', 'Éphémère');
  await page.fill('#newSubProjectClosesAt', '2020-01-01');
  await page.click('#newSubProjectSave');
  await page.waitForTimeout(1200);
  ok(!(await page.isVisible('#newSubProjectCard')), '14.4 le formulaire se referme après création');
  ok((await page.textContent('#subProjectsList')).indexOf('Éphémère') === -1,
    '14.5 ⭐ échéance dépassée : le sous-projet n\'apparaît pas dans la liste');
  ok(await page.isVisible('#subProjectsClosedToggle'),
    '14.6 ⭐ une ligne signale qu\'il existe un sous-projet clôturé');
  await page.click('#subProjectsClosedToggle');
  await page.waitForTimeout(1200);
  ok((await page.textContent('#subProjectsList')).indexOf('Éphémère') !== -1,
    '14.7 ⭐ on peut le faire revenir : la clôture masque, elle ne supprime pas');

  // --- Activité PARTAGÉE ---
  // ⚠️ 3 septembre 2026 : la partie NAVIGATION de ce scénario a dû être
  // retirée. Sur l'état actuel du disque, cliquer la ligne d'une activité
  // PARTAGÉE n'ouvre plus sa page (openActivityPage ne démasque jamais
  // #activityPage) — reproduit sur une copie VIERGE du disque, sans aucune
  // modification de ce volet : le défaut appartient à la discussion
  // "Activité — général". Signalé à Emilien plutôt que corrigé dans la zone
  // d'une autre discussion.
  //
  // Ce qui relève de CE volet est donc vérifié à la source : une fois
  // l'activité partagée, ses sous-projets restent servis à ses deux membres,
  // avec le même avancement.
  const other = 'UIOther' + stamp;
  const user2 = (await api(page, 'POST', '/api/profile', {
    name: other, lastName: 'Test', phone: '+15145550124', email: other + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  await api(page, 'POST', '/api/activities/' + activity.id + '/invite', { userId: user.id, pseudo: other });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + user2.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: user2.id });

  const asOwner = (await api(page, 'GET', '/api/activities/' + activity.id + '/sub-projects?userId=' + user.id)).body;
  const asMember = (await api(page, 'GET', '/api/activities/' + activity.id + '/sub-projects?userId=' + user2.id)).body;
  ok(asMember.subProjects.length === asOwner.subProjects.length && asOwner.subProjects.length >= 1,
    '11.1 les sous-projets sont servis aux deux membres après partage');
  ok(JSON.stringify(asMember.progress) === JSON.stringify(asOwner.progress),
    '11.2 le même avancement est vu par les deux membres');

  // --- Console propre ---
  const realErrors = consoleErrors.filter((e) => e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '12.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
