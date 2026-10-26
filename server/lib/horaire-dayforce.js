// Module « Horaire » : export CSV de l'horaire d'une semaine pour l'import des horaires de Dayforce (Ceridian), où le
// restaurant gère sa paie. Fonction PURE (aucune base, aucun réseau : testée par test/horaire-dayforce-test.js) ; les
// données lues sont confidentielles (Loi 25) : jamais journalisées. Chargement des données : server/lib/horaire.js.
//
// Une ligne par quart : matricule Dayforce de l'employé, date et heure de début, date et heure de fin (un quart qui
// traverse minuit finit le lendemain : date de fin explicite), code de poste Dayforce, code d'unité (lieu) Dayforce.
// Les créneaux non comblés (alertes « trou ») ne sont pas des quarts : ils ne sont jamais exportés.
const gen = require('./horaire-generation');

// FORMAT DE L'IMPORT — seul endroit à ajuster quand le restaurant fournira un fichier modèle de son import Dayforce.
// Ordre des colonnes = ordre de ce tableau ; `header` = texte exact de l'en-tête ; `value` lit une ligne de quart
// { dayforceId, dayforceCode, location, startDate, startTime, endDate, endTime } (dates AAAA-MM-JJ, heures HH:MM, 24 h).
// Les noms d'en-tête suivent le vocabulaire Dayforce (XRefCode) mais restent à confirmer sur le modèle réel.
const DAYFORCE_FORMAT = {
  separator: ',',
  lineEnd: '\r\n', // imports Windows / Excel
  bom: '﻿', // BOM UTF-8 : Excel lit correctement les accents
  columns: [
    { header: 'EmployeeXRefCode', value: (r) => r.dayforceId },
    { header: 'StartDate', value: (r) => r.startDate },
    { header: 'StartTime', value: (r) => r.startTime },
    { header: 'EndDate', value: (r) => r.endDate },
    { header: 'EndTime', value: (r) => r.endTime },
    { header: 'JobXRefCode', value: (r) => r.dayforceCode },
    { header: 'OrgUnitXRefCode', value: (r) => r.location },
  ],
};

// Échappement CSV (RFC 4180) : guillemets doublés, champ entre guillemets s'il contient le séparateur, un guillemet ou
// un saut de ligne.
function csvCell(v, sep) {
  const s = v === null || v === undefined ? '' : String(v);
  return (s.includes(sep) || /["\r\n]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

// Quart -> dates et heures absolues, en minutes depuis le jour du quart (calcul en UTC via addDays : aucune
// dépendance au fuseau du serveur). 24:00 devient 00:00 le lendemain.
function shiftTimes(day, start, end) {
  const r = gen.range(start, end);
  if (!r) return null;
  const at = (m) => ({ date: gen.addDays(day, Math.floor(m / 1440)), time: hhmm(m % 1440) });
  const a = at(r[0]), b = at(r[1]);
  return { from: r[0], startDate: a.date, startTime: a.time, endDate: b.date, endTime: b.time };
}

/**
 * @param {Array} assignments [{ day, start, end, dayforceId, dayforceCode, fillOrder? }] (quarts enregistrés)
 * @param {string|null} location code d'unité Dayforce du compte
 * @param {object} [format] DAYFORCE_FORMAT par défaut
 * @returns {{ csv: string, rows: number, missing: { employees: number, positions: number, location: boolean } }}
 */
function buildDayforceCsv(assignments, location, format) {
  const f = format || DAYFORCE_FORMAT;
  const rows = [];
  for (const a of assignments || []) {
    const t = shiftTimes(a.day, a.start, a.end);
    if (!t) continue;
    rows.push(Object.assign({ dayforceId: a.dayforceId || '', dayforceCode: a.dayforceCode || '', location: location || '', fillOrder: a.fillOrder || 0, day: a.day }, t));
  }
  rows.sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0) || (x.from - y.from) || (x.fillOrder - y.fillOrder));
  const line = (cells) => cells.map((c) => csvCell(c, f.separator)).join(f.separator);
  const lines = [line(f.columns.map((c) => c.header))].concat(rows.map((r) => line(f.columns.map((c) => c.value(r)))));
  return {
    csv: f.bom + lines.join(f.lineEnd) + f.lineEnd,
    rows: rows.length,
    missing: {
      employees: new Set((assignments || []).filter((a) => !a.dayforceId).map((a) => a.employeeId)).size,
      positions: new Set((assignments || []).filter((a) => !a.dayforceCode).map((a) => a.positionId)).size,
      location: !location,
    },
  };
}

module.exports = { DAYFORCE_FORMAT, buildDayforceCsv, csvCell, shiftTimes };
