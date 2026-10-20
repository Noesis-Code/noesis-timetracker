'use strict';

// Table UNIQUE du vocabulaire de temps (jours, mois, abréviations) FR + québécois + EN, partagée par capturedatehint.js (indice de date)
// et taskprecision.js (retrait de l'heure). Pur, sans base ni réseau. Une forme absente ici est ignorée (aucun indice), jamais devinée.

const DAYS = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
const MONTHS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
// Mois anglais abrégés ou complets (« Oct 30 », « September 3rd ») -> mois français pliés.
const EN_MONTHS = { jan: 'janvier', feb: 'fevrier', mar: 'mars', apr: 'avril', may: 'mai', jun: 'juin', jul: 'juillet', aug: 'aout', sep: 'septembre', oct: 'octobre', nov: 'novembre', dec: 'decembre' };

// Abréviations de jours. Avec un point final (« lun. », « Fri. ») toutes sont sûres ; sans point, seules celles qui ne sont pas aussi un mot courant
// (« mon », « sat », « sun », « mar », « jeu », « mer » ne le sont pas : exclus).
const DAY_ABBR = { lun: 'lundi', mar: 'mardi', mer: 'mercredi', jeu: 'jeudi', ven: 'vendredi', sam: 'samedi', dim: 'dimanche', mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
const DAY_ABBR_BARE = new Set(['tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri']);
// Mois abrégés français (derrière un numéro de jour seulement : « 5 nov. », « 1 sept », jamais « sept jours »).
const MONTH_ABBR = { mar: 'mars', janv: 'janvier', jan: 'janvier', fevr: 'fevrier', fev: 'fevrier', avr: 'avril', juil: 'juillet', sept: 'septembre', sep: 'septembre', oct: 'octobre', nov: 'novembre', dec: 'decembre' };

const DAY_NAMES = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
// Fragment de regex : un jour abrégé reconnu (pour le retrait d'une heure collée au jour : « lun. 9h »).
const DAY_ABBR_RE = '(?:(?:lun|mar|mer|jeu|ven|sam|dim|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\.|\\b(?:tues?|wed|thurs?|fri)\\b)';

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Mots de temps corrigeables d'UNE faute de frappe (indice seulement, jamais le titre affiché). Longs (>= 5 lettres) et sans voisin courant :
// « matin », « soir », « dans », « mars » sont exclus (marin, soit, sans, mais sont de vrais mots).
const TYPO_TARGETS = ['demain', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'semaine', 'prochain', 'prochaine', 'janvier', 'fevrier', 'juillet', 'septembre', 'octobre', 'novembre', 'decembre'];
const TYPO_KNOWN = new Set(TYPO_TARGETS.concat(['semaines', 'prochains', 'prochaines', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis', 'dimanches', 'domain', 'remain', 'demande', 'demander', 'demains']));
// Distance d'édition 1 (insertion, suppression, substitution) ou transposition de deux lettres voisines.
function dist1(a, b) {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}
// Mot (déjà plié : minuscules, sans accents) -> mot de temps si UN SEUL candidat à distance 1 et même initiale ; sinon inchangé.
function fixTimeTypo(w) {
  if (w.length < 5 || TYPO_KNOWN.has(w)) return w;
  const c = TYPO_TARGETS.filter((t) => t[0] === w[0] && dist1(w, t));
  return c.length === 1 ? c[0] : w;
}

// Texte brut -> même texte où les abréviations de jours/mois et « après-demain » sont écrits en toutes lettres (le reste est inchangé).
// SEUL point de normalisation d'entrée des indices de temps : espaces/retours/insécables, apostrophes, tirets, heures (« 14:30 », « 2:30 PM », « 14H »
// -> « 14 h 30 »), fautes de frappe d'un mot de temps. Ne sert qu'à l'indice : le titre affiché n'est jamais touché.
function canon(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/[\s\u00a0\u202f\u2007\u2009]+/g, ' ').replace(/[\u2018\u2019\u02bc`´]/g, "'").replace(/[\u2010-\u2015\u2212]/g, '-');
  s = s.replace(/(^|[^\d:])(\d{1,2})\s?:\s?(\d{2})(?:\s?([ap])\.?m\.?(?![a-z]))?/gi, (all, pre, h, mi, ap) => {
    let H = +h; if (H > 24 || +mi > 59) return all;
    if (ap) { H = H % 12 + (/p/i.test(ap) ? 12 : 0); }
    return pre + H + ' h ' + mi;
  });
  s = s.replace(/(^|[^\d:])(\d{1,2})\s?([ap])\.?m\.?(?![a-z])/gi, (all, pre, h, ap) => (+h >= 1 && +h <= 12) ? pre + (+h % 12 + (/p/i.test(ap) ? 12 : 0)) + ' h' : all);
  s = s.replace(/(\d)\s?H\b/g, '$1 h');
  s = s.replace(/[A-Za-zÀ-ÿ]{5,}/g, (w) => { const f = fixTimeTypo(strip(w).toLowerCase()); return f === strip(w).toLowerCase() ? w : f; });
  s = s.replace(/(^|[\s(,;])([A-Za-zéÉ]{3,5})\.(?=[\s),;:]|$)/g, (all, pre, w, off, str) => { const k = strip(w).toLowerCase(); if (k === 'mar' && /\d\s*$/.test(str.slice(0, off + pre.length))) return all; return DAY_ABBR[k] ? pre + DAY_ABBR[k] : all; }); // « 3 mar. » = mars (mois après un numéro), « mar. 9h » = mardi
  s = s.replace(/(^|[\s(,;])([A-Za-z]{3,5})(?=[\s),;:]|$)/g, (all, pre, w) => { const k = w.toLowerCase(); return DAY_ABBR_BARE.has(k) ? pre + DAY_ABBR[k] : all; });
  s = s.replace(/(\d{1,2}(?:er)?)\s+([A-Za-zéÉûÛ]{3,5})\.?(?=[\s),;:.]|$)/g, (all, d, w) => { const m = MONTH_ABBR[strip(w).toLowerCase()]; return m ? d + ' ' + m : all; });
  s = s.replace(/apr[eè]s-demain/gi, 'apres demain');
  return s;
}

module.exports = { DAYS, MONTHS, EN_MONTHS, DAY_ABBR, DAY_NAMES, DAY_ABBR_RE, MONTH_ABBR, canon };
