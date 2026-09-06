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
//     (voir test23.js) ;
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

  // ============ 2bis. ⭐ En-tête fixe, contenu défilant ============
  // 5 septembre 2026, Emilien : « je souhaite que le nom de l'activité en haut
  // et la croix pour fermer soient fixes et que la feuille de temps et la
  // répartition défilent en dessous comme pour le profil utilisateur ».
  console.log('2bis. ⭐ L\'en-tête ne défile pas avec le contenu');
  const layout = await page.evaluate(() => {
    const card = document.querySelector('#subProjectStatsModal .communityMembersModalCard');
    const scroll = document.getElementById('subProjectStatsScroll');
    return {
      cardFlex: getComputedStyle(card).flexDirection,
      cardOverflow: getComputedStyle(card).overflowY,
      scrollOverflow: getComputedStyle(scroll).overflowY,
      scrollable: scroll.scrollHeight > scroll.clientHeight + 4,
    };
  });
  // ⭐ 6 septembre 2026 : la barre supérieure prend la couleur de l'activité.
  const bar = await page.evaluate(() => {
    function hex(rgb) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
      return m ? '#' + [1, 2, 3].map((i) => ('0' + Number(m[i]).toString(16)).slice(-2)).join('') : null;
    }
    const el = document.querySelector('#subProjectStatsModal .viewProfileIdentity');
    const close = document.getElementById('subProjectStatsClose');
    return {
      tinted: el.classList.contains('tinted'),
      bg: hex(getComputedStyle(el).backgroundColor),
      closeBg: getComputedStyle(close).backgroundColor,
      cardBg: hex(getComputedStyle(document.body).backgroundColor),
    };
  });
  const activityColor = (await api(page, 'GET', '/api/activities?userId=' + user.id))
    .body.find((a) => String(a.id) === String(avec.id)).color;
  ok(bar.tinted, '2bis.0a ⭐ la barre supérieure est marquée teintée');
  eq(bar.bg, activityColor.toLowerCase(),
    '2bis.0b ⭐⭐ et porte EXACTEMENT la couleur de l\'activité');
  ok(/rgba\(0, 0, 0, 0\)|transparent/.test(bar.closeBg),
    '2bis.0c ⭐ la croix de fermeture est transparente, pas une boîte pâle posée dessus');

  // ⭐⭐ 6 septembre 2026, Emilien : « il y a un délai entre le moment où la
  // fenêtre s'ouvre et où la barre du haut se colore ; je souhaite que dès que
  // la fenêtre s'ouvre, la barre soit déjà colorée ».
  //
  // La preuve ne peut pas être « la barre est colorée après coup » : elle
  // l'était déjà avant ce correctif, simplement un aller-retour réseau trop
  // tard. Il faut donc observer la barre AVANT que la réponse ne puisse
  // arriver.
  // ⚠️ Retenir la réponse avec page.route() ne marche PAS ici : l'app
  // enregistre un service worker, et les requêtes qui passent par lui
  // échappent à l'interception de Playwright (mesuré : 0 interception).
  // On procède donc sans réseau du tout : on efface la couleur de la barre,
  // on déclenche le clic ET on relit la barre dans le MÊME tick synchrone.
  // Rien de ce qui dépend du réseau ne peut s'être exécuté entre les deux.
  await page.click('#subProjectStatsClose');
  await page.waitForTimeout(300);
  const during = await page.evaluate(() => {
    function hex(rgb) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
      return m ? '#' + [1, 2, 3].map((i) => ('0' + Number(m[i]).toString(16)).slice(-2)).join('') : null;
    }
    const bar = document.querySelector('#subProjectStatsModal .viewProfileIdentity');
    // On repart d'une barre NEUTRE : sans ça, la couleur laissée par
    // l'ouverture précédente ferait passer l'assertion sans rien prouver.
    bar.classList.remove('tinted');
    bar.style.background = '';
    const before = { tinted: bar.classList.contains('tinted'), bg: hex(getComputedStyle(bar).backgroundColor) };

    document.querySelector('#statsPie .pieLegendRow-tappable')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Même tick : aucune réponse serveur n'a pu être traitée.
    return {
      before,
      open: !document.getElementById('subProjectStatsModal').classList.contains('hidden'),
      tinted: bar.classList.contains('tinted'),
      bg: hex(getComputedStyle(bar).backgroundColor),
    };
  });
  ok(!during.before.tinted, '2bis.0-0 (contrôle) la barre était bien neutre juste avant le clic');
  ok(during.open, '2bis.0-1 la fenêtre s\'ouvre au clic');
  ok(during.tinted,
    '2bis.0-2 ⭐⭐ et la barre est DÉJÀ teintée dans le même tick — aucune attente du serveur');
  eq(during.bg, activityColor.toLowerCase(),
    '2bis.0-3 ⭐ avec la couleur de l\'activité sur laquelle on vient d\'appuyer');
  await page.waitForTimeout(1500);   // on laisse la réponse arriver pour la suite

  eq(layout.cardFlex, 'column', '2bis.1 la carte est une colonne : en-tête puis zone défilante');
  eq(layout.cardOverflow, 'hidden', '2bis.2 ⭐ la carte elle-même ne défile PAS');
  eq(layout.scrollOverflow, 'auto', '2bis.3 c\'est la zone intérieure qui défile');
  ok(layout.scrollable, '2bis.4 et son contenu la dépasse bien (il y a de quoi défiler)');

  // La preuve qui compte : on fait défiler, et l'en-tête reste à l'écran.
  const headerBefore = await page.evaluate(() =>
    document.querySelector('#subProjectStatsModal .viewProfileIdentity').getBoundingClientRect().top);
  await page.evaluate(() => { document.getElementById('subProjectStatsScroll').scrollTop = 400; });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    headerTop: document.querySelector('#subProjectStatsModal .viewProfileIdentity').getBoundingClientRect().top,
    scrolled: document.getElementById('subProjectStatsScroll').scrollTop,
    closeVisible: document.getElementById('subProjectStatsClose').getBoundingClientRect().top > 0,
  }));
  ok(after.scrolled > 100, '2bis.5 le contenu a bien défilé (' + after.scrolled + 'px)');
  eq(Math.round(after.headerTop), Math.round(headerBefore),
    '2bis.6 ⭐⭐ le nom de l\'activité n\'a PAS bougé d\'un pixel');
  ok(after.closeVisible, '2bis.7 ⭐ et la croix de fermeture reste à l\'écran');
  await page.evaluate(() => { document.getElementById('subProjectStatsScroll').scrollTop = 0; });
  await page.waitForTimeout(200);

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
  // ⚠️ 6 septembre 2026 : #spStatsTotal a été RETIRÉ par une autre discussion
  // (doublon avec le total affiché au centre du camembert). Le total se lit
  // donc désormais dans .pieCenterValue — même chiffre, une seule source.
  async function gridVsPie() {
    return page.evaluate(() => ({
      total: (document.querySelector('#subProjectStatsPie .pieCenterValue') || {}).textContent || '',
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
    total: (document.querySelector('#subProjectStatsPie .pieCenterValue') || {}).textContent || '',
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
    total: (document.querySelector('#subProjectStatsPie .pieCenterValue') || {}).textContent || '',
  }));
  eq(resync.pressed, 'false', '3.8 un second appui relâche le bouton');
  eq(resync.total, prev.total, '3.9 ⭐ et la Répartition se recale sur la grille');

  await page.click('#spTsNextWeek');
  await page.waitForTimeout(1200);
  eq(await page.textContent('#subProjectStatsPie .pieCenterValue'), '4h00',
    '3.10 retour sur la semaine en cours');

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
  eq(await page.textContent('#subProjectStatsPie .pieCenterValue'), hm(monthApi.breakdown.totalSeconds),
    '3.13 ⭐ et la Répartition a suivi la période Mois');

  // ⭐⭐ 6 septembre 2026, Emilien : « la feuille de temps en mode mois ne
  // mettait pas les dates au niveau des lignes » et « je souhaite un petit
  // espace entre les jours, comme sur la feuille de temps mensuelle du volet
  // stat ».
  //
  // Les deux défauts avaient UNE seule cause : les trois mesures du calendrier
  // (--cal-head / --cal-row / --cal-gap) étaient déclarées sur
  // #statsTimesheetBlock, un identifiant. Dans la fenêtre elles n'existaient
  // pas, donc les hauteurs de ligne ET la gouttière étaient purement ignorées.
  // On mesure ici la géométrie réelle, pas la présence d'une règle.
  const calGeom = await page.evaluate(() => {
    function read(frozenId, calId) {
      const fr = document.getElementById(frozenId);
      const ca = document.getElementById(calId);
      const labels = Array.from(fr.querySelectorAll('.tsCalWeekLabel'));
      const days = Array.from(ca.querySelectorAll('.tsCalendarGrid > .tsCalDay'));
      const firstOfRow = [];
      for (let i = 0; i < days.length; i += 7) firstOfRow.push(days[i]);
      return {
        labels: labels.length,
        // Écart vertical entre chaque libellé de semaine et la première case
        // de SA ligne : c'est exactement « les dates au niveau des lignes ».
        offsets: labels.map((el, i) => (firstOfRow[i]
          ? Math.round(el.getBoundingClientRect().top - firstOfRow[i].getBoundingClientRect().top)
          : null)),
        // Espace horizontal réel entre deux jours voisins.
        dayGap: (days[0] && days[1])
          ? Math.round(days[1].getBoundingClientRect().left - days[0].getBoundingClientRect().right)
          : null,
      };
    }
    return read('spTsFrozenCol', 'spTsCalendar');
  });
  ok(calGeom.labels >= 4, '3.14 le calendrier a ses libellés de semaine (' + calGeom.labels + ')');
  ok(calGeom.offsets.every((d) => d !== null && Math.abs(d) <= 1),
    '3.15 ⭐⭐ chaque date est en face de SA ligne (décalages : '
    + JSON.stringify(calGeom.offsets) + ')');
  ok(calGeom.dayGap > 0,
    '3.16 ⭐⭐ et il y a un espace entre les jours (' + calGeom.dayGap + 'px)');

  // Et cet espace est bien CELUI du volet Statistiques, pas une valeur
  // inventée : on lit la même mesure là-bas et on compare.
  const statsGap = await page.evaluate(() => {
    const el = document.getElementById('statsTimesheetBlock');
    return getComputedStyle(el).getPropertyValue('--cal-gap').trim();
  });
  eq(calGeom.dayGap + 'px', statsGap,
    '3.17 ⭐ exactement l\'espacement de la feuille de temps mensuelle du volet Stats');

  // ============ 3bis. ⭐ Contraste des nuances ============
  // 5 septembre 2026, Emilien (captures à l'appui) : « je souhaite que le
  // contraste entre les couleurs des sous-projets soit plus prononcé ».
  // On mesure sur pièce, pas à l'œil : luminance relative WCAG entre chaque
  // couple de couleurs de la légende, et teinte de chaque nuance.
  console.log('3bis. ⭐ Les nuances de sous-projet se distinguent vraiment');
  await page.click('#spTsPeriodBtn');
  await page.waitForTimeout(300);
  await page.click('#spTsPeriodMenu .statsPeriodMenuItem[data-period="week"]');
  await page.waitForTimeout(1200);

  const shades = await page.$$eval('#subProjectStatsPie .pieLegendRow', (rs) => {
    function hex(rgb) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
      return m ? [1, 2, 3].map((i) => Number(m[i])) : null;
    }
    return rs.map((r) => ({
      label: r.querySelector('.pieLegendLabel').textContent,
      rgb: hex(getComputedStyle(r.querySelector('.pieLegendDot')).backgroundColor),
    }));
  });
  function lum(rgb) {
    const c = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const A = lum(a), B = lum(b);
    return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
  }
  // ⚠️ 6 septembre 2026 : le rapport de contraste WCAG ne mesure QUE la
  // luminance. Il ne voit ni la teinte ni la saturation, et il écrase les
  // écarts dans les tons clairs — il est donc le mauvais outil pour juger
  // « distinguable à l'œil nu ». On mesure désormais l'écart perceptif ΔE
  // (CIELAB) : au-dessus de 10, deux couleurs sont nettement distinctes ;
  // en dessous de 5, elles se confondent.
  function lab(rgb) {
    const [r, g, b] = rgb.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  }
  function deltaE(a, b) {
    const A = lab(a), B = lab(b);
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
  }
  function hue(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return h * 60;
  }
  eq(shades.length, 3, '3bis.1 trois couleurs à comparer');
  let worst = Infinity, worstPair = '';
  for (let i = 0; i < shades.length; i++) {
    for (let j = i + 1; j < shades.length; j++) {
      const d = deltaE(shades[i].rgb, shades[j].rgb);
      if (d < worst) { worst = d; worstPair = shades[i].label + ' / ' + shades[j].label; }
    }
  }
  ok(worst >= 10,
    '3bis.2 ⭐⭐ le couple le plus proche reste nettement distinguable (ΔE '
    + worst.toFixed(1) + ' entre ' + worstPair + ')');
  ok(contrast(shades[0].rgb, shades[shades.length - 1].rgb) > 1,
    '3bis.2bis (le rapport de contraste reste calculé, mais il ne juge plus seul)');

  // Le contraste ne doit pas avoir été gagné en changeant de couleur : ce sont
  // toujours des NUANCES de la couleur de l'activité (demande du 4 septembre).
  const sansRow = shades.find((s) => s.label === 'Sans sous-projet');
  ok(!!sansRow, '3bis.3 « Sans sous-projet » est toujours listé');
  const baseHue = hue(sansRow.rgb);
  shades.filter((s) => s !== sansRow).forEach(function (s, i) {
    const d = Math.abs(hue(s.rgb) - baseHue);
    ok(Math.min(d, 360 - d) <= 4,
      '3bis.4.' + i + ' ⭐ « ' + s.label + ' » garde la teinte de l\'activité ('
      + Math.round(hue(s.rgb)) + '° vs ' + Math.round(baseHue) + '°)');
  });

  // ⭐ 6 septembre 2026 : « 5 nuances distinguables à l'œil nu » par couleur
  // d'activité. Vérifié par le CHEMIN RÉEL — on ajoute des sous-projets, on
  // rouvre la fenêtre et on lit les pastilles de la légende — plutôt qu'en
  // appelant la fonction depuis la page : c'est ce que voit Emilien qui compte.
  const before = {};
  shades.forEach((r) => { before[r.label] = r.rgb.join(','); });

  await page.click('#subProjectStatsClose');
  await page.waitForTimeout(400);

  for (const nom of ['Design', 'Tests', 'Livraison']) {
    const sp = (await api(page, 'POST', '/api/activities/' + avec.id + '/sub-projects',
      { userId: user.id, name: nom })).body;
    await seed(avec.id, sp.id, nom === 'Design' ? 13 : (nom === 'Tests' ? 14 : 16), 30);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.click('.tabBtn[data-tab="stats"]');
  await page.waitForTimeout(2200);
  await page.$eval('#statsPie .pieLegendRow-tappable',
    (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(1500);

  const sixRows = await page.$$eval('#subProjectStatsPie .pieLegendRow', (rs) => {
    function hex(rgb) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
      return m ? [1, 2, 3].map((i) => Number(m[i])) : null;
    }
    return rs.map((r) => ({
      label: r.querySelector('.pieLegendLabel').textContent,
      rgb: hex(getComputedStyle(r.querySelector('.pieLegendDot')).backgroundColor),
    }));
  });
  eq(sixRows.length, 6, '3bis.5 cinq sous-projets plus le temps non rattaché : six parts');

  // ⭐⭐ La propriété qui change tout à l'usage : le nombre de nuances étant
  // désormais FIXE, ajouter un sous-projet ne repeint pas les autres.
  const kept = ['Cadrage', 'Développement'].filter((n) => {
    const row = sixRows.find((r) => r.label === n);
    return row && before[n] === row.rgb.join(',');
  });
  eq(kept.length, 2,
    '3bis.6 ⭐⭐ les sous-projets déjà présents ont GARDÉ leur couleur exacte après en avoir ajouté trois');

  let worstFive = Infinity, worstFivePair = '';
  for (let i = 0; i < sixRows.length; i++) {
    for (let j = i + 1; j < sixRows.length; j++) {
      const d = deltaE(sixRows[i].rgb, sixRows[j].rgb);
      if (d < worstFive) { worstFive = d; worstFivePair = sixRows[i].label + ' / ' + sixRows[j].label; }
    }
  }
  ok(worstFive >= 10,
    '3bis.7 ⭐⭐ les 5 nuances ET la couleur de base sont deux à deux distinguables (ΔE '
    + worstFive.toFixed(1) + ', le plus proche : ' + worstFivePair + ')');
  eq(new Set(sixRows.map((r) => r.rgb.join(','))).size, 6,
    '3bis.8 les six couleurs sont toutes différentes');

  const baseRow = sixRows.find((r) => r.label === 'Sans sous-projet');
  const baseHue2 = hue(baseRow.rgb);
  ok(sixRows.filter((r) => r !== baseRow).every((r) => {
    const d = Math.abs(hue(r.rgb) - baseHue2);
    return Math.min(d, 360 - d) <= 4;
  }), '3bis.9 ⭐ et toutes gardent la teinte de l\'activité : ce sont des nuances, pas d\'autres couleurs');

  // ============ 3ter. ⭐ La section Graphique ============
  // 5 septembre 2026, Emilien : « rajouter une section graphique avec les
  // mêmes fonctions que dans stat (apparition des données lorsqu'on clique
  // sur un point et dernier enregistrement visible par défaut) ».
  console.log('3ter. ⭐ La section Graphique, avec infobulle et recentrage');
  ok(await page.isVisible('#spChartBlock'), '3ter.1 ⭐ la fenêtre a une section Graphique');
  ok(await page.evaluate(() => document.querySelectorAll('#spChart svg').length === 1),
    '3ter.2 un graphique est dessiné');
  ok(await page.evaluate(() => document.querySelectorAll('#spChart .chartLine, #spChart path').length > 0),
    '3ter.3 avec au moins une courbe');

  // Une série par sous-projet, plus la série Total — exactement la
  // composition du Graphique du volet Statistiques.
  const chartLegend = await page.$$eval('#spChartLegend .chartLegendRow',
    (rs) => rs.map((r) => r.querySelector('.chartLegendLabel').textContent));
  ok(chartLegend.indexOf('Total') !== -1, '3ter.4 la courbe Total est présente');
  ok(chartLegend.indexOf('Cadrage') !== -1 && chartLegend.indexOf('Développement') !== -1,
    '3ter.5 ⭐ et une courbe par sous-projet');
  ok(chartLegend.indexOf('Sans sous-projet') !== -1,
    '3ter.6 ⭐ le temps non rattaché a la sienne aussi');

  // « Apparition des données lorsqu'on clique sur un point » : c'est la couche
  // de survol de renderChart, réutilisée telle quelle.
  const tip = await page.evaluate(() => {
    const layer = document.querySelector('#spChart .chartHoverLayer');
    if (!layer) return 'pas de couche de survol';
    const r = layer.getBoundingClientRect();
    layer.dispatchEvent(new PointerEvent('pointerenter', {
      bubbles: true, clientX: r.left + r.width - 20, clientY: r.top + r.height / 2,
    }));
    const el = document.getElementById('spChartTooltip');
    return el && !el.classList.contains('hidden') ? el.textContent : 'infobulle masquée';
  });
  ok(/\d/.test(String(tip)),
    '3ter.7 ⭐⭐ l\'infobulle s\'affiche avec des heures — ' + JSON.stringify(String(tip).slice(0, 40)));

  // « Dernier enregistrement visible par défaut » : le défilement horizontal
  // est posé sur son bord droit à chaque rendu.
  const scrollState = await page.evaluate(() => {
    const s = document.querySelector('#spChartBlock .chartScroll');
    return { left: s.scrollLeft, max: s.scrollWidth - s.clientWidth };
  });
  ok(scrollState.max <= 0 || scrollState.left >= scrollState.max - 2,
    '3ter.8 ⭐⭐ le graphique est calé sur les données les plus récentes ('
    + scrollState.left + '/' + scrollState.max + ')');

  // La granularité se choisit, comme dans le volet Stats — et le recentrage
  // est refait à chaque rendu.
  await page.click('#spChartPeriodBtn');
  await page.waitForTimeout(300);
  await page.click('#spChartPeriodMenu .statsPeriodMenuItem[data-period="month"]');
  await page.waitForTimeout(1300);
  ok(await page.evaluate(() => document.querySelectorAll('#spChart svg').length === 1),
    '3ter.9 la granularité Mois redessine le graphique');
  const afterGranularity = await page.evaluate(() => {
    const s = document.querySelector('#spChartBlock .chartScroll');
    return { left: s.scrollLeft, max: s.scrollWidth - s.clientWidth };
  });
  ok(afterGranularity.max <= 0 || afterGranularity.left >= afterGranularity.max - 2,
    '3ter.10 ⭐ et reste calé à droite après changement de granularité');

  // ⚠️ Le Graphique de la fenêtre ne suit PAS les flèches de la Feuille de
  // temps : il couvre tout l'historique, comme celui du volet Statistiques.
  const chartHtmlBefore = await page.evaluate(() => document.getElementById('spChartLegend').textContent);
  await page.click('#spTsPrevWeek');
  await page.waitForTimeout(1200);
  eq(await page.evaluate(() => document.getElementById('spChartLegend').textContent), chartHtmlBefore,
    '3ter.11 ⭐ un pas en arrière sur la grille ne touche pas au Graphique');
  await page.click('#spTsNextWeek');
  await page.waitForTimeout(1200);

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

  // 4h de temps rattaché/non rattaché du premier membre + 1h30 ajoutée par le
  // trio de sous-projets du bloc 3bis + 3h du second membre.
  // ⚠️ 6 septembre 2026 : #communityActivityStatsTotal a été retiré par une
  // autre discussion, comme #spStatsTotal — le total ne s'affiche plus qu'au
  // centre du camembert.
  const totalGlobal = await page.textContent('#communityActivityPie .pieCenterValue');
  eq(totalGlobal, '8h30', '4.6 la comparaison globale porte sur le temps des deux membres');
  eq(await page.evaluate(() => document.querySelectorAll('#communityActivityPie .pieLegendRow').length), 2,
    '4.7 et compare bien DEUX membres');

  await page.click('#caSubProjectBtn');
  await page.waitForTimeout(400);
  const options = await page.$$eval('#caSubProjectMenu .statsPeriodMenuItem',
    (bs) => bs.map((b) => ({ value: b.getAttribute('data-sub-project'), label: b.textContent })));
  eq(options.map((o) => o.label),
    ['Tous les sous-projets', 'Sans sous-projet',
      'Cadrage', 'Développement', 'Design', 'Tests', 'Livraison'],
    '4.8 ⭐ le menu propose le global, le non-rattaché, puis chaque sous-projet');

  await page.click('#caSubProjectMenu [data-sub-project="' + sp2.id + '"]');
  await page.waitForTimeout(1400);
  eq(await page.textContent('#caSubProjectBtnLabel'), 'Développement',
    '4.9 le bouton porte le sous-projet choisi');
  eq(await page.textContent('#communityActivityPie .pieCenterValue'), '4h00',
    '4.10 ⭐ la comparaison ne porte plus que sur « Développement » (1h + 3h)');
  eq(await page.evaluate(() => document.querySelectorAll('#communityActivityPie .pieLegendRow').length), 2,
    '4.11 ⭐⭐ les DEUX membres restent comparés : c\'est un filtre, pas une fenêtre par membre');

  ok(await page.evaluate(() => document.querySelectorAll('#communityActivityChart path, #communityActivityChart polyline').length > 0),
    '4.12 le Graphique est toujours tracé sous le filtre');

  await page.click('#caSubProjectBtn');
  await page.waitForTimeout(400);
  await page.click('#caSubProjectMenu [data-sub-project="none"]');
  await page.waitForTimeout(1400);
  eq(await page.textContent('#communityActivityPie .pieCenterValue'), '1h00',
    '4.13 ⭐ « Sans sous-projet » ne montre que l\'heure non rattachée');

  await page.click('#caSubProjectBtn');
  await page.waitForTimeout(400);
  await page.click('#caSubProjectMenu [data-sub-project=""]');
  await page.waitForTimeout(1400);
  eq(await page.textContent('#communityActivityPie .pieCenterValue'), '8h30',
    '4.14 le retour au global redonne le total complet');

  // ============ 4bis. ⭐ Garde de version index.html / app.js ============
  // 6 septembre 2026 — incident réel : après un redéploiement, le téléphone
  // d'Emilien a chargé le NOUVEL index.html avec l'ANCIEN app.js (deux fichiers
  // mis en cache séparément par le navigateur). L'ancien script écrivait dans
  // une ligne que le nouvel HTML ne contenait plus, l'exception traversait tout
  // le rendu, et la fenêtre s'ouvrait vide avec une erreur technique affichée
  // en bas de l'écran.
  // On ne peut pas empêcher le décalage. On vérifie ici qu'il produit une
  // phrase actionnable et AUCUNE exception.
  console.log('4bis. ⭐ Un décalage de version se dit, il ne plante pas');
  await page.evaluate(() => document.querySelector('.tabBtn[data-tab="stats"]').click());
  await page.waitForTimeout(1800);
  const errorsBeforeSkew = consoleErrors.length;
  await page.evaluate(() => {
    const el = document.getElementById('spChartBlock');
    if (el) el.remove();
  });
  await page.$eval('#statsPie .pieLegendRow-tappable',
    (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(1200);
  eq(await page.textContent('#subProjectStatsMsg'),
    "L'application vient d'être mise à jour. Recharge la page.",
    '4bis.1 ⭐⭐ une phrase que quelqu\'un peut suivre, pas une erreur technique');
  eq(consoleErrors.length, errorsBeforeSkew,
    '4bis.2 ⭐⭐ et AUCUNE exception n\'a traversé le rendu');
  eq(await page.evaluate(() => document.querySelectorAll('#spTsGrid .tsSlot-filled').length), 0,
    '4bis.3 la fenêtre n\'a pas été construite à moitié');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);

  // ============ 4ter. ⭐ Aucun commentaire HTML ne fuit à l'écran ============
  // 6 septembre 2026 — incident réel, capture d'Emilien à l'appui : en
  // réécrivant un commentaire au-dessus du camembert de la page d'une
  // activité, une discussion l'a fermé trop tôt et a laissé la fin de
  // l'ancien en TEXTE BRUT. Cinq lignes de commentaire de code s'affichaient
  // donc dans l'app, « --> » compris.
  // Un commentaire mal fermé ne casse rien : le navigateur affiche
  // simplement son contenu. Aucune erreur, aucun test rouge — c'est
  // exactement pour ça que ça a atteint son téléphone.
  console.log('4ter. ⭐ Aucun commentaire de code ne s\'affiche dans l\'app');
  const leaked = await page.evaluate(() => {
    // Marqueurs qu'on n'écrit QUE dans des commentaires de code : s'ils
    // apparaissent dans le texte rendu, c'est qu'un commentaire est ouvert.
    const needles = ['-->', '⚠️ ', 'demande d\'Emilien', 'septembre 2026'];
    const found = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest('script, style')) continue;
      const txt = (n.nodeValue || '').trim();
      if (!txt) continue;
      if (needles.some((k) => txt.indexOf(k) !== -1)) {
        found.push(txt.slice(0, 70));
      }
    }
    return found;
  });
  eq(leaked, [], '4ter.1 ⭐⭐ aucun texte de commentaire de code n\'est rendu dans la page');

  const commentBalance = await page.evaluate(() => {
    // Le DOM ne garde pas un commentaire mal fermé — on relit donc la source.
    return fetch('/index.html').then((r) => r.text()).then((s) => ({
      opens: (s.match(/<!--/g) || []).length,
      closes: (s.match(/-->/g) || []).length,
    }));
  });
  eq(commentBalance.opens, commentBalance.closes,
    '4ter.2 ⭐⭐ index.html a autant d\'ouvertures que de fermetures de commentaire ('
    + commentBalance.opens + ' / ' + commentBalance.closes + ')');

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

  // ⭐ Non-régression du Graphique du volet Statistiques après sa
  // paramétrisation : mêmes conteneurs, même infobulle, même recentrage.
  ok(await page.evaluate(() => document.querySelectorAll('#statsChart svg').length === 1),
    '5.8 le Graphique du volet Stats est toujours dessiné dans SON conteneur');
  ok(await page.evaluate(() => document.querySelectorAll('#statsChartLegend .chartLegendRow').length > 0),
    '5.9 avec sa propre légende');
  const statsTip = await page.evaluate(() => {
    const layer = document.querySelector('#statsChart .chartHoverLayer');
    if (!layer) return 'pas de couche';
    const r = layer.getBoundingClientRect();
    layer.dispatchEvent(new PointerEvent('pointerenter', {
      bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    }));
    const el = document.getElementById('chartTooltip');
    return el && !el.classList.contains('hidden') ? el.textContent : 'masquée';
  });
  ok(/\d/.test(String(statsTip)), '5.10 ⭐ et son infobulle d\'origine, intacte');
  eq(await page.evaluate(() => !document.getElementById('spChartTooltip').classList.contains('hidden')), false,
    '5.11 ⭐⭐ survoler le Graphique du volet Stats n\'ouvre PAS l\'infobulle de la fenêtre');

  eq(errorsBeforeBadRequest, [], '5.8 aucune erreur JavaScript en console pendant toute la suite');
  eq(consoleErrors.filter((e) => !/400/.test(e)), [],
    '5.9 et rien d\'autre que le 400 volontaire ensuite');

  await browser.close();
  console.log('\n' + passed + ' assertions passées, ' + failed + ' échec(s).');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
