// Module « Horaire » : lecture d'un COURRIEL d'événement (boîte info@ du restaurant), SANS IA, par règles, en français et en anglais
// (29 oct. 2026, demande d'Émilien). Fonctions PURES (aucune base) : testables seules (test/horaire-mail-test.js).
// Loi 25 : rien de personnel n'est gardé. Le corps est lu ici, en mémoire, puis jeté par l'appelant ; seuls les champs extraits
// (date, heure, service, couverts, plancher, indice « confirmé probable ») et un sujet nettoyé des noms propres en sortent.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();

const MONTHS = [
  ['janvier', 'janv', 'jan', 'january'], ['fevrier', 'fevr', 'fev', 'february', 'feb'], ['mars', 'mar', 'march'],
  ['avril', 'avr', 'april', 'apr'], ['mai', 'may'], ['juin', 'june', 'jun'], ['juillet', 'juil', 'july', 'jul'],
  ['aout', 'august', 'aug'], ['septembre', 'sept', 'sep', 'september'], ['octobre', 'oct', 'october'],
  ['novembre', 'nov', 'november'], ['decembre', 'dec', 'december'],
];
const MONTH_RE = MONTHS.flat().sort((a, b) => b.length - a.length).join('|');
const monthIndex = (w) => MONTHS.findIndex((names) => names.includes(w));
const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Sujet sans « RE: / TR: / Fwd: / FW: / AW: » (répétés).
function cleanSubject(s) {
  let t = String(s || '').trim();
  for (let i = 0; i < 10; i++) {
    const n = t.replace(/^\s*(re|tr|fwd?|fw|aw|wg|réf|ref)\s*(\[\d+\])?\s*:\s*/i, '');
    if (n === t) break;
    t = n;
  }
  return t.replace(/\s+/g, ' ').trim();
}

// Texte du courriel sans les parties citées (lignes « > », et tout ce qui suit « Le … a écrit : », « On … wrote: », « De : », « From: »,
// « -----Original Message----- ») : seul ce que CE courriel dit compte.
function ownText(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const l of lines) {
    const f = fold(l).trim();
    if (/^(le .+ a ecrit ?:|on .+ wrote:|-+ ?original message ?-+|-+ ?message d'origine ?-+|de ?: .+|from: .+|envoye ?: .+|sent: .+)$/.test(f)) break;
    if (/^>/.test(l.trim())) continue;
    out.push(l);
  }
  return out.join('\n');
}

const pad = (n) => String(n).padStart(2, '0');
function iso(y, m, d) {
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return y + '-' + pad(m + 1) + '-' + pad(d);
}
// Année absente : la prochaine occurrence à partir d'aujourd'hui.
function nextYear(m, d, today) {
  const y = Number(today.slice(0, 4));
  const a = iso(y, m, d);
  return a && a >= today ? a : iso(y + 1, m, d);
}

// Dates citées, futures : « samedi 14 novembre », « 14 nov. 2026 », « November 14 », « 14/11 », « 14/11/2026 », « 2026-11-14 ».
function findDates(text, today) {
  const t = fold(text);
  const out = [];
  let m;
  const r1 = new RegExp('\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(' + MONTH_RE + ')\\.?(?:\\s+(\\d{4}))?\\b', 'g');
  while ((m = r1.exec(t))) { const mi = monthIndex(m[2]); const d = Number(m[1]); out.push(m[3] ? iso(Number(m[3]), mi, d) : nextYear(mi, d, today)); }
  const r2 = new RegExp('\\b(' + MONTH_RE + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', 'g');
  while ((m = r2.exec(t))) { const mi = monthIndex(m[1]); const d = Number(m[2]); out.push(m[3] ? iso(Number(m[3]), mi, d) : nextYear(mi, d, today)); }
  const r3 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = r3.exec(t))) out.push(iso(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const r4 = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  while ((m = r4.exec(t))) {
    const d = Number(m[1]), mo = Number(m[2]) - 1;
    let y = m[3] ? Number(m[3]) : null; if (y != null && y < 100) y += 2000;
    out.push(y ? iso(y, mo, d) : nextYear(mo, d, today));
  }
  return out.filter((x) => x && x >= today);
}
// La date future la plus citée (à égalité, la plus proche).
function bestDate(dates) {
  const n = new Map();
  dates.forEach((d) => n.set(d, (n.get(d) || 0) + 1));
  return [...n].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1)).map((x) => x[0])[0] || null;
}

// Heure : « 18h », « 18 h 30 », « 18:30 », « 6 pm », « 6:30pm ». La première citée.
function findTime(text) {
  const t = fold(text);
  let m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/.exec(t);
  if (m) { let h = Number(m[1]) % 12; if (/p/.test(m[3])) h += 12; const mi = Number(m[2] || 0); if (h < 24 && mi < 60) return pad(h) + ':' + pad(mi); }
  m = /\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/.exec(t);
  if (m) return pad(Number(m[1])) + ':' + pad(Number(m[2] || 0));
  return null;
}

// Couverts : « 40 personnes / invités / pax / couverts / convives / guests / people ». La dernière mention du courriel.
function findCovers(text) {
  const t = fold(text);
  const re = /\b(\d{1,4})\s*(?:personnes?|invites?|pax|couverts?|convives?|guests?|people|persons?|adultes?|adults?)\b/g;
  let m, last = null;
  while ((m = re.exec(t))) { const n = Number(m[1]); if (n >= 1 && n <= 5000) last = n; }
  return last;
}

// Planchers cités (noms du tableau Planchers, casse et accents ignorés, mots entiers) ; ordre d'apparition.
function findFloors(text, floors) {
  const t = ' ' + fold(text).replace(/[^a-z0-9']+/g, ' ') + ' ';
  return (floors || []).map((f) => {
    const k = ' ' + fold(f.name).replace(/[^a-z0-9']+/g, ' ').trim() + ' ';
    return { f, i: k.trim() ? t.indexOf(k) : -1 };
  }).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i).map((x) => x.f);
}

// « contrat », « dépôt reçu », « confirmé », « contract », « deposit received », « confirmed » : indice « confirmé probable ».
function confirmHint(text) {
  return /\b(contrat|depot recu|depot a ete recu|confirme|confirmee|confirmation de|contract|deposit received|confirmed)\b/.test(fold(text));
}

// Sujet sans nom propre : on retire les mots à majuscule initiale (noms détectés), sauf les mots d'événement connus (EVENT_WORDS),
// les adresses et les numéros ; puis les petits mots laissés seuls au début ou à la fin. Rien de lisible : null (l'appelant met
// « Événement du 14 nov. »).
const EVENT_WORDS = new Set(['evenement', 'evenements', 'mariage', 'noces', 'banquet', 'anniversaire', 'reception', 'cocktail', 'souper', 'diner', 'dejeuner', 'brunch', 'lunch', 'fete', 'soiree', 'bapteme', 'communion', 'shower', 'conference', 'reunion', 'groupe', 'reservation', 'demande', 'options', 'contrat', 'devis', 'soumission', 'menu', 'salle', 'salles', 'event', 'wedding', 'birthday', 'party', 'dinner', 'corporate', 'meeting', 'group', 'booking', 'request', 'quote', 'contract', 'family', 'style', 'canapes', 'bar', 'ouvert', 'open', 'private', 'prive', 'privee', 'noel', 'christmas', 'gala']);
const STOP = new Set(['de', 'du', 'des', "d'", 'd', 'la', 'le', 'les', 'pour', 'chez', 'avec', 'et', 'a', 'au', 'aux', 'of', 'for', 'with', 'the', 'and', 'to', '-', '–', '—', ':', '/', '|', ',']);
function anonymousSubject(subject) {
  const words = cleanSubject(subject).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const kept = words.filter((w) => !/@/.test(w) && !/\d{3,}/.test(w) && (!/^[A-ZÀ-ÖØ-Þ]/.test(w) || EVENT_WORDS.has(fold(w).replace(/[^a-z]/g, ''))));
  while (kept.length && STOP.has(fold(kept[kept.length - 1]))) kept.pop();
  while (kept.length && STOP.has(fold(kept[0]))) kept.shift();
  const s = kept.join(' ').replace(/[\s,;:–—-]+$/, '').trim();
  return s && s.length >= 3 ? s.slice(0, 80) : null;
}
function fallbackName(day) {
  if (!day) return 'Événement';
  const [, m, d] = day.split('-').map(Number);
  return 'Événement du ' + (d === 1 ? '1er' : d) + ' ' + SHORT[m - 1];
}

// Un courriel -> champs extraits (rien d'autre). today : AAAA-MM-JJ ; floors : [{ id, name }].
function extract({ subject, text }, today, floors) {
  const own = cleanSubject(subject) + '\n' + ownText(text);
  const day = bestDate(findDates(own, today));
  const time = findTime(own);
  const fl = findFloors(own, floors);
  return {
    day, time, service: time ? (Number(time.slice(0, 2)) >= 16 ? 'soir' : 'matin') : null,
    covers: findCovers(own), floorIds: fl.map((f) => f.id), confirm: confirmHint(own),
  };
}

// Fournisseurs courants (Mailgun, Postmark, CloudMailin, Worker) -> { subject, text, messageId, inReplyTo, references[], date }.
function normalizeMail(b) {
  b = b || {};
  const hdrs = {};
  const addHdr = (k, v) => { if (k && v != null) hdrs[String(k).toLowerCase()] = String(v); };
  if (Array.isArray(b.Headers)) b.Headers.forEach((x) => addHdr(x && x.Name, x && x.Value)); // Postmark
  if (b.headers && typeof b.headers === 'object' && !Array.isArray(b.headers)) Object.keys(b.headers).forEach((k) => addHdr(k, b.headers[k])); // CloudMailin
  if (typeof b['message-headers'] === 'string') { try { JSON.parse(b['message-headers']).forEach((x) => addHdr(x[0], x[1])); } catch (e) { /* ignoré */ } } // Mailgun
  const pick = (...ks) => { for (const k of ks) { const v = b[k] != null ? b[k] : hdrs[String(k).toLowerCase()]; if (v != null && String(v).trim()) return String(v); } return ''; };
  const ids = (s) => (String(s || '').match(/<[^<>\s]+>/g) || []).map((x) => x.toLowerCase());
  return {
    subject: pick('subject', 'Subject'),
    text: pick('stripped-text', 'body-plain', 'TextBody', 'StrippedTextReply', 'plain', 'text'),
    messageId: ids(pick('Message-Id', 'Message-ID', 'MessageID', 'message_id', 'messageId'))[0] || '',
    inReplyTo: ids(pick('In-Reply-To', 'in_reply_to', 'inReplyTo'))[0] || '',
    references: ids(pick('References', 'references')),
    date: pick('Date', 'date'),
  };
}

module.exports = { fold, cleanSubject, ownText, findDates, bestDate, findTime, findCovers, findFloors, confirmHint, anonymousSubject, fallbackName, extract, normalizeMail };
