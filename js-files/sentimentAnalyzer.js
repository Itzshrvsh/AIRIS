const fs = require('fs');
const axios = require('axios');

async function analyzeSentiment(userInput) {
  // --- Prompt to generate a one-sentence context ---
  const prompt = `
Summarize the following user input into **one concise sentence** that captures its context, intent, or main idea. 
Do not add fluff.
Don't mention the user input itself, just provide the summary.
note the tone (positive, negative, neutral) if relevant.

User Input: "${userInput}"
`;

  // --- Send to local LLaMA API ---
  const res = await axios.post("http://localhost:11434/api/generate", {
    model: "llava",
    prompt,
    stream: false
  });

  const summary = res.data.response.trim();

  // --- Optionally log it ---
  fs.appendFileSync("user_summary_log.txt", `Input: ${userInput}\nSummary: ${summary}\n\n`);

  return summary;
}

module.exports = { analyzeSentiment };
