// Module « Horaire » : lecture de la NOTE d'un employé (28 oct. 2026, demande d'Émilien). Une seule case de texte libre par employé ;
// la génération y reconnaît six formules EXACTES (casse et accents ignorés) et les applique comme des règles ; le reste de la note est un
// texte libre, repris dans le prompt pour l'IA et dans « À vérifier ». Même lecture côté écran : public/js/horaire.js (noteParts).
const RULES = [
  ['noDouble', 'Jamais de double'], ['restAfterShift', 'Repos après un quart'], ['noMorning', 'Pas de matin'],
  ['noEvening', 'Pas de soir'], ['eveningsFirst', 'Soirs d’abord'], ['morningsFirst', 'Matins d’abord'],
];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const KEYS = RULES.map(([k, label]) => [k, fold(label)]);

// note -> { rules: Set des règles reconnues, rest: texte libre restant (morceaux séparés par « ; » qui ne sont pas une règle) }
function parseNote(note) {
  const rules = new Set();
  const rest = [];
  String(note || '').split(/[;\n]/).map((p) => p.trim()).filter(Boolean).forEach((part) => {
    // Règle EXACTE seulement (29 oct. 2026, décision d'Émilien) : le morceau, normalisé (casse, accents, espaces, « . » ou « ! » final),
    // doit être égal à une formule ; « Pas de matin sauf samedi » n'est pas appliqué : c'est une note libre (« À vérifier »).
    const f = fold(part).replace(/[.!]+$/, '').trim();
    const hit = KEYS.find(([, label]) => f === label);
    if (hit) rules.add(hit[0]); else rest.push(part);
  });
  return { rules, rest: rest.join(' ; ') };
}

module.exports = { RULES, parseNote, fold };
