// test17.js — suite navigateur (Playwright) : PAGE D'UNE ACTIVITÉ SOLO.
//
// Discussion « Activité solo ». État visé au 5 septembre 2026, après trois
// demandes successives d'Emilien :
//
//   · une activité SOLO ouvre une fenêtre identique à celle d'une activité
//     partagée, sans Discussion ;
//   · le formulaire « nouveau sous-projet » ne s'ouvre PLUS tout seul — il
//     n'apparaît qu'au clic sur « + » ;
//   · l'indication « Aucun sous-projet » est sur la MÊME LIGNE que le « + » ;
//   · dès qu'un sous-projet existe, une section Statistiques apparaît, et
//     elle montre le temps de l'activité PAR SOUS-PROJET. Il y a alors deux
//     sections : Sous-projets et Statistiques.
//
// ⚠️ Ce geste a changé quatre fois en trois jours. Les assertions périmées ont
// été retournées, jamais contournées.
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

// Une session d'aujourd'hui, éventuellement rattachée à un sous-projet.
async function seedEntry(page, userId, activityId, subProjectId, minutes, offsetHours) {
  const end = new Date(Date.now() - offsetHours * 3600 * 1000);
  const start = new Date(end.getTime() - minutes * 60 * 1000);
  return api(page, 'POST', '/api/history', {
    userId, activityId, subProjectId,
    startTime: start.toISOString(), endTime: end.toISOString(),
  });
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

  const actVide = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'AVide' + stamp })).body;
  const actPlein = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'BPlein' + stamp })).body;
  const spA = (await api(page, 'POST', '/api/activities/' + actPlein.id + '/sub-projects', {
    userId: user.id, name: 'Maquettes',
  })).body;
  const spB = (await api(page, 'POST', '/api/activities/' + actPlein.id + '/sub-projects', {
    userId: user.id, name: 'Integration',
  })).body;
  const actPartage = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'CPartage' + stamp })).body;
  ok(!!actVide.id && !!actPlein.id && !!spA.id && !!spB.id && !!actPartage.id,
    '0.2 trois activités et deux sous-projets créés');

  // 60 min sur « Maquettes », 30 sur « Integration », 30 sans sous-projet.
  const e1 = await seedEntry(page, user.id, actPlein.id, spA.id, 60, 5);
  const e2 = await seedEntry(page, user.id, actPlein.id, spB.id, 30, 4);
  const e3 = await seedEntry(page, user.id, actPlein.id, null, 30, 3);
  ok(e1.status === 201 && e2.status === 201 && e3.status === 201,
    '0.3 trois sessions enregistrées, dont une sans sous-projet');
  ok(e1.body.subProjectId === spA.id,
    '0.4 le rattachement au sous-projet est bien accepté par le serveur');

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1000);

  // ============ 1. SOLO SANS SOUS-PROJET ============
  await clickActivityRow(page, actVide.id);
  ok(await page.isVisible('#activityPage'), '1.1 la page s\'ouvre');
  ok(await detailInPage(page), '1.2 le bloc vit dans le corps de la page');
  ok(!(await page.isVisible('#newSubProjectCard')),
    '1.3 ⭐ le formulaire de création ne s\'ouvre PLUS tout seul');
  ok(await page.isVisible('#subProjectsEmptyHint'), '1.4 l\'indication « Aucun sous-projet » est visible');

  // ⭐ « alignée avec le + » : même ligne, centres verticaux confondus.
  const align = await page.evaluate(() => {
    const hint = document.getElementById('subProjectsEmptyHint');
    const plus = document.getElementById('addSubProjectBtn');
    const h = hint.getBoundingClientRect(), p = plus.getBoundingClientRect();
    return {
      sameRow: hint.parentElement === plus.parentElement,
      dy: Math.abs((h.top + h.height / 2) - (p.top + p.height / 2)),
      hintLeftOfPlus: h.right <= p.left + 1,
    };
  });
  ok(align.sameRow, '1.5 ⭐ l\'indication et le « + » sont sur la même ligne');
  ok(align.dy <= 2, '1.6 ⭐ leurs centres verticaux sont alignés (écart ' + align.dy.toFixed(1) + 'px)');
  ok(align.hintLeftOfPlus, '1.7 l\'indication est à gauche, le « + » reste à droite');

  // Pas de section Statistiques tant qu'aucun sous-projet n'existe.
  ok(!(await page.isVisible('#activityPageSectionSwitch')),
    '1.8 ⭐ pas de sélecteur : une seule section tant qu\'il n\'y a aucun sous-projet');
  ok(!(await page.isVisible('#activitySoloStatsBlock')), '1.9 pas de section Statistiques non plus');

  // Le « + » ouvre le formulaire — et lui seul.
  await page.click('#addSubProjectBtn');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#newSubProjectCard'), '1.10 ⭐ le « + » ouvre le formulaire');
  await page.fill('#newSubProjectName', 'Premier objectif');
  await page.click('#newSubProjectSave');
  await page.waitForTimeout(1700);
  ok((await page.$$('#subProjectsList .subProjectRow')).length === 1, '1.11 le sous-projet est créé');
  ok(await page.isVisible('#activityPageSectionSwitch'),
    '1.12 ⭐ le sélecteur APPARAÎT dès le premier sous-projet, sans rouvrir la page');
  ok(await page.isVisible('#activityPageTabStats'), '1.13 ⭐ avec l\'onglet Statistiques');
  ok(!(await page.isVisible('#activityPageTabDisc')), '1.14 ⭐ mais jamais la Discussion');
  ok(!(await page.isVisible('#subProjectsEmptyHint')),
    '1.15 l\'indication disparaît, le « + » reste à droite');

  await page.click('#activityPageClose');
  await page.waitForTimeout(800);

  // ============ 2. LES STATISTIQUES PAR SOUS-PROJET ============
  await clickActivityRow(page, actPlein.id);
  ok(await page.isVisible('#activityPageSectionSwitch'), '2.1 deux sections sur une activité solo pourvue');
  await page.click('#activityPageTabStats');
  await page.waitForTimeout(1400);
  ok(await page.isVisible('#activitySoloStatsBlock'), '2.2 ⭐ la section Statistiques s\'affiche');
  ok(!(await page.isVisible('#communityActivityMembersPart')),
    '2.3 ⭐ et ce n\'est PAS le bloc « membres » du partagé');
  ok((await page.textContent('#soloStatsMsg')) === '',
    '2.4 ⭐ aucune erreur serveur : la garde accepte une activité SOLO');
  ok((await page.textContent('#soloStatsTotal')).indexOf('2h00') !== -1,
    '2.5 total de 2h00 — "' + (await page.textContent('#soloStatsTotal')) + '"');
  ok((await page.textContent('#soloStatsLabel')).length > 0,
    '2.6 le libellé de période est affiché — "' + (await page.textContent('#soloStatsLabel')) + '"');

  // ⚠️ La légende lue est celle que renderPie pose DANS le camembert : la
  // section n'en affiche pas une seconde (elle faisait doublon à l'écran).
  const rows = await page.$$eval('#soloStatsPie .pieLegendRow', (els) => els.map((e) => e.textContent));
  ok(rows.length === 3, '2.7 ⭐ trois parts : deux sous-projets + le temps sans sous-projet');
  ok(await page.evaluate(() => !document.getElementById('soloStatsList')),
    '2.7b ⭐ une seule légende, pas deux');
  ok(rows.some((r) => r.indexOf('Maquettes') !== -1 && r.indexOf('50%') !== -1),
    '2.8 ⭐ « Maquettes » à 50 % (1h sur 2h) — ' + JSON.stringify(rows));
  ok(rows.some((r) => r.indexOf('Integration') !== -1 && r.indexOf('25%') !== -1),
    '2.9 ⭐ « Integration » à 25 %');
  ok(rows.some((r) => r.indexOf('Sans sous-projet') !== -1 && r.indexOf('25%') !== -1),
    '2.10 ⭐ le temps NON rattaché forme sa propre part, il n\'est jamais escamoté');
  ok((await page.$$('#soloStatsPie svg')).length === 1, '2.11 le camembert est dessiné');

  // Le menu de période fonctionne et refait l'appel.
  await page.click('#soloStatsPeriodBtn');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#soloStatsPeriodMenu'), '2.12 le menu « ⋮ » de période s\'ouvre');
  await page.click('#soloStatsPeriodMenu .statsPeriodMenuItem[data-period="year"]');
  await page.waitForTimeout(1300);
  ok((await page.textContent('#soloStatsMsg')) === '', '2.13 la période « Année » répond sans erreur');
  ok((await page.textContent('#soloStatsTotal')).indexOf('2h00') !== -1,
    '2.14 et retrouve les mêmes 2h00 sur l\'année');

  await page.screenshot({ path: '/home/claude/work3/solo-stats.png' });

  // Retour sur Sous-projets : l'avancement local et global sont intacts.
  await page.click('#activityPageTabSub');
  await page.waitForTimeout(800);
  ok(await page.isVisible('#activitySubProjectsBlock'), '2.15 retour à la section Sous-projets');
  ok(!(await page.isVisible('#activitySoloStatsBlock')), '2.16 la section Statistiques se masque');

  // ============ 3. TÂCHES ET AVANCEMENT, INCHANGÉS ============
  await page.click('#subProjectsList .subProjectRow:first-child .subProjectRowHeader');
  await page.waitForTimeout(1100);
  await page.click('#subProjectsList .subProjectRow.open .subProjectAddBtn');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#addSectionTasksBtn'), '3.1 « Nouvelle tâche » proposée');
  ok(!(await page.isVisible('#addSectionPollBtn')), '3.2 pas de sondage en solo');
  ok(!(await page.isVisible('#addSectionDiscussionBtn')), '3.3 pas de discussion en solo');
  await page.click('#addSectionTasksBtn');
  await page.waitForTimeout(1100);

  const detail = (await api(page, 'GET', '/api/sub-projects/' + spA.id + '?userId=' + user.id)).body;
  const secId = detail.sections.filter((s) => s.kind === 'tasks')[0].id;
  await api(page, 'POST', '/api/sub-project-sections/' + secId + '/items', { userId: user.id, label: 'Tache A' });
  await api(page, 'POST', '/api/sub-project-sections/' + secId + '/items', { userId: user.id, label: 'Tache B' });
  const items = (await api(page, 'GET', '/api/sub-projects/' + spA.id + '?userId=' + user.id)).body;
  await api(page, 'PUT', '/api/sub-project-items/'
    + items.sections.filter((s) => s.kind === 'tasks')[0].items[0].id, { userId: user.id, done: true });
  await page.click('#activityPageClose');
  await page.waitForTimeout(700);
  await clickActivityRow(page, actPlein.id);
  ok(await page.isVisible('#activityProgressWrap'), '3.4 l\'anneau d\'avancement global est là');
  ok((await page.textContent('#activityProgressPercent')).indexOf('50%') !== -1,
    '3.5 ⭐ une tâche cochée sur deux → 50 % en global');
  const badges = await page.$$eval('#subProjectsList .subProjectBadge', (els) => els.map((e) => e.textContent));
  ok(badges.some((b) => b.indexOf('1/2') !== -1), '3.6 ⭐ et 1/2 en local — ' + JSON.stringify(badges));

  // ⭐ Temps et avancement restent DEUX chiffres distincts : cocher une tâche
  // ne doit rien changer au camembert des heures.
  await page.click('#activityPageTabStats');
  await page.waitForTimeout(1400);
  ok((await page.textContent('#soloStatsTotal')).indexOf('2h00') !== -1,
    '3.7 ⭐ cocher une tâche ne change pas le temps mesuré');

  // ============ 4. UNE ACTIVITÉ PARTAGÉE GARDE SES TROIS SECTIONS ============
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
  ok(await page.isVisible('#activityPageSectionSwitch'), '4.1 l\'activité partagée garde son sélecteur');
  ok(await page.isVisible('#activityPageTabDisc'), '4.2 ⭐ avec sa Discussion');
  await page.click('#activityPageTabStats');
  await page.waitForTimeout(1200);
  ok(await page.isVisible('#communityActivityMembersPart'),
    '4.3 ⭐ et c\'est bien son bloc « membres » qui s\'affiche, pas celui du solo');
  ok(!(await page.isVisible('#activitySoloStatsBlock')), '4.4 le bloc solo reste masqué en partagé');

  await page.click('#activityPageClose');
  await page.waitForTimeout(800);
  await clickActivityRow(page, actPlein.id);
  await page.click('#activityPageTabStats');
  await page.waitForTimeout(1300);
  ok(await page.isVisible('#activitySoloStatsBlock'),
    '4.5 ⭐ retour au solo : c\'est de nouveau le bloc par sous-projet');
  ok(!(await page.isVisible('#communityActivityMembersPart')), '4.6 et le bloc membres est masqué');

  const realErrors = consoleErrors.filter((e) =>
    e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '5.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
