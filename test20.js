// test20.js — suite navigateur (Playwright) : troisième passage du chantier
// « Chrono — sous-projets » (4 septembre 2026).
//
// Ce que cette suite garde, demande par demande d'Emilien :
//   1. « je souhaite que la légende ne soit affichée qu'une seule fois »
//   2. « je souhaite que la répartition ait exactement la même forme et les
//      mêmes fonctionnalités que pour la répartition de la section répartition
//      du volet stats »
//   3. « je souhaite afficher la feuille de temps avec le même visuel et les
//      mêmes fonctionnalités que pour la section stats »
//   4. « je souhaite que la répartition soit synchronisée avec la feuille de
//      temps de l'activité et qu'il y ait l'option de se désynchroniser sur la
//      journée en cliquant sur "aujourd'hui" »
//   5. « je souhaite que les activités qui n'ont pas encore enregistré de
//      sous-projets dans chrono, n'ont pas l'option et ne s'ouvrent pas »
//      (sur la période affichée — sa réponse du même jour)
//   6. « je souhaite que l'affichage ne se fasse plus avec un clic rapide sur
//      la couleur d'une activité (ce qui est le cas pour le volet stat) mais
//      grâce à un bouton et des options pour sélectionner le sous-projet que
//      l'on désire observer » — dans la section Statistiques d'une ACTIVITÉ,
//      où la comparaison entre MEMBRES doit rester à l'écran.
//
// ⚠️ Pièges déjà payés, respectés ici :
//   - le serveur tourne en America/Toronto alors que ce processus est en UTC :
//     toutes les sessions de test sont placées entre 9h et 17h locales, sinon
//     elles basculent la veille et le détail du jour perd la moitié du temps
//     (voir test18.js) ;
//   - une part de camembert qui fait le tour complet ne se clique pas au
//     centre de sa boîte (c'est le trou du donut) : on envoie l'événement
//     directement sur le <path> (voir test19.js).
//
// Lancement : node test20.js  (serveur sur :3000, base VIERGE, playwright)

const { chromium } = require('playwright');

const BASE = 'http://localhost:' + (process.env.PORT || 3000);
let passed = 0, failed = 0;
function ok(cond, label) { if (cond) passed++; else { failed++; console.log('  ✗ ' + label); } }
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), label + ' — attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a));
}

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { method, path, body });
}

(async () => {
  console.log('--- Troisième passage : fenêtre de détail, filtre et sélecteur ---\n');
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const stamp = Date.now();
  const name = 'SP3' + stamp;
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550401', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil de test créé');

  // DEUX activités : l'une avec du temps rattaché à des sous-projets, l'autre
  // avec du temps mais AUCUN rattachement. C'est tout l'objet du filtre
  // d'ouverture : la seconde ne doit ni s'ouvrir ni proposer de le faire.
  const avec = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'Avec' + stamp })).body;
  const sans = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'Sans' + stamp })).body;
  const sp1 = (await api(page, 'POST', '/api/activities/' + avec.id + '/sub-projects',
    { userId: user.id, name: 'Cadrage' })).body;
  const sp2 = (await api(page, 'POST', '/api/activities/' + avec.id + '/sub-projects',
    { userId: user.id, name: 'Développement' })).body;

  const today = new Date();
  async function seed(activityId, subProjectId, hour, minutes, dayOffset) {
    await api(page, 'POST', '/api/timer/start', { userId: user.id, activityId });
    if (subProjectId) await api(page, 'POST', '/api/timer/sub-project', { userId: user.id, subProjectId });
    const s = new Date(today);
    if (dayOffset) s.setDate(s.getDate() + dayOffset);
    s.setHours(hour, 0, 0, 0);
    const e = new Date(s.getTime() + minutes * 60000);
    await api(page, 'POST', '/api/timer/stop', {
      userId: user.id, startTime: s.toISOString(), endTime: e.toISOString(),
    });
  }
  await seed(avec.id, sp1.id, 9, 120);    // 2h aujourd'hui, sur « Cadrage »
  await seed(avec.id, sp2.id, 12, 60);    // 1h aujourd'hui, sur « Développement »
  await seed(avec.id, null, 15, 60);      // 1h aujourd'hui, non rattachée
  await seed(sans.id, null, 10, 90);      // 1h30 aujourd'hui, activité sans sous-projet
  // Une session ANCIENNE (8 jours : toujours dans une semaine antérieure,
  // quel que soit le jour de la semaine où cette suite tourne). Elle sert
  // uniquement à activer la flèche ‹ de la fenêtre : sans historique en
  // amont, la Feuille de temps la désactive — comme dans le volet Stats.
  await seed(avec.id, sp1.id, 9, 120, -8);

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.click('.tabBtn[data-tab="stats"]');
  await page.waitForTimeout(2000);   // grille + camembert + liste des activités ouvrables

  // ============ 1. ⭐ Le filtre d'ouverture ============
  console.log('1. ⭐ Une activité sans temps rattaché n\'a pas l\'option et ne s\'ouvre pas');

  const legend = await page.$$eval('#statsPie .pieLegendRow', (rs) => rs.map((r) => ({
    label: r.querySelector('.pieLegendLabel').textContent,
    tappable: r.classList.contains('pieLegendRow-tappable'),
  })));
  eq(legend.length, 2, '1.1 les deux activités sont dans la légende');
  const rowAvec = legend.find((r) => /^Avec/.test(r.label));
  const rowSans = legend.find((r) => /^Sans/.test(r.label));
  ok(rowAvec && rowAvec.tappable, '1.2 l\'activité AVEC temps rattaché reste cliquable');
  ok(rowSans && !rowSans.tappable,
    '1.3 ⭐ l\'activité SANS temps rattaché n\'a aucune affordance dans la légende');

  eq(await page.evaluate(() => document.querySelectorAll('#statsPie .pieSlice-tappable').length), 1,
    '1.4 ⭐ une seule part de camembert sur deux est cliquable');

  // Les cases de la grille : celles de l'activité sans sous-projet ont perdu
  // la classe, mais gardent leurs attributs (prise du rattrapage applyGridGate).
  const cells = await page.$$eval('#tsGrid .tsSlot-filled[data-activity-id]', (els) => els.map((e) => ({
    name: e.getAttribute('data-activity-name'),
    tappable: e.classList.contains('tsSlot-tappable'),
  })));
  ok(cells.length > 0, '1.5 la grille contient des cases des deux activités (' + cells.length + ')');
  ok(cells.filter((c) => /^Sans/.test(c.name)).length > 0
     && cells.filter((c) => /^Sans/.test(c.name)).every((c) => !c.tappable),
    '1.6 ⭐ aucune case de l\'activité sans sous-projet n\'est cliquable');
  ok(cells.filter((c) => /^Avec/.test(c.name)).every((c) => c.tappable),
    '1.7 toutes les cases de l\'autre le sont');

  // Et la garde de dernier recours : même forcé, l'appui n'ouvre rien.
  await page.evaluate(() => {
    const cell = Array.from(document.querySelectorAll('#tsGrid [data-activity-id]'))
      .find((e) => /^Sans/.test(e.getAttribute('data-activity-name') || ''));
    if (cell) cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  ok(await page.isHidden('#subProjectStatsModal'),
    '1.8 ⭐⭐ forcer l\'appui sur cette activité n\'ouvre toujours RIEN');

  // ============ 2. La fenêtre : une feuille de temps, une répartition ============
  console.log('2. La fenêtre reprend la Feuille de temps et la Répartition du volet Stats');
  await page.evaluate(() => {
    const cell = Array.from(document.querySelectorAll('#tsGrid [data-activity-id]'))
      .find((e) => /^Avec/.test(e.getAttribute('data-activity-name') || ''));
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  ok(await page.isVisible('#subProjectStatsModal'), '2.1 la fenêtre s\'ouvre');
  ok(await page.isVisible('#spTimesheetBlock'), '2.2 ⭐ elle contient une Feuille de temps');
  ok(await page.isVisible('#spPieBlock'), '2.3 et une Répartition');

  // Mêmes classes que les sections du volet Statistiques : c'est ce qui
  // garantit « le même visuel », puisque le CSS est le même.
  const sameShape = await page.evaluate(() => {
    const ref = document.getElementById('statsTimesheetBlock');
    const mine = document.getElementById('spTimesheetBlock');
    return {
      block: mine.className === ref.className,
      hasFrozen: !!document.querySelector('#spTsFrozenCol'),
      hasNav: !!document.querySelector('#spTsPrevWeek') && !!document.querySelector('#spTsNextWeek'),
      hasPeriodMenu: !!document.querySelector('#spTsPeriodMenu .statsPeriodMenuItem'),
      hasToday: !!document.querySelector('#spPieTodayBtn'),
    };
  });
  ok(sameShape.block, '2.4 le bloc porte les mêmes classes que celui du volet Stats');
  ok(sameShape.hasFrozen, '2.5 avec sa colonne de libellés figée');
  ok(sameShape.hasNav, '2.6 ses flèches ‹ › de semaine');
  ok(sameShape.hasPeriodMenu, '2.7 son menu ⋮ Semaine/Mois');
  ok(sameShape.hasToday, '2.8 et le bouton « Aujourd\'hui » de la Répartition');

  const filled = await page.evaluate(() => document.querySelectorAll('#spTsGrid .tsSlot-filled').length);
  ok(filled > 0, '2.9 la grille de la fenêtre est remplie (' + filled + ' cases)');
  eq(await page.evaluate(() => document.querySelectorAll('#spTsGrid .tsSlot-tappable').length), 0,
    '2.10 ⭐ ses cases ne sont PAS cliquables : on est déjà au niveau le plus fin');

  eq(await page.evaluate(() => document.querySelectorAll('#subProjectStatsModal .pieLegend').length), 1,
    '2.11 ⭐ une seule légende dans toute la fenêtre');

  // ============ 3. ⭐ Répartition synchronisée avec la grille ============
  console.log('3. ⭐ La Répartition suit la Feuille de temps, et « Aujourd\'hui » la désynchronise');
  // Les sessions sont semées sur des bornes de 15 min et durent des heures
  // pleines : en vue Semaine, chaque case vaut donc exactement 15 min et la
  // somme des cases DOIT être le total de la Répartition. C'est la formulation
  // la plus stricte de « la répartition est synchronisée avec la feuille de
  // temps » : les deux se contredisent au moindre écart.
  function hm(sec) {
    return Math.floor(sec / 3600) + 'h' + String(Math.round((sec % 3600) / 60)).padStart(2, '0');
  }
  async function gridVsPie() {
    return page.evaluate(() => ({
      total: document.getElementById('spStatsTotal').textContent,
      filled: document.querySelectorAll('#spTsGrid .tsSlot-filled').length,
      label: document.getElementById('spStatsLabel').textContent,
    }));
  }

  const cur = await gridVsPie();
  eq(cur.total, '4h00', '3.1 sur la semaine affichée, le total est celui des trois sessions du jour');
  eq(cur.total, hm(cur.filled * 900),
    '3.2 ⭐ ce total est EXACTEMENT la somme des cases de la grille (' + cur.filled + ' × 15 min)');

  // Semaine antérieure : la grille change, la Répartition doit changer avec.
  await page.click('#spTsPrevWeek');
  await page.waitForTimeout(1200);
  const prev = await gridVsPie();
  eq(prev.total, hm(prev.filled * 900),
    '3.3 ⭐ après un pas en arrière, les deux se répondent toujours (' + prev.filled + ' cases / ' + prev.total + ')');
  ok(prev.total !== '4h00',
    '3.4 et la Répartition n\'est PAS restée sur la semaine précédente (' + prev.total + ')');

  // « Aujourd'hui » : la Répartition se recale sur la journée, la grille NON.
  const filledBefore = prev.filled;
  await page.click('#spPieTodayBtn');
  await page.waitForTimeout(1200);
  const desync = await page.evaluate(() => ({
    pressed: document.getElementById('spPieTodayBtn').getAttribute('aria-pressed'),
    total: document.getElementById('spStatsTotal').textContent,
    filled: document.querySelectorAll('#spTsGrid .tsSlot-filled').length,
  }));
  eq(desync.pressed, 'true', '3.5 le bouton est marqué actif');
  eq(desync.total, '4h00', '3.6 ⭐ la Répartition montre la JOURNÉE en cours (4h00)');
  eq(desync.filled, filledBefore,
    '3.7 ⭐⭐ alors que la grille n\'a pas bougé : c\'est bien une DÉSYNCHRONISATION');

  // Second appui : resynchronisation, sans nouvel appel serveur.
  await page.click('#spPieTodayBtn');
  await page.waitForTimeout(900);
  const resync = await page.evaluate(() => ({
    pressed: document.getElementById('spPieTodayBtn').getAttribute('aria-pressed'),
    total: document.getElementById('spStatsTotal').textContent,
  }));
  eq(resync.pressed, 'false', '3.8 un second appui relâche le bouton');
  eq(resync.total, prev.total, '3.9 ⭐ et la Répartition se recale sur la grille');

  await page.click('#spTsNextWeek');
  await page.waitForTimeout(1200);
  eq(await page.textContent('#spStatsTotal'), '4h00', '3.10 retour sur la semaine en cours');

  // Vue Mois : le même couple grille + répartition, par le même chemin. Le
  // total attendu vient de la route elle-même — le mois peut contenir ou non
  // la session d'il y a huit jours selon le jour où la suite tourne.
  const monthApi = (await api(page, 'GET', '/api/sub-project-timesheet?userId=' + user.id
    + '&activityId=' + avec.id + '&period=month&monthOffset=0')).body;
  await page.click('#spTsPeriodBtn');
  await page.waitForTimeout(300);
  await page.click('#spTsPeriodMenu .statsPeriodMenuItem[data-period="month"]');
  await page.waitForTimeout(1300);
  ok(await page.isVisible('#spTsCalendar'), '3.11 la vue Mois affiche le calendrier');
  ok(await page.evaluate(() => document.querySelectorAll('#spTsCalendar .tsCalSlot').length > 0),
    '3.12 avec ses cases de 2h');
  eq(await page.textContent('#spStatsTotal'), hm(monthApi.breakdown.totalSeconds),
    '3.13 ⭐ et la Répartition a suivi la période Mois');

  await page.click('#subProjectStatsClose');
  await page.waitForTimeout(400);
  ok(await page.isHidden('#subProjectStatsModal'), '3.13 la fenêtre se referme');

  // ============ 4. ⭐ Section Statistiques d'une ACTIVITÉ ============
  console.log('4. ⭐ Section Statistiques d\'une activité : un bouton, pas un clic sur la couleur');

  // Un second membre : c'est la comparaison ENTRE MEMBRES qu'Emilien veut
  // conserver, sous-projet par sous-projet.
  const other = (await api(page, 'POST', '/api/profile', {
    name: 'Duo' + stamp, lastName: 'Test', phone: '+15145550402',
    email: 'duo' + stamp + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  const inv = await api(page, 'POST', '/api/activities/' + avec.id + '/invite',
    { userId: user.id, pseudo: 'Duo' + stamp });
  ok(inv.status === 200 || inv.status === 201, '4.1 invitation envoyée (' + inv.status + ')');
  const invites = (await api(page, 'GET', '/api/invites?userId=' + other.id)).body;
  const pending = (invites || [])[0];
  ok(!!pending, '4.2 l\'autre membre a bien reçu l\'invitation');
  await api(page, 'POST', '/api/invites/' + pending.id + '/accept', { userId: other.id });

  // Du temps pour l'autre membre, rattaché à UN SEUL sous-projet : c'est ce
  // qui rendra le filtre lisible (les deux membres n'y sont pas à égalité).
  await api(page, 'POST', '/api/timer/start', { userId: other.id, activityId: avec.id });
  await api(page, 'POST', '/api/timer/sub-project', { userId: other.id, subProjectId: sp2.id });
  const os = new Date(today); os.setHours(11, 0, 0, 0);
  await api(page, 'POST', '/api/timer/stop', {
    userId: other.id, startTime: os.toISOString(), endTime: new Date(os.getTime() + 180 * 60000).toISOString(),
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1000);
  await page.click('#activitiesList [data-activity-id="' + avec.id + '"] .activityRowHeader');
  await page.waitForTimeout(1200);
  // La page d'activité s'ouvre sur « Sous-projets » : c'est la section
  // Statistiques qu'on regarde ici.
  await page.click('#activityPageTabStats');
  await page.waitForTimeout(1800);

  ok(await page.isVisible('#caSubProjectFilterWrap'),
    '4.3 ⭐ un bouton de sélection de sous-projet est affiché au-dessus des deux blocs');
  eq(await page.textContent('#caSubProjectBtnLabel'), 'Tous les sous-projets',
    '4.4 il annonce la vue globale par défaut');

  eq(await page.evaluate(() => document.querySelectorAll(
    '#communityActivityPie .pieSlice-tappable, #communityActivityPie .pieLegendRow-tappable').length), 0,
    '4.5 ⭐⭐ la couleur d\'un membre n\'est PLUS cliquable ici (demande d\'Emilien du 4 septembre)');

  const totalGlobal = await page.textContent('#communityActivityStatsTotal');
  eq(totalGlobal, '7h00', '4.6 la comparaison globale porte sur les 7h des deux membres');
  eq(await page.evaluate(() => document.querySelectorAll('#communityActivityPie .pieLegendRow').length), 2,
    '4.7 et compare bien DEUX membres');

  await page.click('#caSubProjectBtn');
  await page.waitForTimeout(400);
  const options = await page.$$eval('#caSubProjectMenu .statsPeriodMenuItem',
    (bs) => bs.map((b) => ({ value: b.getAttribute('data-sub-project'), label: b.textContent })));
  eq(options.map((o) => o.label),
    ['Tous les sous-projets', 'Sans sous-projet', 'Cadrage', 'Développement'],
    '4.8 ⭐ le menu propose le global, le non-rattaché, puis chaque sous-projet');

  await page.click('#caSubProjectMenu [data-sub-project="' + sp2.id + '"]');
  await page.waitForTimeout(1400);
  eq(await page.textContent('#caSubProjectBtnLabel'), 'Développement',
    '4.9 le bouton porte le sous-projet choisi');
  eq(await page.textContent('#communityActivityStatsTotal'), '4h00',
    '4.10 ⭐ la comparaison ne porte plus que sur « Développement » (1h + 3h)');
  eq(await page.evaluate(() => document.querySelectorAll('#communityActivityPie .pieLegendRow').length), 2,
    '4.11 ⭐⭐ les DEUX membres restent comparés : c\'est un filtre, pas une fenêtre par membre');

  ok(await page.evaluate(() => document.querySelectorAll('#communityActivityChart path, #communityActivityChart polyline').length > 0),
    '4.12 le Graphique est toujours tracé sous le filtre');

  await page.click('#caSubProjectBtn');
  await page.waitForTimeout(400);
  await page.click('#caSubProjectMenu [data-sub-project="none"]');
  await page.waitForTimeout(1400);
  eq(await page.textContent('#communityActivityStatsTotal'), '1h00',
    '4.13 ⭐ « Sans sous-projet » ne montre que l\'heure non rattachée');

  await page.click('#caSubProjectBtn');
  await page.waitForTimeout(400);
  await page.click('#caSubProjectMenu [data-sub-project=""]');
  await page.waitForTimeout(1400);
  eq(await page.textContent('#communityActivityStatsTotal'), '7h00',
    '4.14 le retour au global redonne le total complet');

  // ============ 5. Non-régressions ============
  console.log('5. Non-régression');
  ok(await page.isHidden('#subProjectStatsModal'),
    '5.1 ⭐ aucune fenêtre de détail ne s\'ouvre depuis cette section');
  ok(!(await page.evaluate(() => !!document.querySelector('#communityActivityPieBlock #caTsGrid'))),
    '5.2 ⭐ aucune Feuille de temps n\'a été ajoutée ici (« pas de feuille de temps »)');

  // ⚠️ Photo des erreurs console AVANT l'appel volontairement invalide qui
  // suit : le navigateur journalise tout 400 comme une erreur de ressource.
  // Sans cette photo, la dernière assertion de la suite échouerait sur une
  // erreur qu'on a nous-mêmes provoquée exprès.
  const errorsBeforeBadRequest = consoleErrors.slice();

  const filterRejected = await api(page, 'GET',
    '/api/community/activity-stats?userId=' + user.id + '&activityId=' + avec.id + '&subProject=abc');
  eq(filterRejected.status, 400,
    '5.3 ⭐ un filtre fantaisiste est refusé par le serveur, pas silencieusement vidé');

  // Clic ENVOYÉ, pas simulé au pointeur : la couche de survol du graphique de
  // l'activité (.chartHoverLayer, transparente et étalée) recouvre la barre
  // d'onglets pour Playwright. Un vrai doigt n'a pas ce problème — la barre
  // est au-dessus dans l'empilement.
  await page.evaluate(() => document.querySelector('.tabBtn[data-tab="stats"]').click());
  await page.waitForTimeout(1800);
  ok(await page.isVisible('#statsTimesheetBlock'), '5.4 la Feuille de temps du volet Stats est intacte');
  ok(await page.isVisible('#statsPieBlock'), '5.5 la Répartition aussi');
  ok(await page.isVisible('#statsChartBlock'), '5.6 le Graphique aussi');
  eq(await page.evaluate(() => document.querySelectorAll(
    '#statsChart .pieSlice-tappable, #statsChart [data-activity-id]').length), 0,
    '5.7 ⭐ le Graphique n\'a toujours reçu aucune affordance (contrainte explicite d\'Emilien)');

  eq(errorsBeforeBadRequest, [], '5.8 aucune erreur JavaScript en console pendant toute la suite');
  eq(consoleErrors.filter((e) => !/400/.test(e)), [],
    '5.9 et rien d\'autre que le 400 volontaire ensuite');

  await browser.close();
  console.log('\n' + passed + ' assertions passées, ' + failed + ' échec(s).');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
