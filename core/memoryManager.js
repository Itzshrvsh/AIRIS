import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import stringSimilarity from 'string-similarity';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function runLLaVA(prompt) {
  return new Promise((resolve) => {
    let output = '';
    const cmd = `ollama run llava "${prompt.replace(/"/g, '\\"')}"`;
    const proc = exec(cmd);
    proc.stdout.on('data', (chunk) => (output += chunk));
    proc.on('close', () => resolve(output.trim()));
  });
}

export async function analyzeAndStore(userId, text) {
  const analysisPrompt = `
You are the AIRIS memory processor.
Analyze this message and respond in JSON ONLY:
{
  "sentiment": "positive | negative | neutral",
  "summary": "short one-line summary"
}
Message: "${text}"
`;

  const output = await runLLaVA(analysisPrompt);
  const jsonText = output.match(/\{[\s\S]*\}/)?.[0];
  let sentiment = "neutral", summary = text.slice(0, 50);
  try {
    const parsed = JSON.parse(jsonText);
    sentiment = parsed.sentiment;
    summary = parsed.summary;
  } catch (e) {
    console.warn("LLaVA returned non-JSON:", output);
  }

  await supabase.from('memories').insert({
    user_id: userId,
    input_text: text,
    sentiment,
    summary,
  });

  return { sentiment, summary };
}

export async function fetchMemoryContext(userId, newInput, limit = 3) {
  const { data } = await supabase.from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(50);

  if (!data?.length) return "";

  const matches = data.map(m => ({
    ...m,
    score: stringSimilarity.compareTwoStrings(newInput, m.input_text)
  })).sort((a, b) => b.score - a.score).slice(0, limit);

  const context = matches.map(m => `(${m.sentiment}) ${m.summary}`).join('\n- ');
  return context;
}
