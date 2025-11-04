const fs = require("fs");
const axios = require("axios");

/**
 * Generate a clean, ready-to-use patched version of a given code snippet
 * using a local Ollama / LLaVA model endpoint.
 * 
 * @param {string} code - The code snippet to patch.
 * @returns {Promise<string>} The cleaned patched code (no extra text).
 */
async function generateCodePatch(code) {
  if (!code || !code.trim()) return "";

  const prompt = `
You are AIRIS, an elite AI assistant for developers.
Your task: fix or improve the following code while keeping its logic and variable names intact.
Return ONLY the patched code, no explanations, text, or comments.

Code:
\`\`\`
${code.trim()}
\`\`\`
`;

  try {
    const res = await axios.post(
      "http://localhost:11434/api/generate",
      { model: "llava", prompt, stream: false },
      { timeout: 20000 } // prevent infinite waits
    );

    // Handle inconsistent API shapes (Ollama sometimes returns {data:{response:""}} or {response:""})
    const raw = res?.data?.response || res?.data || "";
    if (typeof raw !== "string" || !raw.trim()) return "";

    let patchedCode = raw
      // Remove all fenced code markers (```js, ```python, etc.)
      .replace(/```[\s\S]*?```/g, match => match.replace(/```[a-z]*\n?|```/gi, ""))
      // Remove Markdown style or instruction prefaces
      .replace(/^(Here('?|’)?s( the)? patched code[:\s\n]*)/i, "")
      // Strip any quotes wrapping the entire text
      .replace(/^["'`]+|["'`]+$/g, "")
      // Collapse double line breaks
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Log asynchronously for traceability
    fs.promises
      .appendFile(
        "code_patch_log.txt",
        [
          `⏱ ${new Date().toISOString()}`,
          `--- Original ---`,
          code.trim(),
          `--- Patched ---`,
          patchedCode || "(empty result)",
          "\n\n",
        ].join("\n")
      )
      .catch(() => {}); // Ignore log errors silently

    return patchedCode;
  } catch (err) {
    const msg = err?.response?.data?.error || err.message || "Unknown error";
    console.error("⚠️ Code patch generation failed:", msg);

    fs.promises
      .appendFile(
        "code_patch_log.txt",
        `⏱ ${new Date().toISOString()} — ERROR: ${msg}\nInput:\n${code}\n\n`
      )
      .catch(() => {});

    return "";
  }
}

module.exports = { generateCodePatch };
