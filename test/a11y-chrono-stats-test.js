// Usage : node test/a11y-chrono-stats-test.js — accessibilité clavier / lecteur d'écran des écrans Chrono et Stats (Basic n°17). Analyse de texte.
const fs = require('fs'), path = require('path');
const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const html = pub('index.html'), app = pub('app.js'), css = pub('styles.css'), pop = pub('js/a11y-popups.js'), i18n = pub('i18n.js');
let bad = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { bad++; console.log('  FAIL ' + l); } };
const tag = (id) => (html.match(new RegExp('<[a-z0-9]+\\b[^>]*\\bid="' + id + '"[^>]*>')) || [''])[0];

// Chronomètre : role="timer" (silencieux), jamais une région vive qui annoncerait chaque seconde.
const lt = tag('liveTimer');
ok(/role="timer"/.test(lt) && /aria-live="off"/.test(lt) && /aria-label=/.test(lt), '#liveTimer : role=timer, aria-live=off, nom');
const an = tag('chronoAnnounce');
ok(/role="status"/.test(an) && /aria-live="polite"/.test(an) && /class="srOnly"/.test(an), 'annonces : région polie réservée aux lecteurs d\'écran');
ok(/\.srOnly\s*\{[^}]*clip:/.test(css), '.srOnly masque sans display:none (lu par les lecteurs d\'écran)');
const upd = app.slice(app.indexOf('function updateLiveTimer()'), app.indexOf('function startLiveTimer'));
ok(/s === 0 && m % 10 === 0/.test(upd) && (upd.match(/announceChrono\(/g) || []).length === 2, 'annonce toutes les 10 minutes pleines seulement (jamais chaque seconde)');
ok(!/liveTimer'\)\.setAttribute\('aria-live', 'polite'/.test(app) && !/id="liveTimer"[^>]*aria-live="(polite|assertive)"/.test(html), '#liveTimer jamais en région vive');
ok(/role="status"/.test(tag('chronoStatus')), '#chronoStatus : messages (hors ligne, erreurs) annoncés');
ok(/role="alert"/.test(tag('stopConfirmMsg')), 'erreur du récapitulatif d\'arrêt annoncée');

// Récapitulatif d'arrêt : dans le flux de la page (non modal : pas de piège de tabulation, pas de focus automatique).
ok(/role="dialog"/.test(tag('stopConfirmPanel')) && !/aria-modal/.test(tag('stopConfirmPanel')) && /aria-labelledby="stopConfirmTitle"/.test(tag('stopConfirmPanel')), '#stopConfirmPanel : dialog nommé, non modal');
ok(!/SEL = '[^']*#stopConfirmPanel/.test(pop), '#stopConfirmPanel hors de la liste SEL (aucun piège de focus)');

// En-tête repliable de l'historique : atteignable et activable au clavier.
const hh = tag('chronoHistoryHeader');
ok(/role="button"/.test(hh) && /tabindex="0"/.test(hh) && /aria-expanded="false"/.test(hh) && /aria-controls="chronoHistoryPanel"/.test(hh), 'en-tête Historique : role=button, tabindex, aria-expanded, aria-controls');
ok(/chronoHistoryHeader'\)\.setAttribute\('aria-expanded'/.test(app), 'aria-expanded tenu à jour');
ok(/role'\) !== 'button'[\s\S]{0,200}t\.click\(\)/.test(pop) && /e\.key !== 'Enter' && e\.key !== ' '/.test(pop), 'Entrée / Espace activent tout role=button non natif (lignes de légende, en-têtes)');

// Menus : aria-haspopup + aria-expanded suivi.
for (const id of ['statsVisBtn', 'tsPeriodBtn', 'chartPeriodBtn']) ok(/aria-haspopup/.test(tag(id)) && /aria-expanded="false"/.test(tag(id)), id + ' : aria-expanded');
ok(/function syncMenus/.test(pop), 'aria-expanded suit l\'ouverture du menu');

// Onglet courant annoncé, champs nommés.
ok(/setAttribute\('aria-current', 'page'\)/.test(app), 'onglet courant : aria-current=page');
ok(/aria-labelledby="chronoCategoryLabel"/.test(tag('chronoCategoryPicker')) && /aria-labelledby="stopCategoryLabel"/.test(tag('stopCategoryPicker')), 'sélecteurs de pôle/secteur : groupe nommé');

// Graphiques : alternative texte résumée (donnée, pas seulement « Graphique »).
ok(/function chartSummary/.test(app) && /svg\.setAttribute\('role', 'img'\)[\s\S]{0,80}chartSummary\(sorted, series\)/.test(app), 'graphique : role=img + résumé (période, total par série)');
ok(/aria-label', \(\(ids && ids\.ariaLabel\)[\s\S]{0,400}formatHM\(a\.seconds\)[\s\S]{0,200}formatHM\(totalSeconds\)/.test(app), 'camembert : résumé de chaque part et du total');

// Zones tactiles >= 44 px (zone invisible), traductions des nouvelles chaînes.
for (const id of ['tsPeriodBtn', 'chartPeriodBtn', 'statsPieTodayBtn', 'statsVisBtn']) ok(new RegExp('#' + id + '(::after|::before)?[,\\s{]').test(css.slice(css.indexOf('Accessibilité (20 oct. 2026, 390 px)'))), id + ' : zone tactile 44 px');
for (const k of ['Chronomètre', 'Temps écoulé', 'Graphique du temps par jour']) ok(new RegExp("'" + k + "':").test(i18n), 'traduit : ' + k);
process.exit(bad ? 1 : 0);
