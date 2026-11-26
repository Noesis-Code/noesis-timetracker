// Tests signalement d'une publication du fil + masquage après blocage. Usage : node test/signalement-publication-test.js
const fs = require('fs');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('sigpub-');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const mr = require('../server/lib/messagereports');
const { followingFeedForUser } = require('../server/lib/community');
const polls = require('../server/lib/polls');
const now = new Date().toISOString();
for (const [id, share] of [['a', 1], ['b', 1], ['c', 0]]) db.prepare('INSERT INTO users (id, name, createdAt, shareProfile) VALUES (?, ?, ?, ?)').run(id, 'User' + id, now, share);
// a suit b (accepté) ; a ne suit pas c
db.prepare("INSERT INTO follows (followerId, followeeId, status, createdAt) VALUES ('a', 'b', 'accepted', ?)").run(now);
const post = (u, body) => Number(db.prepare('INSERT INTO profile_posts (userId, body, createdAt) VALUES (?, ?, ?)').run(u, body, new Date().toISOString()).lastInsertRowid);
const pb1 = post('b', 'publication b1'), pb2 = post('b', 'publication b2'), pa = post('a', 'publication a'), pc = post('c', 'publication c');
const ids = () => followingFeedForUser('a').filter((e) => !e.isAnnouncement).map((e) => e.id);
assert(ids().includes(pb1) && ids().includes(pa), 'le fil montre les publications suivies et les miennes');
const r = mr.reportPost('a', pb1);
assert(r.ok && !r.already && r.report.messageRef === 'post:' + pb1 && r.post.body === 'publication b1' && r.post.userId === 'b', 'signalement enregistré (ref, auteur, contenu)');
assert(db.prepare("SELECT COUNT(*) AS n FROM message_reports WHERE reporterId = 'a' AND messageRef = ?").get('post:' + pb1).n === 1, 'ligne en base');
const r2 = mr.reportPost('a', pb1);
assert(r2.ok && r2.already && db.prepare('SELECT COUNT(*) AS n FROM message_reports').get().n === 1, '2e signalement idempotent');
assert(!ids().includes(pb1) && ids().includes(pb2), 'publication signalée masquée pour le signaleur seulement');
assert(mr.reportPost('a', pa).status === 400, 'refus de signaler sa propre publication');
assert(mr.reportPost('a', 99999).status === 404, 'publication inconnue : 404');
assert(mr.reportPost('a', pc).status === 404, 'publication non visible (auteur non suivi) : 404');
// limite de débit : 10 signalements par heure
for (let i = 0; i < 9; i++) { const p = post('b', 'x' + i); mr.reportPost('a', p); }
const pl = post('b', 'trop');
assert(mr.reportPost('a', pl).status === 429, 'limite de débit');
// blocage : les publications et sondages de l'auteur disparaissent du fil du bloqueur
assert(ids().includes(pb2), 'avant blocage : publication visible');
db.prepare('INSERT INTO blocks (blockerId, blockedId, createdAt) VALUES (?, ?, ?)').run('a', 'b', now);
assert(ids().length === 1 && ids()[0] === pa, 'après blocage : plus aucune publication de l\'auteur bloqué, les miennes restent');
assert(polls.pollsForFollowing('a').every((p) => !p.author || p.author.id !== 'b'), 'sondages de l\'auteur bloqué masqués');
fs.rmSync(process.env.NOESIS_DATA_DIR, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
