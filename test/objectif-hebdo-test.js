// Interrupteur « Hebdomadaire » de la création (9 nov. 2026) : possible SEULEMENT au niveau secteur ET si l'échéance tombe dans la semaine en cours ou la suivante ; éteint par défaut
// (= périodique) ; absent sinon (l'échéance décide : une seule période = hebdomadaires). Serveur en processus (aucun réseau).
process.env.TZ = 'America/Montreal';
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-hebdo-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const db = require('../server/db');
const goals = require('../server/lib/goals');
const categories = require('../server/lib/categories');
const o = require('../server/lib/objectifs');
const today = require('../server/lib/dates').userToday();
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monday = goals.mostRecentMonday(today);

db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('u1', 'u1', datetime('now'))").run();
const act = Number(db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('Atelier', 'u1', '')").run().lastInsertRowid);
db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?, 'u1', '#fff', '')").run(act);
const pole = categories.addCategory(act, 'Production'); const poleKey = (pole && pole.key) || goals.categoriesForActivity(act)[0].key;
const sec = categories.addCategory(act, 'Atelier bois', poleKey); const secKey = (sec && sec.key) || goals.secteursForPole(act, poleKey)[0].key;
const mk = (extra) => o.creer('u1', Object.assign({ title: 'Objectif ' + Math.random().toString(36).slice(2, 6), activityId: act, startDate: today, level: 'secteur', poleKey, categoryKey: secKey }, extra));

(async () => {
  const nextWeekEnd = addDays(monday, 13), soon = addDays(today, 1); // demain est toujours dans la semaine en cours ou la suivante
  // échéance dans la semaine en cours ou la suivante, niveau secteur : l'interrupteur décide
  let r = mk({ endDate: soon, inner: 'periodiques' });
  assert(r.innerGoals === 'periodiques' && r.level === 'secteur', 'secteur + échéance proche, interrupteur éteint : objectif périodique');
  r = mk({ endDate: nextWeekEnd, inner: 'hebdomadaires' });
  assert(r.innerGoals === 'hebdomadaires', 'secteur + échéance proche, interrupteur allumé : objectif hebdomadaire (jusqu’à la fin de la semaine suivante)');
  // hebdomadaire impossible : échéance au-delà de la semaine suivante (≤ 28 jours = une seule période) : l'échéance décide
  const far = addDays(nextWeekEnd, 3);
  r = mk({ endDate: far, inner: 'periodiques' });
  assert(r.innerGoals === 'hebdomadaires', 'échéance au-delà de la semaine suivante : l’interrupteur ne peut pas imposer un périodique (une période : hebdomadaires)');
  // autre niveau : jamais d'interrupteur
  r = o.creer('u1', { title: 'Niveau pôle', activityId: act, startDate: today, level: 'pole', poleKey, endDate: addDays(today, 3), inner: 'periodiques' });
  assert(r.innerGoals === 'hebdomadaires', 'niveau pôle : pas d’interrupteur, l’échéance décide');
  r = o.creer('u1', { title: 'Niveau activité', activityId: act, startDate: today, endDate: addDays(today, 3), inner: 'periodiques' });
  assert(r.innerGoals === 'hebdomadaires', 'niveau activité : pas d’interrupteur, l’échéance décide');
  // échéance lointaine : choix habituels des objectifs inclus
  r = mk({ endDate: addDays(today, 120), inner: 'periodiques' });
  assert(r.innerGoals === 'periodiques', 'échéance lointaine : « Objectifs inclus » comme avant');

  // Interface : affiché seulement au niveau secteur et si l'échéance est proche ; éteint par défaut ; remplace « Objectifs inclus »
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
  assert(src.includes("f.level === 'secteur' && !!f.endDate && !!f.startDate && f.endDate <= isoAdd(mondayIso(f.startDate), 13)"), 'interrupteur : niveau secteur ET échéance dans la semaine en cours ou la suivante');
  assert(src.includes("el('span', 'toggleSwitch')") && src.includes("cb.checked = !!form.weeklyOn") && !/form\.weeklyOn = true|weeklyOn: true/.test(src), 'composant .toggleSwitch existant, éteint par défaut');
  assert(src.includes("if (weeklyPossible(form)) return form.weeklyOn ? 'hebdomadaires' : 'periodiques'") && src.includes('if (form._switchShown) return;'), 'périodique/hebdomadaire décidé par l’interrupteur quand il est affiché ; « Objectifs inclus » masqué (aucune contradiction)');
  // Phrase en direct sous les choix de la page Activité : activité › pôle › secteur · période ou semaine · sous « parent » / sans parent (texte seul, lecture seule)
  assert(src.includes("path.join(' › ')") && src.includes("tr('sous') + ' « ' + p.title + ' »' : tr('sans parent')") && src.includes("tr('semaine') + ' ' + weekNo(form.endDate) : tr('période') + ' ' + periodNo(form.endDate)"), 'phrase en direct : chemin, période ou semaine, parent ou « sans parent »');
  const fp = src.slice(src.indexOf('    function fetchParent()'), src.indexOf('    function refreshHints()'));
  assert(fp.includes("'/api/objectifs/rattachement'") && !/'PUT'|'DELETE'/.test(fp) && fp.includes('return Promise.resolve(null)'), 'parent retenu : même appel de rattachement, lecture seule ; absent = « sans parent »');
  const per = (iso) => { const y = Number(iso.slice(0, 4)); const d = Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(y + '-01-01T00:00:00Z')) / 86400000); return Math.min(13, Math.floor(d / 28) + 1); };
  assert(src.includes('Math.min(13, Math.floor(d / 28) + 1)') && per('2026-01-01') === 1 && per('2026-02-05') === 2 && per('2026-12-31') === 13, 'numéro de période : même découpage que l’arbre (13 périodes de 28 jours)');
  console.log(failed ? '\nobjectif-hebdo-test : ' + failed + ' ÉCHEC(S)' : '\nobjectif-hebdo-test : OK');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
