// DÉLAIS MINIMAUX ENTRE PALIERS (16 nov. 2026, décision d'Émilien : « on part là-dessus »). Brique PURE de l'algorithme de création d'objectif v46, bloc « 3 · TYPE DE LA CATÉGORIE » :
// « La famille du parent (sinon de l'objectif) est connue (assez de données) ? Oui : appliquer le tableau des délais, puis l'affiner avec les données réelles. Non : insérer petit à petit. »
//
// ⚠ Ce sont des ESTIMATIONS DE CONNAISSANCE GÉNÉRALE, pas des données d'utilisateurs (il n'y en a pas encore). Elles seront REMPLACÉES par les vraies données après le lancement (source: 'estimation-generale').
// Les clés sont celles de server/lib/familles-objectifs.js (colonne user_objectives.objectif_famille) : les 13 familles au niveau d'information « oui ». Aucune n'est sans clé (verifierCles() le contrôle).
// Aucune écriture, aucun appel réseau, aucune base : delaiMinimal() ne fait que du calcul.
const F = require('./familles-objectifs');

const SOURCE = 'estimation-generale';
const SEM_PAR_MOIS = 52 / 12;
const num = (x) => { const n = typeof x === 'number' ? x : parseFloat(String(x == null ? '' : x).replace(',', '.').replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? n : null; };
const pos = (x) => { const n = num(x); return n != null && n > 0 ? n : null; };
const out = (famille, semaines, detail, max) => (semaines == null || !Number.isFinite(semaines) ? null : Object.assign({ semaines: Math.max(0, Math.ceil(semaines - 1e-9)), source: SOURCE, famille, detail }, max != null ? { max: Math.ceil(max - 1e-9) } : {}));

// Échelle à paliers (course, habitude) : somme des délais des segments recouverts par [de, vers], au prorata de la part recouverte de chaque segment ; en dehors de l'échelle : rien (null).
function echelle(famille, de, vers, paliers, delais, detail) {
  const a = num(de), b = num(vers); if (a == null || b == null) return null;
  const lo = Math.min(a, b), hi = Math.max(a, b); let total = 0, touche = false;
  for (let i = 0; i < delais.length; i += 1) {
    const s = paliers[i], e = paliers[i + 1], ov = Math.min(hi, e) - Math.max(lo, s);
    if (ov > 0) { total += delais[i] * (ov / (e - s)); touche = true; }
  }
  return touche ? out(famille, total, detail) : null;
}
// Distances de course reconnues en texte (« semi », « marathon », « 10 km »).
function km(x) {
  if (typeof x === 'number') return x;
  const t = F.norm(x);
  if (/(^| )marathon/.test(t) && !/semi/.test(t)) return 42.195;
  if (/semi/.test(t)) return 21.0975;
  return num(x);
}
// Niveaux de langue (CECRL) ou nombres.
const CECRL = { a1: 1, a2: 2, b1: 3, b2: 4, c1: 5, c2: 6 };
function niveau(x) { const t = F.norm(x).replace(/ /g, ''); return CECRL[t] != null ? CECRL[t] : num(x); }
// Nombre de paliers entre deux valeurs : le contexte peut le donner (contexte.paliers) ; sinon calcul propre à la famille.
const SANS_PALIER = { source: SOURCE, sansPalier: true };

const DELAIS = {
  // Course : 5 km -> 10 km : 4 semaines ; 10 km -> semi : 8 ; semi -> marathon : 12.
  course: (de, vers) => echelle('course', km(de), km(vers), [5, 10, 21.0975, 42.195], [4, 8, 12], 'échelle 5 km, 10 km, semi, marathon : 4, 8 puis 12 semaines'),
  // Force : +5 à 10 % de charge par palier (7,5 % retenu), 2 semaines par palier.
  force: (de, vers, ctx) => {
    let n = pos(ctx.paliers); const a = pos(de), b = pos(vers);
    if (n == null && a != null && b != null && a !== b) n = Math.ceil(Math.log(Math.max(a, b) / Math.min(a, b)) / Math.log(1.075) - 1e-9);
    return n == null ? null : out('force', 2 * n, n + ' palier(s) de +7,5 % de charge, 2 semaines chacun');
  },
  // Poids : 5 kg = 5 semaines (1 kg par semaine au plus).
  poids: (de, vers) => { const a = num(de), b = num(vers); return a == null || b == null ? null : out('poids', Math.abs(b - a) * 1, '1 kg par semaine au plus (5 kg : 5 semaines)'); },
  // Langue : environ 100 h d'étude par niveau ; délai = heures ÷ heures par semaine.
  langue: (de, vers, ctx) => {
    const a = niveau(de), b = niveau(vers), h = pos(ctx.heuresParSemaine); if (a == null || b == null || h == null) return null;
    const heures = 100 * Math.abs(b - a); return out('langue', heures / h, heures + ' h d’étude (environ 100 h par niveau) à ' + h + ' h par semaine');
  },
  // Diplôme : un semestre = 15 semaines, fixé par l'établissement (non compressible).
  diplome: (de, vers) => { const a = num(de), b = num(vers); return a == null || b == null ? null : out('diplome', 15 * Math.abs(b - a), '15 semaines par semestre, calendrier de l’établissement'); },
  // Certification : préparation d'environ 8 semaines (date d'examen fixe) par certification.
  certification: (de, vers, ctx) => { const n = pos(ctx.paliers) || Math.max(1, Math.abs((num(vers) || 0) - (num(de) || 0))); return out('certification', 8 * n, '8 semaines de préparation par certification'); },
  // Lecture : un livre = 6 à 8 h (7 h retenues) ; délai = heures ÷ heures par semaine.
  lecture: (de, vers, ctx) => {
    const a = num(de), b = num(vers), h = pos(ctx.heuresParSemaine); if (a == null || b == null || h == null) return null;
    const heures = 7 * Math.abs(b - a); return out('lecture', heures / h, heures + ' h de lecture (6 à 8 h par livre) à ' + h + ' h par semaine', (8 * Math.abs(b - a)) / h);
  },
  // Épargne : CALCULÉ, pas estimé : montant ÷ épargne mensuelle.
  epargne: (de, vers, ctx) => {
    const a = num(de), b = num(vers), m = pos(ctx.versementMensuel); if (a == null || b == null || m == null) return null;
    return out('epargne', (Math.abs(b - a) / m) * SEM_PAR_MOIS, 'montant ÷ épargne mensuelle (calculé)');
  },
  // Dette : CALCULÉ, sans les intérêts : dette restante ÷ paiement mensuel.
  dette: (de, vers, ctx) => {
    const a = num(de), b = num(vers), m = pos(ctx.paiementMensuel != null ? ctx.paiementMensuel : ctx.versementMensuel); if (a == null || b == null || m == null) return null;
    return out('dette', (Math.abs(a - b) / m) * SEM_PAR_MOIS, 'dette restante ÷ paiement mensuel (calculé, sans intérêts)');
  },
  // Méditation et habitude : échelle 5, 10, 20 minutes ; 2 à 4 semaines par palier (2 retenues comme minimum).
  habitude: (de, vers, ctx) => {
    let n = pos(ctx.paliers); const a = num(de), b = num(vers);
    if (n == null && a != null && b != null) { const lo = Math.min(a, b), hi = Math.max(a, b); n = [10, 20].filter((r) => r > lo && r <= hi).length || (a !== b ? 1 : null); }
    return n == null ? null : out('habitude', 2 * n, n + ' palier(s), 2 à 4 semaines chacun', 4 * n);
  },
  // Maintenance : pas de paliers.
  budget: () => Object.assign({ semaines: 0, famille: 'budget', detail: 'maintenance : pas de paliers' }, SANS_PALIER),
  entretien: () => Object.assign({ semaines: 0, famille: 'entretien', detail: 'maintenance : pas de paliers' }, SANS_PALIER),
  administratif: () => Object.assign({ semaines: 0, famille: 'administratif', detail: 'maintenance : pas de paliers' }, SANS_PALIER),
};

// Délai minimal entre deux paliers d'une famille : { semaines, source, famille, detail[, max][, sansPalier] } ; null = famille INCONNUE ou entrée incalculable (« on insère petit à petit »).
function delaiMinimal(famille, de, vers, contexte) {
  const f = DELAIS[String(famille || '')];
  if (typeof f !== 'function') return null;
  try { return f(de, vers, contexte || {}); } catch (e) { return null; }
}
// « Famille connue (assez de données) » du schéma : la famille existe, son niveau d'information est « oui » ET elle a une ligne dans le tableau.
function familleConnue(famille) { return !!famille && typeof DELAIS[famille] === 'function' && F.infoDe(famille) === 'oui'; }
// Contrôle : clés du tableau absentes de familles-objectifs.js (doit rester vide).
function verifierCles() { return Object.keys(DELAIS).filter((k) => !F.byId(k)); }
const FAMILLES_AVEC_DELAIS = Object.keys(DELAIS);

module.exports = { delaiMinimal, familleConnue, verifierCles, FAMILLES_AVEC_DELAIS, SOURCE };
