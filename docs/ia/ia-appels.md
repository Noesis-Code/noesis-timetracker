# IA : appels, modèles, budget, échecs, coûts (document unique, fusion du 21 oct. 2026)

Seul document IA du dépôt. Tailles = estimations (jetons ~ caractères/4), à confirmer par `node scripts/ai-cost-report.js 30` sur la base de production. « Mémo » = `aicache.memoize` (mémoire, 24 h, température 0, perdu au redémarrage). Chaque appel a un `max_tokens` serré et un délai maximal (`aimodels.timeoutMs`, surcharge `AI_TIMEOUT_<CLE>_MS`).

## 1. Inventaire des appels

| Rang coût | Fonction (feature) | Modèle | Prompt typique | Mémo / cache | Déclenchement |
|---|---|---|---|---|---|
| 1 | Surveillance Drive (`document-taches`, `surveillance-drive-batch`) — `drivesync.js`, `docanalysis.js` | Haiku puis fort si confiance < 80 ; lots -50 % | 2-8 k | mémo + cache de prompt Anthropic + empreintes de blocs ; `DRIVE_SYNC_MAX_AI_PER_PASS` 10, `..._PER_DAY` | toutes les 60 min par connexion, seulement si fichier modifié |
| 2 | Plan Offre 1 (`offre1-plan`) — `offerdelivery.js` | Haiku puis fort, 4096 sortie | 3-5 k | mémo 24 h | achat/reprise de l'offre |
| 3b | Étapes d'un nouvel objectif (`objectifs-creation`) — `objectifs.js` | modèle fort, 4000 sortie | 1-2 k | aucun | « Proposer les étapes » ; gratuit : 1 appel par utilisateur et par mois, plafond global OBJECTIFS_GRATUIT_PLAFOND_USD (défaut 50 $), sinon règles fixes sans IA |
| 3c | Lecture de photos/fichiers pour « Nouvel objectif » (`objectifs-lecture`) — `objectifs.js` (extraction : `documenttasks.textFromFile`) | modèle fort, 1500 sortie, images jointes (jamais stockées) | 1-3 k | aucun | l'épingle ; compte dans la même règle gratuite que 3b, sinon « disponible avec Expansion » sans lecture |
| 3e | Résumé annuel des grands objectifs (`resume-annuel`) — `objectifs-resume.js` | Haiku seul, 200 sortie max (une phrase + 3 puces) | ~0,3-1,5 k (~0,0025 $) | cache par jeu de grands objectifs (hash ids + titres + échéances) : mémo 24 h + table `objectifs_resume_annuel` ; repli sans IA = liste des titres | `GET /api/objectifs/resume-annuel?activityId=&year=`, À LA DEMANDE (premier affichage de la case de l'année dans l'arbre des années) ; jamais à l'ouverture d'un écran ni en continu ; affichage dérivé, ne modifie aucune saisie ; TROIS VOIES (6 nov. 2026) : compte gratuit par défaut = AUCUN appel (accumulation des titres, crédit gratuit intact) ; IA personnelle branchée (« Connecter mon IA », outil de lecture `arbre_objectifs`) = AUCUN appel de Noèsis (`iaPersonnelle: true`) ; Expansion = IA intégrée, cache 7 jours par jeu de titres |
| 3f | Titre commun d'un macro (`macro-titre`) — `objectifs-resume.js` | Haiku seul, 60 sortie (une ligne, 140 caractères au plus) | ~0,2-0,6 k (~0,001 $) | cache par hash des titres (mémo 24 h) ; repli sans IA = titres joints par « · » ; crédit gratuit hebdomadaire et plafond global appliqués par `aibudget` (crédit épuisé : aucun appel) | `POST /api/objectifs/macro/titre` { childIds[] ou columns[] } à la demande du créateur de macro (les deux objectifs les plus récents par colonne reliée) ; ne crée rien, le titre reste modifiable avant `POST /objectifs/macro` ; TROIS VOIES (6 nov. 2026) : compte gratuit par défaut = AUCUN appel (accumulation des titres, crédit gratuit intact) ; IA personnelle branchée (« Connecter mon IA », outil de lecture `arbre_objectifs`) = AUCUN appel de Noèsis (`iaPersonnelle: true`) ; Expansion = IA intégrée, cache 7 jours par jeu de titres |
| 3d | Rattachement d'un nouvel objectif à un objectif existant (`objectifs-rattachement`) — `objectifs.js` | Haiku, 60 sortie | 0,3-1 k | aucun | étape « Rattachement » de la création, seulement s'il existe un candidat non atteint dans l'activité ; PROPOSITION seulement (Accepter / Refuser, jamais silencieux) ; règles de ressemblance (catégorie + mots) d'abord et toujours gratuites ; IA seulement avec Expansion ou avec l'unique proposition gratuite du mois ; erreur ou refus de l'IA => règles ; les refus sont mémorisés par couple (`objectifs_refus`) |
| 3 | Objectifs hebdo (`objectifs-hebdo`) — `goalsweeklyauto.js` | Haiku puis fort, 1600 sortie | 2-4 k | mémo 15 min | génération/aperçu d'un objectif périodique |
| 4 | Document / modifications proposées / redistribution (`document-taches`, `modifications-proposees`, `redistribution-objectif`) — `docanalysis.js` | Haiku puis fort | 1-6 k | mémo + cache de prompt | import de document, édition d'objectif |
| 5 | Inter-secteurs (`inter-secteurs`) — `crosssectorinference.js` | Haiku puis fort, 2500 sortie max | 0,6-1,5 k | mémo 10 min, 30/activité/jour | pose d'un objectif ou d'une tâche |
| 6 | Classement de tâche (`classement-tache`, `:repli`) — `goalstaskclassify.js` | Haiku puis fort, 32-92 sortie | 0,5-0,9 k | mémo 24 h | chaque tâche ajoutée sans catégorie |
| 7 | Reformulation (`reformulation`) — `goalsrewrite.js` | Haiku puis fort, 312 sortie | ~0,3 k | mémo 24 h | clic explicite |
| 9 | Doublon (`doublon-tache`) — `goalstaskclassify.js` (`hasOpenDuplicateAsync`) | Haiku seul, 8 sortie, 15 titres au plus | ~0,3 k (~0,001 $) | mémo 24 h | tâche ajoutée dont un titre ouvert ressemble à moitié (zone grise ; comparaison locale d'abord) |
| 10 | Réforme (`reforme-tache`) — `reform.js` | Haiku seul, 20 sortie | ~0,5 k (~0,001 $) | mémo 24 h | développement sans objectif ou à mots de réforme/décision (sinon aucun appel) |
| 8 | Orthographe (`correction-orthographe`) — `silentspellfix.js` | Haiku seul, 200 sortie | ~110 jetons | mémo par titre (borné 500) | chaque création/modification de titre (la plus fréquente, ~0,0002 $/appel) |

Appels secondaires (journalisés sous leur propre `feature`) : `taskrecurrence.js` (`recurrence-tache`, 80 sortie, réponse avec `confidence`, ignorée sous le seuil du classement ; texte puis historique avant l'IA) ; `goalscaptureplace.js` (`rapprochement-objectif`, 120 sortie, au plus 2 appels par tâche, 60 candidats au plus) ; `aibatch.js` (lots Drive à -50 %, coût enregistré à la relève par `drivesync.js`, `surveillance-drive-batch`) ; `documenttasks.js` et `changeproposals.js` passent par `docanalysis.js`.

Pas d'appel IA : `goalsauto.js`, `subprojects.js`. Aucune fonction n'est appelée à l'ouverture d'un écran (audit 21 oct.) ; seule route GET à appeler l'IA : redistribution d'un secteur retiré (geste explicite).

Garde-fou : `test/ia-appels-doc-test.js` échoue si un fichier de `server/` appelle Anthropic (`api.anthropic.com`, `callModel(`, `docanalysis.call(`) sans être nommé ici, ou si un appel échappe à `ai_usage_log` (URL hors `aibudget.fetchAnthropic`/`record`, `callModel` sans `feature`). Ajouter une ligne en créant un appel.

## 2. Modèles (`server/lib/aimodels.js`, seul fichier avec des identifiants `claude-...` ; test `ia-modeles-centralises-test.js`)

| Constante | Identifiant | Surcharge | Utilisé par |
|---|---|---|---|
| `STRONG` (modèle fort UNIQUE, décision du 21 oct. 2026) | `claude-sonnet-4-5-20250929` | `ANTHROPIC_MODEL`, `NOESIS_TASK_CATEGORY_MODEL` (classement), `NOESIS_GOALS_REWRITE_MODEL` (reformulation) | repli de toutes les fonctions |
| `FAST` | `claude-haiku-4-5` | `NOESIS_FAST_MODEL` (UNE variable pour tous les paliers, `off` = fort seul), `DRIVE_SYNC_MODEL`, `NOESIS_SPELLFIX_MODEL` | paliers `aicache.fastModelFor`, `drivesync`, `silentspellfix` |

Tarifs (`PRICES`, $ / million de jetons) : Haiku 1 / 5 ; Sonnet 3 / 15 ; Opus 15 / 75. Un seul endroit : `aimodels.js`, lus via `aibudget.priceFor`. **Revérification tous les 90 jours** (`PRICES_UPDATED` = 2026-10-16, prochaine échéance 2027-01-14) : `test/ia-tarifs-echeance-test.js` et le rapport avertissent sans échouer. Haiku coûte ~3 fois moins que Sonnet : les gains viennent du TAUX DE REPLI (`fallbackRate` du rapport), pas d'un autre modèle de premier essai. Coût estimé par appel (Haiku -> repli) : orthographe 0,0002 $ ; classement 0,0009 -> 0,0027 $ ; reformulation 0,001 -> 0,003 $ ; inter-secteurs 0,004 -> 0,011 $ ; documents 0,0075 -> 0,022 $ ; Drive 0,008 $ (lots 0,004 $) ; hebdo 0,013 -> 0,039 $ ; Offre 1 0,019 -> 0,057 $. Piste (proposition S8 refusée par Émilien le 21 oct. 2026) : le repli reste, ne pas retirer.

Point d'appel unique : tout `/v1/messages` passe par `aibudget.fetchAnthropic` (budget, relances 429/529, masquage Loi 25, alerte clé 401/403, journal). Exception : `aibatch.js` (API Batch Drive : budget `submit`, délai 60 s, masquage, alerte 401/403 ; coût à la relève, facteur 0,5). `test/ia-point-unique-test.js` échoue sinon.

- `yearplanproposals.js` (`modifications-proposees`, Expansion seulement) : objectif annuel + stratégie -> objectifs de période proposés, UN appel par demande, 2-3 k entrée, <= 2 k sortie, passe par `docanalysis.js` (mêmes plafonds/budget).
- `weeklytaskproposals.js` (`modifications-proposees`, Expansion seulement) : objectifs de la semaine sans tâche -> tâches proposées, UN appel par demande, via `docanalysis.js` (mêmes plafonds/budget). Le report des tâches en excès de capacité (`weekloadproposals.js`) n'appelle aucune IA.

## 3. Budget par compte (seuls plafonds, décision du 21 oct. 2026)

`aibudget.js` : **3,5 CAD par semaine civile (lundi-dimanche, Montréal)** et **15 CAD par mois civil**, par compte (tous les comptes, y compris les appels sans utilisateur « system »). Plus de plafond journalier ni de plafond par fonction (anciens `*_MAX_PER_DAY`, `aifeaturecaps` réduit à `dayKey`). Réglages : `AI_BUDGET_WEEK_CAD`, `AI_BUDGET_MONTH_CAD` (anciennes `_USD` acceptées, en USD, prioritaires). Coût compté = réel + appels en vol + lots soumis. Messages : « ... pour cette semaine. Elle reprend le <date>. » / « ... pour ce mois. ... » (traduits dans `public/i18n.js`). Les montants sont en CAD, les coûts du journal (`ai_usage_log.costUsd`) en USD ; conversion `server/lib/fx.js` (`USD_PER_CAD` 0,72, estimation non vérifiée ; surcharge `AI_USD_PER_CAD`, avertissement au-delà de 90 jours). 15 CAD = 10,80 USD de coût réel.

Plafonds propres restants (autres mécanismes) : Drive 40 appels/jour (`DRIVE_SYNC_MAX_AI_CALLS_PER_DAY`) ; inter-secteurs 30/activité/jour (`CROSS_MAX_PER_ACTIVITY_DAY`) ; documents 10/heure ; redistribution 20/h/compte (antirafale).

Alertes (journal serveur seulement, aucune notification) : coût du jour tous comptes > `AI_COST_ALERT_DAY_CAD` (défaut 8 CAD, une ligne par jour de Montréal, durable au redémarrage) ; rapport hebdomadaire `--semaine` > `AI_WEEKLY_ALERT_CAD` (défaut 5 CAD) ou fonction en hausse de plus de 50 % (et > 0,25 $) ; adaptatif derrière `AI_ALERT_ADAPTIVE=1` (`aialertthreshold.js`, 3,5 CAD x comptes actifs) ; clé refusée 401/403 (`ALERTE clé API Anthropic refusée`, une par heure). Le jour de tous les compteurs = `aifeaturecaps.dayKey` (America/Toronto, jamais UTC).

## 3 bis. Crédit de l'IA gratuite par utilisateur (cahier des charges d'Émilien, 6 nov. 2026)

Tout compte SANS accès Expansion est « gratuit » (jamais un compte Expansion, ni les appels système, ni le connecteur IA libre qui utilise l'IA de la personne et non celle de Noèsis). Appliqué dans le point d'appel unique `aibudget.fetchAnthropic`, à TOUS les appels IA d'un compte gratuit, AVANT le budget de la section 3 (journal `ai_usage_log`, jour civil de Montréal).
- **Crédit** : 1 CAD par mois et par utilisateur (`IA_GRATUIT_CREDIT_MOIS_CAD`). Devise : CAD, comme les budgets de la section 3 (3,5 CAD par semaine, 15 CAD par mois) ; converti en USD (`fx.toUsd`) pour être comparé à `ai_usage_log.costUsd`, qui est en USD. Les dépenses par activité (`utilisateur#aActivité`) comptent pour l'utilisateur.
- **Étalement hebdomadaire**, formule exacte (semaine = lundi-dimanche civil de Montréal) :
  - fenêtre = de max(lundi de la semaine, 1er du mois) à aujourd'hui ;
  - dépensé_avant = dépense du mois AVANT le début de la fenêtre ; dépensé_semaine = dépense depuis le début de la fenêtre ;
  - **dépense autorisée de la semaine = 0,35 × (crédit − dépensé_avant)** ; **budget restant de la semaine = cette valeur − dépensé_semaine** (`IA_GRATUIT_FRACTION_SEMAINE`, défaut 0,35).
  - « dépensé_avant » exclut la semaine en cours : sinon la dépense de la semaine serait comptée deux fois. Avec 1 CAD tout dépensé chaque semaine : 35, 23, 15, 10 cents ; il reste toujours un peu de crédit, de moins en moins, jamais plus de 1 CAD par mois. Le non-utilisé d'une semaine reste dans le solde ; remise à zéro le 1er de chaque mois civil ; une semaine à cheval sur deux mois est coupée au 1er (chaque jour compte pour son mois).
- **Modèle léger seul** : un appel d'un compte gratuit qui demandait un modèle fort part en Haiku (jamais de repli vers le modèle fort).
- **Épuisé** : l'appel lève la même erreur `aiBlocked` (`freeCap: true`) SANS appeler l'API ; chaque fonction retombe sur ses règles locales (jamais d'erreur bloquante). Message court : « Crédit IA épuisé, reprend lundi. » (ou « …reprend le 1er décembre. » si le 1er du mois précède le lundi) ; les fonctions qui affichent déjà le message d'une limite de budget l'affichent tel quel (aucun nouveau bouton ni écran) ; pas de compteur affiché (aucune zone existante ne s'y prête).
- Les appels de `objectifs.js` et du résumé annuel passent par `aibudget.runAs(userId, …)` : comptés sur la personne.
Test : `test/ia-gratuit-credit-test.js`.

## 3 ter. Plafond global annuel NET de l'IA gratuite (cahier des charges d'Émilien, 6 nov. 2026)

- **Net** = coût cumulé de l'IA des comptes gratuits depuis le 1er janvier (table `ai_free_cost` : un total par jour, en USD, sans compte ni texte ; comptes Expansion exclus) MOINS la marge nette des abonnés Expansion de l'année.
- **Coupure** : l'IA gratuite ne se coupe que si ce net dépasse la perte annuelle maximale, `IA_GRATUITE_PERTE_ANNUELLE_MAX` (défaut 100 $ US) : tout compte gratuit passe en repli sans IA (« Disponible avec Expansion : l'IA gratuite est suspendue pour le moment. ») ; sinon seul le crédit par utilisateur (3 bis) s'applique. Les comptes Expansion ne sont jamais coupés.
- **Marge Expansion (donnée absente)** : la base ne conserve aucun montant de revenu (`activity_subscriptions` ne garde que des identifiants et des dates Stripe) : la marge n'est PAS lisible aujourd'hui. En attendant, plafond de 100 $ FIXE (marge = 0). Lecture prévue quand la donnée existera : revenus d'abonnement nets de Stripe moins coûts IA des comptes payants ; d'ici là, elle peut être posée à la main par `IA_EXPANSION_MARGE_ANNUELLE_USD`.
- **Alerte à 50 %** du plafond : une seule fois par année (clé `ia-gratuit-50` dans `ai_alerts_sent`) ; pas d'alerte à 80 % ni à 100 %.
- **Rappel le 1er de chaque mois, 9 h** (cron existant de `subscriptioncron.js`, `aibudget.monthlyFreeReminder`) : coût net depuis le début de l'année, % du plafond, marge Expansion déduite (ou « plafond fixe »), tendance du mois écoulé (coût brut du mois, la marge n'étant pas ventilée par mois) ; une seule notification par mois (clé `ia-gratuit-rappel`).
- **Destinataire** : l'administrateur seulement, jamais les utilisateurs, par la notification push existante (`push.sendToUsers`), message court en français, sans écran ni réglage. L'administrateur est identifié par le COURRIEL de son compte : `IA_ALERTE_ADMIN_EMAILS` (courriels séparés par des virgules, insensible à la casse et aux espaces ; valeur prévue `admin@compagnienoesis.com`), et/ou par `IA_ALERTE_ADMIN_USER_IDS` (ids de comptes) ; l'union des comptes trouvés reçoit alerte et rappel, une seule notification par compte même trouvé par id ET par courriel ; aucun compte trouvé : journal du serveur seulement, sans erreur. OÙ LA POSER : Railway > service web-staging > Variables ; au redéploiement la variable est lue au prochain appel (rien d'autre à faire), et les alertes déjà émises (50 % de l'année, rappel du mois) ne sont pas renvoyées.
Test : `test/ia-gratuit-global-test.js`.

## 4. Réductions déjà appliquées

- Orthographe : consigne raccourcie (127 -> 110 jetons), clé de mémo normalisée.
- Classement : description de pôle écrite une fois par suite de secteurs du même pôle (549 -> 416 jetons, -24 %, `ia-prompts-reduction-test.js`) ; exemples utilisateur bornés à 5 et 250 caractères.
- Sorties : `max_tokens` redistribution 3000 -> 1500 (min(3000, 150 x cMax)), hebdo 3000 -> 1600 (`ia-sortie-reduite-test.js`).
- Inter-secteurs : description coupée à 160 caractères, objectif de candidat à 240 (pire cas 8028 -> 3543 jetons, -56 %) ; mémo 10 min, deux évaluations identiques simultanées = un appel.
- Rapprochement : pire cas 5236 jetons (60 candidats) ; ramener à 25 candidats (-58 %) NON fait (risque de qualité, case posée à Émilien).
- Cache de prompt : actif là où il paie (Drive, documents, modifications : `aicache.messageParams`) ; NON activé sur classement/reformulation/inter-secteurs/hebdo (blocs statiques ~300-400 jetons, sous le minimum cachable 1024 Sonnet / 2048-4096 Haiku : économie nulle). À reconsidérer si une consigne statique dépasse ~4000 jetons.
- Mémo mesuré : `aicache.memoStats()` et ligne `[aicache] mémo : X succès / N` tous les 200 appels. Journal `ai_usage_log` : une ligne agrégée par (compte, jour, modèle, fonction), compte = userId interne non haché. Cases ouvertes (Émilien) : clé de mémo du classement sans exemples récents ; hachage du compte ; une ligne par appel.

Pistes non faites : retirer le paragraphe d'exemple du classement ou classer plusieurs tâches en un appel (exige `eval-task-precision.js --live`) ; mémo persistant SQLite (survivrait aux redémarrages Railway) ; signal d'acceptation de la reformulation (aucun texte stocké, Loi 25) ; « au plus N » dans la consigne de redistribution.

## 5. Échecs, reprises et robustesse

- **429/529 jamais facturé** : `fetchAnthropic` relance au plus 2 fois (`AI_RETRY_MAX`), attente = `Retry-After` (abandon s'il dépasse 8 s, `AI_RETRY_MAX_WAIT_MS`), sinon 1 s puis 2 s (`AI_RETRY_BASE_MS`). Aucune relance sur 400/401/403/500.
- **Aucun repli vers le modèle fort** (`aicache.isNoFallback`) après 429/529, 400/401/403, ou délai dépassé du modèle rapide. Le 500/502/503 garde le repli.
- **JSON abîmé** : réparation locale avant tout re-appel (`server/lib/jsonrepair.js` : clôtures, texte autour, virgules finales, accolades manquantes). Une sortie tronquée par `max_tokens`, une chaîne ouverte ou une prose seule restent irréparables (repli habituel). Entrée > 2 Mo refusée ; aucune exécution de code.
- **Délais** : orthographe 10 s ; classement/reformulation/récurrence/rapprochement 15 s ; documents/modifications/redistribution/Drive 45 s ; hebdo 60 s ; inter-secteurs 90 s ; Offre 1 120 s (le plan est attendu par le webhook Stripe, activation idempotente). Dépassé = panne IA, sans repli payant ; le coût éventuel facturé n'est alors pas journalisé (limite connue, bornée par `max_tokens` et le délai).
- **Disjoncteur** (`aibudget.fetchAnthropic`) : 5 échecs de suite (529, 502-504, réseau) => appels suspendus 60 s puis une sonde (`AI_BREAKER_N`, `AI_BREAKER_OPEN_MS`) ; 4xx et 429 ne comptent pas. Message utilisateur : « Génération indisponible pour le moment. », repli local des appelants.
- **Pire cas facturé pour UNE demande** (rapide + fort, sorties au maximum) : orthographe 0,001 $ ; classement 0,006 $ ; reformulation 0,008 $ ; récurrence 0,002 $ ; rapprochement 0,018 $ ; modifications/redistribution 0,084 $ ; Offre 1 0,102 $ ; inter-secteurs 0,098 $ ; hebdo 0,133 $ ; documents 0,184 $ (0,368 $ avec la relance unique). Au plus un appel de repli, une relance sur « illisible » (hebdo, inter-secteurs), une relance unique sur documents.
- **Fermeture de l'app en cours de génération** : l'appel continue et est facturé, mais le résultat est mémorisé (la reprise ne repaie pas) ; seuls les échecs ne sont pas mémorisés.
- **Robustesse** (`ia-robustesse-test.js`) : pour chaque fonction, JSON illisible, texte coupé, `max_tokens`, `content` vide, prose, `null`, délai, réseau coupé, HTTP 500 donnent un repli propre (`null`, repli lexical, `{error:true}`, `Error` propre pour l'Offre 1 sans avancer l'abonnement), jamais de `TypeError`. Limite connue : la reformulation du modèle fort n'est pas validée (proposition que la personne accepte ou refuse).
- **Confidentialité (Loi 25)** (`ia-confidentialite-test.js`) : aucune donnée personnelle (noms, courriel, téléphone, identifiant, autres membres) n'apparaît dans les corps de requête ; seules les réponses libres des formulaires Offre 1 partent telles que saisies (masquage à décider par Émilien).

## 6. Mesurer les coûts réels

Une seule commande, lecture seule (`scripts/ai-cost-report.js`) :
- `node scripts/ai-cost-report.js 30` : mois par utilisateur, résumé par fonction (appels, jetons moyens, cache, $/appel, part), par fonction et modèle, par jour, total mensuel projeté (7 j / 7 x 30), taux de repli Haiku -> fort. `--court` : 10 lignes. `--from export.json|csv` : sans accès base (export de `SELECT * FROM ai_usage_log`). Test : `test/ia-rapport-export-test.js`.
- `--semaine` : 7 derniers jours par fonction vs semaine précédente, avec alertes.
- `--projection [--hyp fichier.json] [--detail]` : projection mensuelle par profil (léger/moyen/intensif) et taille (10/100/1000), hypothèses supposées dans `scripts/ai-cost-hypotheses.json` (aucun réseau, aucune base) ; plafond 15 CAD et prix Expansion 20 CAD convertis par `fx.js`. Résultat avec les hypothèses actuelles (par utilisateur et par mois) : léger 0,65 $, moyen 2,35 $, intensif 7,86 $ ; rapprochement tâche -> objectif domine (22 % du moyen), l'orthographe pèse 5 %.
- `--acceptation [jours]` : apprentissage par l'usage (classements corrigés à la main, propositions acceptées/refusées par champ, inter-secteurs, tâches générées rejetées).

Sur Railway : service web > onglet Shell (ou `railway run`), sans secret à donner. Refaire à J+7 puis chaque mois ; les replis (`:repli`) sont regroupés dans leur fonction. Cible produit : 10 CAD de moyenne par compte actif, jamais plus de 15 CAD par mois.
