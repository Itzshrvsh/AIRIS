import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import stringSimilarity from 'string-similarity';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Helper: Ask LLaVA via Ollama
function askLLaVA(prompt) {
  return new Promise((resolve, reject) => {
    let output = '';
    const command = `ollama run llava "${prompt.replace(/"/g, '\\"')}"`;
    const process = exec(command);

    process.stdout.on('data', (chunk) => output += chunk);
    process.stderr.on('data', (err) => console.error(err));
    process.on('close', () => resolve(output.trim()));
  });
}

// --- Step 1: Analyze text with LLaVA
async function analyzeInput(userInput) {
  const analysisPrompt = `
You are the memory processor.
Analyze the following message and return a JSON with:
{
  "sentiment": "positive | negative | neutral",
  "summary": "short summary of what user said"
}
Message: "${userInput}"
`;
  const result = await askLLaVA(analysisPrompt);

  try {
    // Attempt to extract JSON from LLaVA output
    const jsonText = result.match(/\{[\s\S]*\}/)?.[0];
    const parsed = JSON.parse(jsonText);
    return parsed;
  } catch {
    return { sentiment: "neutral", summary: userInput.slice(0, 50) };
  }
}

// --- Step 2: Store memory
async function storeMemory(userId, inputText, summary, sentiment) {
  await supabase.from('memories').insert({
    user_id: userId,
    input_text: inputText,
    summary,
    sentiment
  });
}

// --- Step 3: Fetch similar past messages
async function fetchMemories(userId, userInput, limit = 3) {
  const { data } = await supabase.from('memories')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(50); // last 50 memories

  if (!data?.length) return [];

  const matches = data.map(m => ({
    ...m,
    score: stringSimilarity.compareTwoStrings(userInput, m.input_text)
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

  return matches;
}

// --- Step 4: Chat with memory
async function chat(userId, userInput) {
  console.log(`\n🧠 Processing: "${userInput}"`);

  const analysis = await analyzeInput(userInput);
  await storeMemory(userId, userInput, analysis.summary, analysis.sentiment);

  const past = await fetchMemories(userId, userInput);
  const pastContext = past.map(m => `(${m.sentiment}) ${m.summary}`).join('\n- ');

  const finalPrompt = `
[User's past context]
- ${pastContext}

[User says now]
${userInput}

Respond naturally, considering their past tone and summaries.
`;

  const response = await askLLaVA(finalPrompt);

  console.log("\n🤖 LLaVA says:\n", response);
  return response;
}

// --- Run a test
const userId = "sharvesh";
const userInput = process.argv.slice(2).join(" ") || "I feel tired today, maybe I should rest.";

chat(userId, userInput);
