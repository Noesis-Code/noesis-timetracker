// test17.js — Rappels avant l'échéance d'un sous-projet, et modification de la
// date de clôture après coup.
//
// Discussion "Calendrier des clôtures" (4 septembre 2026), deuxième et
// troisième passages.
//
// PRINCIPE : le balayage des rappels ne peut pas être observé « pour de vrai »
// — il faudrait un vrai service de push et un vrai téléphone. On remplace donc
// la seule sortie du module (push.sendToUsers) par un espion, et on vérifie
// CE QUI SERAIT ENVOYÉ : à qui, quel texte, quelle adresse de renvoi, combien
// de fois. Tout le reste (dates, seuils, mémoire des envois, cascades) est du
// comportement réel, sur une base SQLite vierge.
//
// Lancement : node test17.js   (base vierge ; Playwright facultatif)

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const webpush = require('web-push');

let passed = 0;
const failures = [];
function check(label, fn) {
  try { fn(); passed += 1; console.log('  ✓ ' + label); }
  catch (err) { failures.push(label + ' — ' + err.message); console.log('  ✗ ' + label + ' — ' + err.message); }
}

const PORT = 3317;
const BASE = 'http://127.0.0.1:' + PORT;
let dataDir = null;
let child = null;

// Des clés VAPID jetables : sans elles, server/lib/push.js se déclare « non
// configuré » et le balayage ne fait — à dessein — strictement rien. C'est
// justement ce que vérifie la section 1.
const VAPID = webpush.generateVAPIDKeys();

function startServer(withPush) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT),
      NOESIS_DATA_DIR: dataDir,
      NOESIS_HOST: '127.0.0.1',
      // Le serveur ne doit PAS balayer de son côté pendant la suite : sinon
      // ses envois et ceux du test se mélangeraient.
      NOESIS_DUE_REMINDERS: '0',
    });
    if (withPush) {
      env.NOESIS_VAPID_PUBLIC_KEY = VAPID.publicKey;
      env.NOESIS_VAPID_PRIVATE_KEY = VAPID.privateKey;
      env.NOESIS_VAPID_SUBJECT = 'mailto:test@noesis.local';
    }
    child = spawn(process.execPath, [path.join(__dirname, 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); if (out.includes('en écoute')) resolve(); });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      if (!/ExperimentalWarning|SQLite is an experimental/.test(s)) process.stderr.write('[serveur] ' + s);
    });
    child.on('exit', (code) => { if (code !== 0) reject(new Error('serveur arrêté, code ' + code)); });
    setTimeout(() => reject(new Error('le serveur ne démarre pas')), 15000);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!child) return resolve();
    const c = child; child = null;
    c.removeAllListeners('exit');
    c.on('exit', () => resolve());
    c.kill();
    setTimeout(resolve, 3000);
  });
}

async function req(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, text, json };
}

function dayOffset(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function main() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noesis-test17-'));
  console.log('Base vierge : ' + dataDir + '\n');

  // ============ 1. SANS PUSH CONFIGURÉ, LE BALAYAGE NE FAIT RIEN ============
  console.log('1. Web Push non configuré');
  await startServer(false);

  const a = (await req('POST', '/api/profile', { name: 'RemA' + Date.now(), lastName: 'T', phone: '+15145550123', email: 'a' + Date.now() + '@e.com', pin: '1234', lang: 'fr' })).json;
  const b = (await req('POST', '/api/profile', { name: 'RemB' + Date.now(), lastName: 'T', phone: '+15145550124', email: 'b' + Date.now() + '@e.com', pin: '1234', lang: 'en' })).json;
  const act = (await req('POST', '/api/activities', { userId: a.id, name: 'ActRappel' })).json;

  const spSoon = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Dans 3 jours', closesAt: dayOffset(3) })).json;
  const spFar = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Dans 10 jours', closesAt: dayOffset(10) })).json;
  const spNone = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Sans date' })).json;

  // On charge le module dans CE processus, avec les mêmes variables d'env que
  // le serveur (donc sans clés VAPID pour l'instant).
  process.env.NOESIS_DATA_DIR = dataDir;
  const db = require('./server/db');
  const pushLib = require('./server/lib/push');
  const reminders = require('./server/lib/duereminders');

  const off = reminders.runDueReminders();
  check('1.1 le balayage se déclare désactivé', () => {
    assert.strictEqual(off.disabled, true);
    assert.strictEqual(off.sent, 0);
  });
  check('1.2 et n\'enregistre RIEN — sinon les rappels seraient perdus le jour où le push est configuré', () => {
    const n = db.prepare('SELECT COUNT(*) AS n FROM sub_project_due_reminders').get().n;
    assert.strictEqual(n, 0);
  });

  // ============ 2. AVEC PUSH : L'ESPION ============
  console.log('\n2. Ce qui serait envoyé');

  // On remplace la seule sortie du module. `require` renvoie le même objet de
  // module que celui capturé par duereminders.js, donc l'espion est bien vu.
  const outbox = [];
  pushLib.sendToUsers = function (userIds, payload) {
    outbox.push({ userIds: userIds.slice(), payload: payload });
  };
  pushLib.pushEnabled = function () { return true; };

  function sweep() { outbox.length = 0; return reminders.runDueReminders(); }

  let res = sweep();
  check('2.1 une échéance à 3 jours déclenche un rappel', () => {
    assert.strictEqual(res.sent, 1, 'envoyés : ' + res.sent);
    assert.deepStrictEqual(outbox[0].userIds, [a.id]);
  });
  check('2.2 le texte dit le nombre de jours restants', () => {
    assert.ok(/dans 3 jours/.test(outbox[0].payload.body), outbox[0].payload.body);
    assert.ok(outbox[0].payload.body.indexOf('Dans 3 jours') !== -1, 'le nom du sous-projet doit apparaître');
  });
  check('2.3 le titre est le nom de l\'activité', () => {
    assert.strictEqual(outbox[0].payload.title, 'ActRappel');
  });
  check('2.4 l\'adresse de renvoi pointe le sous-projet exact', () => {
    assert.ok(/notif=subproject/.test(outbox[0].payload.url), outbox[0].payload.url);
    assert.ok(outbox[0].payload.url.indexOf('activityId=' + act.id) !== -1);
    assert.ok(outbox[0].payload.url.indexOf('subProjectId=' + spSoon.id) !== -1);
  });
  check('2.5 ni l\'échéance lointaine ni le sous-projet sans date ne déclenchent rien', () => {
    const bodies = outbox.map((o) => o.payload.body).join(' | ');
    assert.ok(bodies.indexOf('Dans 10 jours') === -1, bodies);
    assert.ok(bodies.indexOf('Sans date') === -1, bodies);
  });

  res = sweep();
  check('2.6 ⭐ un second balayage ne renvoie RIEN (pas de rappel toutes les 30 minutes)', () => {
    assert.strictEqual(res.sent, 0);
    assert.strictEqual(outbox.length, 0);
  });

  // ============ 3. LA VEILLE, ET LE JOUR MÊME ============
  console.log('\n3. Les deux seuils, et le jour de la clôture');

  const spTomorrow = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Demain', closesAt: dayOffset(1) })).json;
  res = sweep();
  check('3.1 une échéance à 1 jour déclenche un rappel « demain »', () => {
    const mine = outbox.filter((o) => /Demain/.test(o.payload.body));
    assert.strictEqual(mine.length, 1, 'envoyés : ' + JSON.stringify(outbox.map((o) => o.payload.body)));
    assert.ok(/se clôture demain/.test(mine[0].payload.body), mine[0].payload.body);
  });
  check('3.2 ⭐ créé la veille, il ne reçoit QU\'UN seul rappel, pas deux d\'un coup', () => {
    const mine = outbox.filter((o) => /Demain/.test(o.payload.body));
    assert.strictEqual(mine.length, 1);
    // Le seuil « 3 jours » a été noté comme traité pour ne pas repartir plus tard.
    const rows = db.prepare('SELECT daysBefore FROM sub_project_due_reminders WHERE subProjectId = ?').all(spTomorrow.id);
    assert.strictEqual(rows.length, 2, 'les deux seuils doivent être notés');
  });

  const spToday = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Aujourd hui', closesAt: dayOffset(0) })).json;
  res = sweep();
  check('3.3 ⭐ une échéance du JOUR dit « aujourd\'hui », jamais « demain »', () => {
    const mine = outbox.filter((o) => /Aujourd hui/.test(o.payload.body));
    assert.strictEqual(mine.length, 1, JSON.stringify(outbox.map((o) => o.payload.body)));
    assert.ok(/se clôture aujourd'hui/.test(mine[0].payload.body), mine[0].payload.body);
    assert.ok(!/demain/.test(mine[0].payload.body), 'le texte suit les jours restants, pas le seuil');
  });

  // ============ 4. DÉPLACER LA DATE RÉARME LES RAPPELS ============
  console.log('\n4. Déplacer ou retirer l\'échéance');

  await req('PUT', '/api/sub-projects/' + spSoon.id, { userId: a.id, name: 'Dans 3 jours', closesAt: dayOffset(2) });
  res = sweep();
  check('4.1 ⭐ une date déplacée fait repartir un rappel — une nouvelle date est une nouvelle échéance', () => {
    const mine = outbox.filter((o) => /Dans 3 jours/.test(o.payload.body));
    assert.strictEqual(mine.length, 1, JSON.stringify(outbox.map((o) => o.payload.body)));
    assert.ok(/dans 2 jours/.test(mine[0].payload.body), mine[0].payload.body);
  });

  await req('PUT', '/api/sub-projects/' + spSoon.id, { userId: a.id, name: 'Dans 3 jours', closesAt: '' });
  res = sweep();
  check('4.2 échéance retirée : plus aucun rappel pour ce sous-projet', () => {
    assert.strictEqual(outbox.filter((o) => /Dans 3 jours/.test(o.payload.body)).length, 0);
  });
  const afterClear = (await req('GET', '/api/activities/' + act.id + '/sub-projects?userId=' + a.id)).json;
  check('4.3 et la route a bien accepté la chaîne vide (closesAt = null)', () => {
    const row = afterClear.subProjects.find((s) => String(s.id) === String(spSoon.id));
    assert.ok(row, 'le sous-projet doit être de nouveau listé');
    assert.strictEqual(row.closesAt, null);
  });

  // ============ 5. ÉCHÉANCE PASSÉE ============
  console.log('\n5. Une échéance passée ne réveille personne');

  const spPast = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Passe', closesAt: dayOffset(-2) })).json;
  res = sweep();
  check('5.1 aucun rappel pour un sous-projet déjà clôturé', () => {
    assert.strictEqual(outbox.filter((o) => /Passe/.test(o.payload.body)).length, 0);
  });

  // ============ 6. ACTIVITÉ PARTAGÉE ============
  console.log('\n6. Activité partagée : chacun son rappel, dans sa langue');

  const inv = await req('POST', '/api/activities/' + act.id + '/invite', { userId: a.id, pseudo: b.name });
  assert.ok(inv.status === 200 || inv.status === 201, 'invitation : ' + inv.text.slice(0, 120));
  const invites = (await req('GET', '/api/invites?userId=' + b.id)).json;
  await req('POST', '/api/invites/' + invites[0].id + '/accept', { userId: b.id });

  const spShared = (await req('POST', '/api/activities/' + act.id + '/sub-projects', { userId: a.id, name: 'Partage', closesAt: dayOffset(3) })).json;
  res = sweep();
  const sharedMsgs = outbox.filter((o) => /Partage/.test(o.payload.body));
  check('6.1 les deux membres reçoivent leur rappel', () => {
    assert.strictEqual(sharedMsgs.length, 2, JSON.stringify(sharedMsgs.map((o) => o.payload.body)));
    const ids = sharedMsgs.map((o) => o.userIds[0]).sort();
    assert.deepStrictEqual(ids, [a.id, b.id].sort());
  });
  check('6.2 ⭐ chacun dans SA langue (le profil B est en anglais)', () => {
    const forB = sharedMsgs.find((o) => o.userIds[0] === b.id);
    const forA = sharedMsgs.find((o) => o.userIds[0] === a.id);
    assert.ok(/closes in 3 days/.test(forB.payload.body), forB.payload.body);
    assert.ok(/se clôture dans 3 jours/.test(forA.payload.body), forA.payload.body);
  });

  // ============ 7. CASCADES ET NON-RÉGRESSION ============
  console.log('\n7. Cascades et non-régression');

  const before = db.prepare('SELECT COUNT(*) AS n FROM sub_project_due_reminders WHERE subProjectId = ?').get(spShared.id).n;
  await req('DELETE', '/api/sub-projects/' + spShared.id + '?userId=' + a.id);
  check('7.1 supprimer un sous-projet emporte ses rappels (ON DELETE CASCADE)', () => {
    assert.ok(before > 0, 'il devait y avoir des rappels enregistrés');
    const after = db.prepare('SELECT COUNT(*) AS n FROM sub_project_due_reminders WHERE subProjectId = ?').get(spShared.id).n;
    assert.strictEqual(after, 0);
  });

  check('7.2 daysBetween : arithmétique juste, y compris aux changements d\'heure', () => {
    assert.strictEqual(reminders.daysBetween('2026-03-07', '2026-03-08'), 1);
    assert.strictEqual(reminders.daysBetween('2026-03-08', '2026-03-09'), 1);
    assert.strictEqual(reminders.daysBetween('2026-11-01', '2026-11-02'), 1);
    assert.strictEqual(reminders.daysBetween('2026-12-31', '2027-01-01'), 1);
    assert.strictEqual(reminders.daysBetween('2026-03-12', '2026-03-12'), 0);
    assert.strictEqual(reminders.daysBetween('2026-03-12', '2026-03-10'), -2);
    assert.strictEqual(reminders.daysBetween('pas une date', '2026-03-12'), null);
  });

  check('7.3 les deux seuils sont bien 3 et 1', () => {
    assert.deepStrictEqual(reminders.THRESHOLDS, [3, 1]);
  });

  const acts = await req('GET', '/api/activities?userId=' + a.id);
  check('7.4 GET /api/activities répond toujours', () => { assert.strictEqual(acts.status, 200); });
  const subs = await req('GET', '/api/activities/' + act.id + '/sub-projects?userId=' + a.id);
  check('7.5 la liste des sous-projets répond toujours', () => { assert.strictEqual(subs.status, 200); });
  const version = await req('GET', '/api/version');
  check('7.6 /api/version répond toujours', () => { assert.strictEqual(version.status, 200); });

  await stopServer();

  // ============ 8. L'ÉCRAN : modifier la date après coup ============
  let chromium = null;
  try { chromium = require('playwright').chromium; } catch (e) {}

  if (!chromium) {
    console.log('\n8. Écran — Playwright absent, section ignorée.');
  } else {
    console.log('\n8. Écran — modifier la date de clôture après coup');
    await startServer(true);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((u) => localStorage.setItem('noesis_profile', JSON.stringify(u)), a);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1300);
    await page.click('.tabBtn[data-tab="activity"]');
    await page.waitForTimeout(800);
    await page.click('#activitiesList .activityRow .activityRowHeader');
    await page.waitForTimeout(1300);

    const rowSel = '#subProjectsList .subProjectRow[data-sub-project-id="' + spTomorrow.id + '"]';
    const listed = await page.isVisible(rowSel);
    check('8.1 le sous-projet daté est bien listé', () => { assert.ok(listed); });

    await page.click(rowSel + ' .subProjectDue');
    await page.waitForTimeout(500);
    const editorVisible = await page.isVisible(rowSel + ' .subProjectDueEditor');
    const inputValue = await page.inputValue(rowSel + ' .subProjectDueInput');
    check('8.2 toucher la pastille ouvre l\'éditeur, pré-rempli à la date actuelle', () => {
      assert.ok(editorVisible, 'l\'éditeur devrait être visible');
      assert.strictEqual(inputValue, dayOffset(1));
    });
    // #subProjectDetail n'a pas été déplacé dans cette ligne : le clic sur la
    // pastille ne doit pas remonter jusqu'à l'en-tête, qui ouvrirait le
    // sous-projet.
    const detailMoved = await page.evaluate((sel) => {
      const row = document.querySelector(sel);
      return !!row.querySelector('#subProjectDetail');
    }, rowSel);
    check('8.3 ⭐ ouvrir l\'éditeur n\'ouvre PAS le sous-projet (le clic ne remonte pas)', () => {
      assert.strictEqual(detailMoved, false);
    });

    const NEW_DATE = dayOffset(20);
    await page.fill(rowSel + ' .subProjectDueInput', NEW_DATE);
    await page.click(rowSel + ' .subProjectDueEditor .iconBtn:not(.danger)');
    await page.waitForTimeout(1100);
    const shown = await page.textContent(rowSel + ' .subProjectDue');
    const persisted = (await req('GET', '/api/activities/' + act.id + '/sub-projects?userId=' + a.id)).json
      .subProjects.find((s) => String(s.id) === String(spTomorrow.id));
    check('8.4 la nouvelle date est enregistrée et affichée', () => {
      assert.strictEqual(persisted.closesAt, NEW_DATE, 'en base : ' + persisted.closesAt);
      assert.ok(shown.indexOf(NEW_DATE.slice(8, 10)) !== -1, 'affiché : ' + shown);
    });
    const closedAfterSave = !(await page.isVisible(rowSel + ' .subProjectDueEditor'));
    check('8.5 l\'éditeur se referme après enregistrement', () => { assert.ok(closedAfterSave); });

    // Retirer l'échéance.
    await page.click(rowSel + ' .subProjectDue');
    await page.waitForTimeout(400);
    page.once('dialog', (d) => d.accept());
    await page.click(rowSel + ' .subProjectDueEditor .iconBtn.danger');
    await page.waitForTimeout(1100);
    const cleared = (await req('GET', '/api/activities/' + act.id + '/sub-projects?userId=' + a.id)).json
      .subProjects.find((s) => String(s.id) === String(spTomorrow.id));
    const badgeGone = !(await page.isVisible(rowSel + ' .subProjectDue'));
    check('8.6 « Retirer l\'échéance » vide bien la date, et la pastille disparaît', () => {
      assert.strictEqual(cleared.closesAt, null, 'en base : ' + cleared.closesAt);
      assert.ok(badgeGone, 'la pastille ne devrait plus être affichée');
    });

    check('8.7 aucune erreur JavaScript en console', () => {
      assert.strictEqual(errors.length, 0, errors.join(' | '));
    });

    await browser.close();
    await stopServer();
  }

  console.log('\n' + '='.repeat(60));
  console.log(passed + ' assertions passées, ' + failures.length + ' échec(s)');
  if (failures.length) { failures.forEach((f) => console.log('  ✗ ' + f)); process.exitCode = 1; }
  fs.rmSync(dataDir, { recursive: true, force: true });
}

main().catch(async (err) => {
  console.error('\nErreur fatale : ' + (err && err.stack ? err.stack : err));
  await stopServer();
  process.exitCode = 1;
});
