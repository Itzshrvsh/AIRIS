// core/memoryManager.js — AIRIS cloud context memory (CommonJS).
//
// Legacy note: this module previously ran the model with the `ollama` CLI
// and embedded a Supabase key. It now runs through the central AI
// configuration (js-files/aiConfig.js; provider/base URL/key/model from
// AI Settings) and reads Supabase credentials from the local .env only.
const { createClient } = require('@supabase/supabase-js');
const stringSimilarity = require('string-similarity');
const { generateText } = require('../js-files/aiConfig');

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

async function analyzeAndStore(userId, text) {
  const analysisPrompt = `
You are the AIRIS memory processor.
Analyze this message and respond in JSON ONLY:
{
  "sentiment": "positive | negative | neutral",
  "summary": "short one-line summary"
}
Message: "${String(text ?? '').slice(0, 500)}"
`;

  const output = await generateText(analysisPrompt, { maxTokens: 80, feature: 'fast' });
  const jsonText = String(output || '').match(/\{[\s\S]*\}/)?.[0];
  let sentiment = "neutral", summary = String(text ?? '').slice(0, 50);
  try {
    const parsed = JSON.parse(jsonText);
    sentiment = parsed.sentiment;
    summary = parsed.summary;
  } catch {
    console.warn("Memory model returned non-JSON:", String(output || '').slice(0, 120));
  }

  if (!supabase) {
    console.warn('core/memoryManager: Supabase not configured (.env) — analysis not stored.');
    return { sentiment, summary };
  }

  await supabase.from('memories').insert({
    user_id: userId,
    input_text: text,
    sentiment,
    summary,
  });

  return { sentiment, summary };
}

async function fetchMemoryContext(userId, newInput, limit = 3) {
  if (!supabase) return "";
  const { data, error } = await supabase.from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(50);
  if (error || !data?.length) return "";

  const matches = data.map(m => ({
    ...m,
    score: stringSimilarity.compareTwoStrings(String(newInput ?? ''), String(m.input_text ?? ''))
  })).sort((a, b) => b.score - a.score).slice(0, limit);

  const context = matches.map(m => `(${m.sentiment}) ${m.summary}`).join('\n- ');
  return context;
}

module.exports = { analyzeAndStore, fetchMemoryContext };
