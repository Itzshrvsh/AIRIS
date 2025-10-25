// 🔥 whatreq.js — AIRIS Action Selector
const fs = require("fs");
const axios = require("axios");

async function whatreq(userInput) {
  const prompt = `
You are the ACTION SELECTOR core for the AIRIS system.
The user can perform exactly ONE of the following actions:
1. "launch-app" – when the user wants to open or start an app.
2. "automate" – when they want to automate a process or action.
3. "summarize" – when they provide text to summarize.
4. "analyze" – when they want to analyze the screen or detect something visually.
5. "open-url" – when they want to open a website or link.

Return ONLY one of these words as your entire response, without explanation or extra text.

User input: "${userInput}"
`.trim();

  try {
    // --- 🔗 Send request to local Ollama API ---
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "llava", // you can swap to "llama3" if needed
      prompt,
      stream: false
    });

    // --- 🧠 Extract and normalize the model's response ---
    const aiResponse = response.data?.response?.trim().toLowerCase();

    if (!aiResponse) throw new Error("Empty AI response.");

    // --- 🧾 Log the input and AI choice ---
    const logEntry = `🕒 ${new Date().toLocaleString()}\nUser Input: ${userInput}\nAI Action: ${aiResponse}\n\n`;
    fs.appendFileSync("airis_action_log.txt", logEntry);

    return aiResponse;

  } catch (error) {
    console.error("⚠️ AIRIS whatreq() error:", error.message);
    fs.appendFileSync("airis_action_log.txt", `[ERROR] ${error.message}\n`);
    return "automate"; // fallback mode if AI fails
  }
}

module.exports = { whatreq };
