'use strict';

// 16 oct. 2026 (Émilien) : la capture de la zone libre (Page 1) posait
// systématiquement « aujourd'hui ». Ce module PUR lit les indices de date
// écrits dans le texte d'une tâche (« vendredi », « la semaine prochaine »,
// « avant le 30 ») et renvoie une cible : un JOUR, une SEMAINE (lundi) ou une
// ÉCHÉANCE (jour limite). Sans indice : null (le placement répartit alors
// selon la capacité, voir goalscaptureplace.js#placeCaptureDefault).
// Ce n'est qu'une SUGGESTION (dueDateAuto=2) modifiable dans le pop-up ; une
// date saisie par l'utilisateur prime toujours (jamais écrasée).

const DAYS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
const MONTHS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

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
  const t = norm(text);

  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) {
    const iso = m[1] + '-' + m[2] + '-' + m[3];
    if (iso >= today && !isNaN(parse(iso))) return { kind: /\b(avant|d ici|dici|pour le|au plus tard)\b/.test(t) ? 'deadline' : 'day', date: iso };
  }

  if (/ apres demain /.test(t)) return { kind: 'day', date: add(today, 2) };
  if (/ demain /.test(t)) return { kind: 'day', date: add(today, 1) };
  if (/ (aujourd hui|aujourdhui|ce soir|ce matin) /.test(t)) return { kind: 'day', date: today };

  if (/ semaine prochaine | la semaine suivante | semaine d apres /.test(t)) return { kind: 'week', date: add(monday(today), 7) };
  if (/ (cette semaine|d ici la fin de la semaine|d ici vendredi) /.test(t) && !/ d ici vendredi /.test(t)) return { kind: 'week', date: monday(today) };
  if (/ (la )?fin (de|du) mois /.test(t)) {
    const d = parse(today);
    return { kind: 'deadline', date: fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1)))) };
  }
  if (/ (le )?mois prochain /.test(t)) {
    const d = parse(today);
    return { kind: 'week', date: monday(fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))) };
  }

  const dead = /\b(avant|d ici|dici|pour|au plus tard)( le| lundi| mardi| mercredi| jeudi| vendredi| samedi| dimanche)?\b/.test(t);
  m = /\b(?:le |du )?(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.exec(t);
  if (m) {
    const iso = dayOfMonth(today, +m[1], MONTHS[m[2]]);
    if (iso) return { kind: dead ? 'deadline' : 'day', date: iso };
  }
  m = /\b(?:avant|d ici|dici|pour|au plus tard)(?: le| au)? (\d{1,2})(?:er)?\b(?! ?(?:h|heures?|min|minutes|%|\$|euros?))/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    const iso = dayOfMonth(today, +m[1]);
    if (iso) return { kind: 'deadline', date: iso };
  }

  m = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)( prochain)?\b/.exec(t);
  if (m) {
    const target = DAYS[m[1]];
    const w = parse(today).getUTCDay();
    let diff = (target - w + 7) % 7;
    if (m[2] && diff === 0) diff = 7;
    return { kind: dead ? 'deadline' : 'day', date: add(today, diff) };
  }
  return null;
}

module.exports = { parseDateHint, monday };
