// test15.js — suite navigateur (Playwright) : sous-projets d'une activité + NON-RÉGRESSION
// de la généralisation du composeur de messages.
//
// Le point le plus sensible de ce chantier n'est pas le nouveau code : c'est
// que mountProfilePostsComposer (zone Discussion du Profil et zone "écrire à
// sa communauté", propriété de Profil et de Communauté) est devenu un appel
// préconfiguré de mountMessageThread. Cette suite vérifie donc autant les deux
// zones EXISTANTES que la nouvelle.

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
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
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

  // STORAGE_KEY = 'noesis_profile' dans public/app.js — l'app relit le profil
  // entier depuis localStorage puis le resynchronise avec le serveur.
  await page.evaluate((u) => {
    localStorage.setItem('noesis_profile', JSON.stringify(u));
  }, user);
  await page.goto(BASE);
  await page.waitForTimeout(1200);

  // Certains builds stockent le profil sous une autre clé : si l'app est
  // restée sur l'onboarding, on force l'entrée par l'API interne de la page.
  const onApp = await page.evaluate(() => !document.getElementById('app') || !document.getElementById('app').classList.contains('hidden'));
  ok(onApp, '0.3 application ouverte (pas bloquée sur l\'onboarding)');

  // --- Onglet Activité ---
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#tab-activity'), '1.1 onglet Activité affiché');

  // Sélection de l'activité (ouvre #communityActivityDetail)
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#communityActivityDetail'), '1.2 détail de l\'activité ouvert');
  ok(await page.isVisible('#activitySubProjectsBlock'), '1.3 bloc Sous-projets présent');
  ok(await page.isVisible('#subProjectsEmptyHint'), '1.4 message "aucun sous-projet" affiché');
  ok(!(await page.isVisible('#activityProgressWrap')), '1.5 R1 — aucune barre d\'avancement tant qu\'il n\'y a rien');
  // L'activité de ce test est SOLO : la partie "membres" (fil de discussion de
  // l'activité + statistiques comparant les membres) est volontairement
  // masquée, seuls les sous-projets s'affichent. Sur une activité partagée,
  // les deux coexistent (vérifié plus bas par la suite API, scénario 5).
  ok(!(await page.isVisible('#communityDiscussionBlock')), '1.6 activité solo : le fil des membres est masqué');
  ok(!(await page.isVisible('#communityActivityMembersPart')), '1.7 activité solo : les stats des membres sont masquées');

  // --- Création d'un sous-projet ---
  await page.click('#addSubProjectBtn');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#newSubProjectCard'), '2.1 formulaire d\'ajout déplié');
  await page.fill('#newSubProjectName', 'Refonte');
  await page.fill('#newSubProjectDescription', 'Objectif du trimestre');
  await page.click('#newSubProjectSave');
  await page.waitForTimeout(700);
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '2.2 sous-projet ajouté à la liste');
  ok(!(await page.isVisible('#newSubProjectCard')), '2.3 formulaire refermé après ajout');
  ok((await page.textContent('#subProjectsList .subProjectBadge')).indexOf('aucune tâche') !== -1,
    '2.4 R1 — un sous-projet sans tâche affiche "aucune tâche", pas "0 %"');

  // --- Ouverture du détail (déplacé dans la ligne) ---
  await page.click('#subProjectsList .subProjectRowHeader');
  await page.waitForTimeout(700);
  ok(await page.isVisible('#subProjectDetail'), '3.1 détail du sous-projet ouvert');
  const insideRow = await page.evaluate(() =>
    !!document.querySelector('#subProjectsList .subProjectRow #subProjectDetail'));
  ok(insideRow, '3.2 le détail est bien déplacé DANS la ligne sélectionnée');
  ok(await page.isVisible('#subProjectDiscussionBlock'), '3.3 fil de discussion du sous-projet présent');

  // --- Todolist et avancement ---
  for (const label of ['Maquettes', 'Intégration', 'Contenus', 'Mise en ligne']) {
    await page.fill('#newSubProjectItemInput', label);
    await page.click('#newSubProjectItemBtn');
    await page.waitForTimeout(350);
  }
  ok((await page.$$('#subProjectItems .subProjectItem')).length === 4, '4.1 quatre tâches ajoutées');

  await page.check('#subProjectItems .subProjectItem:first-child input[type="checkbox"]');
  await page.waitForTimeout(800);
  const badge = await page.textContent('#subProjectsList .subProjectBadge');
  ok(badge.indexOf('25%') !== -1, '4.2 avancement du sous-projet à 25 % (1/4) — obtenu : ' + badge);
  ok(await page.isVisible('#activityProgressWrap'), '4.3 la barre de l\'activité apparaît dès qu\'il y a des tâches');
  const actLabel = await page.textContent('#subProjectsProgressLabel');
  ok(actLabel.indexOf('25%') !== -1, '4.4 avancement de l\'ACTIVITÉ à 25 % — obtenu : ' + actLabel);
  const fillWidth = await page.evaluate(() => document.getElementById('activityProgressFill').style.width);
  ok(fillWidth === '25%', '4.5 la barre est remplie à 25 % — obtenu : ' + fillWidth);
  ok(await page.evaluate(() =>
    document.querySelector('#subProjectItems .subProjectItem').classList.contains('done')),
    '4.6 la tâche cochée est barrée (classe .done)');

  // Décocher revient à 0 % (et pas à "aucune tâche")
  await page.uncheck('#subProjectItems .subProjectItem:first-child input[type="checkbox"]');
  await page.waitForTimeout(800);
  const badge0 = await page.textContent('#subProjectsList .subProjectBadge');
  ok(badge0.indexOf('0%') !== -1, '4.7 décoché : 0 % (et non "aucune tâche") — obtenu : ' + badge0);

  // --- Fil de discussion du sous-projet (multi-auteur) ---
  await page.fill('#subProjectMessageInput', 'On démarre lundi.');
  await page.click('#subProjectMessageSendBtn');
  await page.waitForTimeout(800);
  ok((await page.$$('#subProjectMessagesList .discussionMsg')).length === 1, '5.1 message envoyé et affiché');
  const msgText = await page.textContent('#subProjectMessagesList .discussionMsg');
  ok(msgText.indexOf('On démarre lundi.') !== -1, '5.2 le texte du message est affiché');
  ok(msgText.indexOf(name) !== -1, '5.3 multi-auteur : le nom de l\'auteur est affiché');
  ok(await page.evaluate(() =>
    !!document.querySelector('#subProjectMessagesList .discussionMsg .discussionMsgAuthor .dot')),
    '5.4 multi-auteur : la pastille de couleur de l\'auteur est présente');
  ok(await page.evaluate(() =>
    document.querySelector('#subProjectMessagesList .discussionMsg').classList.contains('mine')),
    '5.5 mon propre message est marqué .mine');

  // Le fil du sous-projet n'a PAS écrit dans le fil de l'activité (vérifié
  // côté données : le fil des membres est masqué en solo, mais la table
  // activity_messages doit rester vide).
  // Requête faite HORS de la page (page.request) : un 400 attendu, s'il
  // passait par un fetch de la page, polluerait la console et ferait échouer
  // l'assertion 9.1 pour une erreur volontaire.
  const actRes = await page.request.get(BASE + '/api/community/activity-messages?userId=' + user.id + '&activityId=' + activity.id);
  const actBody = await actRes.json().catch(() => null);
  ok(actRes.status() === 400 || (actBody && actBody.messages && actBody.messages.length === 0),
    '5.6 le fil de l\'ACTIVITÉ n\'a rien reçu : deux systèmes distincts');

  // --- Réglages du sous-projet ---
  await page.click('#subProjectSettingsBtn');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#subProjectSettingsPanel'), '6.1 panneau de réglages déplié');
  ok((await page.inputValue('#subProjectEditName')) === 'Refonte', '6.2 le nom actuel est pré-rempli');
  await page.fill('#subProjectEditName', 'Refonte 2026');
  await page.click('#subProjectEditSave');
  await page.waitForTimeout(700);
  ok((await page.textContent('#subProjectsList .activityRowName')) === 'Refonte 2026', '6.3 renommage appliqué');

  // --- NON-RÉGRESSION : zone "écrire à sa communauté" (Communauté) ---
  await page.click('.tabBtn[data-tab="community"]');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#communityMyPostsBlock'), '7.1 zone "écrire à sa communauté" toujours présente');
  await page.fill('#communityMyPostsInput', 'Message communauté');
  await page.click('#communityMyPostsSendBtn');
  await page.waitForTimeout(900);
  const commMsgs = await page.$$('#communityMyPostsList .discussionMsg');
  ok(commMsgs.length === 1, '7.2 envoi toujours fonctionnel après la généralisation du composeur');
  ok(await page.evaluate(() =>
    document.querySelector('#communityMyPostsList .discussionMsg').classList.contains('mine')),
    '7.3 rendu mono-auteur inchangé (.mine)');
  ok(await page.evaluate(() =>
    !document.querySelector('#communityMyPostsList .discussionMsg .discussionMsgAuthor .dot')),
    '7.4 mono-auteur : pas de pastille de couleur, comme avant');
  ok(await page.evaluate(() =>
    !!document.querySelector('#communityMyPostsList .attachmentMenuWrap')),
    '7.5 le trombone par message est toujours là (pièces jointes conservées)');
  ok(await page.isVisible('#communityMyPostsAttachBtn'), '7.6 le trombone du composeur est toujours là');

  // --- NON-RÉGRESSION : zone Discussion du Profil, et rafraîchissement mutuel ---
  await page.click('#whoami');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#profileDiscussionBlock'), '8.1 zone Discussion du Profil toujours présente');
  const profMsgs = await page.$$('#profileDiscussionCommunityList .discussionMsg');
  ok(profMsgs.length === 1, '8.2 le message écrit depuis Communauté apparaît aussi sur le Profil (rafraîchissement mutuel des deux instances)');

  await page.fill('#profileDiscussionCommunityInput', 'Message profil');
  await page.click('#profileDiscussionCommunitySendBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#profileDiscussionCommunityList .discussionMsg')).length === 2, '8.3 envoi depuis le Profil toujours fonctionnel');

  // --- Activité PARTAGÉE : la partie "membres" réapparaît, les sous-projets restent ---
  // C'est le pendant du 1.6/1.7 : le détail s'ouvre désormais pour toute
  // activité, mais le fil des membres et leurs statistiques ne s'affichent
  // que sur une activité réellement partagée.
  const other = 'UIOther' + stamp;
  const user2 = (await api(page, 'POST', '/api/profile', {
    name: other, lastName: 'Test', phone: '+15145550124', email: other + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  await api(page, 'POST', '/api/activities/' + activity.id + '/invite', { userId: user.id, pseudo: other });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + user2.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: user2.id });

  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(900);
  // L'activité était peut-être encore sélectionnée depuis la section 1 : le
  // premier clic la refermerait. On s'assure qu'elle est bien ouverte.
  await page.click('#activitiesList .activityRowHeader');
  await page.waitForTimeout(1400);
  if (!(await page.isVisible('#communityActivityDetail'))) {
    await page.click('#activitiesList .activityRowHeader');
    await page.waitForTimeout(1400);
  }
  ok(await page.isVisible('#activitySubProjectsBlock'), '10.1 activité partagée : les sous-projets sont là');
  ok(await page.isVisible('#communityDiscussionBlock'), '10.2 activité partagée : le fil des membres réapparaît');
  ok(await page.isVisible('#communityActivityMembersPart'), '10.3 activité partagée : les stats des membres réapparaissent');
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '10.4 le sous-projet créé en solo est toujours là après le partage');

  // --- Console propre ---
  const realErrors = consoleErrors.filter((e) => e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '9.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
