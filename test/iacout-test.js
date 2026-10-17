// Tests des économies de coût IA (surveillance Drive, 17 oct. 2026) : Google et Anthropic simulés. Usage : node test/iacout-test.js
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmt-iacout-'));
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'sec';
process.env.GOOGLE_REDIRECT_URI = 'https://x.test/api/drive/callback'; process.env.DRIVE_TOKEN_KEY = 'a'.repeat(64);
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const { grantAccess } = require('../server/lib/offer1access');
const drive = require('../server/lib/drive');
const ds = require('../server/lib/drivesync');
const dt = require('../server/lib/documenttasks');
const cp = require('../server/lib/changeproposals');
const goals = require('../server/lib/goals');
const goalstasks = require('../server/lib/goalstasks');
const classify = require('../server/lib/goalstaskclassify');

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('own','own',datetime('now'))").run();
const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','own','')").run().lastInsertRowid;
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'own');
grantAccess('own', 'code');
goals.addCategory(act, 'Production');
const KEY = classify.buildClassificationCandidates(act)[0].key;
const today = new Date().toISOString().slice(0, 10);
const openTask = goalstasks.addCategoryTask(act, 'own', KEY, 'Rédiger le plan', { dueDate: goals.addDays(today, 3) });

const docs = { 'f1-aaaaa': { text: 'Appeler Paul\nEnvoyer devis', mt: '2026-10-01T00:00:00Z', parents: ['fold-1111'] } };
const mockFetch = async (url, opt) => {
  const u = new URL(url);
  const json = (o, ok = true, st = 200) => ({ ok, status: st, json: async () => o, arrayBuffer: async () => Buffer.from('') });
  if (u.pathname === '/token') { const b = new URLSearchParams(opt.body);
    return b.get('grant_type') === 'authorization_code' ? json({ refresh_token: 'R', access_token: 'at' }) : json({ access_token: 'at' }); }
  const m = u.pathname.match(/\/drive\/v3\/files(?:\/([^/]+)(\/export)?)?$/);
  if (m && !m[1]) {
    if (u.searchParams.get('q').startsWith('mimeType =')) return json({ files: [] });
    const qf = (u.searchParams.get('q').match(/'([^']+)' in parents/) || [])[1];
    return json({ files: Object.keys(docs).filter((id) => docs[id].parents.includes(qf)).map((id) => ({ id, name: id, mimeType: 'application/vnd.google-apps.document', modifiedTime: docs[id].mt })) });
  }
  if (m && m[2]) return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(docs[m[1]].text) };
  if (m && m[1] === 'fold-1111') return json({ id: 'fold-1111', name: 'Projet', mimeType: 'application/vnd.google-apps.folder' });
  if (m && docs[m[1]]) return json({ id: m[1], name: m[1], mimeType: 'application/vnd.google-apps.document', parents: docs[m[1]].parents });
  return json({}, false, 404);
};
drive.setFetch(mockFetch);
const touch = (id, text) => { docs[id].text = text; docs[id].mt = new Date(Date.parse(docs[id].mt) + 86400000).toISOString(); };

(async () => {
  const st = drive.makeState('own', act);
  await drive.handleCallback('own', { state: st, code: 'c' });
  await drive.chooseFolder('own', act, 'fold-1111');

  // ---- Option 7 : pas d'appel « modifications proposées » à la première lecture ----
  let tasksCalls = 0, changeCalls = 0;
  dt.setCaller(async () => { tasksCalls++; return JSON.stringify({ tasks: [{ title: 'Appeler Paul', key: KEY, week: null, minutes: 30 }] }); });
  cp.setCaller(async () => { changeCalls++; return JSON.stringify({ changes: [] }); });
  await ds.syncConnection('own', act);
  assert(tasksCalls === 1 && changeCalls === 0, 'option 7 : première lecture = 1 appel tâches, aucun appel modifications proposées');
  touch('f1-aaaaa', 'Appeler Paul\nEnvoyer devis\nRelancer');
  await ds.syncConnection('own', act);
  assert(tasksCalls === 2 && changeCalls === 1, 'option 7 : fichier modifié = appel tâches + appel modifications proposées');

  console.log(failed ? failed + ' échec(s)' : 'OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
