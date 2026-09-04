// test17.js — suite navigateur (Playwright) : rattachement d'une session
// chronométrée à un sous-projet (chantier « Chrono — sous-projets »,
// 4 septembre 2026).
//
// Ce que cette suite protège en priorité, dans l'ordre :
//   1. que ne RIEN choisir reste le cas normal et ne bloque rien ;
//   2. qu'un rattachement existant ne puisse jamais être effacé par omission
//      (sélecteur non affiché, sous-projet clôturé entre-temps) ;
//   3. que l'avancement d'un sous-projet ne bouge JAMAIS parce qu'on a
//      enregistré du temps dessus.
//
// Lancement : node test17.js  (serveur sur :3000, base VIERGE, playwright)

const { chromium } = require('playwright');

const BASE = 'http://localhost:' + (process.env.PORT || 3000);
let passed = 0, failed = 0;
function ok(cond, label) { if (cond) passed++; else { failed++; console.log('  ✗ ' + label); } }
function eq(a, b, label) {
  ok(JSON.stringify(a) === JSON.stringify(b), label + ' — attendu ' + JSON.stringify(b) + ', obtenu ' + JSON.stringify(a));
}

// Le récapitulatif d'arrêt désactive « Valider » tant que la fin n'est pas
// APRÈS le début, et les deux champs sont à la seconde près : une session
// démarrée et arrêtée dans la même seconde laisse donc le bouton grisé
// (comportement voulu, documenté dans app.js). On laisse tourner un peu.
async function stopSession(page) {
  await page.waitForTimeout(1600);
  await page.click('#stopBtn');
  await page.waitForTimeout(600);
}

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { method, path, body });
}

// Options réellement proposées par un <select>, dans l'ordre.
async function optionsOf(page, selector) {
  return page.$$eval(selector + ' option', (os) => os.map((o) => o.textContent.trim()));
}

(async () => {
  console.log('--- Chrono → sous-projets : suite navigateur ---\n');
  // PLAYWRIGHT_CHROMIUM_PATH permet de pointer un Chromium déjà installé
  // (bac à sable) sans lancer `npx playwright install`.
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const stamp = Date.now();
  const name = 'ChronoSP' + stamp;
  // ⚠️ lang: 'fr' — un compte créé par l'API démarre en ANGLAIS depuis le
  // 29 août 2026 ; sans ça les libellés cherchés ici sont introuvables.
  const user = (await api(page, 'POST', '/api/profile', {
    name, lastName: 'Test', phone: '+15145550123', email: name + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!user.id, '0.1 profil de test créé');

  const sansSP = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'SansSP' + stamp })).body;
  const avecSP = (await api(page, 'POST', '/api/activities', { userId: user.id, name: 'AvecSP' + stamp })).body;
  const sp1 = (await api(page, 'POST', '/api/activities/' + avecSP.id + '/sub-projects',
    { userId: user.id, name: 'Cadrage' })).body;
  const sp2 = (await api(page, 'POST', '/api/activities/' + avecSP.id + '/sub-projects',
    { userId: user.id, name: 'Développement' })).body;
  ok(!!sp1.id && !!sp2.id, '0.2 deux sous-projets créés sur la seconde activité');

  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !document.getElementById('app').classList.contains('hidden')),
    '0.3 application ouverte');

  // ============ 1. Une activité SANS sous-projet : rien ne change ============
  console.log('1. Activité sans sous-projet : l\'écran est celui d\'avant');
  await page.click('#activityButtons button:has-text("SansSP' + stamp + '")');
  await page.waitForTimeout(700);
  ok(await page.isVisible('#chronoRunning'), '1.1 le chrono démarre en UN clic, comme avant');
  ok(await page.isHidden('#chronoSubProjectWrap'), '1.2 aucun sélecteur affiché — rien à proposer');

  await stopSession(page);
  ok(await page.isHidden('#stopSubProjectWrap'), '1.3 ni dans le récapitulatif d\'arrêt');
  await page.click('#stopConfirmBtn');
  await page.waitForTimeout(800);
  ok(await page.isVisible('#chronoIdle'), '1.4 la session s\'enregistre normalement');

  // ============ 2. Activité AVEC sous-projets : choix optionnel ============
  console.log('2. Activité avec sous-projets : le choix apparaît, sans rien imposer');
  await page.click('#activityButtons button:has-text("AvecSP' + stamp + '")');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#chronoRunning'), '2.1 le chrono démarre toujours en UN clic');
  ok(await page.isVisible('#chronoSubProjectWrap'), '2.2 le sélecteur apparaît sous le chronomètre');
  eq(await page.inputValue('#chronoSubProjectSelect'), '', '2.3 ⭐ rien n\'est pré-sélectionné : ne rien choisir est le cas normal');
  eq(await optionsOf(page, '#chronoSubProjectSelect'), ['Aucun sous-projet', 'Cadrage', 'Développement'],
    '2.4 les deux sous-projets ouverts sont proposés, précédés de « Aucun »');

  await page.selectOption('#chronoSubProjectSelect', String(sp1.id));
  await page.waitForTimeout(600);
  let status = (await api(page, 'GET', '/api/timer/status?userId=' + user.id)).body;
  eq(status.subProject.id, sp1.id, '2.5 le choix est enregistré sur le chrono en cours (pas gardé dans l\'écran)');

  // Il survit à un rechargement de page — c'est tout l'intérêt de le stocker
  // sur running_timers plutôt que dans une variable JavaScript.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok(await page.isVisible('#chronoRunning'), '2.6 le chrono tourne toujours après rechargement');
  eq(await page.inputValue('#chronoSubProjectSelect'), String(sp1.id),
    '2.7 ⭐ le sous-projet choisi est retrouvé après rechargement');

  // ============ 3. Correction au moment de l'arrêt ============
  console.log('3. Correction dans le récapitulatif d\'arrêt');
  await stopSession(page);
  ok(await page.isVisible('#stopSubProjectWrap'), '3.1 le sélecteur est repris dans le récapitulatif');
  eq(await page.inputValue('#stopSubProjectSelect'), String(sp1.id), '3.2 pré-rempli avec le choix de la session');

  await page.selectOption('#stopSubProjectSelect', String(sp2.id));
  await page.click('#stopConfirmBtn');
  await page.waitForTimeout(900);
  let hist = (await api(page, 'GET', '/api/history?userId=' + user.id + '&period=week')).body;
  eq(hist[0].subProjectId, sp2.id, '3.3 ⭐ la correction faite à l\'arrêt est bien celle enregistrée');
  eq(hist[0].subProjectName, 'Développement', '3.4 et son nom revient avec l\'historique');
  const entryId = hist[0].id;

  // ============ 4. Historique modifiable ============
  console.log('4. Historique : affichage et correction a posteriori');
  await page.click('#chronoHistoryHeader');
  await page.waitForTimeout(900);
  const firstCard = '#historyList .historyEntry:first-child';
  // `> div.meta` et non `.meta` : la carte porte aussi la durée dans un
  // <span class="meta"> à l'intérieur de .rowTop, et le message de pièce
  // jointe dans un <p class="meta">. Seule la ligne date/heure est un div.
  ok((await page.textContent(firstCard + ' > div.meta')).includes('Développement'),
    '4.1 le sous-projet s\'affiche sur la carte, à côté de la durée');

  await page.click(firstCard + ' .actions .iconBtn:has-text("Modifier")');
  await page.waitForTimeout(800);
  ok(await page.isVisible(firstCard + ' .historyEditSubProjectWrap'), '4.2 le sélecteur est proposé à la modification');
  eq(await page.inputValue(firstCard + ' .historyEditSubProject'), String(sp2.id), '4.3 pré-rempli sur le rattachement actuel');

  await page.selectOption(firstCard + ' .historyEditSubProject', String(sp1.id));
  await page.click(firstCard + ' .historyEditSave');
  await page.waitForTimeout(900);
  hist = (await api(page, 'GET', '/api/history?userId=' + user.id + '&period=week')).body;
  eq(hist.find((e) => e.id === entryId).subProjectId, sp1.id, '4.4 corrigé depuis l\'historique');

  // Rattraper une session enregistrée SANS sous-projet (celle de l'étape 1) :
  // son activité n'en a aucun, le sélecteur doit donc rester masqué.
  const sansCard = '#historyList .historyEntry:last-child';
  await page.click(sansCard + ' .actions .iconBtn:has-text("Modifier")');
  await page.waitForTimeout(800);
  ok(await page.isHidden(sansCard + ' .historyEditSubProjectWrap'),
    '4.5 aucun sélecteur pour une activité qui n\'a pas de sous-projet');
  await page.click(sansCard + ' .historyEditCancel');

  // ============ 5. ⭐ Un rattachement existant ne se perd jamais ============
  console.log('5. ⭐ Clôture : plus proposé, mais le lien existant tient');
  const hier = new Date(Date.now() - 86400000);
  const iso = hier.getFullYear() + '-' + String(hier.getMonth() + 1).padStart(2, '0') + '-' + String(hier.getDate()).padStart(2, '0');
  await api(page, 'PUT', '/api/sub-projects/' + sp1.id, { userId: user.id, closesAt: iso });

  await page.click('#activityButtons button:has-text("AvecSP' + stamp + '")');
  await page.waitForTimeout(900);
  eq(await optionsOf(page, '#chronoSubProjectSelect'), ['Aucun sous-projet', 'Développement'],
    '5.1 ⭐ un sous-projet clôturé disparaît du sélecteur du chrono');
  await stopSession(page);
  await page.click('#stopConfirmBtn');
  await page.waitForTimeout(900);

  // L'enregistrement de l'étape 4 pointe sp1, désormais clôturé : il doit
  // garder son lien, et le sélecteur doit l'ÉPINGLER au lieu de le perdre.
  await page.waitForTimeout(300);
  hist = (await api(page, 'GET', '/api/history?userId=' + user.id + '&period=week')).body;
  const cible = hist.find((e) => e.id === entryId);
  eq(cible.subProjectId, sp1.id, '5.2 ⭐ l\'enregistrement déjà rattaché garde son lien après clôture');
  eq(cible.subProjectClosed, true, '5.3 marqué comme clôturé');

  await page.click('#chronoHistoryHeader');   // referme
  await page.waitForTimeout(300);
  await page.click('#chronoHistoryHeader');   // rouvre, rechargé
  await page.waitForTimeout(1000);
  const cibleSel = '#historyList .historyEntry:has-text("Cadrage")';
  ok(await page.isVisible(cibleSel), '5.4 son nom reste affiché sur la carte');
  await page.click(cibleSel + ' .actions .iconBtn:has-text("Modifier")');
  await page.waitForTimeout(900);
  const opts = await optionsOf(page, cibleSel + ' .historyEditSubProject');
  ok(opts.some((o) => o.indexOf('Cadrage') === 0 && o.indexOf('clôturé') !== -1),
    '5.5 ⭐ le sous-projet clôturé reste proposé, épinglé et marqué (sinon ouvrir la liste l\'effacerait)');
  eq(await page.inputValue(cibleSel + ' .historyEditSubProject'), String(sp1.id),
    '5.6 ⭐ et il reste bien sélectionné');
  await page.click(cibleSel + ' .historyEditSave');
  await page.waitForTimeout(900);
  hist = (await api(page, 'GET', '/api/history?userId=' + user.id + '&period=week')).body;
  eq(hist.find((e) => e.id === entryId).subProjectId, sp1.id,
    '5.7 ⭐⭐ enregistrer sans y toucher ne détache PAS un sous-projet clôturé');

  // ============ 6. ⛔ Le temps n'entre pas dans l'avancement ============
  console.log('6. ⛔ Aucune heure enregistrée ne bouge un pourcentage d\'avancement');
  const before = (await api(page, 'GET', '/api/activities/' + avecSP.id + '/sub-projects?userId=' + user.id)).body;
  await page.click('#activityButtons button:has-text("AvecSP' + stamp + '")');
  await page.waitForTimeout(900);
  await page.selectOption('#chronoSubProjectSelect', String(sp2.id));
  await page.waitForTimeout(500);
  await stopSession(page);
  await page.click('#stopConfirmBtn');
  await page.waitForTimeout(1000);
  const after = (await api(page, 'GET', '/api/activities/' + avecSP.id + '/sub-projects?userId=' + user.id)).body;
  eq(after.progress, before.progress, '6.1 ⭐ l\'avancement de l\'activité est strictement inchangé');
  eq(after.subProjects.map((s) => s.percent), before.subProjects.map((s) => s.percent),
    '6.2 ⭐ celui de chaque sous-projet aussi');
  eq(after.subProjects.map((s) => s.done + '/' + s.total), before.subProjects.map((s) => s.done + '/' + s.total),
    '6.3 ⭐ « done / total » reste un compte de CASES, jamais d\'heures');

  // ============ 7. Non-régression de l'onglet Chrono ============
  console.log('7. Non-régression de l\'onglet Chrono');
  ok(await page.isVisible('#chronoIdle'), '7.1 retour à la grille d\'activités après l\'arrêt');
  ok((await page.$$('#activityButtons button')).length === 2, '7.2 les deux activités sont toujours proposées');
  ok(await page.isHidden('#stopConfirmPanel'), '7.3 le récapitulatif d\'arrêt est refermé');
  ok(await page.isVisible('#chronoHistoryHeader'), '7.4 le panneau d\'historique est toujours là');
  hist = (await api(page, 'GET', '/api/history?userId=' + user.id + '&period=week')).body;
  ok(hist.length >= 4 && hist.every((e) => e.durationSeconds >= 0),
    '7.5 toutes les sessions enregistrées pendant cette suite sont présentes');
  ok(hist.every((e) => Array.isArray(e.attachments)), '7.6 les pièces jointes de session sont toujours servies');

  eq(consoleErrors, [], '7.7 aucune erreur JavaScript en console pendant toute la suite');

  await browser.close();
  console.log('\n' + passed + ' assertions passées, ' + failed + ' échec(s).');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
