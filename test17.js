// test17.js — suite navigateur (Playwright) : PAGE D'UNE ACTIVITÉ SOLO.
//
// Discussion « Activité solo », 5 septembre 2026. Demande d'Emilien, verbatim :
// « Je souhaite que lorsque je clique sur une activité solo, une fenêtre
// s'ouvre identique aux fenêtres partagées, mais sans les sections discussions
// et statistiques. Uniquement l'option d'ajouter des sous-projets et des
// tâches. »
//
// ⚠️ Ce geste a changé trois fois en deux jours : page à trois sections
// (3 sept) → bloc déplié dans la ligne du volet (4 sept) → page à UNE section
// (5 sept, ce que cette suite vérifie). Les assertions du mode « déplié » ont
// été retournées, pas contournées.
//
// Ce qu'il faut prouver :
//   1. une activité SOLO ouvre bien une PAGE, sans sélecteur ni onglets
//      Statistiques/Discussion ;
//   2. on peut y créer un sous-projet puis des tâches, avec l'avancement
//      global ET local ;
//   3. une activité PARTAGÉE garde ses trois sections ;
//   4. le bloc #communityActivityDetail ne quitte jamais #activityPageBody.
//
// Lancement : node test17.js  (serveur sur :3000, base VIERGE, playwright)

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

// Le détail est-il bien dans le corps de la PAGE (et nulle part ailleurs) ?
async function detailInPage(page) {
  return page.evaluate(() => {
    const d = document.getElementById('communityActivityDetail');
    const body = document.getElementById('activityPageBody');
    return !!(d && body && body.contains(d));
  });
}

async function clickActivityRow(page, activityId) {
  await page.click('#activitiesList .activityRow[data-activity-id="' + activityId + '"] .activityRowHeader');
  await page.waitForTimeout(1300);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE);

  const stamp = Date.now();
  const name = 'SoloPage' + stamp;
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550188', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil créé');

  // A : solo SANS aucun sous-projet — le cas dont la règle a changé.
  const actVide = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'AVide' + stamp })).body;
  // B : solo AVEC un sous-projet.
  const actPlein = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'BPlein' + stamp })).body;
  const sp = (await api(page, 'POST', '/api/activities/' + actPlein.id + '/sub-projects', {
    userId: user.id, name: 'Maquettes',
  })).body;
  // C : sera PARTAGÉE — elle doit garder ses trois sections.
  const actPartage = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'CPartage' + stamp })).body;
  ok(!!actVide.id && !!actPlein.id && !!actPartage.id && !!sp.id, '0.2 trois activités et un sous-projet créés');

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1000);

  // ============ 1. SOLO SANS SOUS-PROJET : la page s'ouvre quand même ============
  await clickActivityRow(page, actVide.id);
  ok(await page.isVisible('#activityPage'),
    '1.1 ⭐ une activité solo SANS sous-projet ouvre bien sa page');
  ok(await detailInPage(page), '1.2 le bloc vit dans le corps de la page');
  ok(!(await page.isVisible('#activityPageSectionSwitch')),
    '1.3 ⭐ pas de sélecteur de sections en solo — il n\'y en a qu\'une');
  ok(!(await page.isVisible('#communityActivityMembersPart')),
    '1.4 ⭐ aucune section Statistiques en solo');
  ok(!(await page.isVisible('#communityDiscussionBlock')),
    '1.5 ⭐ aucune section Discussion en solo');
  ok(await page.isVisible('#activitySubProjectsBlock'), '1.6 la section Sous-projets est là');
  ok(await page.isVisible('#newSubProjectCard'),
    '1.7 ⭐ « uniquement l\'option d\'ajouter » : le formulaire est ouvert d\'emblée');
  ok((await page.textContent('#activityPageName')).indexOf('AVide') !== -1,
    '1.8 le nom de l\'activité est en haut de la fenêtre');

  // On crée le premier sous-projet depuis cette page.
  await page.fill('#newSubProjectName', 'Premier objectif');
  await page.click('#newSubProjectSave');
  await page.waitForTimeout(1600);
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1,
    '1.9 ⭐ le sous-projet créé apparaît dans la page');
  ok(await page.isVisible('#activityPage'), '1.10 la page est restée ouverte');
  ok(await detailInPage(page), '1.11 ⭐ le bloc a survécu au rendu de liste déclenché par la création');

  // ============ 2. FERMETURE PAR LA CROIX ============
  await page.click('#activityPageClose');
  await page.waitForTimeout(900);
  ok(!(await page.isVisible('#activityPage')), '2.1 la croix referme la page');
  ok(await detailInPage(page), '2.2 ⭐ le bloc reste dans la page, jamais laissé détaché');

  // ============ 3. SOLO AVEC SOUS-PROJET ============
  await clickActivityRow(page, actPlein.id);
  ok(await page.isVisible('#activityPage'), '3.1 la page s\'ouvre');
  ok(!(await page.isVisible('#activityPageSectionSwitch')), '3.2 toujours pas de sélecteur');
  ok(!(await page.isVisible('#newSubProjectCard')),
    '3.3 le formulaire ne s\'ouvre PAS tout seul quand des sous-projets existent déjà');
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '3.4 le sous-projet est listé');

  // Tâches : seule option d'ajout en solo.
  await page.click('#subProjectsList .subProjectRowHeader');
  await page.waitForTimeout(1100);
  await page.click('#subProjectsList .subProjectRow.open .subProjectAddBtn');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#addSectionTasksBtn'), '3.5 « Nouvelle tâche » proposée');
  ok(!(await page.isVisible('#addSectionPollBtn')), '3.6 ⭐ pas de sondage en solo');
  ok(!(await page.isVisible('#addSectionDiscussionBtn')), '3.7 ⭐ pas de discussion en solo');
  await page.click('#addSectionTasksBtn');
  await page.waitForTimeout(1100);

  const secId = (await api(page, 'GET', '/api/sub-projects/' + sp.id + '?userId=' + user.id))
    .body.sections.filter((s) => s.kind === 'tasks')[0].id;
  await api(page, 'POST', '/api/sub-project-sections/' + secId + '/items', { userId: user.id, label: 'Tache A' });
  await api(page, 'POST', '/api/sub-project-sections/' + secId + '/items', { userId: user.id, label: 'Tache B' });
  await page.click('#activityPageClose');
  await page.waitForTimeout(700);
  await clickActivityRow(page, actPlein.id);

  ok(await page.isVisible('#activityProgressWrap'),
    '3.8 ⭐ l\'anneau d\'avancement GLOBAL s\'affiche');
  ok((await page.textContent('#activityProgressPercent')).indexOf('0%') !== -1,
    '3.9 avancement global à 0 % avec deux tâches non cochées');
  const badge = await page.textContent('#subProjectsList .subProjectBadge');
  ok(badge.indexOf('0/2') !== -1,
    '3.10 ⭐ l\'avancement LOCAL du sous-projet est affiché — "' + badge + '"');

  // Une tâche cochée : les deux avancements bougent ensemble.
  const items = (await api(page, 'GET', '/api/sub-projects/' + sp.id + '?userId=' + user.id)).body;
  const firstItem = items.sections.filter((s) => s.kind === 'tasks')[0].items[0];
  await api(page, 'PUT', '/api/sub-project-items/' + firstItem.id, { userId: user.id, done: true });
  await page.click('#activityPageClose');
  await page.waitForTimeout(700);
  await clickActivityRow(page, actPlein.id);
  ok((await page.textContent('#activityProgressPercent')).indexOf('50%') !== -1,
    '3.11 ⭐ une tâche cochée sur deux → 50 % en global');
  ok((await page.textContent('#subProjectsList .subProjectBadge')).indexOf('1/2') !== -1,
    '3.12 ⭐ et 1/2 en local');

  await page.screenshot({ path: '/home/claude/work3/solo-page.png' });

  // ============ 4. RIEN NE SE DÉPLIE PLUS DANS LE VOLET ============
  await page.click('#activityPageClose');
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => !document.getElementById('activityInlineHeader')),
    '4.1 ⭐ le bandeau « Fermer » du mode déplié n\'existe plus dans le DOM');
  ok(await page.evaluate(() => {
    const d = document.getElementById('communityActivityDetail');
    return !d.closest('#activitiesList');
  }), '4.2 ⭐ le bloc n\'est jamais descendu dans la liste des activités');

  // ============ 5. UNE ACTIVITÉ PARTAGÉE GARDE SES TROIS SECTIONS ============
  const other = 'SoloPageOther' + stamp;
  const user2 = (await api(page, 'POST', '/api/profile', {
    name: other, lastName: 'Test', phone: '+15145550189', email: other + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  await api(page, 'POST', '/api/activities/' + actPartage.id + '/invite', { userId: user.id, pseudo: other });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + user2.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: user2.id });

  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1100);
  await clickActivityRow(page, actPartage.id);
  ok(await page.isVisible('#activityPage'), '5.1 l\'activité partagée ouvre sa page');
  ok(await page.isVisible('#activityPageSectionSwitch'),
    '5.2 ⭐ elle garde son sélecteur de sections');
  ok(await page.isVisible('#activityPageTabStats'), '5.3 avec Statistiques');
  ok(await page.isVisible('#activityPageTabDisc'), '5.4 et Discussion');
  await page.click('#activityPageTabDisc');
  await page.waitForTimeout(800);
  ok(await page.isVisible('#communityDiscussionBlock'),
    '5.5 ⭐ le fil de discussion s\'affiche bien en partagé');

  // Retour direct d'une page partagée à une activité solo.
  await page.click('#activityPageClose');
  await page.waitForTimeout(800);
  await clickActivityRow(page, actPlein.id);
  ok(await page.isVisible('#activityPage'), '5.6 retour au solo : la page s\'ouvre');
  ok(!(await page.isVisible('#activityPageSectionSwitch')),
    '5.7 ⭐ et son sélecteur est de nouveau masqué');
  ok(!(await page.isVisible('#communityDiscussionBlock')),
    '5.8 ⭐ la discussion affichée juste avant est bien masquée en solo');

  const realErrors = consoleErrors.filter((e) =>
    e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '6.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
