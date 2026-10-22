// js-files/screenAnalyzer.js — vision analysis over an explicit screenshot
// buffer (deduped by hash). Uses the central AI configuration's vision
// model (js-files/aiConfig.js); the old version passed a Buffer into
// askAI()'s callback slot, which could never have sent the image.
const { generateVisionText } = require('./aiConfig');
const crypto = require('crypto');

let lastHash = null;

function hashBuffer(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

async function analyzeScreen(buffer) {
  if (!buffer || !buffer.length) return null;
  const hash = hashBuffer(buffer);
  if (hash === lastHash) return null;
  lastHash = hash;

  const prompt = `
You are looking at the user's current screen.
- If there are any questions visible, answer them concisely.
- If it looks like an exam/quiz/study material, give direct concise answers.
- Otherwise, briefly describe what is on the screen.
`.trim();

  try {
    const result = await generateVisionText({
      prompt,
      imageBase64: buffer.toString('base64'),
      mimeType: 'image/png',
      maxTokens: 500,
    });
    return String(result || '').trim() || null;
  } catch (err) {
    console.error('[screenAnalyzer] vision failed:', err.message);
    return null;
  }
}

module.exports = { analyzeScreen };
