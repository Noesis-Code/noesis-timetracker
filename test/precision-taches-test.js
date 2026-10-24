// Tests « Précision des tâches » (règles déterministes + harnais d'évaluation, fournisseur simulé, aucun réseau).
const os = require('os'), fs = require('fs'), path = require('path');
process.env.NOESIS_DATA_DIR = require('./lib/tmpdir').mkTmp('tmt-prec-');
process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
let failed = 0;
const assert = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const tp = require('../server/lib/taskprecision');

(async () => {
  assert(tp.cleanTitle('  - 1) Appeler le fournisseur. ') === 'Appeler le fournisseur', 'titre : puces, numérotation, point final retirés');
  assert(tp.cleanTitle('[ ] « Payer la TPS »;') === 'Payer la TPS', 'titre : case, guillemets, point-virgule');
  assert(tp.cleanTitle('Réunion à 10 h') === 'Réunion à 10 h', 'titre : contenu intact');
  assert(tp.matchesIgnore('Publier trois posts sur les réseaux sociaux', 'refonte du logo, réseaux sociaux') !== null, 'à ignorer : terme trouvé (pluriel, accents)');
  assert(tp.matchesIgnore('Écrire au webmestre', 'site web') === null, 'à ignorer : pas de faux positif partiel');
  assert(tp.matchesIgnore('Refaire le site vitrine', 'newsletter; refaire le site') !== null, 'à ignorer : séparateur point-virgule');
  assert(tp.matchesIgnore('Tout', '') === null, 'à ignorer : vide = rien');
  assert(tp.priorityRank('Prospecter de nouveaux clients PME', ['Terminer les projets', 'Prospecter de nouveaux clients', '']) === 2, 'priorité : rang 2');
  assert(tp.priorityRank('Ranger le bureau', ['Prospecter', '', '']) === 0, 'priorité : aucune');
  assert(tp.sameTitle('Commander le café vert', 'commander le CAFÉ vert.'), 'doublon : casse/accents/ponctuation');
  assert(tp.sameTitle('Payer la facture du fournisseur', 'Facture fournisseur : payer') === true, 'doublon : mêmes mots, ordre libre');
  assert(!tp.sameTitle('Payer la facture du fournisseur', 'Payer la facture du transporteur'), 'doublon : un mot différent = distinct');
  assert(tp.sameTitle('Commander les légumes pour la semaine', 'Commande de légumes pour la semaine'), 'doublon : commander/commande (racine)');
  assert(tp.matchesIgnore('Embaucher un employé', 'embauche') !== null, 'à ignorer : embaucher/embauche (racine)');
  assert(tp.stem('terrasse') === tp.stem('terase'), 'racine : faute de frappe (lettre doublée)');
  assert(tp.actionHints('Payer la facture du fournisseur').length >= 1 && tp.actionHints('Appeler Marc').length === 0, 'action : verbe d\'ouverture connu seulement');

  // Tâches proposées par l'IA (24 oct.) : consigne sans cible, antécédent absent, objet absent, lot contradictoire, reformulations.
  const why = (t) => tp.checkGenerated(t, []).reason;
  ['Simplifier', 'Simplifier le processus', 'Améliorer le système', 'Simplify the process'].forEach((t) => assert(why(t) === 'sansObjet', 'sans cible : « ' + t + ' » écarté'));
  ['Faire le point', 'Faire un bilan'].forEach((t) => assert(why(t) === 'sansObjet', 'sans objet concret : « ' + t + ' » écarté'));
  ['Avancer', 'Travailler sur le projet'].forEach((t) => assert(why(t) === 'sansSens', 'sans objet concret : « ' + t + ' » écarté'));
  ['Le relire', 'Envoyer ça', 'Finir celui-ci', 'Relire ce document', 'Send it'].forEach((t) => assert(why(t) === 'sansAntecedent', 'antécédent absent : « ' + t + ' » écarté'));
  ['Simplifier le processus de paie', 'Faire le point avec Paul', 'Relire le contrat de bail', 'Envoyer ce document à Paul', 'Le livre de comptes', 'La poste', 'Revoir le budget'].forEach((t) => assert(why(t) === null, 'titre précis conservé : « ' + t + ' »'));
  assert(tp.contradicts('Ajouter le bouton Exporter', 'Retirer le bouton Exporter') && tp.contradicts('Add X field', 'Remove the X field'), 'lot : Ajouter X / Retirer X détecté (fr/en)');
  assert(!tp.contradicts('Ajouter un bouton', 'Retirer un bouton de partage') && !tp.contradicts('Créer le dossier clients', 'Supprimer le dossier fournisseurs') && !tp.contradicts('Ajouter le champ A', 'Ajouter le champ B'), 'lot : objets différents ou même sens = pas de contradiction');
  assert(JSON.stringify(tp.contradictionsInBatch(['Ajouter le bouton Exporter', 'Appeler Paul', 'Retirer le bouton Exporter'])) === '[-1,-1,0]', 'lot : le titre le plus récent pointe le plus ancien');
  assert(tp.sameTitle('Rédiger le courriel de relance au client', 'Écrire un mail de relance au client', true) && tp.sameTitle('Envoi de la facture à Paul', 'Envoyer la facture à Paul', true) && tp.sameTitle('Mettre à jour la page des tarifs', 'Actualiser la page des tarifs', true), 'doublon : reformulations (synonymes courts, nom d\'action)');
  assert(!tp.sameTitle('Payer la facture à Paul', 'Envoyer la facture à Paul') && !tp.sameTitle('Écrire à Paul', 'Écrire à Marie') && !tp.sameTitle('Acheter du café', 'Vendre du café') && !tp.sameTitle('Acheter du café', 'Commander du café') && !tp.sameTitle('Envoyer la facture', 'Relire la facture') && !tp.sameTitle('Écrire un courriel à Paul', 'Appeler Paul'), 'doublon : tâches réellement différentes jamais fusionnées');
  // Corrections du 24 oct. : synonymes réservés à l'IA, synonymes ambigus retirés, objets distincts, paires réversibles, titres génériques.
  assert(tp.sameTitle('Écrire un mail à Paul', 'Rédiger un courriel à Paul', true) && !tp.sameTitle('Écrire un mail à Paul', 'Rédiger un courriel à Paul') && !tp.isDuplicate('Mettre à jour la page des tarifs', ['Actualiser la page des tarifs']) && tp.isDuplicate('Mettre à jour la page des tarifs', ['Actualiser la page des tarifs'], true), 'doublon : table de synonymes seulement pour l\'IA (sans drapeau = comportement d\'origine)');
  assert(!tp.sameTitle('Régler la facture', 'Payer la facture', true) && !tp.sameTitle('Composer le menu', 'Rédiger le menu', true) && !tp.sameTitle('Contrôle de la caisse', 'Vérifier la caisse', true) && tp.sameTitle('Contrôler la caisse', 'Vérifier la caisse', true), 'doublon : regler, composer, controle ne sont plus des synonymes');
  assert(!tp.contradicts('Accepter le devis A', 'Refuser le devis B') && !tp.contradicts('Accepter le devis 1', 'Refuser le devis 2') && tp.contradicts('Accepter le devis A', 'Refuser le devis A'), 'lot : une lettre ou un chiffre isolé distingue l\'objet');
  assert(!tp.contradicts('Ouvrir le compte', 'Fermer le compte') && !tp.contradicts('Lancer le serveur', 'Arrêter le serveur') && !tp.contradicts('Créer le dossier clients', 'Supprimer le dossier clients') && tp.contradicts('Ajouter le bouton Exporter', 'Retirer le bouton Exporter'), 'lot : ouvrir/fermer, lancer/arrêter, créer/supprimer ne rejettent plus');
  assert(tp.checkGenerated('Revoir le dossier Martin', []).title === 'Revoir le dossier Martin' && tp.checkGenerated('Revoir le dossier', []).reason === null && tp.checkGenerated('Simplifier le processus', []).reason === 'sansObjet', 'titres génériques : revoir et dossier retirés, simplifier le processus toujours écarté');
  assert(tp.cleanTitle('Le relire') === 'Le relire', 'saisie : ces règles ne réécrivent aucun titre (le rejet ne vise que les tâches proposées)');

  // Harnais (fournisseur simulé) : garde-fous de non-régression.
  const ev = require('../scripts/eval-task-precision');
  const out = await ev.run({});
  const m = out.metrics;
  console.log('  métriques', JSON.stringify(m));
  assert(m.cas >= 60, 'jeu d\'évaluation : au moins 60 cas');
  assert(m.precision >= 95 && m.rappel >= 90, 'précision >= 95 % et rappel >= 90 %');
  assert(m.refusJustes === 100, 'refus (à ignorer, doublons) : aucun faux refus');
  assert(out.rows.filter((r) => r.got.outcome === 'reject').every((r) => r.expected.outcome === 'reject'), 'aucun rejet injustifié');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/task-precision/cases.json'), 'utf8'));
  const manual = new Set(data.cases.filter((c) => c.kind === 'classify').map((c) => c.id));
  assert(out.rows.every((r) => !(manual.has(r.id) && r.got.outcome === 'reject')), 'saisie manuelle : jamais rejetée par « à ignorer »');
  const strict = await ev.run({ minConfidence: 100 });
  assert(strict.metrics.tauxIncertitude > m.tauxIncertitude, 'seuil plus haut : plus d\'incertitude (le seuil agit)');
  const injected = await ev.run({ provider: { name: 'x', async classify() { return { key: 'compta', confidence: 99 }; } } });
  assert(injected.provider === 'x', 'fournisseur injectable');

  // Intégration documenttasks.parseDetailed : « à ignorer » strict + doublon + titre propre.
  const db = require('../server/db');
  const goals = require('../server/lib/goals');
  const strategy = require('../server/lib/strategy');
  const dt = require('../server/lib/documenttasks');
  db.prepare("INSERT INTO users (id, name, createdAt) VALUES ('o', 'o', datetime('now'))").run();
  const act = db.prepare("INSERT INTO activities (name, ownerId, createdAt) VALUES ('A','o','')").run().lastInsertRowid;
  db.prepare("INSERT INTO activity_members (activityId, userId, color, joinedAt) VALUES (?,?,'#fff','')").run(act, 'o');
  // hasOpenDuplicate (capture MANUELLE) : comportement d'origin/staging, sans la table de synonymes de l'IA.
  { const sp = db.prepare("INSERT INTO sub_projects (activityId, name, createdBy, createdAt) VALUES (?, 'P', 'o', '')").run(act).lastInsertRowid;
    const sec = db.prepare("INSERT INTO sub_project_sections (subProjectId, kind, createdBy, createdAt) VALUES (?, 'tasks', 'o', '')").run(sp).lastInsertRowid;
    ['Appeler le plombier', 'Écrire un mail à Paul', 'Mettre à jour la page des tarifs', 'Régler la facture'].forEach((l, i) => db.prepare("INSERT INTO sub_project_items (subProjectId, sectionId, label, done, position, createdAt) VALUES (?, ?, ?, 0, ?, '')").run(sp, sec, l, i));
    const hod = require('../server/lib/goalstaskclassify').hasOpenDuplicate;
    assert(hod(act, 'Appeler plombier') && hod(act, 'écrire un mail à paul.'), 'hasOpenDuplicate : doublons d\'origine toujours détectés');
    assert(!hod(act, 'Rédiger un courriel à Paul') && !hod(act, 'Actualiser la page des tarifs') && !hod(act, 'Payer la facture'), 'hasOpenDuplicate inchangé : aucun synonyme de l\'IA à la capture manuelle'); }
  strategy.set(act, 'o', { ignore: 'réseaux sociaux, embauche' });
  const ctx = { candidates: [{ key: 'k1', label: 'Ventes' }], weeks: [], activityId: act, today: '2026-10-19' };
  const text = JSON.stringify({ t: [
    { title: '- Publier sur les réseaux sociaux.', key: 'k1' },
    { title: 'Appeler le client', key: 'k1' },
    { title: 'appeler le client.', key: 'k1' },
    { title: 'Préparer l\'embauche', key: 'k1' },
  ] });
  const r = dt.parseDetailed(text, ctx);
  assert(r.tasks.length === 1 && r.tasks[0].title === 'Appeler le client', 'documenttasks : 1 tâche retenue, titre propre');
  assert(r.dropped.ignore === 2 && r.dropped.doublon === 1, 'documenttasks : 2 ignorées, 1 doublon');
  const lot = dt.parseDetailed(JSON.stringify({ t: [
    { title: 'Ajouter le bouton Exporter', key: 'k1' }, { title: 'Retirer le bouton Exporter', key: 'k1' },
    { title: 'Simplifier le processus', key: 'k1' }, { title: 'Le relire', key: 'k1' }, { title: 'Faire le point', key: 'k1' },
    { title: 'Appeler le fournisseur de grains', key: 'k1' },
  ] }), { ...ctx, activityId: null });
  assert(lot.tasks.length === 2 && lot.tasks[0].title === 'Ajouter le bouton Exporter' && lot.tasks[1].title === 'Appeler le fournisseur de grains', 'documenttasks : lot contradictoire = une seule proposée (la première), vagues et antécédent écartés');
  assert(lot.dropped.invalide === 4 && lot.dropped.raisons.contradiction === 1 && lot.dropped.raisons.sansObjet === 2 && lot.dropped.raisons.sansAntecedent === 1, 'documenttasks : raisons comptées, rien d\'affiché');
  const ctx2 = { ...ctx, activityId: null };
  assert(dt.parseDetailed(text, ctx2).dropped.ignore === 0, 'sans activité/stratégie : rien d\'écarté');

  console.log(failed ? `${failed} échec(s)` : 'tout passe');
  process.exit(failed ? 1 : 0);
})();
