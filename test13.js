// test13.js — fusion de deux activités
//
// Demande d'Emilien (2 septembre 2026) : un utilisateur peut fusionner deux de
// ses activités ; les historiques de temps s'additionnent ; la fusion n'est
// possible que si au moins une des deux n'est partagée avec personne. Et,
// précision d'Emilien : quand l'une des deux est partagée, c'est TOUJOURS
// elle qui reste (nom, couleur, membres) et qui recueille les enregistrements
// de l'autre — quel que soit le bouton par lequel on est parti.
//
// Vérifie l'effet réel en base (node:sqlite en lecture seule), pas seulement
// ce que l'écran affiche : c'est un déplacement de données, une erreur de sens
// se verrait mal à l'œil et se rattraperait très mal.
//
// À FAIRE AVANT DE LANCER CE FICHIER (comme test7/test9/test10/test11/test12) :
//   1. Arrêter le serveur s'il tourne.
//   2. Supprimer data/noesis.db pour repartir d'une base vide.
//   3. Relancer le serveur : npm start
//   4. Dans un autre terminal, à la racine du projet : node test13.js
//
// Note : un nouveau profil est en ANGLAIS par défaut (migration de langue,
// server/db.js), d'où les libellés anglais dans les sélecteurs.
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3000';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'noesis.db');

let failures = 0;
function check(label, ok) {
  console.log((ok ? '  OK   ' : '  FAIL ') + label);
  if (!ok) failures++;
}

// Lecture seule : toutes les écritures passent par l'app, comme en vrai.
function db() { return new DatabaseSync(DB_PATH, { readOnly: true }); }

function secondsOn(activityName, userName) {
  const d = db();
  try {
    const row = d.prepare(`
      SELECT COALESCE(SUM(t.durationSeconds), 0) AS seconds, COUNT(*) AS n
      FROM time_entries t
      JOIN activities a ON a.id = t.activityId
      JOIN users u ON u.id = t.userId
      WHERE a.name = ? AND u.name = ?
    `).get(activityName, userName);
    return row;
  } finally { d.close(); }
}

function activityExists(name) {
  const d = db();
  try {
    return !!d.prepare('SELECT 1 FROM activities WHERE name = ? AND active = 1').get(name);
  } finally { d.close(); }
}

function memberNames(activityName) {
  const d = db();
  try {
    return d.prepare(`
      SELECT u.name AS name FROM activity_members m
      JOIN activities a ON a.id = m.activityId
      JOIN users u ON u.id = m.userId
      WHERE a.name = ? ORDER BY u.name
    `).all(activityName).map((r) => r.name);
  } finally { d.close(); }
}

async function createProfile(page, name, pin, phone) {
  await page.goto(BASE);
  await page.waitForSelector('#onbCreate');
  await page.fill('#onbName', name);
  await page.fill('#onbLastName', 'Test');
  await page.fill('#onbPhone', phone);
  await page.fill('#onbEmail', name.toLowerCase() + '@example.com');
  await page.fill('#onbPin', pin);
  await page.fill('#onbPinConfirm', pin);
  await page.click('#onbCreateBtn');
  await page.waitForSelector('#onbActivities:not(.hidden)');
}

async function finishOnboarding(page, names) {
  for (const n of names) {
    await page.fill('#onbNewActivityName', n);
    await page.click('#onbNewActivitySave');
    await page.waitForFunction(
      (x) => document.querySelector('#onbActivityList').textContent.includes(x), n);
  }
  await page.click('#onbActivitiesContinue');
  await page.waitForSelector('#app:not(.hidden)');
}

(async () => {
  const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch(launchOpts);

  const a = await (await browser.newContext()).newPage();
  a.on('pageerror', (e) => { console.log('  !! erreur JS (A) : ' + e.message); failures++; });

  await createProfile(a, 'Milo', '1234', '0600000021');
  await finishOnboarding(a, ['Lecture', 'Romans', 'Sport']);

  async function recordSession(page, activityName) {
    await page.click('.tabBtn[data-tab="chrono"]');
    await page.waitForSelector('#activityButtons button');
    await page.click('#activityButtons button:has-text("' + activityName + '")');
    await page.waitForSelector('#chronoRunning:not(.hidden)');
    await page.waitForTimeout(1500);
    await page.click('#stopBtn');
    await page.waitForSelector('#stopConfirmPanel:not(.hidden)');
    await page.click('#stopConfirmBtn');
    await page.waitForSelector('#chronoIdle:not(.hidden)');
  }
  await recordSession(a, 'Lecture');
  await recordSession(a, 'Romans');
  await recordSession(a, 'Sport');

  const lectureBefore = secondsOn('Lecture', 'Milo');
  const romansBefore = secondsOn('Romans', 'Milo');
  check('trois sessions enregistrées au départ',
    lectureBefore.n === 1 && romansBefore.n === 1 && secondsOn('Sport', 'Milo').n === 1);

  const rowFor = (name) => '#activitiesList .activityRow:has(.activityRowName:text-is("' + name + '"))';

  async function openMerge(page, name) {
    await page.click('.tabBtn[data-tab="activity"]');
    await page.waitForSelector('#tab-activity:not(.hidden)');
    await page.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length > 0);
    await page.click(rowFor(name) + ' .menuBtn');
    await page.click(rowFor(name) + ' .rowActions button:has-text("Merge")');
    await page.waitForSelector('#mergeActivityModal:not(.hidden)');
  }

  // ---------- 1. Deux activités personnelles ----------
  await openMerge(a, 'Romans');
  const candidates = await a.$$eval('#mergeActivityList .activityRowName', (e) => e.map((x) => x.textContent));
  check('la boîte propose les autres activités, jamais celle de départ',
    candidates.length === 2 && candidates.includes('Lecture') && candidates.includes('Sport') &&
    !candidates.includes('Romans'));

  await a.click('#mergeActivityList .activityRow:has(.activityRowName:text-is("Lecture")) .activityRowHeader');
  await a.waitForSelector('#mergeActivityStepConfirm:not(.hidden)');
  const summary = await a.textContent('#mergeActivitySummary');
  check('le récapitulatif annonce le sens de la fusion avant d\'agir',
    summary.includes('Romans') && summary.includes('Lecture'));

  // Retour en arrière : on ne fusionne rien tant qu'on n'a pas confirmé
  await a.click('#mergeActivityBackBtn');
  await a.waitForSelector('#mergeActivityStepPick:not(.hidden)');
  await a.click('#mergeActivityModalClose');
  await a.waitForTimeout(400);
  check('fermer la boîte sans confirmer ne fusionne rien',
    activityExists('Romans') && secondsOn('Romans', 'Milo').n === 1);

  await openMerge(a, 'Romans');
  await a.click('#mergeActivityList .activityRow:has(.activityRowName:text-is("Lecture")) .activityRowHeader');
  await a.waitForSelector('#mergeActivityStepConfirm:not(.hidden)');
  await a.click('#mergeActivityConfirmBtn');
  await a.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length === 2);
  check('la boîte annonce ce qui a été déplacé',
    /1 session\(s\)/.test(await a.textContent('#mergeActivityMsg')));
  await a.click('#mergeActivityModalClose');
  await a.waitForTimeout(300);

  const lectureAfter = secondsOn('Lecture', 'Milo');
  check('l\'activité versée a disparu', !activityExists('Romans'));
  check('les deux historiques se sont additionnés',
    lectureAfter.n === 2 &&
    lectureAfter.seconds === lectureBefore.seconds + romansBefore.seconds);
  check('l\'activité d\'arrivée garde son nom', activityExists('Lecture'));
  check('la troisième activité n\'a pas bougé', secondsOn('Sport', 'Milo').n === 1);

  // ---------- 2. Une partagée + une personnelle ----------
  // Milo partage "Lecture" avec Nina : "Lecture" devient partagée.
  const b = await (await browser.newContext()).newPage();
  b.on('pageerror', (e) => { console.log('  !! erreur JS (B) : ' + e.message); failures++; });
  await createProfile(b, 'Nina', '5678', '0600000022');
  await finishOnboarding(b, ['Cuisine']);

  await a.click('.tabBtn[data-tab="activity"]');
  await a.waitForTimeout(600);
  await a.click(rowFor('Lecture') + ' .menuBtn');
  const shareDialogs = (d) => (d.type() === 'prompt' ? d.accept('Nina') : d.accept());
  a.on('dialog', shareDialogs);
  await a.click(rowFor('Lecture') + ' .rowActions button:has-text("Share")');
  await a.waitForTimeout(1200);
  a.off('dialog', shareDialogs);

  await b.click('#whoami');
  await b.waitForSelector('#tab-profile:not(.hidden)');
  await b.click('#profileNotifBtn');
  await b.waitForSelector('#invitesList .activityRow');
  await b.click('#invitesList button:has-text("Accept")');
  await b.waitForTimeout(1200);
  check('"Lecture" est bien partagée entre les deux', memberNames('Lecture').length === 2);

  // Milo part de "Sport" (personnelle) et choisit "Lecture" (partagée).
  // Le sens doit s'inverser : c'est "Lecture" qui reste.
  const sportBefore = secondsOn('Sport', 'Milo');
  const lectureBefore2 = secondsOn('Lecture', 'Milo');
  await openMerge(a, 'Sport');
  await a.click('#mergeActivityList .activityRow:has(.activityRowName:text-is("Lecture")) .activityRowHeader');
  await a.waitForSelector('#mergeActivityStepConfirm:not(.hidden)');
  const summary2 = await a.textContent('#mergeActivitySummary');
  check('le récapitulatif annonce que c\'est la partagée qui reste',
    summary2.indexOf('Sport') < summary2.indexOf('Lecture'));

  await a.click('#mergeActivityConfirmBtn');
  await a.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length === 1);
  await a.click('#mergeActivityModalClose');
  await a.waitForTimeout(300);

  check('l\'activité personnelle a disparu', !activityExists('Sport'));
  check('l\'activité partagée est restée', activityExists('Lecture'));
  check('elle est toujours partagée avec les deux membres', memberNames('Lecture').length === 2);
  const lectureAfter2 = secondsOn('Lecture', 'Milo');
  check('ses enregistrements ont été ajoutés à la partagée',
    lectureAfter2.n === lectureBefore2.n + sportBefore.n &&
    lectureAfter2.seconds === lectureBefore2.seconds + sportBefore.seconds);

  // ---------- 3. Deux partagées : refusé ----------
  // Nina partage "Cuisine" avec Milo : Milo se retrouve avec deux activités
  // partagées et plus aucune personnelle.
  // On quitte le Profil en tapant un onglet de la barre du bas : le bouton
  // "←" a été retiré (il n'y a plus qu'un seul chemin de sortie).
  await b.click('.tabBtn[data-tab="activity"]');
  await b.waitForTimeout(800);
  await b.click('#activitiesList .activityRow:has(.activityRowName:text-is("Cuisine")) .menuBtn');
  const shareDialogsB = (d) => (d.type() === 'prompt' ? d.accept('Milo') : d.accept());
  b.on('dialog', shareDialogsB);
  await b.click('#activitiesList .activityRow:has(.activityRowName:text-is("Cuisine")) .rowActions button:has-text("Share")');
  await b.waitForTimeout(1200);
  b.off('dialog', shareDialogsB);

  await a.click('#whoami');
  await a.waitForSelector('#tab-profile:not(.hidden)');
  await a.click('#profileNotifBtn');
  await a.waitForSelector('#invitesList .activityRow');
  await a.click('#invitesList button:has-text("Accept")');
  await a.waitForTimeout(1200);

  await openMerge(a, 'Lecture');
  const blockedRow = '#mergeActivityList .activityRow:has(.activityRowName:text-is("Cuisine"))';
  check('l\'autre activité partagée est proposée mais barrée',
    (await a.$$(blockedRow + '.inactive')).length === 1);
  check('elle dit pourquoi la fusion est impossible',
    (await a.textContent(blockedRow)).includes('Shared as well'));
  await a.click(blockedRow + ' .activityRowHeader');
  await a.waitForTimeout(400);
  check('cliquer dessus ne mène nulle part',
    await a.evaluate(() => !document.querySelector('#mergeActivityStepConfirm').classList.contains('hidden') === false));
  check('les deux activités partagées sont toujours là',
    activityExists('Lecture') && activityExists('Cuisine'));
  await a.click('#mergeActivityModalClose');

  // ---------- 4. Le refus ne dépend pas de l'interface ----------
  // L'UI barre la ligne, mais un client périmé (ou quelqu'un qui appelle
  // l'API à la main) ne doit pas pouvoir passer outre : le serveur applique
  // la même règle.
  const ids = (() => {
    const d = db();
    try {
      const milo = d.prepare('SELECT id FROM users WHERE name = ?').get('Milo');
      const lecture = d.prepare('SELECT id FROM activities WHERE name = ?').get('Lecture');
      const cuisine = d.prepare('SELECT id FROM activities WHERE name = ?').get('Cuisine');
      return { userId: milo.id, lecture: lecture.id, cuisine: cuisine.id };
    } finally { d.close(); }
  })();

  const direct = await fetch(BASE + '/api/activities/' + ids.lecture + '/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ids.userId, intoActivityId: ids.cuisine }),
  });
  const directBody = await direct.json();
  check('le serveur refuse aussi la fusion de deux activités partagées (409)',
    direct.status === 409 && /partagées/.test(directBody.error || ''));
  check('rien n\'a bougé après ce refus',
    activityExists('Lecture') && activityExists('Cuisine'));

  await browser.close();
  console.log(failures === 0 ? '\nTOUT EST PASSÉ' : '\n' + failures + ' ÉCHEC(S)');
  process.exit(failures === 0 ? 0 : 1);
})();
