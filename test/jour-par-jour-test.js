// Réglage « jour par jour » des heures d'un objectif existant : Passé par jour (même moyenne pondérée que la page Temps), répartition par défaut, enregistrement (meta.hoursByDay), relecture.
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-jours-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const o = require('../server/lib/objectifs');
const tb = require('../server/lib/tempsbudget');
const wa = require('../server/lib/weeklyavg');
const today = require('../server/lib/dates').userToday();
const add = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wd = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const mkAct = (name) => { const id = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES (?, 'u1', '')").run(name).lastInsertRowid); db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(id); return id; };
const A = mkAct('Atelier'), B = mkAct('Sans historique');
// Chrono : chaque semaine, 2 h le lundi et 1 h le mercredi (les 28 derniers jours) sur A
for (let k = 1; k <= 28; k++) {
  const day = add(today, -k), w = wd(day), h = w === 0 ? 2 : w === 2 ? 1 : 0;
  if (h) db.prepare("INSERT INTO time_entries (userId, activityId, startTime, endTime, durationSeconds, isoDate, dayOfWeek, source) VALUES ('u1', ?, ?, ?, ?, ?, 2, 'manual')").run(A, day + 'T10:00:00Z', day + 'T12:00:00Z', h * 3600, day);
}
let n = 0;
const obj = (act, hours) => {
  n += 1;
  const id = Number(db.prepare("INSERT INTO user_objectives (userId, activityId, title, amount, unit, startDate, endDate, periodWeeks, weekly, stepsJson, taskIdsJson, createdAt) VALUES ('u1', ?, ?, 8, 'semaines', ?, ?, 4, 0, ?, '[]', '')").run(act, 'Objectif ' + n, today, add(today, 56), JSON.stringify([{ n: 1, title: 'P1', startDate: today, endDate: add(today, 55), weeks: [{ i: 1, startDate: today, endDate: add(today, 6), text: '', done: false }] }])).lastInsertRowid);
  db.prepare('UPDATE user_objectives SET level = ?, isMacro = 0, metaJson = ? WHERE id = ?').run('activite', JSON.stringify(hours == null ? {} : { hoursPerWeek: hours }), id);
  return id;
};
const meta = (id) => JSON.parse(db.prepare('SELECT metaJson FROM user_objectives WHERE id = ?').get(id).metaJson);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---- Fonction partagée : par jour, même moyenne que la semaine ----
const seen = []; const bd = wa.weeklyByDay('2026-11-09', (s, e) => { seen.push(s); return [60, 0, 0, 0, 0, 0, 0]; });
assert(Math.abs(sum(bd) - 60) < 1e-9 && seen.length === 4, 'weeklyByDay : mêmes 4 semaines, la somme des jours = la moyenne hebdomadaire');
assert(wa.weeklyByDay('2026-11-09', () => [0, 0, 0, 0, 0, 0, 0]) === null, 'sans historique : null');
const pw = wa.weeklyByDay('2026-11-09', (s) => (s === '2026-11-02' ? [600, 0, 0, 0, 0, 0, 0] : [60, 0, 0, 0, 0, 0, 0]));
assert(Math.abs(pw[0] - (600 * 2 + 60 * 2 + 60 + 60) / 6) < 1e-9, 'semaine récente atypique : poids 2-2-1-1 par jour aussi');

// ---- Visible seulement si le Prévu diffère du Passé ----
const o1 = obj(A, 8);
let d = o.get('u1', o1);
assert(d.byDay && JSON.stringify(d.byDay.passe) === JSON.stringify([120, 0, 60, 0, 0, 0, 0]) && d.byDay.passeWeekMin === 180, 'Passé par jour : lundi 2h, mercredi 1h (moyenne Chrono du niveau), semaine 3h');
assert(d.byDay.show === true && d.hoursByDay === null, 'Prévu 8h ≠ Passé 3h : le volet « Avancé » est proposé ; rien n’est stocké');
const o2 = obj(A, 3);
assert(o.get('u1', o2).byDay.show === false, 'Prévu 3h = Passé 3h : le volet est absent');
assert(o.get('u1', obj(A, null)).byDay.show === false, 'sans Prévu : le volet est absent');

// ---- Défaut proportionnel / sans historique ----
assert(JSON.stringify(d.byDay.default) === JSON.stringify([315, 0, 165, 0, 0, 0, 0]) && sum(d.byDay.default) === 480, 'défaut : proportions du Passé (2/3 – 1/3) mises à l’échelle sur 8h, arrondies au quart d’heure, somme = 8h');
const o3 = obj(B, 8); d = o.get('u1', o3);
assert(JSON.stringify(d.byDay.default) === JSON.stringify([120, 90, 90, 90, 90, 0, 0]) && d.byDay.show === true, 'sans historique : répartition égale sur L à V (90 min), l’écart d’arrondi sur le premier jour (lundi), somme = 8h');
assert(JSON.stringify(tb.defaultByDay(0, [1, 2, 3, 0, 0, 0, 0])) === '[0,0,0,0,0,0,0]' && sum(tb.defaultByDay(487, [1, 5, 2, 0, 0, 3, 0])) === 487, 'défaut : somme exacte même quand le total n’est pas un multiple de 15 (l’écart va sur le jour le plus chargé)');

// ---- Enregistrement et relecture ----
let bad = false;
bad = false; try { o.parametres('u1', o1, { hoursByDay: [300, 0, 150, 0, 0, 0, 0] }); } catch (e) { bad = e.statusCode === 400; }
assert(bad && meta(o1).hoursByDay === undefined, 'total inégal (7h30 au lieu de 8h) : refusé, rien n’est écrit');
bad = false; try { o.parametres('u1', o1, { hoursByDay: [1, 2, 3] }); } catch (e) { bad = e.statusCode === 400; }
assert(bad, 'tableau invalide (pas 7 entiers) : refusé');
o.parametres('u1', o1, { hoursByDay: [300, 0, 180, 0, 0, 0, 0] });
assert(JSON.stringify(o.get('u1', o1).hoursByDay) === JSON.stringify([300, 0, 180, 0, 0, 0, 0]), 'total égal : enregistré dans metaJson.hoursByDay et relu');
// les heures par semaine changent : les jours suivent proportionnellement ; hoursPerWeek retiré : hoursByDay supprimé
o.parametres('u1', o1, { hoursPerWeek: 4 });
const re = meta(o1).hoursByDay;
assert(sum(re) === 240 && re[0] > re[2] && re[1] === 0 && re[3] === 0, 'heures 8h → 4h : les jours suivent proportionnellement (somme = 4h, lundi > mercredi) : ' + re.join(','));
o.parametres('u1', o1, { hoursByDay: null });
assert(o.get('u1', o1).hoursByDay === null, 'retour au défaut : hoursByDay supprimé');
o.parametres('u1', o1, { hoursByDay: [60, 60, 60, 30, 30, 0, 0] });
o.parametres('u1', o1, { hoursPerWeek: null });
assert(o.get('u1', o1).hoursByDay === null, 'plus d’heures par semaine : hoursByDay supprimé avec elles');
// objet sans hoursByDay : inchangé par un enregistrement ordinaire
const o4 = obj(A, 8); o.parametres('u1', o4, { skill: 'débutant' });
assert(meta(o4).hoursByDay === undefined && meta(o4).hoursPerWeek === 8, 'objectif sans hoursByDay : un enregistrement ordinaire ne l’ajoute pas');
assert(JSON.stringify(o.joursDefaut('u1', o4, 480).default) === JSON.stringify([315, 0, 165, 0, 0, 0, 0]), 'défaut pour un total modifié à l’écran : même calcul (GET /api/objectifs/:id/jours)');
// ---- Interface : réglage rangé dans la MODIFICATION d'un objectif existant, jamais dans la création ----
{
  const fs = require('fs'), path = require('path');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'objectifs-creer.css'), 'utf8').split('\r\n').join('\n');
  const i18n = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');
  const iEdit = js.indexOf('  function openEdit(id) {'), iEnd = js.indexOf('  // ---------- Fenêtre « détail d\'un objectif » ----------');
  const edit = js.slice(iEdit, iEnd), create = js.slice(0, iEdit);
  assert(edit.includes("tr('Avancé')") && !create.includes('hoursByDay') && !create.includes('byDay') && !create.includes("tr('Avancé')"), 'le volet « Avancé » est dans la modification d’un objectif ; la création n’en parle pas (aucune étape, aucun écran de plus)');
  assert(edit.includes('byOpen = false') && edit.includes("btn('objGuideHead cmpToggle'") && edit.includes("'cmpChev' + (byOpen ? ' open' : '')"), 'volet fermé par défaut, même composant que les groupes repliables de la description (ligne fine, titre à gauche, chevron à droite)');
  assert(edit.includes('function byShow() { return !!bd && hoursMin() > 0 && hoursMin() !== (bd.passeWeekMin || 0); }') && edit.includes('if (!byShow() || !form.byDay) return;'), 'visible seulement si le Prévu diffère du Passé');
  const iDays = edit.indexOf('function paintDays()'), days = edit.slice(iDays, edit.indexOf('paintDays();\n      var sIn'));
  assert(days.includes("['L', 'M', 'M', 'J', 'V', 'S', 'D']") && days.includes("tr('Total')") && days.includes("tr('Passé')") && days.includes("tr('Prévu')") && !days.includes("el('input'") && days.includes('tbtn(m,') && days.includes(', 1440)'), 'tableau L M M J V S D + Total ; Passé en lecture seule ; Prévu réglé par le sélecteur de durée standard (aucun champ de saisie)');
  assert(edit.includes('function sync() { stepBtn.disabled = !dirty() || !form.endDate || !byOk(); }') && edit.includes('bySum() === hoursMin()'), '« Enregistrer » grisé tant que la somme des jours ≠ les heures par semaine');
  assert(days.includes("'Le total doit rester à {t} : retire {d} sur un jour.'") && days.includes("'Le total doit rester à {t} : ajoute {d} sur un jour.'") && days.includes("note.classList.toggle('hidden', sum === want)") && days.indexOf("wrap.appendChild(tbl); wrap.appendChild(note);") > 0, 'phrase explicative juste sous le tableau, disparaît quand c’est égal');
  assert(edit.includes('if (byChanged()) b.hoursByDay = form.byDay;'), 'les jours ne sont envoyés que s’ils ont changé (un objectif sans jours reste inchangé)');
  assert(/\.objDayHead \.objDayCell, \.objDayTotal \{ color: var\(--text\); \}/.test(css) && /\.objDayCell \{[^}]*color: var\(--text-light\)/.test(css) && !/#[0-9a-fA-F]{3,6}/.test(css.slice(css.indexOf('.objDayRow'), css.indexOf('.objDayRow') + 700)), 'couleurs par jetons : en-têtes et Total en blanc, Passé en gris sable, rien en dur');
  assert(i18n.includes("'Avancé': 'Advanced'") && i18n.includes('retire {d} sur un jour') && i18n.includes('ajoute {d} sur un jour'), 'textes traduits');
}
console.log(failed ? '\njour-par-jour-test : ' + failed + ' ÉCHEC(S)' : '\njour-par-jour-test : OK');
process.exit(failed ? 1 : 0);
