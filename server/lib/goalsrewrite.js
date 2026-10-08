// Reformulation (gratuite, aucun verrou d'abonnement) du texte d'un objectif
// saisi à la main — validée par Émilien (7 oct. 2026) : « Noèsis reformule le
// texte saisi à la main, mais ne l'applique pas tout de suite. La case se
// colore ; quand l'utilisateur clique dessus, Noèsis propose le changement. »
//
// L'IA PROPOSE, ne décide jamais : ce module n'écrit rien en base, il renvoie
// seulement une proposition (ou null). Même patron d'appel que
// goalstaskclassify.js (fetch natif, aucune dépendance) ; repli = aucune
// proposition si la clé ANTHROPIC_API_KEY est absente, si l'appel échoue ou
// expire, ou si la réponse est vide/identique/inexploitable.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_OUTPUT_TOKENS = 300;
const MAX_TEXT_LENGTH = 500;

function configured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function modelName() {
  return process.env.NOESIS_GOALS_REWRITE_MODEL || process.env.NOESIS_TASK_CATEGORY_MODEL || DEFAULT_MODEL;
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

async function callModel(prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName(),
        max_tokens: MAX_OUTPUT_TOKENS,
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

// Renvoie la proposition (string) ou null. Ne lève jamais pour une panne IA.
// Lève une Error { status: 400 } si le texte est invalide (vide / trop long).
async function proposeRewrite(rawText) {
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
    const out = await callModel(buildPrompt(text));
    const cleaned = String(out || '').trim().replace(/^["«'`]+|["»'`]+$/g, '').replace(/\s*\n+\s*/g, ' ').trim();
    if (!cleaned || cleaned.length > MAX_TEXT_LENGTH || cleaned === text) return null;
    return cleaned;
  } catch (err) {
    return null;
  }
}

module.exports = { proposeRewrite, MAX_TEXT_LENGTH };
