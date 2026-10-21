const fs = require('fs');
const { generateText, ConfigError } = require('./aiConfig');

async function analyzeSentiment(userInput) {
  // --- Prompt to generate a one-sentence context ---
  const prompt = `
Summarize the following user input into **one concise sentence** that captures its context, intent, or main idea. 
Do not add fluff.
Don't mention the user input itself, just provide the summary.
note the tone (positive, negative, neutral) if relevant.

User Input: "${userInput}"
`;

  // --- Central AI configuration (provider/base URL/key/model from AI Settings) ---
  let summary;
  try {
    summary = await generateText(prompt, { maxTokens: 120 });
  } catch (err) {
    console.error("⚠️ Sentiment analysis failed:", err instanceof ConfigError ? err.message : err.message || err);
    return "";
  }

  if (!String(summary).trim()) return "";

  // --- Optionally log it ---
  try {
    fs.appendFileSync("user_summary_log.txt", `Input: ${userInput}\nSummary: ${summary}\n\n`);
  } catch {
    /* logging is best-effort */
  }

  return summary;
}

module.exports = { analyzeSentiment };
