// test19.js — suite navigateur (Playwright) : détail du temps par sous-projet
// ouvert en appuyant sur une couleur, et recentrage du sélecteur du Chrono
// (chantier « Chrono — sous-projets », second passage, 4 septembre 2026).
//
// Les deux assertions qui comptent le plus ici sont des NON-RÉGRESSIONS :
//   - l'infobulle du GRAPHIQUE continue d'afficher les heures et n'ouvre
//     surtout PAS la nouvelle fenêtre (« sauf sur le graphie car je souhaite
//     conserver l'option d'afficher le nombre d'heure enregistré lorsque
//     l'utilisateur appuie sur le graphique », Emilien) ;
//   - le camembert de la page de visite d'un profil, qui partage renderPie,
//     n'est PAS devenu cliquable.
//
// Lancement : node test19.js  (serveur sur :3000, base VIERGE, playwright)

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

function isoOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Teinte d'une couleur #rrggbb, en degrés — sert à prouver que les nuances
// d'une activité gardent bien SA teinte.
function hueOf(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(h * 60);
}
function rgbToHex(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
  if (!m) return null;
  return '#' + [1, 2, 3].map((i) => ('0' + Number(m[i]).toString(16)).slice(-2)).join('');
}

(async () => {
  console.log('--- Détail par sous-projet : suite navigateur ---\n');
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const stamp = Date.now();
  const name = 'StatSP' + stamp;
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550123', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil de test créé');

  const act = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'Chantier' + stamp })).body;
  const sp1 = (await api(page, 'POST', '/api/activities/' + act.id + '/sub-projects',
    { userId: user.id, name: 'Cadrage' })).body;
  const sp2 = (await api(page, 'POST', '/api/activities/' + act.id + '/sub-projects',
    { userId: user.id, name: 'Développement' })).body;

  // Trois sessions en pleine journée (piège du fuseau, voir test18.js).
  const today = new Date();
  async function seed(subProjectId, hour, minutes) {
    await api(page, 'POST', '/api/timer/start', { userId: user.id, activityId: act.id });
    if (subProjectId) await api(page, 'POST', '/api/timer/sub-project', { userId: user.id, subProjectId });
    const s = new Date(today); s.setHours(hour, 0, 0, 0);
    const e = new Date(s.getTime() + minutes * 60000);
    await api(page, 'POST', '/api/timer/stop', {
      userId: user.id, startTime: s.toISOString(), endTime: e.toISOString(),
    });
  }
  await seed(sp1.id, 9, 120);
  await seed(sp2.id, 12, 60);
  await seed(null, 15, 60);   // NON rattaché

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);

  // ============ 1. Le sélecteur du Chrono, recentré ============
  console.log('1. Sélecteur de sous-projet recentré sous le chronomètre');
  await page.click('#activityButtons button:has-text("Chantier' + stamp + '")');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#chronoSubProjectWrap'), '1.1 le sélecteur est affiché');

  const geo = await page.evaluate(() => {
    const w = document.getElementById('chronoSubProjectWrap');
    const p = w.parentElement;
    const wr = w.getBoundingClientRect(), pr = p.getBoundingClientRect();
    const stop = document.getElementById('stopBtn').getBoundingClientRect();
    const timer = document.getElementById('liveTimer').getBoundingClientRect();
    return {
      leftGap: Math.round(wr.left - pr.left),
      rightGap: Math.round(pr.right - wr.right),
      gapToStop: Math.round(stop.top - wr.bottom),
      gapToTimer: Math.round(wr.top - timer.bottom),
      textAlign: getComputedStyle(w).textAlign,
    };
  });
  ok(Math.abs(geo.leftGap - geo.rightGap) <= 1,
    '1.2 ⭐ centré horizontalement (marges gauche/droite égales : ' + geo.leftGap + ' / ' + geo.rightGap + ')');
  eq(geo.textAlign, 'center', '1.3 son contenu est centré');
  ok(geo.gapToStop >= 20, '1.4 ⭐ un vrai espace le sépare du bouton STOP (' + geo.gapToStop + 'px)');
  ok(geo.gapToTimer > 0, '1.5 et il est bien SOUS le temps qui défile (' + geo.gapToTimer + 'px)');

  await page.waitForTimeout(1600);
  await page.click('#stopBtn');
  await page.waitForTimeout(500);
  await page.click('#stopConfirmBtn');
  await page.waitForTimeout(900);

  // ============ 2. Appui sur une case de la Feuille de temps ============
  console.log('2. Appui sur une case colorée de la Feuille de temps');
  await page.click('.tabbar button[data-tab="stats"]');
  await page.waitForTimeout(1600);

  const filledCount = await page.evaluate(() => document.querySelectorAll('#tsGrid .tsSlot-filled').length);
  ok(filledCount > 0, '2.1 la grille contient des cases remplies (' + filledCount + ')');
  ok(await page.evaluate(() => !!document.querySelector('#tsGrid .tsSlot-filled[data-activity-id]')),
    '2.2 chaque case remplie porte son activité en attribut');

  await page.click('#tsGrid .tsSlot-filled');
  await page.waitForTimeout(1000);
  ok(await page.isVisible('#subProjectStatsModal'), '2.3 ⭐ la fenêtre s\'ouvre');
  eq(await page.textContent('#subProjectStatsTitle'), 'Chantier' + stamp, '2.4 elle porte le nom de l\'activité');
  eq(await page.textContent('#subProjectStatsSubtitle'), 'Mon temps', '2.5 et précise qu\'on regarde son propre temps');

  const rows = await page.$$eval('#subProjectStatsList .subProjectStatsRow', (rs) => rs.map((r) => ({
    label: r.querySelector('.subProjectStatsLabel').textContent,
    value: r.querySelector('.subProjectStatsValue').textContent,
    color: getComputedStyle(r.querySelector('.subProjectStatsDot')).backgroundColor,
  })));
  eq(rows.length, 3, '2.6 trois parts : deux sous-projets et le temps non rattaché');
  ok(rows.some((r) => r.label === 'Cadrage'), '2.7 « Cadrage » est listé');
  ok(rows.some((r) => r.label === 'Sans sous-projet'),
    '2.8 ⭐ le temps NON rattaché apparaît comme une part nommée, jamais masqué');
  ok(/2h00/.test(rows.find((r) => r.label === 'Cadrage').value), '2.9 avec ses heures (2h00)');
  ok(/50%/.test(rows.find((r) => r.label === 'Cadrage').value), '2.10 et son pourcentage');
  eq(await page.textContent('#subProjectStatsTotal'), '4h00', '2.11 le total de la période est affiché');

  // ============ 3. Les nuances ============
  console.log('3. Nuances de la couleur de l\'activité');
  const baseColor = (await api(page, 'GET',
    '/api/sub-project-stats?userId=' + user.id + '&activityId=' + act.id
    + '&from=' + isoOf(today) + '&to=' + isoOf(today))).body.baseColor;
  const hexes = rows.map((r) => rgbToHex(r.color));
  const sansIdx = rows.findIndex((r) => r.label === 'Sans sous-projet');
  eq(hexes[sansIdx].toLowerCase(), baseColor.toLowerCase(),
    '3.1 ⭐ « Sans sous-projet » garde EXACTEMENT la couleur de l\'activité');
  const shades = hexes.filter((h, i) => i !== sansIdx);
  eq(new Set(hexes).size, 3, '3.2 les trois couleurs sont distinctes');
  const baseHue = hueOf(baseColor);
  shades.forEach(function (h, i) {
    ok(Math.abs(hueOf(h) - baseHue) <= 3,
      '3.3.' + i + ' ⭐ la nuance ' + h + ' garde la teinte de l\'activité (' + hueOf(h) + '° vs ' + baseHue + '°)');
  });

  ok(await page.evaluate(() => document.querySelectorAll('#subProjectStatsPie .pieSlice').length === 3),
    '3.4 le camembert de la fenêtre a bien trois parts');
  ok(await page.evaluate(() => document.querySelectorAll('#subProjectStatsPie .pieSlice-tappable').length === 0),
    '3.5 ses parts ne sont PAS cliquables : on est déjà au niveau le plus fin');

  await page.click('#subProjectStatsClose');
  await page.waitForTimeout(400);
  ok(await page.isHidden('#subProjectStatsModal'), '3.6 la croix referme la fenêtre');

  // ============ 4. Appui sur le camembert et sur sa légende ============
  console.log('4. Appui sur une part du camembert et sur une ligne de légende');
  ok(await page.evaluate(() => document.querySelectorAll('#statsPie .pieSlice-tappable').length > 0),
    '4.1 les parts du camembert de la Répartition sont cliquables');
  // Clic envoyé directement sur la part : sur un camembert à une seule
  // activité, la part fait un tour complet et le centre de sa boîte tombe dans
  // le TROU du donut, où c'est le <svg> parent qui reçoit le pointeur. Un vrai
  // doigt vise l'anneau ; Playwright, lui, vise le centre de la boîte.
  await page.$eval('#statsPie .pieSlice-tappable',
    (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(900);
  ok(await page.isVisible('#subProjectStatsModal'), '4.2 ⭐ une part du camembert ouvre la fenêtre');
  await page.click('#subProjectStatsClose');
  await page.waitForTimeout(400);

  ok(await page.evaluate(() => document.querySelectorAll('#statsPie .pieLegendRow-tappable').length > 0),
    '4.3 les lignes de légende aussi');
  await page.click('#statsPie .pieLegendRow-tappable');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#subProjectStatsModal'), '4.4 ⭐ une ligne de légende ouvre la fenêtre');
  eq(await page.textContent('#subProjectStatsTitle'), 'Chantier' + stamp, '4.5 sur la bonne activité');

  // Fermeture par appui sur le fond.
  await page.evaluate(() => {
    const m = document.getElementById('subProjectStatsModal');
    m.dispatchEvent(new MouseEvent('click', { bubbles: false }));
  });
  await page.waitForTimeout(400);
  ok(await page.isHidden('#subProjectStatsModal'), '4.6 un appui sur le fond referme aussi');

  // ============ 5. ⭐ LE GRAPHIQUE N'EST PAS TOUCHÉ ============
  console.log('5. ⭐ Le graphique garde son infobulle et n\'ouvre pas la fenêtre');
  ok(await page.evaluate(() => document.querySelectorAll('#statsChart .pieSlice-tappable, #statsChart [data-activity-id]').length === 0),
    '5.1 aucun élément du graphique n\'a été rendu cliquable');

  const tooltipShown = await page.evaluate(() => {
    const layer = document.querySelector('#statsChart .chartHoverLayer');
    if (!layer) return 'pas de couche de survol';
    const r = layer.getBoundingClientRect();
    layer.dispatchEvent(new PointerEvent('pointerenter', {
      bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    }));
    const tip = document.getElementById('chartTooltip');
    return tip && !tip.classList.contains('hidden') ? tip.textContent : 'infobulle masquée';
  });
  ok(typeof tooltipShown === 'string' && /\d/.test(tooltipShown),
    '5.2 ⭐⭐ l\'infobulle du graphique affiche toujours des heures — contenu : ' + JSON.stringify(String(tooltipShown).slice(0, 40)));
  ok(await page.isHidden('#subProjectStatsModal'),
    '5.3 ⭐ et appuyer sur le graphique n\'ouvre PAS la fenêtre des sous-projets');

  // ============ 6. Non-régression du camembert partagé ============
  console.log('6. Non-régression : renderPie reste inerte pour ses autres appelants');
  // La page de visite d'un profil monte renderPie SANS onActivityTap : ses
  // parts ne doivent pas être devenues cliquables.
  const inert = await page.evaluate(() => {
    const wrap = document.getElementById('viewProfilePie');
    if (!wrap) return 'absent';
    return wrap.querySelectorAll('.pieSlice-tappable, .pieLegendRow-tappable').length;
  });
  ok(inert === 'absent' || inert === 0,
    '6.1 ⭐ le camembert de la page de visite d\'un profil n\'est pas devenu cliquable');

  ok(await page.isVisible('#statsTimesheetBlock'), '6.2 la Feuille de temps est toujours là');
  ok(await page.isVisible('#statsPieBlock'), '6.3 la Répartition aussi');
  ok(await page.isVisible('#statsChartBlock'), '6.4 le Graphique aussi');

  eq(consoleErrors, [], '6.5 aucune erreur JavaScript en console pendant toute la suite');

  await browser.close();
  console.log('\n' + passed + ' assertions passées, ' + failed + ' échec(s).');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
