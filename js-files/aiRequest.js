// js-files/aiRequest.js — thin wrapper over the central aiConfig client.
//
// Kept as its own module (many call sites require it), but it no longer
// hard-codes an endpoint or model: everything is resolved from
// data/ai-config.json via js-files/aiConfig.js, i.e. the same provider,
// base URL, key and model the user configures once in AI Settings.
//
// askAI(prompt, onChunk, options) intentionally keeps its historical
// signature: prompt string, optional streaming callback, options merged
// into the unified chat call (model, temperature, maxTokens, feature...).

const { chat, ConfigError } = require("./aiConfig");

async function askAI(prompt, onChunk, options = {}) {
  if (typeof onChunk === "object" && onChunk !== null && !(options.onChunk)) {
    // Older call sites may pass an options object as the 2nd argument.
    options = onChunk;
    onChunk = undefined;
  }

  try {
    if (onChunk && typeof onChunk === "function") {
      return await chat({
        messages: [{ role: "user", content: String(prompt ?? "") }],
        stream: true,
        onChunk,
        ...options,
      });
    }
    return await chat({
      messages: [{ role: "user", content: String(prompt ?? "") }],
      stream: false,
      ...options,
    });
  } catch (err) {
    const message = err instanceof ConfigError ? err.message : (err && err.message) || String(err);
    console.error("[🔥 AI Error]:", message);
    return `⚠️ AI unavailable: ${message}`;
  }
}

module.exports = { askAI };
