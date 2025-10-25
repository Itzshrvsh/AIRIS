const fs = require('fs');
const axios = require('axios');

async function whatapptoopen(userInput) {
  // --- Prompt to generate a one-sentence context ---
  const prompt = `
Extract the name of the application the user wants to open from the following input. 
Return **only the app name as a single word or proper noun**, no extra text, no explanations.

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

module.exports = { whatapptoopen };
