#!/usr/bin/env node
// Contrôle avant d'activer l'achat Expansion en production (lecture seule, aucun réseau, aucun secret imprimé).
// Usage (Railway > service de production > Shell) : node scripts/preflight-expansion.js
// Code de sortie : 0 = tout est OK, 1 = au moins une ligne « À CORRIGER ». N'ouvre jamais la base en écriture,
// ne charge pas server/db.js (aucune migration déclenchée) ; des clés on ne lit que le préfixe sk_live / sk_test.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function run(env, dataDir, now) {
  const L = [];
  const ok = (m) => L.push('OK         ' + m);
  const ko = (m) => L.push('À CORRIGER ' + m);
  const v = (k) => (env[k] === undefined ? '' : String(env[k]));
  const set = (k) => v(k).trim() !== '';
  const dirty = (k) => v(k) !== '' && v(k) !== v(k).trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  const staging = v('RAILWAY_ENVIRONMENT_NAME') === 'staging';
  const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_OFFER1_PRICE_ID', 'OFFER_CHECKOUT_OPEN', 'EXPANSION_MAILS', 'RESEND_API_KEY', 'RESEND_FROM', 'EXPANSION_PLAN_MAX_ATTEMPTS'];

  // Variables
  const sale = names.filter((k) => dirty(k) || (v(k) !== '' && !set(k)));
  if (sale.length) ko('variable(s) avec espace, guillemets ou retour de ligne autour de la valeur : ' + sale.join(', '));
  const key = v('STRIPE_SECRET_KEY');
  const live = /^(sk|rk)_live/.test(key), test = /^(sk|rk)_test/.test(key);
  if (staging) {
    if (live) ko('STRIPE_SECRET_KEY est une clé live sur staging (ignorée) : poser une clé de test');
    else ok('staging : ' + (test ? 'clé de test' : 'pas de clé') + ', aucun vrai paiement possible');
  } else if (!set('STRIPE_SECRET_KEY')) ko('STRIPE_SECRET_KEY absente');
  else if (live) ok('STRIPE_SECRET_KEY : clé live (sk_live)');
  else if (test) ko('STRIPE_SECRET_KEY : clé de test (sk_test) en production, aucun vrai paiement ne serait encaissé');
  else ko('STRIPE_SECRET_KEY : format inattendu (attendu sk_live_…)');
  if (/^whsec_/.test(v('STRIPE_WEBHOOK_SECRET').trim())) ok('STRIPE_WEBHOOK_SECRET posée (whsec_)'); else ko('STRIPE_WEBHOOK_SECRET absente ou format inattendu (whsec_…)');
  if (/^price_/.test(v('STRIPE_OFFER1_PRICE_ID').trim())) ok('STRIPE_OFFER1_PRICE_ID posée (price_)'); else ko('STRIPE_OFFER1_PRICE_ID absente ou format inattendu (price_…)');
  const open = v('OFFER_CHECKOUT_OPEN');
  if (open === '1') ok('OFFER_CHECKOUT_OPEN=1 : achat OUVERT'); else if (open === '') ok('OFFER_CHECKOUT_OPEN absente : achat fermé (à poser en dernier)'); else ko('OFFER_CHECKOUT_OPEN : valeur ignorée (seule la valeur 1 ouvre)');
  if (v('EXPANSION_MAILS') === '1') {
    if (set('RESEND_API_KEY') && set('RESEND_FROM')) ok('courriels actifs : RESEND_API_KEY et RESEND_FROM posées');
    else ko('EXPANSION_MAILS=1 sans ' + [set('RESEND_API_KEY') ? '' : 'RESEND_API_KEY', set('RESEND_FROM') ? '' : 'RESEND_FROM'].filter(Boolean).join(' ni '));
  } else if (v('EXPANSION_MAILS') === '') ok('EXPANSION_MAILS absente : aucun courriel (à poser après Resend)');
  else ko('EXPANSION_MAILS : valeur ignorée (seule la valeur 1 active)');
  const mx = v('EXPANSION_PLAN_MAX_ATTEMPTS');
  if (mx === '' || /^[1-9][0-9]*$/.test(mx.trim())) ok('EXPANSION_PLAN_MAX_ATTEMPTS ' + (mx === '' ? 'absente (3 par jour)' : 'valide')); else ko('EXPANSION_PLAN_MAX_ATTEMPTS : doit être un entier positif (ou absente)');

  // Base (lecture seule)
  const file = path.join(dataDir, 'noesis.db');
  if (!fs.existsSync(file)) { ko('base introuvable (' + file + ') : mauvais NOESIS_DATA_DIR ?'); return L; }
  let db;
  try { db = new DatabaseSync(file, { readOnly: true }); } catch (e) { ko('base illisible : ' + String(e.message).slice(0, 80)); return L; }
  try {
    const has = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    const col = (t, c) => has(t) && db.prepare('PRAGMA table_info(' + t + ')').all().some((x) => x.name === c);
    const miss = [];
    for (const t of ['activity_subscriptions', 'sub_projects', 'plan_activation_attempts', 'stripe_webhook_events']) if (!has(t)) miss.push('table ' + t);
    if (!col('activity_subscriptions', 'cancelAtPeriodEnd')) miss.push('colonne activity_subscriptions.cancelAtPeriodEnd');
    if (!col('sub_projects', 'slot')) miss.push('colonne sub_projects.slot');
    if (miss.length) ko('base à migrer (démarrer la dernière version une fois) : ' + miss.join(', ')); else ok('tables et colonnes Expansion présentes');
    if (col('sub_projects', 'slot')) {
      const idx = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='uniq_sub_projects_activity_slot'").get();
      const dup = db.prepare('SELECT COUNT(*) n FROM (SELECT 1 FROM sub_projects WHERE slot IS NOT NULL GROUP BY activityId, slot HAVING COUNT(*) > 1)').get().n;
      if (idx) ok('index unique (activityId, slot) posé');
      else ko('index unique (activityId, slot) absent' + (dup ? ' : ' + dup + ' doublon(s), ids dans le journal de démarrage « [db] DOUBLONS », à nettoyer puis redémarrer' : ' : redémarrer le service pour le poser'));
    }
    if (has('activity_subscriptions')) {
      const orph = db.prepare("SELECT COUNT(*) n FROM activity_subscriptions s WHERE s.status IN ('active','past_due','trialing','incomplete') AND (NOT EXISTS (SELECT 1 FROM activities a WHERE a.id = s.activityId) OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.userId))").get().n;
      if (orph) ko(orph + ' abonnement(s) en cours dont l\'activité ou le compte n\'existe plus'); else ok('aucun abonnement orphelin');
      if (col('sub_projects', 'slot')) {
        const lim = new Date(now - 3600 * 1000).toISOString();
        const pend = db.prepare("SELECT COUNT(*) n FROM activity_subscriptions s WHERE s.status = 'active' AND s.createdAt < ? AND NOT EXISTS (SELECT 1 FROM sub_projects p WHERE p.activityId = s.activityId AND p.slot IS NOT NULL)").get(lim).n;
        if (pend) ko(pend + ' activation(s) de plan en attente depuis plus d\'une heure (abonné payé sans plan : voir journaux, reprise horaire)'); else ok('aucune activation de plan en attente depuis plus d\'une heure');
      }
    }
    if (has('stripe_webhook_events')) {
      const lim = new Date(now - 3600 * 1000).toISOString();
      const bad = db.prepare('SELECT COUNT(*) n FROM stripe_webhook_events WHERE processedAt IS NULL AND receivedAt < ?').get(lim).n;
      if (bad) ko(bad + ' événement(s) Stripe reçu(s) mais non traité(s) depuis plus d\'une heure'); else ok('aucun événement Stripe bloqué');
    }
  } catch (e) { ko('contrôle de la base interrompu : ' + String(e.message).slice(0, 80)); }
  finally { try { db.close(); } catch (e) { /* ignoré */ } }
  return L;
}

function dataDirOf(env) { return env.NOESIS_DATA_DIR ? path.resolve(env.NOESIS_DATA_DIR) : path.join(__dirname, '..', 'data'); }

if (require.main === module) {
  const lines = run(process.env, dataDirOf(process.env), Date.now());
  const bad = lines.filter((l) => l.startsWith('À CORRIGER')).length;
  console.log(lines.join('\n'));
  console.log(bad ? '=> ' + bad + ' point(s) À CORRIGER avant d\'ouvrir l\'achat.' : '=> Tout est OK : l\'achat peut être ouvert (OFFER_CHECKOUT_OPEN=1 en dernier).');
  process.exit(bad ? 1 : 0);
}
module.exports = { run };
