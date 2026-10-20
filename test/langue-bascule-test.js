// Usage : node test/langue-bascule-test.js — bascule de langue FR <-> EN en cours de session (Basic n°19).
// Navigateur réel (Chromium + Playwright, test/lib/langue-navigateur.py) : chrono démarré en français, bascule vers l'anglais par le vrai
// bouton, puis Chrono / Historique (menus, modification, semaine précédente) / récapitulatif d'arrêt (erreur serveur comprise) /
// Statistiques (périodes, graphique, filtre) : aucune chaîne française connue ne doit rester ; retour en français sans anglais ; chrono jamais perdu.
// Parties sans navigateur (toujours exécutées) : chaînes t() de l'application et messages serveur du Chrono, de l'Historique et des Stats traduits.
// Sans Chromium ou Playwright (poste sans navigateur) : la partie navigateur est ignorée, avec la raison affichée.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { startServer, makeCounter } = require('./fonctionnel-lib');
const T = makeCounter(); const assert = T.assert;
const rd = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const win = {}; win.window = win;
vm.runInNewContext(rd('public/i18n.js'), Object.assign(win, { document: { documentElement: { setAttribute() {} } }, console }));
const I = win.NoesisI18n;
const toEn = (s) => { I.setLang('en'); const r = I.t(s); I.setLang('fr'); return r; };
const SAME_IN_EN = new Set(['Public', 'Total', 'Minutes', 'Description', 'Date', 'importance', 'max. h', 'Expansion', 'Trade', 'Chrono', 'STOP']);

// ---- 1. Toute chaîne passée à t() par l'application a une traduction anglaise ----
const files = ['public/app.js'].concat(fs.readdirSync(path.join(__dirname, '..', 'public', 'js')).filter((f) => f.endsWith('.js')).map((f) => 'public/js/' + f));
const missing = [];
for (const f of files) {
  for (const m of rd(f).matchAll(/\bt\((["'])((?:\\.|(?!\1).)+)\1\s*[,)]/g)) {
    const k = m[2].replace(/\\u2019/g, '\u2019').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
    if (!/[A-Za-zÀ-ÿ]{2,}/.test(k) || SAME_IN_EN.has(k)) continue;
    if (toEn(k) === k) missing.push(f + ' : ' + k);
  }
}
assert(missing.length === 0, 't() : aucune chaîne sans traduction anglaise' + (missing.length ? ' — manquantes : ' + missing.join(' | ') : ''));

// ---- 2. Messages serveur du Chrono, de l'Historique et des Stats : traduits ----
const serverMsgs = ['Aucun chrono en cours.', "L'heure de fin doit être après l'heure de début.", 'Heures invalides (fin doit être après le début).', 'Heures invalides.',
  'Une entrée ne peut pas durer plus de 24 h.', 'Les heures ne peuvent pas être dans le futur.', 'Ces heures chevauchent une autre de tes entrées.', 'Activité invalide.',
  "Cette activité ne t'appartient pas.", 'Enregistrement introuvable.', "Ce n'est pas ton enregistrement.", 'Heure de début invalide.', 'Heure de fin invalide.',
  'Pôle ou secteur invalide pour cette activité.', 'Note trop longue (5000 caractères maximum).', 'Maximum 4 pièces jointes par session.', 'Fichier trop lourd (5 Mo max).',
  'Connexion impossible. Réessaie.', 'Erreur serveur', 'Profil introuvable.'];
const missingSrv = serverMsgs.filter((k) => toEn(k) === k);
assert(missingSrv.length === 0, 'messages serveur Chrono/Historique/Stats : tous traduits' + (missingSrv.length ? ' — manquants : ' + missingSrv.join(' | ') : ''));
// Les messages que le code serveur de ces routes peut renvoyer sont tous dans la liste ci-dessus ou déjà traduits.
const srvSrc = ['server/routes/timer.js', 'server/routes/history.js', 'server/lib/entryguard.js', 'server/lib/entrycategory.js'].map(rd).join('\n');
const srvMissing = new Set();
for (const m of srvSrc.matchAll(/(?:error\s*:|return)\s*(["'])((?:\\.|(?!\1).)+)\1/g)) {
  const k = m[2].replace(/\\'/g, "'");
  if (/^[A-ZÀ-Ý][^$]*\s/.test(k) && /[.!)]$/.test(k) && toEn(k) === k) srvMissing.add(k);
}
assert(srvMissing.size === 0, 'chaque message d\'erreur des routes chrono/historique est traduit' + (srvMissing.size ? ' — manquants : ' + [...srvMissing].join(' | ') : ''));

// ---- 3. Parcours navigateur ----
const FRENCH_WORDS = /\b(le|la|les|des|une|un|ton|tes|ta|pour|avec|dans|pas|est|aucun|aucune|ajouter|enregistrer|annuler|valider|supprimer|modifier|semaine|rien|cette|sur|du|au|aux|ou|et)\b/i;
const ENGLISH_WORDS = /\b(the|your|you|this|previous|next|nothing|recorded|record|running|week of)\b/i;
const ACCENT = /[àâäçéèêëîïôöûùüÿœÀÂÇÉÈÊÎÔÛÙ]/;
const BRAND = /No[eè]sis/gi;
(async () => {
  const chromium = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
  const probe = spawnSync('python3', ['-c', 'import playwright'], { encoding: 'utf8' });
  if (probe.status !== 0 || !fs.existsSync(chromium)) {
    console.log('  (navigateur absent : parcours Chromium ignoré — ' + (probe.status !== 0 ? 'Playwright Python manquant' : chromium + ' introuvable') + ')');
  } else {
    const s = await startServer();
    try {
      const r = spawnSync('python3', ['-I', path.join(__dirname, 'lib', 'langue-navigateur.py'), s.base, chromium], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 240000 });
      let out = null;
      try { out = JSON.parse(r.stdout); } catch (e) { /* sortie invalide */ }
      assert(!!out, 'parcours navigateur exécuté' + (out ? '' : ' : ' + (r.stderr || r.stdout || '').slice(-600)));
      if (out) {
        const { etats, infos } = out;
        assert(infos.langEn === 'en' && infos.runningEn === true && /Work/.test(infos.activityEn), 'bascule vers EN : le chrono démarré en français tourne toujours (' + infos.activityEn + ')');
        const secs = (hms) => { const m = /(\d+):(\d+):(\d+)/.exec(hms || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : -1; };
        assert(secs(infos.timerEn) >= secs(infos.startFr) && secs(infos.timerEn) < 120, 'durée du chrono conservée après la bascule (' + infos.startFr + ' -> ' + infos.timerEn + ')');
        assert(infos.runningAfterCancel === true, 'Annuler le récapitulatif d\'arrêt (en EN) : le chrono continue');
        assert(infos.langFr === 'fr' && infos.runningFr === true && secs(infos.timerFr) >= secs(infos.timerEn), 'retour en FR : le chrono tourne toujours, sans repartir de zéro (' + infos.timerFr + ')');
        assert(infos.serveurChronoEnCours === true, 'un seul chrono côté serveur après deux bascules');
        const names = Object.keys(etats);
        if (process.env.LANG_LOG) console.log(names.join(' / '));
        assert(names.some((n) => /^historique modification/.test(n)) && names.some((n) => /^arrêt refusé/.test(n)) && names.length >= 12, 'écrans parcourus : ' + names.length + ' états (dont modification d\'entrée et erreur du récapitulatif d\'arrêt)');
        const bad = [];
        for (const n of names) {
          const en = !/^retour français/.test(n);
          for (const raw of etats[n]) {
            const txt = raw.replace(BRAND, '').trim();
            if (!txt || /^[\d\s:/.\-‹›⋮✕+%h]+$/.test(txt)) continue;
            if (en) {
              if (toEn(raw) !== raw && !SAME_IN_EN.has(raw)) bad.push(n + ' : « ' + raw + ' » (clé française connue non traduite)');
              else if (ACCENT.test(txt) || FRENCH_WORDS.test(txt)) bad.push(n + ' : « ' + raw + ' » (français en mode anglais)');
            } else if (ENGLISH_WORDS.test(txt)) bad.push(n + ' : « ' + raw + ' » (anglais en mode français)');
          }
        }
        assert(bad.length === 0, 'aucune chaîne dans la mauvaise langue sur Chrono / Historique / Arrêt / Statistiques' + (bad.length ? ' — ' + [...new Set(bad)].slice(0, 40).join(' | ') : ''));
      }
    } finally { s.stop(); }
  }
  console.log(`\n${T.passed} ok, ${T.failed} échec(s)`);
  process.exit(T.failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
