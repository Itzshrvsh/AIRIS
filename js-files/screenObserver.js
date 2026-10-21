const screenshot = require('screenshot-desktop');
const path = require('path');
const fs = require('fs');
const { generateVisionText, ConfigError } = require('./aiConfig');

const TEMP_PATH = path.join(__dirname, 'last_screen.png');

async function analyzeScreen({ saveScreenshot = false, retryCount = 1 } = {}) {
  console.log("[analyzeScreen] 🚀 Starting screen analysis...");

  try {
    // Step 1: Capture screenshot
    console.log("[analyzeScreen] Step 1/5: Capturing screenshot...");
    const imgBuffer = await screenshot({ format: "png" });
    console.log(`[analyzeScreen] ✅ Screenshot captured (${(imgBuffer.length / 1024).toFixed(2)} KB)`);

    if (saveScreenshot) {
      fs.writeFileSync(TEMP_PATH, imgBuffer);
      console.log(`[analyzeScreen] 💾 Screenshot saved to ${TEMP_PATH}`);
    }

    // Step 2: Convert to Base64 (truncated in logs)
    console.log("[analyzeScreen] Step 2/5: Converting screenshot to Base64...");
    const base64Image = imgBuffer.toString("base64");
    console.log(`[analyzeScreen] ✅ Base64 conversion done (length: ${base64Image.length} chars, truncated for logs)`);

    // Step 3: Vision request via the central AI configuration.
    // Uses the configured provider/base URL/API key and the "vision"
    // feature model (falling back to the main model) so switching the
    // provider in AI Settings applies here too.
    console.log("[analyzeScreen] Step 3/5: Preparing vision request via central AI config...");
    const systemPrompt = `
    You are a **smart vision-debug assistant** specialized in analyzing code screenshots, IDE/compiler outputs, and runtime errors.
    
    Your goals:
    1. Carefully analyze the screenshot (text, UI elements, error messages, code snippets).
    2. Identify the programming language, runtime, and environment shown.
    3. Detect possible issues (syntax errors, missing dependencies, runtime misconfiguration, etc.).
    4. Provide **step-by-step reasoning** on what went wrong and why.
    5. Suggest **practical, context-aware fixes**, including example code or terminal commands if relevant.
    6. If multiple possibilities exist, list them with probabilities.
    7. When possible, explain in both beginner-friendly terms and expert-level detail.
    8. Never just describe the screenshot—always aim to solve the underlying problem.
        `;

    console.log("[analyzeScreen] Step 4/5: Sending vision request to configured AI provider...");
    const output = await generateVisionText({
      prompt: `Analyze this screenshot, detect the runtime/environment, explain the issue, and suggest fixes with code or commands if needed.`,
      imageBase64: base64Image,
      mimeType: "image/png",
    }).catch(async (err) => {
      // Fallback: if the message-style vision call is rejected, retry with
      // the system prompt folded into the user turn (some servers only
      // accept a single user message part).
      if (err instanceof ConfigError) console.error("[analyzeScreen] Vision error:", err.message);
      return generateVisionText({
        prompt: `${systemPrompt}\n\nUser: Analyze this screenshot, detect the runtime/environment, explain the issue, and suggest fixes with code or commands if needed. Note: you will receive an attached screenshot.`,
        imageBase64: base64Image,
        mimeType: "image/png",
        maxTokens: 1200,
      });
    });

    console.log(`[analyzeScreen] ✅ Response received`);

    console.log("[analyzeScreen] 🎯 Vision response preview:", output.slice(0, 500).replace(/\n/g, " "));
    console.log("[analyzeScreen] ✅ Screen analysis complete!");
    return output;

  } catch (err) {
    console.error("[analyzeScreen] ❌ ERROR:", err.message || err);

    if (retryCount > 0) {
      console.log("[analyzeScreen] 🔄 Retrying screen analysis...");
      return analyzeScreen({ saveScreenshot, retryCount: retryCount - 1 });
    }

    const hint = err && err.message ? ` (${err.message})` : "";
    return `❌ I couldn't capture/analyze the screen. Check permissions, the AI connection (AI Settings), or network.${hint}`;
  }
}

function setMainWindow(mainWindow) {
  global.mainWindow = mainWindow;
}

module.exports = {
  analyzeScreen,
  setMainWindow,
};
