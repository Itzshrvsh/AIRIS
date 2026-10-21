const fs = require('fs');
const { generateText } = require('./aiConfig');

async function whatapptoopen(userInput) {
  // --- Prompt to generate a one-sentence context ---
  const prompt = `
Extract the name of the application the user wants to open from the following input. 
Return **only the app name as a single word or proper noun**, no extra text, no explanations.

User Input: "${userInput}"
`;


  // --- Send request via the central AI configuration ---
  const summary = (await generateText(prompt, { maxTokens: 16 }) || "").trim();

  // --- Optionally log it ---
  try {
    fs.appendFileSync("user_summary_log.txt", `Input: ${userInput}\nSummary: ${summary}\n\n`);
  } catch {
    /* logging is best-effort */
  }

  return summary;
}

module.exports = { whatapptoopen };
