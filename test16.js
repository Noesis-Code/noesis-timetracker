// test16.js — suite navigateur (Playwright) : ACTIVITÉ SOLO.
//
// Discussion "Activité solo", 4 septembre 2026. Chantier 2 : sur une activité
// NON PARTAGÉE, un sous-projet ne propose ni sondage ni discussion, et ceux
// qui existent déjà (activité « Séparée » après coup) sont MASQUÉS, jamais
// supprimés — décision d'Emilien : « masquer, rien supprimer ».
//
// La suite vérifie donc les deux moitiés de cette décision :
//   · en solo, rien de tout ça ne s'affiche ni ne se propose ;
//   · une fois l'activité (re)partagée, tout réapparaît INTACT.
//
// Lancement : node test16.js  (serveur sur :3000, base VIERGE, playwright)

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

async function openSubProject(page, name) {
  const rows = await page.$$('#subProjectsList .subProjectRow');
  for (const row of rows) {
    const label = await row.$eval('.activityRowName', (e) => e.textContent).catch(() => '');
    if (label === name) {
      await row.$eval('.subProjectRowHeader', (e) => e.click());
      await page.waitForTimeout(900);
      return true;
    }
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  // Compteur de requêtes : sert à prouver que le minuteur du fil d'un
  // sous-projet ne tourne PAS en solo (bloc masqué = aucun trafic).
  let messagePolls = 0;
  page.on('request', (r) => {
    if (/\/api\/sub-projects\/\d+\/messages/.test(r.url()) && r.method() === 'GET') messagePolls++;
  });

  await page.goto(BASE);

  const stamp = Date.now();
  const name = 'SoloTest' + stamp;
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550133', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil créé');

  const activity = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'Solo' + stamp })).body;
  ok(!!activity.id, '0.2 activité créée (solo)');

  // spA : sous-projet vierge — sert à regarder le MENU "Ajouter".
  const spA = (await api(page, 'POST', '/api/activities/' + activity.id + '/sub-projects', {
    userId: user.id, name: 'Vierge',
  })).body;
  // spB : sous-projet HÉRITÉ — il porte déjà un sondage et une discussion,
  // exactement comme après un « Séparer » d'une activité partagée.
  const spB = (await api(page, 'POST', '/api/activities/' + activity.id + '/sub-projects', {
    userId: user.id, name: 'Herite',
  })).body;
  ok(!!spA.id && !!spB.id, '0.3 deux sous-projets créés');

  const secPoll = (await api(page, 'POST', '/api/sub-projects/' + spB.id + '/sections', {
    userId: user.id, kind: 'poll',
  }));
  const secDisc = (await api(page, 'POST', '/api/sub-projects/' + spB.id + '/sections', {
    userId: user.id, kind: 'discussion',
  }));
  ok(secPoll.status < 400 && secDisc.status < 400, '0.4 sections sondage + discussion créées sur le sous-projet hérité');

  // Un message et un sondage déjà présents : ce sont EUX qu'on ne doit pas perdre.
  await api(page, 'POST', '/api/sub-projects/' + spB.id + '/messages', { userId: user.id, body: 'Message hérité' });
  const poll = await api(page, 'POST', '/api/polls', {
    userId: user.id, scope: 'subproject', scopeId: String(spB.id),
    question: 'Question héritée ?', options: ['Oui', 'Non'],
  });
  ok(poll.status < 400, '0.5 un sondage hérité existe sur ce sous-projet');

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE);
  await page.waitForTimeout(1300);
  ok(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden')),
    '0.6 application ouverte');

  // ================= ACTIVITÉ SOLO =================
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(800);
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(1200);
  // ⚠️ 4 septembre 2026 : cette assertion a été INVERSÉE. Une activité solo
  // n'ouvre plus de page — son bloc se déplie dans sa ligne du volet Activité
  // (demande d'Emilien du même jour, voir test17.js).
  ok(!(await page.isVisible('#activityPage')),
    '1.1 ⭐ une activité solo n\'ouvre PAS de page');
  ok(await page.isVisible('#activitySubProjectsBlock'), '1.2 section Sous-projets affichée');

  // --- Le sous-projet VIERGE : le menu ne propose que des tâches ---
  ok(await openSubProject(page, 'Vierge'), '2.0 sous-projet vierge ouvert');
  await page.click('#subProjectsList .subProjectRow.open .subProjectAddBtn');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#addSectionMenu'), '2.1 le menu "Ajouter" s\'ouvre');
  ok(await page.isVisible('#addSectionTasksBtn'), '2.2 ⭐ "Nouvelle tâche" est proposée');
  ok(!(await page.isVisible('#addSectionPollBtn')), '2.3 ⭐ "Nouveau sondage" N\'EST PAS proposé en solo');
  ok(!(await page.isVisible('#addSectionDiscussionBtn')), '2.4 ⭐ "Nouvelle discussion" N\'EST PAS proposée en solo');

  // Et la seule option restante fonctionne toujours : le chantier ne casse pas
  // la todolist, qui est tout l'intérêt d'un sous-projet solo.
  await page.click('#addSectionTasksBtn');
  await page.waitForTimeout(900);
  ok((await page.$$('#subProjectSections .subProjectSection')).length === 1,
    '2.5 la section de tâches se crée normalement en solo');
  // Tâches créées : plus rien à ajouter en solo, le bouton disparaît.
  ok(!(await page.isVisible('#subProjectsList .subProjectRow.open .subProjectAddBtn')),
    '2.6 ⭐ le bouton "Ajouter" disparaît : en solo, une fois les tâches là, il n\'y a plus rien à ajouter');

  // --- Le sous-projet HÉRITÉ : tout est masqué, rien n'est perdu ---
  ok(await openSubProject(page, 'Herite'), '3.0 sous-projet hérité ouvert');
  ok(!(await page.isVisible('#subProjectPollsBlock')), '3.1 ⭐ le bloc Sondages est masqué en solo');
  ok(!(await page.isVisible('#subProjectDiscussionBlock')), '3.2 ⭐ le fil de discussion est masqué en solo');
  ok(await page.isVisible('#subProjectEmptyHint'),
    '3.3 ⭐ le sous-projet se dit vide : il ne compte que ses sections VISIBLES');

  const badgeHerite = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#subProjectsList .subProjectRow'));
    const r = rows.find((x) => x.querySelector('.activityRowName').textContent === 'Herite');
    return r ? r.querySelector('.subProjectBadge').textContent : '';
  });
  ok(badgeHerite.indexOf('sondages') === -1 && badgeHerite.indexOf('discussion') === -1,
    '3.4 ⭐ la pastille n\'annonce plus un contenu introuvable à l\'écran — "' + badgeHerite + '"');

  // ⭐ LE POINT LE PLUS IMPORTANT : rien n'a été supprimé en base.
  const detailSolo = (await api(page, 'GET', '/api/sub-projects/' + spB.id + '?userId=' + user.id)).body;
  ok(detailSolo.hasPolls === true, '3.5 ⭐ la section sondage EXISTE toujours côté serveur');
  ok(detailSolo.hasDiscussion === true, '3.6 ⭐ la section discussion EXISTE toujours côté serveur');
  const msgsSolo = (await api(page, 'GET', '/api/sub-projects/' + spB.id + '/messages?userId=' + user.id)).body;
  ok((msgsSolo.messages || msgsSolo).length === 1, '3.7 ⭐ le message hérité est toujours en base');
  const pollsSolo = (await api(page, 'GET', '/api/polls?userId=' + user.id + '&scope=subproject&scopeId=' + spB.id)).body;
  ok((pollsSolo.polls || []).length === 1, '3.8 ⭐ le sondage hérité est toujours en base');

  // Le minuteur du fil ne tourne pas sur un bloc masqué.
  const before = messagePolls;
  await page.waitForTimeout(17000);
  ok(messagePolls === before,
    '3.9 ⭐ aucun rafraîchissement du fil en solo (' + (messagePolls - before) + ' requête(s))');

  // ================= L'ACTIVITÉ DEVIENT PARTAGÉE =================
  const other = 'SoloOther' + stamp;
  const user2 = (await api(page, 'POST', '/api/profile', {
    name: other, lastName: 'Test', phone: '+15145550134', email: other + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  await api(page, 'POST', '/api/activities/' + activity.id + '/invite', { userId: user.id, pseudo: other });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + user2.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: user2.id });

  await page.goto(BASE);
  await page.waitForTimeout(1300);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(900);
  await page.click('#activitiesList .activityRow .activityRowHeader');
  await page.waitForTimeout(1400);
  ok(await page.isVisible('#activityPage'), '4.1 la page s\'ouvre aussi quand l\'activité est PARTAGÉE');

  ok(await openSubProject(page, 'Herite'), '4.2 sous-projet hérité rouvert');
  ok(await page.isVisible('#subProjectPollsBlock'), '4.3 ⭐ le bloc Sondages REVIENT une fois l\'activité partagée');
  ok(await page.isVisible('#subProjectDiscussionBlock'), '4.4 ⭐ le fil de discussion REVIENT');
  await page.waitForTimeout(900);
  ok((await page.$$('#subProjectMessagesList .discussionMsg')).length === 1,
    '4.5 ⭐ le message hérité est retrouvé INTACT à l\'écran');
  ok((await page.$$('#subProjectPollsList .pollCard')).length === 1,
    '4.6 ⭐ le sondage hérité est retrouvé INTACT à l\'écran');

  ok(await openSubProject(page, 'Vierge'), '5.0 sous-projet vierge rouvert (activité partagée)');
  await page.click('#subProjectsList .subProjectRow.open .subProjectAddBtn');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#addSectionPollBtn'), '5.1 ⭐ "Nouveau sondage" est de nouveau proposé en partagé');
  ok(await page.isVisible('#addSectionDiscussionBtn'), '5.2 ⭐ "Nouvelle discussion" est de nouveau proposée');
  ok(!(await page.isVisible('#addSectionTasksBtn')), '5.3 "Nouvelle tâche" a disparu : elle existe déjà');

  const realErrors = consoleErrors.filter((e) =>
    e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '6.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
