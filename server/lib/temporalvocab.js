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
const MONTH_ABBR = { janv: 'janvier', jan: 'janvier', fevr: 'fevrier', fev: 'fevrier', avr: 'avril', juil: 'juillet', sept: 'septembre', sep: 'septembre', oct: 'octobre', nov: 'novembre', dec: 'decembre' };

const DAY_NAMES = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
// Fragment de regex : un jour abrégé reconnu (pour le retrait d'une heure collée au jour : « lun. 9h »).
const DAY_ABBR_RE = '(?:(?:lun|mar|mer|jeu|ven|sam|dim|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\.|\\b(?:tues?|wed|thurs?|fri)\\b)';

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Texte brut -> même texte où les abréviations de jours/mois et « après-demain » sont écrits en toutes lettres (le reste est inchangé).
function canon(text) {
  let s = String(text == null ? '' : text);
  s = s.replace(/(^|[\s(,;])([A-Za-zéÉ]{3,5})\.(?=[\s),;:]|$)/g, (all, pre, w) => { const k = strip(w).toLowerCase(); return DAY_ABBR[k] ? pre + DAY_ABBR[k] : all; });
  s = s.replace(/(^|[\s(,;])([A-Za-z]{3,5})(?=[\s),;:]|$)/g, (all, pre, w) => { const k = w.toLowerCase(); return DAY_ABBR_BARE.has(k) ? pre + DAY_ABBR[k] : all; });
  s = s.replace(/(\d{1,2}(?:er)?)\s+([A-Za-zéÉûÛ]{3,5})\.?(?=[\s),;:.]|$)/g, (all, d, w) => { const m = MONTH_ABBR[strip(w).toLowerCase()]; return m ? d + ' ' + m : all; });
  s = s.replace(/apr[eè]s-demain/gi, 'apres demain');
  return s;
}

module.exports = { DAYS, MONTHS, EN_MONTHS, DAY_ABBR, DAY_NAMES, DAY_ABBR_RE, MONTH_ABBR, canon };
