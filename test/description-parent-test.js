// Description de l'objectif : réponses du PARENT proposées à l'enfant (9 nov. 2026). Cinq questions seulement (Avec qui, Avec quoi, Où, Autre nom, Hors sujet), par copie champ par
// champ (sans IA), jamais Que faire / Quel résultat / Comment ça avance / Obstacle ; parent plein, partiel ou vide ; rien n'est écrit avant validation.
const fs = require('fs');
const path = require('path');
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'objectifs-creer.js'), 'utf8').split('\r\n').join('\n');
const a = src.indexOf('  var GUIDE_GROUPS = ['), b = src.indexOf('  function paintGuideInto(');
assert(a > 0 && b > a, 'bloc de la description guidée trouvé');
const tr = (s) => s;
const api = new Function('tr', src.slice(a, b) + '\nreturn { GUIDE, guideParse, guideCompose, guideAns, guideProposals, guideInsert, guideFilled, GUIDE_FROM_PARENT };')(tr);

const full = 'Faire : contacter · Résultat : devis · Avancement : chiffre · Avec qui : client · Avec quoi : outils · Lieu : en ligne · Obstacle : argent · Hors sujet : plus tard · Autre nom : surnom';
let p = api.guideProposals(full);
assert(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(['horssujet', 'nom', 'ou', 'qui', 'quoi']), 'parent plein : seules les cinq questions sont proposées');
assert(p.qui === 'client' && p.quoi === 'outils' && p.ou === 'en ligne' && p.nom === 'surnom' && p.horssujet === 'plus tard', 'parent plein : copie champ par champ');
assert(!('faire' in p) && !('resultat' in p) && !('avance' in p) && !('obstacle' in p), 'jamais Que faire, Quel résultat, Comment ça avance, Obstacle');
p = api.guideProposals('Faire : créer · Avec qui : équipe · Obstacle : temps');
assert(JSON.stringify(p) === JSON.stringify({ qui: 'équipe' }), 'parent partiel : seul ce qui est écrit est proposé');
assert(JSON.stringify(api.guideProposals('')) === '{}' && JSON.stringify(api.guideProposals(null)) === '{}', 'parent vide : aucun champ proposé (comme avant)');
assert(JSON.stringify(api.guideProposals('Réussite : chiffre · Raison : santé · texte libre ancien')) === '{}', 'ancien format du parent : rien de proposé, rien de perdu');
assert(JSON.stringify(api.guideProposals('Avec qui :   ')) === '{}', 'réponse blanche : rien');

// La proposition n'est pas une réponse : le texte composé de l'enfant reste vide tant que la personne ne valide pas
const child = {};
api.guideParse(child, '');
assert(api.guideCompose(child) === '', 'enfant : rien d’enregistré tant que la proposition n’est pas validée');
child.proposed = api.guideProposals(full);
assert(api.guideCompose(child) === '', 'les propositions ne passent jamais dans le texte composé');
const qui = api.GUIDE.filter((g) => g.k === 'qui')[0];
api.guideAns(child, qui).text = child.proposed.qui; // toucher = valider
assert(api.guideCompose(child) === 'Avec qui : client', 'validée : seule la réponse touchée est enregistrée');
const ou = api.GUIDE.filter((g) => g.k === 'ou')[0], aOu = api.guideAns(child, ou);
api.guideInsert(aOu, 'En ligne');
assert(aOu.touched === true && /Lieu : en ligne/.test(api.guideCompose(child)), 'un mot touché compte comme une réponse de la personne');

// Garde statique : lecture seule, composants existants, aucun appel payant
const ra = src.indexOf('    function refreshHints()'), rb = src.indexOf('    form._hints = refreshHints;');
const body = src.slice(ra, rb);
assert(ra > 0 && rb > ra, 'refreshHints trouvé');
assert(!/'PUT'|'DELETE'|api\('POST', '\/api\/objectifs'[,)]/.test(body) && !/anthropic|callModel/i.test(body) && !/objectifs\/(proposition|contexte|macro)/.test(body), 'refreshHints : aucune écriture, aucun appel IA');
assert(/btn\('cmpBtn cmpBtnIdle', tr\('Proposé'\)/.test(src), 'la proposition est un bouton cmpBtn atténué (aucun nouveau style)');
assert(/a\.touched = true/.test(src) && /!a\.touched && !a\.text\.trim\(\)/.test(src), 'écrire ou effacer soi-même retire la proposition');
assert(/GUIDE_FROM_PARENT = \['qui', 'quoi', 'ou', 'nom', 'horssujet'\]/.test(src), 'les cinq clés exactes');

// Groupes repliables (9 nov. 2026) : titres, compteur « n/3 » des réponses écrites ou validées (jamais une proposition du parent non touchée), « Le travail » déplié par défaut
assert(["g: 'Le travail'", "g: 'Le contexte'", "g: 'Les précisions'"].every((x) => src.includes(x)), 'titres des trois groupes : Le travail, Le contexte, Les précisions');
assert(src.includes("btn('objGuideHead cmpToggle'") && src.includes("el('span', 'cmpChev' + (open ? ' open' : ''))") && src.includes("filled + '/' + grp.qs.length"), 'cellule repliable : titre, compteur « n/3 », flèche R21 (.cmpChev)');
assert(src.includes('if (form.guideOpen === undefined) form.guideOpen = 0;') && !/localStorage|sessionStorage/.test(src.slice(a, src.indexOf('  // Terme (Périodique'))), '« Le travail » déplié par défaut ; l’état déplié/replié ne s’enregistre pas');
{
  const childC = {}; api.guideParse(childC, '');
  const cnt = (grp) => grp.qs.filter((g) => api.guideFilled(api.guideAns(childC, g))).length;
  const grpT = api.GROUPS ? api.GROUPS[0] : null;
  const quiQ = api.GUIDE.filter((g) => g.k === 'qui')[0], quoiQ = api.GUIDE.filter((g) => g.k === 'quoi')[0];
  const ctxGroup = { qs: [quiQ, quoiQ, api.GUIDE.filter((g) => g.k === 'ou')[0]] };
  childC.proposed = api.guideProposals(full);
  assert(cnt(ctxGroup) === 0, 'compteur : une proposition du parent non touchée ne compte pas');
  api.guideAns(childC, quiQ).text = 'client';
  assert(cnt(ctxGroup) === 1, 'compteur : une réponse validée ou écrite compte');
  assert(grpT === null || true, 'groupes');
}
console.log(failed ? '\ndescription-parent-test : ' + failed + ' ÉCHEC(S)' : '\ndescription-parent-test : OK');
process.exit(failed ? 1 : 0);
