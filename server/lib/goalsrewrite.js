// Reformulation (gratuite, aucun verrou d'abonnement) du texte d'un objectif
// saisi à la main — validée par Émilien : « Noèsis reformule le
// texte saisi à la main, mais ne l'applique pas tout de suite. La case se
// colore ; quand l'utilisateur clique dessus, Noèsis propose le changement. »
//
// L'IA PROPOSE, ne décide jamais : ce module n'écrit rien en base, il renvoie
// seulement une proposition (ou null). Même patron d'appel que
// goalstaskclassify.js (fetch natif, aucune dépendance) ; repli = aucune
// proposition si la clé ANTHROPIC_API_KEY est absente, si l'appel échoue ou
// expire, ou si la réponse est vide/identique/inexploitable.

const aibudget = require('./aibudget');
const aicache = require('./aicache');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = () => require('./aimodels').timeoutMs('reformulation');
const MAX_OUTPUT_TOKENS = 300;
const MAX_TEXT_LENGTH = 500;

function configured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function modelName() {
  return require('./aimodels').rewriteModel();
}

function buildPrompt(text) {
  return [
    "Une personne vient d'écrire à la main le texte d'un objectif de son planning.",
    "Reformule-le de façon claire, concise et orientée action, dans la MÊME langue que le texte.",
    "Ne change pas le sens, n'ajoute aucun fait, aucun chiffre, aucune date qui ne figure pas dans le texte.",
    "Si le texte est déjà bon, renvoie-le tel quel.",
    'Réponds UNIQUEMENT avec le texte reformulé, sur une seule ligne, sans guillemets, sans balises markdown, sans commentaire.',
    '',
    `Texte : "${text}"`,
  ].join('\n');
}

// Haiku d'abord, repli sur le modèle fort (modelName()) si Haiku est peu sûr : appel en échec, sortie vide/multi-lignes/trop longue,
// chiffre absent du texte d'origine (fait inventé), ou confiance < seuil. Réglages : NOESIS_REWRITE_FAST_MODEL ('off' = fort seul), NOESIS_REWRITE_MIN_CONFIDENCE.
// Journal : features 'reformulation' (Haiku) / 'reformulation:repli' (fort).
const CONF_LINE = "\nTermine par une seconde ligne exactement de la forme « CONFIANCE: N » (N de 0 à 100 : ta confiance que la reformulation est fidèle et meilleure ; sous 80 si tu hésites).";
const digitsOf = (t) => (String(t).match(/\d+/g) || []);
function callModel(prompt, original, userId) {
  // Plafond d'abus par compte (REWRITE_MAX_PER_DAY, défaut 150) : compté seulement sur un vrai appel (le mémo passe avant) ; refus = comme une panne IA, jamais mémorisé.
  const cap = () => { if (!aicache.takeDailyCap('reformulation', userId, aicache.capFromEnv('REWRITE_MAX_PER_DAY', 150))) throw new Error('Plafond quotidien de reformulation atteint.'); };
  const fast = aicache.fastModelFor('NOESIS_REWRITE_FAST_MODEL', modelName());
  const strong = () => aicache.memoize([modelName(), MAX_OUTPUT_TOKENS, prompt], () => { if (!fast) cap(); return callModelRaw(prompt, modelName(), fast ? 'reformulation:repli' : 'reformulation'); });
  if (!fast) return strong();
  return aicache.memoize([fast, MAX_OUTPUT_TOKENS + 12, prompt], async () => {
    cap();
    try {
      const raw = String(await callModelRaw(prompt + CONF_LINE, fast, 'reformulation', MAX_OUTPUT_TOKENS + 12)).trim();
      const m = /\n\s*CONFIANCE\s*:\s*(\d{1,3})\s*$/i.exec(raw);
      const body = m ? raw.slice(0, m.index).trim() : '';
      const known = new Set(digitsOf(original));
      if (m && Number(m[1]) >= aicache.minConfidenceFor('NOESIS_REWRITE_MIN_CONFIDENCE') && body && !/\n/.test(body)
          && body.length <= MAX_TEXT_LENGTH && digitsOf(body).every((d) => known.has(d))) return body;
    } catch (err) { if (aicache.isNoFallback(err)) throw err; /* repli sur le modèle fort */ }
    return strong();
  });
}

async function callModelRaw(prompt, model, feature, maxTokens) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS());
  try {
    const res = await aibudget.fetchAnthropic(feature || 'reformulation', ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || modelName(),
        max_tokens: maxTokens || MAX_OUTPUT_TOKENS,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
    const body = await res.json();
    const block = Array.isArray(body.content) ? body.content.find((b) => b.type === 'text') : null;
    return block ? block.text : '';
  } finally {
    clearTimeout(timer);
  }
}

// Validation de la sortie du modèle : non vide, longueur raisonnable (pas plus de ~4x l'original), pas de refus/commentaire type « je ne peux pas ».
// Sinon null = repli sur le texte original (aucune proposition).
const REFUSAL = /^\s*(?:je (?:ne )?(?:peux|suis) (?:pas|désolé)|désolé|d[ée]sol[ée]e?\b|je regrette|i (?:can'?t|cannot|am unable|'m sorry)|i'?m sorry|sorry\b|as an ai|en tant qu'?(?:ia|assistant))|\bje ne peux pas\b|\bi (?:can'?t|cannot) (?:help|assist|rewrite)/i;
function validRewrite(out, original) {
  const t = String(out || '').trim();
  if (!t || t.length > MAX_TEXT_LENGTH) return false;
  if (t.length > String(original || '').length * 4 + 40) return false;
  if (REFUSAL.test(t) && !REFUSAL.test(String(original || ''))) return false;
  return true;
}

// Renvoie la proposition (string) ou null. Ne lève jamais pour une panne IA.
// Lève une Error { status: 400 } si le texte est invalide (vide / trop long).
async function proposeRewrite(rawText, userId) {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) {
    const e = new Error('Texte requis.');
    e.status = 400;
    throw e;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    const e = new Error(`Texte trop long (${MAX_TEXT_LENGTH} caractères maximum).`);
    e.status = 400;
    throw e;
  }
  if (!configured()) return null;
  try {
    const out = await callModel(buildPrompt(text), text, userId);
    const cleaned = String(out || '').trim().replace(/^["«'`]+|["»'`]+$/g, '').replace(/\s*\n+\s*/g, ' ').trim();
    if (!validRewrite(cleaned, text) || cleaned === text) return null;
    return cleaned;
  } catch (err) {
    return null;
  }
}

module.exports = { proposeRewrite, validRewrite, MAX_TEXT_LENGTH };
