// Description de l'objectif : 9 questions facultatives en 3 groupes ; un mot touché se SÉLECTIONNE (bascule, plusieurs possibles), rien n'est écrit dans le champ texte ; réponses du PARENT proposées à
// l'enfant (cinq questions, mots pré-sélectionnés + texte, copie champ par champ, sans IA, jamais Que faire / Quel résultat / Comment ça avance / Obstacle) ; compteur « n/3 » par groupe.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
const a = src.indexOf('  var GUIDE_GROUPS = ['), b = src.indexOf('  function paintGuideInto(');
assert(a > 0 && b > a, 'bloc de la description guidée trouvé');
const tr = (s) => s;
const api = new Function('tr', src.slice(a, b) + '\nreturn { GUIDE, GUIDE_GROUPS, guideParse, guideCompose, guideAns, guideProposals, guideToggle, guideFilled, GUIDE_FROM_PARENT };')(tr);
const Q = (k) => api.GUIDE.filter((g) => g.k === k)[0];

// ---- Pré-remplissage depuis le parent : parent plein / partiel / vide ----
const full = 'Faire : contacter · Résultat : devis · Avancement : chiffre · Avec qui : client, équipe, ma voisine · Avec quoi : outils · Lieu : en ligne · Obstacle : argent · Hors sujet : plus tard · Autre nom : surnom, le grand projet';
let p = api.guideProposals(full);
assert(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(['horssujet', 'nom', 'ou', 'qui', 'quoi']), 'parent plein : seules les cinq questions sont proposées');
assert(JSON.stringify(p.qui) === JSON.stringify({ picks: ['Client', 'Équipe'], text: 'ma voisine' }) && JSON.stringify(p.quoi) === JSON.stringify({ picks: ['Outils'], text: '' }), 'parent plein : mots pré-sélectionnés ET texte du parent, champ par champ');
assert(JSON.stringify(p.nom) === JSON.stringify({ picks: ['Surnom'], text: 'le grand projet' }) && p.ou.picks[0] === 'En ligne', 'parent plein : autres questions copiées');
assert(!('faire' in p) && !('resultat' in p) && !('avance' in p) && !('obstacle' in p), 'jamais Que faire, Quel résultat, Comment ça avance, Obstacle');
p = api.guideProposals('Faire : créer · Avec qui : équipe · Obstacle : temps');
assert(JSON.stringify(Object.keys(p)) === JSON.stringify(['qui']) && p.qui.picks[0] === 'Équipe', 'parent partiel : seul ce qui est écrit est proposé');
assert(JSON.stringify(api.guideProposals('')) === '{}' && JSON.stringify(api.guideProposals(null)) === '{}', 'parent vide : aucun champ proposé (comme avant)');
assert(JSON.stringify(api.guideProposals('Réussite : chiffre · Raison : santé · texte libre ancien')) === '{}', 'ancien format du parent : rien de proposé, rien de perdu');
assert(JSON.stringify(api.guideProposals('Avec qui :   ')) === '{}', 'réponse blanche : rien');

// ---- Sélection : bascule, plusieurs mots, texte libre séparé ----
const f = {}; api.guideParse(f, '');
const qui = Q('qui'), aq = api.guideAns(f, qui);
assert(api.guideCompose(f) === '' && !api.guideFilled(aq), 'départ : rien d’écrit, question non remplie');
api.guideToggle(aq, 'Client');
assert(JSON.stringify(aq.picks) === '["Client"]' && aq.text === '' && api.guideFilled(aq), 'toucher un mot le SÉLECTIONNE ; rien n’est écrit dans la case de texte');
api.guideToggle(aq, 'Équipe');
assert(JSON.stringify(aq.picks) === '["Client","Équipe"]', 'plusieurs mots possibles par question');
api.guideToggle(aq, 'Client');
assert(JSON.stringify(aq.picks) === '["Équipe"]' && api.guideFilled(aq), 'toucher de nouveau le DÉSÉLECTIONNE');
api.guideToggle(aq, 'Équipe');
assert(aq.picks.length === 0 && !api.guideFilled(aq), 'plus aucun mot et pas de texte : question non remplie');
// texte seul / mots seuls / les deux
const ouQ = Q('ou'), ao = api.guideAns(f, ouQ);
ao.text = 'chez le client';
assert(api.guideFilled(ao) && api.guideCompose(f) === 'Lieu : chez le client', 'texte seul : question remplie');
const quoiQ = Q('quoi'), aqq = api.guideAns(f, quoiQ);
api.guideToggle(aqq, 'Outils'); api.guideToggle(aqq, 'Documents');
assert(api.guideCompose(f) === 'Avec quoi : outils, documents · Lieu : chez le client', 'mots seuls : texte composé « libellé : mots » ; les deux : mots puis texte');
api.guideToggle(ao, 'En ligne');
assert(api.guideCompose(f) === 'Avec quoi : outils, documents · Lieu : en ligne, chez le client', 'mots sélectionnés ET texte écrit, ensemble');

// ---- Enregistrement et relecture ----
const saved = api.guideCompose(f), g2 = {};
api.guideParse(g2, saved);
assert(JSON.stringify(api.guideAns(g2, quoiQ).picks) === '["Outils","Documents"]' && api.guideAns(g2, quoiQ).text === '', 'relecture : mots sélectionnés retrouvés');
assert(JSON.stringify(api.guideAns(g2, ouQ).picks) === '["En ligne"]' && api.guideAns(g2, ouQ).text === 'chez le client', 'relecture : mots ET texte retrouvés séparément');
assert(api.guideCompose(g2) === saved, 'enregistrement puis relecture : texte identique (aucune perte)');
const legacy = {}; api.guideParse(legacy, 'Obstacle : temps, argent, manque de budget · Raison : santé · note libre');
assert(JSON.stringify(api.guideAns(legacy, Q('obstacle')).picks) === '["Temps","Argent"]' && api.guideAns(legacy, Q('obstacle')).text === 'manque de budget' && /Raison : santé · note libre/.test(api.guideCompose(legacy)), 'ancienne description : réponses reconnues, texte inconnu conservé');

// ---- La proposition n'est pas une réponse ----
const child = {}; api.guideParse(child, '');
child.proposed = api.guideProposals(full);
assert(api.guideCompose(child) === '' && !api.guideFilled(api.guideAns(child, qui)), 'enfant : une proposition du parent non touchée n’est ni enregistrée ni comptée');
const aqu = api.guideAns(child, qui); aqu.picks = child.proposed.qui.picks.slice(); aqu.text = child.proposed.qui.text; aqu.touched = true; // toucher la proposition = valider
assert(api.guideCompose(child) === 'Avec qui : client, équipe, ma voisine' && api.guideFilled(aqu), 'validée : mots et texte du parent enregistrés, la question compte');

// ---- Compteur « n/3 » par groupe ----
const cnt = (form, grp) => grp.qs.filter((g) => api.guideFilled(api.guideAns(form, g))).length;
const ctxGroup = api.GUIDE_GROUPS[1];
assert(ctxGroup.g === 'Le contexte' && api.GUIDE_GROUPS[0].g === 'Le travail' && api.GUIDE_GROUPS[2].g === 'Les précisions', 'titres des trois groupes : Le travail, Le contexte, Les précisions');
assert(cnt(f, ctxGroup) === 3 - 1 && cnt(f, api.GUIDE_GROUPS[0]) === 0 && cnt(f, api.GUIDE_GROUPS[2]) === 0, 'compteur : une question avec un mot OU du texte compte (2/3 ici), sinon 0');
assert(cnt(child, ctxGroup) === 1, 'compteur : seulement ce qui est validé par la personne');

// ---- Garde statique : lecture seule, composants existants, aucun appel payant ----
const ra = src.indexOf('    function refreshHints()'), rb = src.indexOf('    form._hints = refreshHints;');
const body = src.slice(ra, rb);
assert(ra > 0 && rb > ra, 'refreshHints trouvé');
assert(!/'PUT'|'DELETE'|api\('POST', '\/api\/objectifs'[,)]/.test(body) && !/anthropic|callModel/i.test(body) && !/objectifs\/(proposition|contexte|macro)/.test(body), 'refreshHints : aucune écriture, aucun appel IA');
assert(/btn\('cmpBtn cmpBtnIdle', tr\('Proposé'\)/.test(src) && src.includes("btn(on ? 'active' : '', tr(o)"), 'proposition = bouton cmpBtn atténué ; mots = boutons à bascule (état « active » des choix de l’app)');
assert(src.includes("btn('objGuideHead cmpToggle'") && src.includes("el('span', 'cmpChev' + (open ? ' open' : ''))") && src.includes("filled + '/' + grp.qs.length"), 'cellule repliable : titre, compteur « n/3 », flèche R21 (.cmpChev)');
assert(src.includes('if (form.guideOpen === undefined) form.guideOpen = 0;') && !/localStorage|sessionStorage/.test(src.slice(a, src.indexOf('  // Terme (Périodique'))), '« Le travail » déplié par défaut ; l’état déplié/replié ne s’enregistre pas');
assert(/GUIDE_FROM_PARENT = \['qui', 'quoi', 'ou', 'nom', 'horssujet'\]/.test(src), 'les cinq clés exactes');

console.log(failed ? '\ndescription-parent-test : ' + failed + ' ÉCHEC(S)' : '\ndescription-parent-test : OK');
process.exit(failed ? 1 : 0);
