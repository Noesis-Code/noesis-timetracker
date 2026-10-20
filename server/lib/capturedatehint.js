'use strict';

// La capture de la zone libre (Page 1) posait
// systématiquement « aujourd'hui ». Ce module PUR lit les indices de date
// écrits dans le texte d'une tâche (« vendredi », « la semaine prochaine »,
// « avant le 30 ») et renvoie une cible : un JOUR, une SEMAINE (lundi) ou une
// ÉCHÉANCE (jour limite). Sans indice : null (le placement répartit alors
// selon la capacité, voir goalscaptureplace.js#placeCaptureDefault).
// Ce n'est qu'une SUGGESTION (dueDateAuto=2) modifiable dans le pop-up ; une
// date saisie par l'utilisateur prime toujours (jamais écrasée).

const { DAYS, MONTHS, EN_MONTHS: EN_M, canon } = require('./temporalvocab'); // table unique du vocabulaire de temps (jours, mois, abréviations)

function norm(s) {
  return ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/\-]+/g, ' ').trim() + ' ';
}
function parse(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); }
function fmt(d) { return d.toISOString().slice(0, 10); }
function add(iso, n) { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
function monday(iso) { const w = parse(iso).getUTCDay(); return add(iso, -((w + 6) % 7)); }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// Prochain « jour du mois » dom (>= today), éventuellement d'un mois donné.
function dayOfMonth(today, dom, month) {
  const t = parse(today);
  let y = t.getUTCFullYear(), m = month || (t.getUTCMonth() + 1);
  for (let i = 0; i < 14; i += 1) {
    if (dom <= daysInMonth(y, m)) {
      const iso = fmt(new Date(Date.UTC(y, m - 1, dom)));
      if (iso >= today) return iso;
    }
    if (month) y += 1; else { m += 1; if (m > 12) { m = 1; y += 1; } }
    if (month && i > 0) break;
  }
  return null;
}

// today : 'YYYY-MM-DD'. Retourne { kind: 'day'|'week'|'deadline', date } ou null.
function parseDateHint(text, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return null;
  // Mois anglais suivi du jour (« Oct 30 », « October 30th ») : ramené à la forme française « 30 octobre » traitée plus bas.
  const t = norm(canon(text)).replace(/ (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|t|tember|ober|ember)? (\d{1,2})(?:st|nd|rd|th)? /g, (all, mo, d) => ' ' + d + ' ' + EN_M[mo] + ' ');

  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) {
    const iso = m[1] + '-' + m[2] + '-' + m[3];
    if (iso >= today && !isNaN(parse(iso))) return { kind: /\b(avant|d ici|dici|pour le|au plus tard)\b/.test(t) ? 'deadline' : 'day', date: iso };
  }

  if (/ apres demain /.test(t)) return { kind: 'day', date: add(today, 2) };
  if (/ (demain|tomorrow|tmrw|tmr|tmw|2morrow) /.test(t)) return { kind: 'day', date: add(today, 1) };
  if (/ (aujourd hui|aujourdhui|ce soir|ce matin|a soir|a matin|cet apres-midi|cet apres midi|today|tonight|tonite|eod|cob|end of (?:the )?day|this (?:morning|afternoon|evening)) /.test(t)) return { kind: 'day', date: today };
  // « dans 3 jours », « dans 2 semaines » (relatif, jamais une heure) ; « dans une heure » ne donne aucun indice.
  m = / (?:dans|in) (\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|a|one|two|three|four|five|six|seven|eight|nine|ten) (jours?|jrs?|days?|semaines?|sem|weeks?|wks?) /.exec(t);
  if (m) {
    const n = /^\d/.test(m[1]) ? +m[1] : m[1] === 'a' ? 1 : (/^(?:a|one|two|three|four|five|six|seven|eight|nine|ten)$/.test(m[1]) ? ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].indexOf(m[1]) : ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'].indexOf(m[1])) || 1;
    return { kind: 'day', date: add(today, n * (/^[sw]/.test(m[2]) ? 7 : 1)) };
  }

  // « fin de semaine » (québécois) = le week-end : le samedi (le jour même un samedi ou dimanche) ; « prochaine » = celui d'après ; « pour / avant » = échéance.
  m = / (?:la |the )?(?:fin de semaine|week-end|weekend)( prochaine| prochain| next)? /.exec(t);
  if (m) {
    const w = parse(today).getUTCDay();
    let d = w === 0 || w === 6 ? today : add(today, 6 - w);
    if (m[1]) d = add(w === 0 ? add(today, -1) : add(today, 6 - w), 7);
    return { kind: / (pour|avant|d ici) /.test(t) ? 'deadline' : 'day', date: d };
  }
  // « semaine du 10 novembre » = la semaine (lundi) de cette date.
  m = / semaine du (\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) /.exec(t);
  if (m) { const iso = dayOfMonth(today, +m[1], MONTHS[m[2]]); if (iso) return { kind: 'week', date: monday(iso) }; }
  // Fêtes à date fixe, avec un mot de contexte (jamais « Noël » seul : prénom) : « la St-Jean » (24 juin), « pour Noël », « avant l'Halloween ».
  const hol = / (?:la |a la |pour la |avant la |d ici la |fete de la )(?:st|saint)-jean(?:-baptiste)? /.test(t) ? [6, 24]
    : / (?:pour|avant|d ici|veille de|reveillon de|jour de) (?:noel|l halloween|halloween) /.exec(t) ? (/noel/.test(t) ? [12, 25] : [10, 31]) : null;
  if (hol) { const iso = dayOfMonth(today, hol[1], hol[0]); if (iso) return { kind: / (pour|avant|d ici) /.test(t) ? 'deadline' : 'day', date: iso }; }
  if (/ semaine prochaine | la semaine suivante | semaine d apres | next (?:week|wk) /.test(t)) return { kind: 'week', date: add(monday(today), 7) };
  if (/ (cette semaine|this (?:week|wk)|d ici la fin de la semaine|d ici vendredi) /.test(t) && !/ d ici vendredi /.test(t)) return { kind: 'week', date: monday(today) };
  if (/ (la )?fin (de|du) mois | end of (?:the )?month | eom /.test(t)) {
    const d = parse(today);
    return { kind: 'deadline', date: fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1)))) };
  }
  if (/ (le )?mois prochain | next month /.test(t)) {
    const d = parse(today);
    return { kind: 'week', date: monday(fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))) };
  }

  // « pour » n'est une échéance que devant une date (« pour le 5 nov. », « pour vendredi ») : « pour son anniversaire samedi » reste un jour.
  const dead = /\b(avant|d ici|dici|au plus tard|before|by|until)\b|\bpour (le|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d)/.test(t);
  m = /\b(?:le |du )?(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.exec(t);
  // « la réunion du 12 octobre » (déjà passé cette année) est une référence, pas une date à venir : aucun indice (sans échéance ni « à partir du »).
  const pastRef = m && / du \d{1,2}(?:er)? [a-z]+ /.test(t) && !dead && !/ (partir|des|from) du /.test(t) && (() => { const d = parse(today); return fmt(new Date(Date.UTC(d.getUTCFullYear(), MONTHS[m[2]] - 1, +m[1]))) < today; })();
  if (m && !pastRef) {
    const iso = dayOfMonth(today, +m[1], MONTHS[m[2]]);
    if (iso) return { kind: dead ? 'deadline' : 'day', date: iso };
  }
  // « on the 1st », « the 15th » (anglais) : jour du mois nu en fin de titre.
  m = / the (\d{1,2})(?:st|nd|rd|th) $/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    const iso = dayOfMonth(today, +m[1]);
    if (iso) return { kind: /\b(?:before|by|until|avant|d ici|dici)\b/.test(t) ? 'deadline' : 'day', date: iso }; // « before the 25th » = échéance
  }
  m = /\b(?:avant|d ici|dici|pour|au plus tard)(?: le| au)? (\d{1,2})(?:er)?\b(?! ?(?:h|heures?|min|minutes|%|\$|euros?))/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    const iso = dayOfMonth(today, +m[1]);
    if (iso) return { kind: 'deadline', date: iso };
  }

  // « Payer le loyer le 15 » : jour du mois nu en fin de titre (pas suivi d'une unité ou d'un mot : « le 15 chapitres » n'est pas une date).
  m = / le (\d{1,2})(?:er)?(?: (?:a |vers |at |@ )?\d{1,2} ?(?:h|heures?)(?: ?\d{2})?| (?:a |at |@ )?\d{1,2}(?::\d{2})? ?(?:am|pm))? $/.exec(t); // heure d'horloge facultative derrière (« le 28 à 16h »)
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    const iso = dayOfMonth(today, +m[1]);
    if (iso) return { kind: 'day', date: iso };
  }

  // « le 1er de chaque mois », « le 15 du mois » : prochain jour du mois (point de départ d'une récurrence mensuelle).
  m = / le (\d{1,2})(?:er)? (?:de chaque|de tous les|du|de) mois /.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    const iso = dayOfMonth(today, +m[1]);
    if (iso) return { kind: 'day', date: iso };
  }

  // « tous les lundis » : le pluriel désigne le prochain lundi (point de départ d'une récurrence hebdomadaire).
  m = /\b(?:(next) )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(s)?( prochain| next)?\b/.exec(t);
  if (m) {
    const target = DAYS[m[2]];
    const w = parse(today).getUTCDay();
    let diff = (target - w + 7) % 7;
    if ((m[1] || m[4]) && diff === 0) diff = 7;
    return { kind: dead ? 'deadline' : 'day', date: add(today, diff) };
  }
  return null;
}

module.exports = { parseDateHint, monday };
