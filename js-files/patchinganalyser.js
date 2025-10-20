const fs = require('fs');
const axios = require('axios');

/**
 * Sends highlighted code to Ollama/LLaMA3 to generate a patched version.
 * Cleans unwanted quotes, backticks, and extra text.
 * @param {string} code The code snippet to patch
 * @returns {Promise<string>} The cleaned patched code
 */
async function generateCodePatch(code) {
  if (!code || !code.trim()) return "";

  const prompt = `
You are AIRIS, an elite AI assistant for developers.
The user has highlighted some code that needs to be patched.
Return only the patched code.
Do NOT add explanations, comments, or extra text.
Keep all variable names and structure intact.

Code to patch:
\`\`\`
${code}
\`\`\`
`;

  try {
    const res = await axios.post("http://localhost:11434/api/generate", {
      model: "llama3",
      prompt,
      stream: false
    });

    let patchedCode = res.data.response?.trim() || "";

    // 1️⃣ Remove surrounding triple quotes or backticks
    patchedCode = patchedCode.replace(/^["'`]{0,3}/, "").replace(/["'`]{0,3}$/, "");

    // 2️⃣ Remove any "Here’s the code" or similar phrases
    patchedCode = patchedCode.replace(/^(Here('|’)?s (the )?patched code[:\n]*)/i, "");

    // 3️⃣ Remove fenced code block markers ``` or ```js
    patchedCode = patchedCode.replace(/```(js)?\n?/gi, "").replace(/```$/gi, "");

    // 4️⃣ Trim final result
    patchedCode = patchedCode.trim();

    // Optionally save logs
    if (patchedCode) {
      fs.appendFileSync("code_patch_log.txt", `Original:\n${code}\n\nPatched:\n${patchedCode}\n\n`);
    }

    return patchedCode;
  } catch (err) {
    console.error("Error generating code patch:", err);
    return "";
  }
}

module.exports = { generateCodePatch };
