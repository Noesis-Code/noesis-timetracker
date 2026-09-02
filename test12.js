// test12.js — suppression d'une activité : les deux issues sont des boutons
//
// Depuis le 2 septembre 2026 (demande d'Emilien), supprimer une activité
// n'enchaîne plus deux confirm() natifs en "OK / Annuler" : une seule boîte
// s'ouvre, avec les deux issues écrites sur les boutons ("Conserver les
// anciens enregistrements" / "Supprimer les anciens enregistrements").
//
// Ce fichier vérifie AUSSI l'effet réel sur les données, pas seulement
// l'affichage : après "Conserver", la session enregistrée sur l'activité est
// toujours dans l'historique du Chrono ; après "Supprimer", elle a disparu.
//
// À FAIRE AVANT DE LANCER CE FICHIER (comme test7/test9/test10/test11) :
//   1. Arrêter le serveur s'il tourne.
//   2. Supprimer data/noesis.db pour repartir d'une base vide.
//   3. Relancer le serveur : npm start
//   4. Dans un autre terminal, à la racine du projet : node test12.js
//
// Note : un nouveau profil est en ANGLAIS par défaut (migration de langue,
// server/db.js), d'où les libellés anglais dans les sélecteurs.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';

let failures = 0;
function check(label, ok) {
  console.log((ok ? '  OK   ' : '  FAIL ') + label);
  if (!ok) failures++;
}

(async () => {
  const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (e) => { console.log('  !! erreur JS : ' + e.message); failures++; });

  // Toute boîte native qui s'ouvrirait encore est un échec : c'est
  // précisément ce que ce chantier a remplacé.
  page.on('dialog', (d) => {
    console.log('  !! boîte native inattendue (' + d.type() + ') : ' + d.message());
    failures++;
    d.dismiss().catch(function () {});
  });

  // ---------- Profil + deux activités ----------
  await page.goto(BASE);
  await page.waitForSelector('#onbCreate');
  await page.fill('#onbName', 'Delta');
  await page.fill('#onbLastName', 'Test');
  await page.fill('#onbPhone', '0600000012');
  await page.fill('#onbEmail', 'delta@example.com');
  await page.fill('#onbPin', '4321');
  await page.fill('#onbPinConfirm', '4321');
  await page.click('#onbCreateBtn');
  await page.waitForSelector('#onbActivities:not(.hidden)');
  for (const name of ['Lecture', 'Sport']) {
    await page.fill('#onbNewActivityName', name);
    await page.click('#onbNewActivitySave');
    await page.waitForFunction(
      (n) => document.querySelector('#onbActivityList').textContent.includes(n), name);
  }
  await page.click('#onbActivitiesContinue');
  await page.waitForSelector('#app:not(.hidden)');

  // ---------- Une session enregistrée sur chaque activité ----------
  async function recordSession(activityName) {
    await page.click('.tabBtn[data-tab="chrono"]');
    await page.waitForSelector('#activityButtons button');
    await page.click('#activityButtons button:has-text("' + activityName + '")');
    await page.waitForSelector('#chronoRunning:not(.hidden)');
    await page.waitForTimeout(1200); // une durée non nulle
    await page.click('#stopBtn');
    await page.waitForSelector('#stopConfirmPanel:not(.hidden)');
    await page.click('#stopConfirmBtn');
    await page.waitForSelector('#chronoIdle:not(.hidden)');
  }
  await recordSession('Lecture');
  await recordSession('Sport');

  // L'historique du Chrono est replié par défaut et se recharge à chaque
  // ouverture de l'onglet : on le rouvre à chaque relevé.
  async function historyText() {
    await page.click('.tabBtn[data-tab="chrono"]');
    await page.waitForSelector('#tab-chrono:not(.hidden)');
    await page.click('#chronoHistoryHeader');
    await page.waitForSelector('#chronoHistoryPanel:not(.hidden)');
    await page.waitForTimeout(800);
    return page.textContent('#historyList');
  }
  const historyAtStart = await historyText();
  check('les deux sessions sont bien enregistrées au départ',
    historyAtStart.includes('Lecture') && historyAtStart.includes('Sport'));

  // ---------- La boîte de suppression ----------
  const rowFor = (name) => '#activitiesList .activityRow:has(.activityRowName:text-is("' + name + '"))';

  async function openDeleteModal(name) {
    await page.click('.tabBtn[data-tab="activity"]');
    await page.waitForSelector('#tab-activity:not(.hidden)');
    await page.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length > 0);
    await page.click(rowFor(name) + ' .menuBtn');
    await page.click(rowFor(name) + ' .rowActions button:has-text("Delete permanently")');
    await page.waitForSelector('#deleteActivityModal:not(.hidden)');
  }

  await openDeleteModal('Lecture');
  check('la boîte nomme l\'activité concernée',
    (await page.textContent('#deleteActivityModalTitle')).includes('Lecture'));
  const choices = await page.$$eval('#deleteActivityModal .rowActions button', (b) => b.map((x) => x.textContent.trim()));
  check('deux boutons nommés, plus de OK/Annuler',
    choices.length === 2 &&
    choices[0] === 'Keep the past sessions' &&
    choices[1] === 'Delete the past sessions');
  check('l\'option non destructive est proposée en premier', choices[0] === 'Keep the past sessions');

  // ✕ = ne rien faire du tout
  await page.click('#deleteActivityModalClose');
  await page.waitForSelector('#deleteActivityModal.hidden', { state: 'attached' });
  await page.waitForTimeout(400);
  check('"✕" referme sans rien supprimer',
    (await page.$$('#activitiesList .activityRow')).length === 2);

  // Clic sur le fond = ne rien faire non plus
  await openDeleteModal('Lecture');
  const box = await page.$('#deleteActivityModal');
  const bb = await box.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + 20); // au-dessus de la carte
  await page.waitForTimeout(400);
  check('un clic sur le fond referme sans rien supprimer',
    await page.evaluate(() => document.querySelector('#deleteActivityModal').classList.contains('hidden')) &&
    (await page.$$('#activitiesList .activityRow')).length === 2);

  // ---------- "Conserver les anciens enregistrements" ----------
  await openDeleteModal('Lecture');
  await page.click('#deleteActivityKeepBtn');
  await page.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length === 1);
  check('l\'activité a disparu de la liste', !(await page.textContent('#activitiesList')).includes('Lecture'));
  const historyAfterKeep = await historyText();
  check('la session enregistrée dessus est conservée',
    historyAfterKeep.includes('Lecture') && historyAfterKeep.includes('Sport'));

  // ---------- "Supprimer les anciens enregistrements" ----------
  await openDeleteModal('Sport');
  await page.click('#deleteActivityPurgeBtn');
  await page.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length === 0);
  const historyAfterPurge = await historyText();
  check('la session enregistrée dessus est bien supprimée', !historyAfterPurge.includes('Sport'));
  check('la session de l\'autre activité, elle, est intacte', historyAfterPurge.includes('Lecture'));

  await browser.close();
  console.log(failures === 0 ? '\nTOUT EST PASSÉ' : '\n' + failures + ' ÉCHEC(S)');
  process.exit(failures === 0 ? 0 : 1);
})();
