#!/usr/bin/env node
// Vue d'ensemble des chantiers : worktrees, branches distantes claude/*, derniers commits de staging.
// Usage : node scripts/chantiers-status.js [--since="2 days ago"]   (lecture seule, aucun fetch sauf --fetch)
const { execFileSync } = require('child_process');
const root = require('path').join(__dirname, '..');
const git = (a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).trim(); } catch (e) { return ''; } };
const arg = (n, d) => { const m = process.argv.find((x) => x.startsWith(n + '=')); return m ? m.slice(n.length + 1) : d; };
const since = arg('--since', '1 day ago');
if (process.argv.includes('--fetch')) git(['fetch', '--prune', 'origin']);

const wts = [];
let cur = null;
for (const l of git(['worktree', 'list', '--porcelain']).split('\n')) {
  if (l.startsWith('worktree ')) { cur = { path: l.slice(9) }; wts.push(cur); }
  else if (cur && l.startsWith('branch ')) cur.branch = l.slice(7).replace('refs/heads/', '');
  else if (cur && l === 'detached') cur.branch = '(détaché)';
}
const remotes = new Set(git(['branch', '-r', '--list', 'origin/claude/*', '--format=%(refname:short)']).split('\n').filter(Boolean));
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

console.log('== Worktrees ==');
const rows = [];
for (const w of wts) {
  if (!w.branch || w.branch === '(détaché)') { rows.push([w.path.split('/').pop(), '(détaché)', '', '', '']); continue; }
  const last = git(['log', '-1', '--format=%h %cr — %s', w.branch]).slice(0, 70);
  const [ahead] = git(['rev-list', '--left-right', '--count', `origin/staging...${w.branch}`]).split(/\s+/).reverse();
  const behind = git(['rev-list', '--left-right', '--count', `origin/staging...${w.branch}`]).split(/\s+/)[0];
  const dirty = git(['-C', w.path, 'status', '--porcelain']).split('\n').filter(Boolean).length;
  const pushed = remotes.has('origin/' + w.branch) ? (git(['rev-list', '--count', `origin/${w.branch}..${w.branch}`]) === '0' ? 'poussé' : 'push en retard') : 'non poussé';
  const merged = ahead === '0' ? 'dans staging' : `+${ahead}/-${behind} vs staging`;
  rows.push([w.path.split('/').pop(), w.branch, merged, pushed + (dirty ? `, ${dirty} modif. non commitée(s)` : ''), last]);
}
for (const r of rows) console.log(`${pad(r[0], 24)} ${pad(r[1], 34)} ${pad(r[2], 18)} ${pad(r[3], 28)} ${r[4]}`);

console.log('\n== Branches distantes origin/claude/* sans worktree local ==');
const local = new Set(wts.map((w) => w.branch));
let n = 0;
for (const r of remotes) {
  const b = r.replace('origin/', '');
  if (local.has(b)) continue;
  const ahead = git(['rev-list', '--count', `origin/staging..${r}`]);
  console.log(`${pad(b, 40)} ${ahead === '0' ? 'fusionnée' : '+' + ahead + ' non fusionné(s)'}  ${git(['log', '-1', '--format=%h %cr — %s', r]).slice(0, 70)}`);
  n++;
}
if (!n) console.log('(aucune)');

console.log(`\n== origin/staging depuis « ${since} » ==`);
console.log(git(['log', 'origin/staging', `--since=${since}`, '--format=%h %cr  %s']).split('\n').map((l) => l.slice(0, 130)).join('\n') || '(rien)');
