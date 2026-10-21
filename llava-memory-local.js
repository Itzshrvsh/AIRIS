// llava-memory-local.js — CLI demo of AIRIS memory-aware chat.
//
// Legacy note: this script duplicated core/memoryManager with its own
// Ollama CLI call (with a broken prompt-escaping shell command). It now
// reuses the shared implementation, which runs through the central AI
// configuration (provider/base URL/key/model from AI Settings):
//     node llava-memory-local.js "your message"
const { askAIRIS } = require('./core/llavaHandler');

const userId = "sharvesh";
const userInput = process.argv.slice(2).join(" ") || "I feel tired today, maybe I should rest.";

askAIRIS(userId, userInput)
  .then((response) => {
    console.log("\n🤖 AIRIS says:\n", response);
  })
  .catch((err) => {
    console.error("❌ Memory chat failed:", err.message || err);
    process.exitCode = 1;
  });
