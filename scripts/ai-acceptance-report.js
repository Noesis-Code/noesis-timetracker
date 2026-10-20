// Mesure de l'apprentissage par l'usage (20 oct. 2026), LECTURE SEULE, aucun jeton, aucune interface.
// Usage : NOESIS_DATA_DIR=... node scripts/ai-acceptance-report.js [jours=30]
// Signaux déjà stockés : tâches classées par l'IA (autoCaptured), corrections du classement (goal_classify_examples),
// propositions de modification (change_proposals : accepted (ou applied) / dismissed / pending / inapplicable), suggestions inter-secteurs (goal_cross_sector_suggestions).
// Approximations assumées : « modifiée » = déplacée à la main (correction enregistrée) ; « sans modification » = classée - corrigée ;
// pas de signal pour la reformulation (rien n'est stocké côté serveur).
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const days = Math.max(1, Math.floor(Number(process.argv[2])) || 30);
const DATA_DIR = process.env.NOESIS_DATA_DIR ? path.resolve(process.env.NOESIS_DATA_DIR) : path.join(__dirname, '..', 'data');
const file = path.join(DATA_DIR, 'noesis.db');
if (!fs.existsSync(file)) { console.log('Aucune base : ' + file); process.exit(0); }
const db = new DatabaseSync(file, { readOnly: true });
const since = new Date(Date.now() - days * 86400000).toISOString();
const q = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch (e) { return []; } };
const pct = (n, d) => (d ? Math.round(100 * n / d) + ' %' : 'n/a');

const classified = (q('SELECT COUNT(*) AS n FROM sub_project_items WHERE autoCaptured = 1 AND createdAt >= ?', since)[0] || {}).n || 0;
const corrected = (q('SELECT COUNT(*) AS n FROM goal_classify_examples WHERE createdAt >= ?', since)[0] || {}).n || 0;
const kept = Math.max(0, classified - corrected);
console.log('Apprentissage par l\'usage — ' + days + ' j\n');
console.log('Classement de tâche : ' + classified + ' classée(s) par l\'IA | sans modification ' + kept + ' (' + pct(kept, classified) + ') | modifiée(s) à la main ' + corrected + ' (' + pct(corrected, classified) + ')');
const perUser = q('SELECT userId, COUNT(*) AS n FROM goal_classify_examples WHERE createdAt >= ? GROUP BY userId ORDER BY n DESC', since);
console.log('  corrections par compte : ' + (perUser.length ? perUser.map((r) => (r.userId || 'supprimé') + '=' + r.n).join(', ') : 'aucune'));

// change_proposals.apply écrit « accepted » (valeur des lignes existantes) ; « applied » est lu aussi par sécurité : les deux comptent comme acceptées.
const prop = q("SELECT CASE WHEN status IN ('accepted','applied') THEN 'accepted' ELSE status END AS status, COUNT(*) AS n FROM change_proposals WHERE createdAt >= ? GROUP BY 1", since);
const pc = Object.fromEntries(prop.map((r) => [r.status, r.n]));
const pDecided = (pc.accepted || 0) + (pc.dismissed || 0);
console.log('Modifications proposées : acceptées ' + (pc.accepted || 0) + ' (' + pct(pc.accepted || 0, pDecided) + ') | refusées ' + (pc.dismissed || 0) + ' (' + pct(pc.dismissed || 0, pDecided) + ') | en attente ' + (pc.pending || 0) + ' | inapplicables ' + (pc.inapplicable || 0));
const prByField = q("SELECT field, CASE WHEN status IN ('accepted','applied') THEN 'accepted' ELSE status END AS status, COUNT(*) AS n FROM change_proposals WHERE createdAt >= ? AND status IN ('accepted','applied','dismissed') GROUP BY 1, 2", since);
prByField.forEach((r) => console.log('  ' + String(r.field).padEnd(14) + r.status.padEnd(10) + r.n));

const xs = q('SELECT status, COUNT(*) AS n FROM goal_cross_sector_suggestions WHERE createdAt >= ? GROUP BY status', since);
console.log('Suggestions inter-secteurs : ' + (xs.length ? xs.map((r) => r.status + ' ' + r.n).join(' | ') : 'aucune'));
console.log('Reformulation : aucun signal stocké (rien n\'est enregistré côté serveur).');

// Tâches générées : compteur agrégé journalier (generation_quality_log), sans titre ni compte.
const gq = q('SELECT feature, SUM(generated) AS g, SUM(rejected) AS r, SUM(cleaned) AS c FROM generation_quality_log WHERE day >= ? GROUP BY feature', since.slice(0, 10));
console.log('Tâches générées : ' + (gq.length ? gq.map((r) => r.feature + ' ' + r.g + ' générée(s), ' + r.r + ' rejetée(s) (' + pct(r.r, r.g) + '), ' + r.c + ' nettoyée(s)').join(' | ') : 'aucune mesure'));
