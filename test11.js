// test11.js — onglet "Activité" (30 août 2026)
//
// Couvre la réorganisation du 30 août 2026 : l'onglet "Profil" a quitté la
// barre du bas au profit d'un onglet "Activité", et le Profil s'ouvre en
// cliquant sur le prénom en haut à droite (#whoami). L'onglet Activité
// regroupe la gestion des activités (venue de Profil) et le suivi des
// activités partagées (venu de Communauté > Membres). Les invitations
// reçues, elles, sont restées dans le panneau "avion en papier" du Profil
// (arbitrage d'Emilien du même jour, après un aller-retour).
//
// Fin de journée, deuxième passage : les deux listes de l'onglet ("Activités"
// et "Mes activités partagées") ont fusionné en une seule, l'onglet ne montre
// plus rien d'autre que cette liste tant qu'aucune activité n'est
// sélectionnée, et les textes d'aide automatiques ont été retirés.
//
// À FAIRE AVANT DE LANCER CE FICHIER (comme test7/test9/test10) :
//   1. Arrêter le serveur s'il tourne.
//   2. Supprimer data/noesis.db pour repartir d'une base vide — ce fichier
//      crée des profils à pseudo fixe et se percute sinon sur la contrainte
//      d'unicité des pseudos.
//   3. Relancer le serveur : npm start
//   4. Dans un autre terminal, à la racine du projet : node test11.js
//
// Note : un nouveau profil est en ANGLAIS par défaut (voir la migration de
// langue dans server/db.js), d'où les libellés anglais dans les sélecteurs.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';

let failures = 0;
function check(label, ok) {
  console.log((ok ? '  OK   ' : '  FAIL ') + label);
  if (!ok) failures++;
}

async function createProfile(page, name, pin) {
  await page.goto(BASE);
  await page.waitForSelector('#onbCreate');
  await page.fill('#onbName', name);
  await page.fill('#onbLastName', 'Test');
  await page.fill('#onbPhone', '0600000000');
  await page.fill('#onbEmail', name.toLowerCase() + '@example.com');
  await page.fill('#onbPin', pin);
  await page.fill('#onbPinConfirm', pin);
  await page.click('#onbCreateBtn');
  await page.waitForSelector('#onbActivities:not(.hidden)');
}

async function addOnboardingActivity(page, name) {
  await page.fill('#onbNewActivityName', name);
  await page.click('#onbNewActivitySave');
  await page.waitForFunction(
    (n) => document.querySelector('#onbActivityList').textContent.includes(n), name);
  await page.click('#onbActivitiesContinue');
  await page.waitForSelector('#app:not(.hidden)');
}

(async () => {
  // executablePath : à retirer si Playwright trouve son propre Chromium.
  const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch(launchOpts);

  // ---------- Profil A : crée une activité, puis la partage ----------
  const a = await (await browser.newContext()).newPage();
  a.on('pageerror', (e) => { console.log('  !! erreur JS (A) : ' + e.message); failures++; });
  await createProfile(a, 'Alpha', '1234');
  await addOnboardingActivity(a, 'Lecture');

  // 1. Barre du bas : Profil a bien été remplacé par Activité
  const tabs = await a.$$eval('.tabBtn', (els) => els.map((e) => e.dataset.tab));
  check('barre du bas = chrono/stats/community/activity', tabs.join(',') === 'chrono,stats,community,activity');
  check('le prénom en haut à droite est bien un bouton', await a.isVisible('#whoami'));

  // 2. L'onglet Activité liste les activités (bloc venu de Profil)
  await a.click('.tabBtn[data-tab="activity"]');
  await a.waitForSelector('#tab-activity:not(.hidden)');
  await a.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length > 0);
  check('l\'activité créée apparaît dans l\'onglet Activité',
    (await a.textContent('#activitiesList')).includes('Lecture'));
  check('le bloc Activités a bien quitté le Profil',
    await a.evaluate(() => !document.querySelector('#tab-profile #activitiesList')));

  // 3. Le "⋮" ouvre les réglages de l'activité
  await a.click('#activitiesList .activityRow .menuBtn');
  check('le "⋮" ouvre le panneau de réglages',
    await a.isVisible('#activitiesList .activitySettingsPanel'));

  // 4. Le Profil s'ouvre par le prénom et se referme par "←"
  await a.click('#whoami');
  await a.waitForSelector('#tab-profile:not(.hidden)');
  check('le Profil s\'ouvre en cliquant sur le prénom', await a.isVisible('#profileMain'));
  check('le Profil garde "Mes notes"', (await a.textContent('#tab-profile')).includes('My notes'));
  await a.click('#profileCloseBtn');
  await a.waitForSelector('#tab-profile', { state: 'hidden' });
  check('"←" referme le Profil et rouvre le dernier onglet visité',
    await a.isVisible('#tab-activity'));

  // 5. Communauté ne garde que le suivi
  await a.click('.tabBtn[data-tab="community"]');
  await a.waitForSelector('#tab-community:not(.hidden)');
  check('plus de sélecteur Communauté/Membres',
    await a.evaluate(() => !document.querySelector('#communitySectionSwitch')));
  check('la liste des activités a quitté Communauté',
    await a.evaluate(() => !document.querySelector('#tab-community #activitiesList')));
  check('Communauté garde "En ce moment" et la recherche de membres',
    (await a.textContent('#tab-community')).includes('Right now') &&
    await a.isVisible('#communitySearchInput'));

  // ---------- Invitation d'Alpha vers Beta ----------
  const b = await (await browser.newContext()).newPage();
  b.on('pageerror', (e) => { console.log('  !! erreur JS (B) : ' + e.message); failures++; });
  await createProfile(b, 'Beta', '5678');
  await addOnboardingActivity(b, 'Sport');

  await a.click('.tabBtn[data-tab="activity"]');
  await a.waitForSelector('#tab-activity:not(.hidden)');
  await a.click('#activitiesList .activityRow .menuBtn');
  // Un seul gestionnaire pour les deux boîtes natives enchaînées : le prompt
  // du pseudo, puis l'alert de confirmation.
  const shareDialogs = (d) => (d.type() === 'prompt' ? d.accept('Beta') : d.accept());
  a.on('dialog', shareDialogs);
  await a.click('#activitiesList .rowActions button:has-text("Share")');
  await a.waitForTimeout(1200);
  a.off('dialog', shareDialogs);

  // 6. L'invitation se signale et s'accepte dans le Profil, pas dans l'onglet
  //    Activité (arbitrage d'Emilien du 30 août 2026).
  await b.reload();
  await b.waitForSelector('#app:not(.hidden)');
  await b.waitForTimeout(1000);
  check('point rouge d\'invitation visible sur le prénom, depuis un autre onglet',
    await b.isVisible('#whoamiDot'));
  check('la liste des invitations n\'est pas dans l\'onglet Activité',
    await b.evaluate(() => !document.querySelector('#tab-activity #invitesList')));
  check('la liste des invitations est dans le panneau du Profil',
    await b.evaluate(() => !!document.querySelector('#profileNotifPanel #invitesList')));

  await b.click('#whoami');
  await b.waitForSelector('#tab-profile:not(.hidden)');
  await b.click('#profileNotifBtn');
  await b.waitForSelector('#invitesList .activityRow');
  await b.click('#invitesList button:has-text("Accept")');
  await b.waitForTimeout(1000);
  check('point rouge éteint une fois l\'invitation traitée',
    await b.evaluate(() => document.querySelector('#whoamiDot').classList.contains('hidden')
      && document.querySelector('#profileNotifDot').classList.contains('hidden')));

  // ---------- Le suivi des membres vit dans l'onglet Activité ----------
  await b.click('#profileCloseBtn');
  await b.click('.tabBtn[data-tab="activity"]');
  await b.waitForSelector('#tab-activity:not(.hidden)');
  await b.waitForFunction(() => document.querySelectorAll('#activitiesList .activityRow').length === 2);
  check('une seule liste : la partagée et la solo y sont ensemble',
    await b.evaluate(() => !document.querySelector('#communityActivities')));

  const sharedRow = '#activitiesList .activityRow:has(.activityRowHeader.clickable)';
  check('seule l\'activité partagée est cliquable', (await b.$$(sharedRow)).length === 1);
  check('la ligne cliquable est bien "Lecture"',
    (await b.textContent(sharedRow + ' .activityRowName')) === 'Lecture');

  // Tant qu'aucune activité n'est choisie : rien d'autre que la liste
  check('rien d\'autre que la liste tant qu\'aucune activité n\'est choisie',
    await b.evaluate(() => {
      var tab = document.querySelector('#tab-activity');
      var detail = document.querySelector('#communityActivityDetail');
      return detail.classList.contains('hidden')
        && !document.querySelector('#sharedFeed')
        // offsetParent null = pas rendu à l'écran (le bloc parent est masqué)
        && Array.prototype.every.call(tab.querySelectorAll('p.hint'),
             function (h) { return h.offsetParent === null; });
    }));

  await b.click(sharedRow + ' .activityRowHeader .activityRowName');
  await b.waitForSelector('#communityActivityDetail:not(.hidden)');
  check('le détail s\'ouvre DANS la ligne sélectionnée',
    await b.evaluate(() => !!document.querySelector('#activitiesList .activityRow.selected #communityActivityDetail')));
  check('le détail contient la discussion et la feuille de temps des membres',
    await b.isVisible('#communityDiscussionBlock') && await b.isVisible('#communityActivityTimesheetBlock'));

  // "Voir les membres" est passé dans le panneau de réglages du "⋮"
  await b.click('#activitiesList .activityRow.selected .menuBtn');
  await b.click('#activitiesList .activityRow.selected .rowActions button:has-text("View members")');
  await b.waitForSelector('#communityMembersModal:not(.hidden)');
  const modalTxt = await b.textContent('#communityMembersModalList');
  check('la modale "Voir les membres" liste les deux membres',
    modalTxt.includes('Alpha') && modalTxt.includes('Beta'));
  await b.click('#communityMembersModalClose');

  // Désélection : le détail se referme et retourne à son ancre (il ne doit
  // jamais être perdu — un nœud détaché n'est plus trouvable par son id).
  await b.click(sharedRow + ' .activityRowHeader .activityRowName');
  await b.waitForTimeout(600);
  check('le détail se referme et retourne à son ancre',
    await b.evaluate(() => {
      var d = document.querySelector('#communityActivityDetail');
      return !!d && d.parentNode.id === 'activityDetailAnchor' && d.classList.contains('hidden');
    }));

  // Aller-retour d'onglet : le bloc est toujours vivant
  await b.click('.tabBtn[data-tab="chrono"]');
  await b.click('.tabBtn[data-tab="activity"]');
  await b.waitForTimeout(800);
  await b.click(sharedRow + ' .activityRowHeader .activityRowName');
  await b.waitForSelector('#communityActivityDetail:not(.hidden)');
  check('le détail se rouvre après un aller-retour d\'onglet', true);

  // Une activité solo ouvre ses réglages au clic (jamais un clic sans effet)
  const soloRow = '#activitiesList .activityRow:not(:has(.activityRowHeader.clickable))';
  await b.click(soloRow + ' .activityRowHeader .activityRowName');
  check('clic sur une activité solo : ouvre ses réglages',
    await b.isVisible(soloRow + ' .activitySettingsPanel'));

  await browser.close();
  console.log(failures === 0 ? '\nTOUT EST PASSÉ' : '\n' + failures + ' ÉCHEC(S)');
  process.exit(failures === 0 ? 0 : 1);
})();
