const assert = require('assert');
const A = require('../server/lib/objectifs-algo');
const T = '2026-11-16';
const o = (id, level, s, e, x) => Object.assign({ id, level, poleKey: 'p1', categoryKey: level === 'secteur' ? 'c1' : null, startDate: s, endDate: e }, x || {});
const n = (level, e, x) => Object.assign({ id: null, level, poleKey: 'p1', categoryKey: level === 'secteur' ? 'c1' : null, endDate: e }, x || {});
const eq = assert.strictEqual;
// 1 PARENT
eq(A.findParent(n('secteur', '2027-03-01'), [o(1, 'pole', '2027-01-01', '2027-12-31')]).id, 1, 'pole qui contient');
eq(A.findParent(n('secteur', '2027-03-01'), [o(1, 'pole', '2028-01-01', '2028-12-31'), o(2, 'activite', '2029-01-01', '2033-12-31')]).id, 1, 'le plus proche qui suit');
eq(A.findParent(n('pole', '2027-03-01'), [o(1, 'secteur', '2027-01-01', '2027-12-31')]), null, 'un inferieur jamais parent');
eq(A.findParent(n('secteur', '2027-03-01'), [o(1, 'secteur', '2027-01-01', '2027-12-31')]), null, 'meme niveau sans date fixee : pas parent');
eq(A.findParent(n('secteur', '2027-03-01'), [o(1, 'secteur', '2027-01-01', '2027-12-31', { dateFixe: true })]).id, 1, 'meme niveau a date fixee : parent');
eq(A.findParent(n('secteur', '2027-03-01'), [o(1, 'pole', '2027-01-01', '2027-12-31', { poleKey: 'autre' })]), null, 'autre pole');
eq(A.findParent(n('secteur', '2027-03-01'), [o(1, 'pole', '2027-01-01', '2027-12-31', { abandoned: true })]), null, 'abandonne ignore');
// Cas A / B / C
eq(A.classify(n('secteur', '2027-03-01'), [o(1, 'pole', '2027-01-01', '2027-12-31')]).cas, 'A');
eq(A.classify(n('secteur', '2027-03-01', { dateFixe: true }), []).cas, 'B');
eq(A.classify(n('secteur', '2027-03-01', { proposedEnd: '2027-02-01' }), []).cas, 'B', 'date modifiee = date fixee');
eq(A.classify(n('secteur', '2027-03-01'), []).cas, 'C');
// 2 MURS, depart
let r = A.computeStart(n('secteur', '2027-03-01'), [], T);
eq(r.start, T, 'sans mur : aujourd hui');
r = A.computeStart(n('secteur', '2027-03-01'), [o(1, 'secteur', '2026-12-01', '2027-01-15')], T);
eq(r.cas, 'C'); eq(r.start, '2027-01-15', 'C : precedent meme niveau = mur');
r = A.computeStart(n('secteur', '2027-03-01'), [o(1, 'secteur', '2025-01-01', '2025-06-01')], T);
eq(r.start, T, 'jamais le passe');
r = A.computeStart(n('secteur', '2027-03-01'), [o(1, 'pole', '2026-11-01', '2027-01-31'), o(2, 'pole', '2027-02-01', '2027-12-31')], T);
eq(r.cas, 'A'); eq(r.parent.id, 2); eq(r.start, '2027-01-31', 'A : superieur precedent = mur');
r = A.computeStart(n('secteur', '2027-03-01'), [o(1, 'pole', '2027-01-01', '2027-12-31'), o(2, 'secteur', '2026-12-01', '2027-01-15', { dateFixe: true }), o(3, 'secteur', '2027-02-01', '2027-02-10')], T);
eq(r.cas, 'A'); eq(r.start, '2027-01-15', 'A : seul le meme niveau a date fixee est un mur');
r = A.computeStart(n('pole', '2027-12-01', { dateFixe: true }), [o(1, 'secteur', '2027-01-01', '2027-02-01', { dateFixe: true })], T);
eq(r.cas, 'B'); eq(r.start, T, 'B : un inferieur nest pas un mur');
r = A.computeStart(n('pole', '2027-12-01'), [o(1, 'secteur', '2027-01-01', '2027-02-01', { dateFixe: true })], T);
eq(r.cas, 'C'); eq(r.start, '2027-02-01', 'C : inferieur a date fixee = mur');
r = A.computeStart(n('pole', '2027-12-01'), [o(1, 'secteur', '2027-01-01', '2027-02-01')], T);
eq(r.start, T, 'C : inferieur sans date fixee, lie par defaut : pas un mur');
// Sans rapport (crochet)
const sr = (a, b) => (b.id === 1 || b.id === 2 ? 'sans_rapport' : 'lie');
r = A.computeStart(n('pole', '2027-12-01'), [o(1, 'secteur', '2027-01-01', '2027-02-01'), o(2, 'secteur', '2027-03-01', '2027-04-01')], T, sr);
eq(r.start, '2027-04-01', 'inferieur sans rapport dont le precedent lest aussi = mur');
r = A.computeStart(n('pole', '2027-12-01'), [o(1, 'secteur', '2027-01-01', '2027-02-01')], T, sr);
eq(r.start, T, 'inferieur sans rapport, precedent lie : ignore');
r = A.computeStart(n('secteur', '2027-12-01'), [o(1, 'secteur', '2027-01-01', '2027-02-01')], T, sr);
eq(r.start, '2027-02-01', 'meme niveau sans rapport = mur');
console.log('objectifs-algo : OK');
