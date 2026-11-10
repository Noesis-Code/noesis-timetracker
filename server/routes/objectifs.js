// Objectifs de la Feuille de route (4 nov. 2026) : toute la logique est dans server/lib/objectifs.js.
// `contexte` et `proposition` ne créent rien ; seule la validation (POST /objectifs) écrit.
const express = require('express');
const objectifs = require('../lib/objectifs');

const router = express.Router();

function run(fn) {
  return async (req, res) => {
    if (!req.userId) return res.status(400).json({ error: 'userId requis.' });
    try { res.json(await fn(req)); } catch (err) {
      if (err && err.statusCode) return res.status(err.statusCode).json(Object.assign({ error: err.message }, err.extra || {}));
      console.error('[objectifs] ' + req.method + ' ' + req.originalUrl.split('?')[0], err);
      res.status(500).json({ error: 'Impossible pour le moment : réessaie dans un instant.' });
    }
  };
}

router.get('/objectifs', run((req) => ({ objectifs: objectifs.liste(req.userId, String(req.query.filtre || 'en_cours')) })));
router.post('/objectifs/contexte', run((req) => objectifs.contexte(req.userId, req.body || {})));
router.post('/objectifs/macro/titre', run((req) => require('../lib/objectifs-resume').titreMacro(req.userId, req.body || {})));
router.get('/objectifs/ordre', run((req) => require('../lib/objectifs-ordre').lire(req.userId, String(req.query.level || ''), req.query.scope, req.query.anchor)));
router.put('/objectifs/ordre', run((req) => require('../lib/objectifs-ordre').ecrire(req.userId, req.body || {})));
router.get('/objectifs/resume-annuel', run((req) => require('../lib/objectifs-resume').resumeAnnuel(req.userId, req.query.activityId, req.query.year)));
router.get('/objectifs/structure', run((req) => objectifs.structure(req.userId)));
router.get('/objectifs/reglage', run((req) => ({ anon: objectifs.anonOptIn(req.userId) })));
router.put('/objectifs/reglage', run((req) => objectifs.setAnon(req.userId, !(req.body && req.body.anon === false))));
router.post('/objectifs/case', run((req) => ({ occupant: objectifs.occupant(req.userId, req.body || {}) })));
router.get('/objectifs/temps', run((req) => require('../lib/tempsbudget').etat(req.userId, { activityId: req.query.activityId, level: req.query.level, poleKey: req.query.poleKey || null, categoryKey: req.query.categoryKey || null, endDate: req.query.endDate || null, inner: req.query.inner || null })));
router.post('/objectifs/temps/plan', run((req) => { const b = req.body || {}; return require('../lib/tempsbudget').plan(req.userId, b, b.apply === true); }));
router.post('/objectifs/niveau/questions', run((req) => require('../lib/objectifs-niveau').questions(req.userId, req.body || {})));
router.post('/objectifs/temps/suggestion', run((req) => require('../lib/objectifs-heures').suggest(req.userId, req.body || {}, require('../lib/dates').userToday())));
router.post('/objectifs/rattachement', run((req) => objectifs.rattachement(req.userId, req.body || {})));
router.post('/objectifs/proposition', run((req) => objectifs.proposer(req.userId, req.body || {})));
router.post('/objectifs', run(async (req) => { objectifs.checkEcheance(req.body || {}, null, true); return objectifs.creer(req.userId, req.body || {}); })); // échéance obligatoire, jamais passée
router.post('/objectifs/macro', run((req) => objectifs.fusionnerEnMacro(req.userId, req.body || {})));
router.get('/objectifs/:id', run((req) => objectifs.get(req.userId, req.params.id)));
router.put('/objectifs/:id/periodes/:n/semaines/:i', run((req) => objectifs.semaine(req.userId, req.params.id, req.params.n, req.params.i, req.body && req.body.done === true)));
router.post('/objectifs/:id/bilan', run((req) => objectifs.bilan(req.userId, req.params.id, String((req.body || {}).action || ''), (req.body || {}).period)));
router.put('/objectifs/:id/colonnes-vides', run((req) => objectifs.setEmptyColumns(req.userId, req.params.id, (req.body || {}).emptyColumns)));
router.put('/objectifs/:id/titre', run((req) => objectifs.renommer(req.userId, req.params.id, (req.body || {}).title)));
router.put('/objectifs/:id/description', run((req) => objectifs.decrire(req.userId, req.params.id, (req.body || {}).description)));
router.post('/objectifs/:id/parts/apercu', run((req) => objectifs.changerPart(req.userId, req.params.id, req.body || {}, false)));
router.put('/objectifs/:id/parts', run((req) => objectifs.changerPart(req.userId, req.params.id, req.body || {}, true)));
router.get('/objectifs/:id/jours', run((req) => objectifs.joursDefaut(req.userId, req.params.id, req.query.minutes)));
router.put('/objectifs/:id/parametres', run((req) => objectifs.parametres(req.userId, req.params.id, req.body || {})));
router.put('/objectifs/:id/echeance', run((req) => objectifs.modifierEcheance(req.userId, req.params.id, (req.body || {}).endDate)));
router.get('/objectifs/:id/macro', run((req) => objectifs.macroDe(req.userId, req.params.id)));
router.put('/objectifs/:id/macro', run((req) => objectifs.setMacro(req.userId, req.params.id, (req.body || {}).isMacro === true, (req.body || {}).anchor)));
router.put('/objectifs/:id/activite', run((req) => objectifs.deplacer(req.userId, req.params.id, (req.body || {}).activityId)));
router.post('/objectifs/:id/abandon', run((req) => objectifs.abandonner(req.userId, req.params.id, true)));
router.post('/objectifs/:id/reactiver', run((req) => objectifs.abandonner(req.userId, req.params.id, false)));
router.delete('/objectifs/:id', run((req) => objectifs.supprimer(req.userId, req.params.id, String(req.query.confirm || '') === '1')));
router.put('/objectifs/:id/parent', run((req) => objectifs.lier(req.userId, req.params.id, (req.body || {}).parentId == null ? null : Number((req.body || {}).parentId), (req.body || {}).rel)));
router.get('/objectifs/:id/refus', run((req) => ({ refus: objectifs.refusDe(req.userId, req.params.id) })));
router.post('/objectifs/:id/refus', run((req) => objectifs.refuser(req.userId, req.params.id, Number((req.body || {}).candidateId))));

module.exports = router;
