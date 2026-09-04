// test17.js — suite navigateur (Playwright) : ACTIVITÉ SOLO DÉPLIÉE DANS LE VOLET.
//
// Discussion « Activité solo », 4 septembre 2026. Demande d'Emilien, verbatim :
// « lorsque l'on clique sur activité solo depuis le volet activité, on puisse
// directement ajouter un projet et que les projets soient directement visibles,
// toujours sur le volet, sans aller dans une nouvelle page. [...] les principes
// et la mise en forme [...] les mêmes que sur les fenêtres des activités
// partagées avec l'avancement, les différents sous-projets reliés au chrono et
// [...] la possibilité de créer des tâches (avec l'avancement global et local)
// mais [...] pas [...] discussion. »
//
// Trois choses à prouver, et la troisième est celle qui casse en silence :
//   1. une activité SOLO ne fait plus jamais apparaître #activityPage ;
//   2. le bloc est bien DANS sa ligne, avec avancement + sous-projets + tâches,
//      sans statistiques ni discussion ;
//   3. le bloc SURVIT à un rendu de la liste — c'est le piège documenté
//      (box.innerHTML = '' détruit la ligne, et le bloc avec).
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

// Le détail est-il un descendant de la ligne de CETTE activité ?
async function detailInsideRow(page, activityId) {
  return page.evaluate((id) => {
    const row = document.querySelector('#activitiesList .activityRow[data-activity-id="' + id + '"]');
    const detail = document.getElementById('communityActivityDetail');
    return !!(row && detail && row.contains(detail));
  }, String(activityId));
}

async function clickActivityRow(page, activityId) {
  await page.click('#activitiesList .activityRow[data-activity-id="' + activityId + '"] .activityRowHeader');
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE);

  const stamp = Date.now();
  const name = 'Inline' + stamp;
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550166', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil créé');

  // A : solo SANS aucun sous-projet — c'est le cas dont la règle a changé.
  const actVide = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'AVide' + stamp })).body;
  // B : solo AVEC un sous-projet.
  const actPlein = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'BPlein' + stamp })).body;
  const sp = (await api(page, 'POST', '/api/activities/' + actPlein.id + '/sub-projects', {
    userId: user.id, name: 'Maquettes',
  })).body;
  // C : activité qui sera PARTAGÉE — elle doit garder sa page.
  const actPartage = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'CPartage' + stamp })).body;
  ok(!!actVide.id && !!actPlein.id && !!actPartage.id && !!sp.id, '0.2 trois activités et un sous-projet créés');

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE);
  await page.waitForTimeout(1400);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(900);

  // ============ 1. SOLO SANS SOUS-PROJET : plus de « rien ne se passe » ============
  await clickActivityRow(page, actVide.id);
  ok(!(await page.isVisible('#activityPage')),
    '1.1 ⭐ aucune page ne s\'ouvre sur une activité solo');
  ok(await detailInsideRow(page, actVide.id),
    '1.2 ⭐ le bloc est déplié DANS la ligne, dans le volet Activité');
  ok(await page.isVisible('#activitySubProjectsBlock'), '1.3 les sous-projets sont visibles');
  ok(await page.isVisible('#newSubProjectCard'),
    '1.4 ⭐ « directement ajouter un projet » : le formulaire de création est ouvert d\'emblée');
  ok(await page.isVisible('#activityInlineClose'), '1.5 le bouton « Fermer » est présent');
  ok(!(await page.isVisible('#communityActivityMembersPart')),
    '1.6 ⭐ aucune statistique en solo (elles vivent désormais dans le volet Stats)');
  ok(!(await page.isVisible('#communityDiscussionBlock')), '1.7 ⭐ aucune discussion en solo');

  // On crée le premier sous-projet depuis ce formulaire.
  await page.fill('#newSubProjectName', 'Premier objectif');
  await page.click('#newSubProjectSave');
  await page.waitForTimeout(1500);
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1,
    '1.8 ⭐ le sous-projet créé apparaît immédiatement dans la ligne');
  ok(!(await page.isVisible('#activityPage')),
    '1.9 ⭐ et toujours aucune page ne s\'ouvre après la création');
  ok(await detailInsideRow(page, actVide.id),
    '1.10 ⭐ le bloc a SURVÉCU au rendu de la liste déclenché par la création');

  // ============ 2. LE BOUTON « FERMER » ============
  await page.click('#activityInlineClose');
  await page.waitForTimeout(900);
  ok(!(await page.isVisible('#communityActivityDetail')), '2.1 « Fermer » referme le bloc');
  ok(!(await detailInsideRow(page, actVide.id)), '2.2 et le nœud est ressorti de la ligne');
  ok(await page.evaluate(() => {
    const d = document.getElementById('communityActivityDetail');
    const body = document.getElementById('activityPageBody');
    return !!(d && body && body.contains(d));
  }), '2.3 ⭐ il est remis dans son hôte par défaut, jamais laissé détaché');

  // ============ 3. SOLO AVEC SOUS-PROJET : avancement global et local ============
  await clickActivityRow(page, actPlein.id);
  ok(!(await page.isVisible('#activityPage')), '3.1 toujours aucune page');
  ok(await detailInsideRow(page, actPlein.id), '3.2 le bloc s\'est déplacé dans l\'autre ligne');
  ok(!(await page.isVisible('#newSubProjectCard')),
    '3.3 le formulaire ne s\'ouvre PAS tout seul quand des sous-projets existent déjà');
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '3.4 le sous-projet est listé');

  // Tâches : on ouvre le sous-projet et on crée une section de tâches.
  await page.click('#subProjectsList .subProjectRowHeader');
  await page.waitForTimeout(1000);
  await page.click('#subProjectsList .subProjectRow.open .subProjectAddBtn');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#addSectionTasksBtn'), '3.5 « Nouvelle tâche » proposée');
  ok(!(await page.isVisible('#addSectionPollBtn')), '3.6 pas de sondage en solo');
  ok(!(await page.isVisible('#addSectionDiscussionBtn')), '3.7 pas de discussion en solo');
  await page.click('#addSectionTasksBtn');
  await page.waitForTimeout(1000);

  const secId = (await api(page, 'GET', '/api/sub-projects/' + sp.id + '?userId=' + user.id))
    .body.sections.filter((s) => s.kind === 'tasks')[0].id;
  await api(page, 'POST', '/api/sub-project-sections/' + secId + '/items', { userId: user.id, label: 'Tache A' });
  await api(page, 'POST', '/api/sub-project-sections/' + secId + '/items', { userId: user.id, label: 'Tache B' });
  await clickActivityRow(page, actPlein.id);   // recharge le bloc
  await page.waitForTimeout(800);

  ok(await page.isVisible('#activityProgressWrap'),
    '3.8 ⭐ l\'anneau d\'avancement GLOBAL s\'affiche dans le volet');
  ok((await page.textContent('#activityProgressPercent')).indexOf('0%') !== -1,
    '3.9 avancement global à 0 % avec deux tâches non cochées');
  const badge = await page.textContent('#subProjectsList .subProjectBadge');
  ok(badge.indexOf('0/2') !== -1,
    '3.10 ⭐ l\'avancement LOCAL du sous-projet est affiché — "' + badge + '"');

  // On coche une tâche : les deux avancements bougent ensemble.
  const items = (await api(page, 'GET', '/api/sub-projects/' + sp.id + '?userId=' + user.id)).body;
  const firstItem = items.sections.filter((s) => s.kind === 'tasks')[0].items[0];
  await api(page, 'PUT', '/api/sub-project-items/' + firstItem.id, { userId: user.id, done: true });
  await clickActivityRow(page, actPlein.id);
  await page.waitForTimeout(900);
  ok((await page.textContent('#activityProgressPercent')).indexOf('50%') !== -1,
    '3.11 ⭐ une tâche cochée sur deux → 50 % en global');
  ok((await page.textContent('#subProjectsList .subProjectBadge')).indexOf('1/2') !== -1,
    '3.12 ⭐ et 1/2 en local');

  // ============ 4. LE RENDU DE LISTE NE DÉTRUIT PAS LE BLOC ============
  // C'est le piège : box.innerHTML = '' emporte la ligne, et le bloc avec.
  await page.evaluate(() => { document.querySelector('.tabBtn[data-tab="chrono"]').click(); });
  await page.waitForTimeout(700);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1400);
  ok(await detailInsideRow(page, actPlein.id),
    '4.1 ⭐ le bloc est toujours dans sa ligne après un aller-retour d\'onglets');
  ok(await page.isVisible('#subProjectsList'), '4.2 et son contenu est toujours là');

  // ============ 5. UNE ACTIVITÉ PARTAGÉE GARDE SA PAGE ============
  const other = 'InlineOther' + stamp;
  const user2 = (await api(page, 'POST', '/api/profile', {
    name: other, lastName: 'Test', phone: '+15145550167', email: other + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  await api(page, 'POST', '/api/activities/' + actPartage.id + '/invite', { userId: user.id, pseudo: other });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + user2.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: user2.id });

  await page.goto(BASE);
  await page.waitForTimeout(1400);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1000);
  await clickActivityRow(page, actPartage.id);
  ok(await page.isVisible('#activityPage'),
    '5.1 ⭐ une activité PARTAGÉE ouvre toujours sa page plein écran');
  ok(await page.isVisible('#activityPageSectionSwitch'), '5.2 son sélecteur de sections est là');
  ok(await page.isVisible('#activityPageTabDisc'), '5.3 avec la Discussion');
  ok(await page.evaluate(() => {
    const d = document.getElementById('communityActivityDetail');
    const body = document.getElementById('activityPageBody');
    return !!(d && body && body.contains(d));
  }), '5.4 ⭐ le bloc est remonté dans la page');

  // Et l'on repasse directement de la page partagée à une activité solo.
  await page.click('#activityPageClose');
  await page.waitForTimeout(900);
  await clickActivityRow(page, actPlein.id);
  ok(!(await page.isVisible('#activityPage')), '5.5 retour au solo : plus de page');
  ok(await detailInsideRow(page, actPlein.id), '5.6 ⭐ et le bloc redescend dans la ligne');

  const realErrors = consoleErrors.filter((e) =>
    e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '6.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await page.screenshot({ path: '/home/claude/work2/inline-solo.png' });

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
