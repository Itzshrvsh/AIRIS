const { askAI } = require('./aiRequest');
const crypto = require('crypto');

let lastHash = null;

function hashBuffer(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function analyzeScreen(buffer) {
  const hash = hashBuffer(buffer);
  if (hash === lastHash) return null;
  lastHash = hash;

  const prompt = `
You are looking at the user's current screen.
- If there are any questions visible, answer them concisely.
- If it looks like an exam/quiz/study material, give direct concise answers.
- Otherwise, briefly describe what is on the screen.
`;

  // Send prompt + image directly to LLaVA
  const result = await askAI(prompt, buffer);

  return result?.trim() || null;
}

module.exports = { analyzeScreen };
