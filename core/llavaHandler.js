// core/llavaHandler.js — memory-aware chat entry point (CommonJS).
//
// Runs through the central AI configuration (js-files/aiConfig.js) instead
// of spawning the `ollama` CLI with a hard-coded model.
const { analyzeAndStore, fetchMemoryContext } = require('./memoryManager');
const { generateText } = require('../js-files/aiConfig');

async function askAIRIS(userId, userInput) {
  // 1. Retrieve memory context
  const memoryContext = await fetchMemoryContext(userId, userInput);

  // 2. Inject it into the prompt
  const fullPrompt = `
[User's previous context]
- ${memoryContext}

[User says now]
${userInput}

Respond naturally and consider their mood and memory.
`;

  // 3. Ask the configured model
  const response = await generateText(fullPrompt, { maxTokens: 600 });

  // 4. Store new memory (best-effort; Supabase may be disabled)
  try {
    await analyzeAndStore(userId, userInput);
    await analyzeAndStore(userId, response);
  } catch (err) {
    console.warn('core/llavaHandler: memory store skipped:', err.message);
  }

  return response;
}

module.exports = { askAIRIS };
