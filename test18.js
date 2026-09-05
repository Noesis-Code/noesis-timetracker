// test18.js — suite navigateur (Playwright) : ICÔNE MEMBRES + ZONE SÛRE.
//
// Discussion « Activité solo », 5 septembre 2026, cinquième passage.
//
// 1. BUG signalé par Emilien, capture à l'appui : la page d'une activité
//    s'ouvre en plein écran et son en-tête se dessine SOUS la barre d'état de
//    l'appareil (heure, réseau, batterie). ⚠️ Chromium n'émule pas les
//    `safe-area-inset` : cette suite ne peut donc pas reproduire l'encoche.
//    Ce qu'elle prouve, et qui est vérifiable : la règle lit bien les insets
//    comme le fait .topbar depuis toujours, et sur un écran SANS encoche le
//    rendu est strictement inchangé (16px). La confirmation finale se fait sur
//    le téléphone.
//
// 2. Icône « petit personnage avec un + » dans l'en-tête de la page : liste des
//    membres, puis « Ajouter un membre » (créateur, ou activité solo) et
//    « Quitter la communauté » (activités partagées).
//
// Lancement : node test18.js  (serveur sur :3000, base VIERGE, playwright)

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

async function openActivity(page, activityId) {
  await page.click('#activitiesList .activityRow[data-activity-id="' + activityId + '"] .activityRowHeader');
  await page.waitForTimeout(1300);
}

async function loginAs(page, user) {
  await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), user);
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await page.click('.tabBtn[data-tab="activity"]');
  await page.waitForTimeout(1100);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  // Compteur d'appels à la route des membres : elle est gardée par
  // checkSharedActivityAccess (>= 2 membres) et refuserait une activité solo.
  let memberCalls = 0;
  page.on('request', (r) => {
    if (r.url().indexOf('/api/community/activity-members') !== -1) memberCalls++;
  });

  await page.goto(BASE);

  const stamp = Date.now();
  const owner = (await api(page, 'POST', '/api/profile', {
    name: 'Chef' + stamp, lastName: 'Test', phone: '+15145550211',
    email: 'chef' + stamp + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  const membre = (await api(page, 'POST', '/api/profile', {
    name: 'Membre' + stamp, lastName: 'Test', phone: '+15145550212',
    email: 'membre' + stamp + '@example.com', pin: '1234', lang: 'fr',
  })).body;
  ok(!!owner.id && !!membre.id, '0.1 deux profils créés');

  const actSolo = (await api(page, 'POST', '/api/activities', { userId: owner.id, name: 'Solo' + stamp })).body;
  const actPartage = (await api(page, 'POST', '/api/activities', { userId: owner.id, name: 'Partagee' + stamp })).body;
  await api(page, 'POST', '/api/activities/' + actPartage.id + '/invite', { userId: owner.id, pseudo: membre.name });
  const invites = (await api(page, 'GET', '/api/invites?userId=' + membre.id)).body;
  await api(page, 'POST', '/api/invites/' + invites[0].id + '/accept', { userId: membre.id });
  ok(!!actSolo.id && !!actPartage.id, '0.2 une activité solo et une partagée');

  await loginAs(page, owner);

  // ============ 1. ZONE SÛRE DE L'APPAREIL ============
  await openActivity(page, actSolo.id);
  ok(await page.isVisible('#activityPage'), '1.0 la page est ouverte');

  const safe = await page.evaluate(() => {
    // On relit les règles telles qu'écrites dans la feuille de style : c'est la
    // seule façon de voir un env() (le style calculé, lui, l'a déjà résolu).
    let headerRule = '', scrollRule = '', topbarRule = '';
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (!r.selectorText) continue;
        if (r.selectorText === '.activityPageHeader') headerRule += r.cssText;
        if (r.selectorText === '#activityPageScroll') scrollRule += r.cssText;
        if (r.selectorText === '.topbar') topbarRule += r.cssText;
      }
    }
    const header = document.querySelector('.activityPageHeader');
    const scroll = document.getElementById('activityPageScroll');
    const cs = getComputedStyle(header);
    const cs2 = getComputedStyle(scroll);
    return {
      headerReadsTop: headerRule.indexOf('safe-area-inset-top') !== -1,
      headerReadsSides: headerRule.indexOf('safe-area-inset-left') !== -1
        && headerRule.indexOf('safe-area-inset-right') !== -1,
      scrollReadsBottom: scrollRule.indexOf('safe-area-inset-bottom') !== -1,
      scrollTopUntouched: scrollRule.indexOf('padding-top') === -1
        || scrollRule.indexOf('safe-area-inset-top') === -1,
      topbarReadsTop: topbarRule.indexOf('safe-area-inset-top') !== -1,
      headerPadTop: cs.paddingTop,
      scrollPadTop: cs2.paddingTop,
    };
  });
  ok(safe.topbarReadsTop, '1.1 (repère) .topbar lit déjà l\'inset haut — c\'est le modèle');
  ok(safe.headerReadsTop, '1.2 ⭐ l\'en-tête de la page lit désormais l\'inset HAUT');
  ok(safe.headerReadsSides, '1.3 ⭐ et les insets latéraux (écrans incurvés en paysage)');
  ok(safe.scrollReadsBottom, '1.4 ⭐ la zone défilante réserve l\'inset BAS');
  ok(safe.scrollTopUntouched,
    '1.5 ⭐ son padding-top n\'est PAS touché : pinSubProjectSticky le lit au pixel près');
  ok(safe.headerPadTop === '16px',
    '1.6 ⭐ sur un écran sans encoche, rien ne change — ' + safe.headerPadTop);
  ok(safe.scrollPadTop === '16px',
    '1.7 et le padding haut de la zone défilante vaut toujours 16px — ' + safe.scrollPadTop);

  // ============ 2. L'ICÔNE, SUR UNE ACTIVITÉ SOLO ============
  ok(await page.isVisible('#activityPageMembersBtn'), '2.1 ⭐ l\'icône « membres » est dans l\'en-tête');
  const iconGeom = await page.evaluate(() => {
    const b = document.getElementById('activityPageMembersBtn');
    const x = document.getElementById('activityPageClose');
    const svg = b.querySelector('svg');
    const br = b.getBoundingClientRect(), xr = x.getBoundingClientRect();
    return {
      hasSvg: !!svg, circles: b.querySelectorAll('circle').length,
      paths: b.querySelectorAll('path').length,
      leftOfClose: br.right <= xr.left + 1,
      sameRow: Math.abs((br.top + br.height / 2) - (xr.top + xr.height / 2)) <= 1,
      w: Math.round(br.width), h: Math.round(br.height),
    };
  });
  ok(iconGeom.hasSvg && iconGeom.circles === 1 && iconGeom.paths === 3,
    '2.2 c\'est bien un dessin (une tête, un buste, un +), pas un caractère');
  ok(iconGeom.leftOfClose && iconGeom.sameRow, '2.3 placée à gauche de la croix, sur la même ligne');
  ok(iconGeom.w >= 30 && iconGeom.h >= 30,
    '2.4 la cible tactile fait au moins 30px — ' + iconGeom.w + 'x' + iconGeom.h);

  const before = memberCalls;
  await page.click('#activityPageMembersBtn');
  await page.waitForTimeout(900);
  ok(await page.isVisible('#communityMembersModal'), '2.5 ⭐ le clic ouvre la liste des membres');
  // ⭐ L'assertion qui a trouvé le SECOND bug : « visible » au sens du DOM ne veut
  // pas dire visible à l'écran. #activityPage porte la classe
  // .communityMembersModal, donc le même z-index (100) que la modale, et il est
  // déclaré APRÈS elle : la liste s'ouvrait DERRIÈRE la page. On vérifie donc
  // ce que le doigt toucherait vraiment à cet endroit.
  ok(await page.evaluate(() => {
    const card = document.querySelector('#communityMembersModal .communityMembersModalCard');
    const r = card.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
    return !!(hit && document.getElementById('communityMembersModal').contains(hit));
  }), '2.5b ⭐ et elle est réellement AU-DESSUS de la page, pas cachée derrière');
  ok(memberCalls === before,
    '2.6 ⭐ AUCUN appel serveur en solo : la route refuse les activités à un seul membre');
  const soloRows = await page.$$eval('#communityMembersModalList .activityRow',
    (els) => els.map((e) => e.textContent));
  ok(soloRows.length === 1, '2.7 un seul membre listé');
  ok(soloRows[0].indexOf('Chef') !== -1 && soloRows[0].indexOf('(toi)') !== -1,
    '2.8 c\'est moi — "' + soloRows[0].trim() + '"');
  ok(await page.isVisible('#activityMembersActions'), '2.9 la zone d\'actions est visible');
  const soloBtns = await page.$$eval('#activityMembersActions .iconBtn', (els) => els.map((e) => e.textContent));
  ok(soloBtns.length === 1 && soloBtns[0] === 'Ajouter un membre',
    '2.10 ⭐ en solo : « Ajouter un membre » seul, pas de « Quitter » — ' + JSON.stringify(soloBtns));

  await page.click('#communityMembersModalClose');
  await page.waitForTimeout(500);
  await page.click('#activityPageClose');
  await page.waitForTimeout(700);

  // ============ 3. ACTIVITÉ PARTAGÉE, VUE PAR LE CRÉATEUR ============
  await openActivity(page, actPartage.id);
  await page.click('#activityPageMembersBtn');
  await page.waitForTimeout(1200);
  const sharedRows = await page.$$eval('#communityMembersModalList .activityRow',
    (els) => els.map((e) => e.textContent));
  ok(sharedRows.length === 2, '3.1 les deux membres sont listés');
  const ownerBtns = await page.$$eval('#activityMembersActions .iconBtn', (els) => els.map((e) => e.textContent));
  ok(ownerBtns.indexOf('Ajouter un membre') !== -1,
    '3.2 ⭐ le créateur peut ajouter un membre — ' + JSON.stringify(ownerBtns));
  ok(ownerBtns.indexOf('Quitter la communauté') !== -1,
    '3.3 ⭐ et quitter la communauté');
  await page.click('#communityMembersModalClose');
  await page.waitForTimeout(500);

  // ============ 4. LA ZONE D'ACTIONS EST RECONSTRUITE À CHAQUE OUVERTURE =====
  // C'est ce qui garantit qu'aucun bouton ne survit d'une activité à l'autre —
  // et, du même coup, que l'appelant historique (« Voir les membres », qui ne
  // passe aucune activité) trouve la zone vide et masquée.
  //
  // ⚠️ Vérifié par le comportement observable, PAS par le chemin d'interface de
  // « Voir les membres » : ce bouton a déménagé deux fois en trois jours
  // (derrière le « ⋮ » d'une ligne, puis dans un mode édition par appui long
  // livré le 5 septembre par une autre discussion). Une assertion accrochée à
  // ses ids serait tombée sans qu'aucune régression n'ait eu lieu.
  await page.click('#activityPageClose');
  await page.waitForTimeout(800);
  await openActivity(page, actSolo.id);
  await page.click('#activityPageMembersBtn');
  await page.waitForTimeout(900);
  const afterShared = await page.$$eval('#activityMembersActions .iconBtn', (els) => els.map((e) => e.textContent));
  ok(afterShared.length === 1 && afterShared[0] === 'Ajouter un membre',
    '4.1 ⭐ revenu sur le solo : aucun « Quitter » résiduel de l\'activité partagée — '
    + JSON.stringify(afterShared));
  await page.click('#communityMembersModalClose');
  await page.waitForTimeout(500);
  await page.click('#activityPageClose');
  await page.waitForTimeout(700);

  // ============ 5. UN SIMPLE MEMBRE : PAS D'AJOUT, MAIS IL PEUT QUITTER ======
  await loginAs(page, membre);
  await openActivity(page, actPartage.id);
  await page.click('#activityPageMembersBtn');
  await page.waitForTimeout(1200);
  const memberBtns = await page.$$eval('#activityMembersActions .iconBtn', (els) => els.map((e) => e.textContent));
  ok(memberBtns.indexOf('Ajouter un membre') === -1,
    '5.1 ⭐ un membre qui n\'est pas le créateur ne peut PAS ajouter — ' + JSON.stringify(memberBtns));
  ok(memberBtns.indexOf('Quitter la communauté') !== -1, '5.2 mais il peut quitter');

  await page.screenshot({ path: '/home/claude/work4/membres.png' });

  // ⭐ Quitter pour de vrai : c'est un « Séparer », donc on GARDE son historique.
  // Un seul gestionnaire, permanent : deux `once` se seraient tous deux
  // enregistrés sur la PREMIÈRE boîte, et la seconde aurait fait planter la
  // suite (« dialog which is already handled »).
  const acceptAll = (d) => d.accept();
  page.on('dialog', acceptAll);                    // confirmation, puis succès
  await page.click('#activityMembersActions .iconBtn:last-child');
  await page.waitForTimeout(2500);
  ok(!(await page.isVisible('#activityPage')),
    '5.3 ⭐ la page se referme : l\'activité vient de changer de nature');
  const mine = (await api(page, 'GET', '/api/activities?userId=' + membre.id)).body;
  const still = (mine.activities || mine).filter(function (x) {
    return String(x.name).indexOf('Partagee' + stamp) !== -1;
  });
  ok(still.length === 1, '5.4 ⭐ l\'activité est TOUJOURS là — quitter n\'est pas supprimer');
  ok(still.length === 1 && still[0].membersCount === 1,
    '5.5 ⭐ mais elle est devenue personnelle (1 membre)');
  const asOwner = (await api(page, 'GET', '/api/activities?userId=' + owner.id)).body;
  const ownerCopy = (asOwner.activities || asOwner).filter(function (x) {
    return String(x.id) === String(actPartage.id);
  });
  ok(ownerCopy.length === 1, '5.6 ⭐ et le créateur garde la sienne, intacte');

  const realErrors = consoleErrors.filter((e) =>
    e.indexOf('favicon') === -1 && e.indexOf('manifest') === -1 && e.indexOf('sw.js') === -1);
  ok(realErrors.length === 0, '6.1 aucune erreur JS en console — ' + JSON.stringify(realErrors.slice(0, 4)));

  await browser.close();
  console.log('\n--- ' + passed + ' assertions passées, ' + failed + ' échouées ---');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERREUR : ' + e.stack); process.exit(1); });
