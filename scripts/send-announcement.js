#!/usr/bin/env node
// Diffuse une ANNONCE a tous les utilisateurs : l'insere dans `announcements`
// (texte complet, affiche dans l'app une seule fois par profil) et envoie un
// push a TOUS les abonnes. A lancer UNIQUEMENT a la main, jamais automatiquement.
//
//   node scripts/send-announcement.js --dry-run "<texte>"
//   node scripts/send-announcement.js "<texte>"
//   node scripts/send-announcement.js --file annonce.txt [--dry-run]
//
// Environnement : celui des variables NOESIS_DATA_DIR / NOESIS_VAPID_* de la
// base visee (sur Railway : `railway run`/shell du service web, volume /data).
// Sans clés VAPID, l'annonce est inseree mais aucun push ne part.
//
// Exemple de texte (titre affiche : toujours « Noèsis », tout le texte = corps) :
//   📢 Avis à nos deux fidèles utilisateurs (Max peut aller se faire cuire un œuf) !
//   Le dimanche 11 octobre, l'app se refait une beauté. Nouveau style visuel plus
//   calme, nouveau volet de planification des tâches générées par l'IA, et l'Offre 1
//   offerte pendant un mois pour que vous puissiez la tester et nous donner vos retours !


const fs = require('fs');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
let text = '';
const fi = args.indexOf('--file');
if (fi !== -1) text = fs.readFileSync(args[fi + 1], 'utf8');
else text = args.filter((a) => !a.startsWith('--')).join(' ');
text = text.trim();
if (!text) {
  console.error('Usage : node scripts/send-announcement.js [--dry-run] "<texte>" | --file <fichier>');
  process.exit(1);
}

const db = require('../server/db');
const push = require('../server/lib/push');

const ids = push.allSubscribedUserIds();
const total = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
console.log('Texte (' + text.length + ' car.) :\n' + text + '\n');
console.log('Destinataires push : ' + ids.length + ' profil(s) abonné(s) sur ' + total + ' (push ' + (push.pushEnabled() ? 'configuré' : 'NON configuré : aucun push ne partira') + ').');
if (dryRun) {
  ids.forEach((id) => {
    const u = db.prepare('SELECT name FROM users WHERE id = ?').get(id);
    console.log(' - ' + (u ? u.name : id));
  });
  console.log('--dry-run : rien n\'a été écrit ni envoyé.');
  process.exit(0);
}

const title = 'Noèsis';
const r = db.prepare('INSERT INTO announcements (title, body, createdAt) VALUES (?, ?, ?)').run(title, text, new Date().toISOString());
console.log('Annonce #' + r.lastInsertRowid + ' enregistrée.');
push.notifyAnnouncement(text).then((n) => {
  console.log('Push envoyé à ' + n + ' profil(s).');
  process.exit(0);
});
