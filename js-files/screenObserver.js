const screenshot = require('screenshot-desktop');
const fetch = require('node-fetch'); // ensure node-fetch installed for Node 18-
const path = require('path');
const fs = require('fs');

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

    // Step 3: Prepare LLaVA payload
    console.log("[analyzeScreen] Step 3/5: Preparing payload for LLaVA...");
    const payload = {
      model: "llava",
      messages: [
        {
          role: "system",
          content: `
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
        `
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this screenshot, detect the runtime/environment, explain the issue, and suggest fixes with code or commands if needed." },
            { type: "image_url", image_url: `data:image/png;base64,${base64Image}` }
          ]
        }
      ]
    };
    
    
    console.log("[analyzeScreen] ✅ Payload prepared");

    // Step 4: Send request to LLaVA
    console.log("[analyzeScreen] Step 4/5: Sending request to LLaVA API...");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const response = await fetch("http://localhost:11434/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LLAVA_API_KEY || ""}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    console.log(`[analyzeScreen] ✅ Request sent (status: ${response.status} ${response.statusText})`);

    // Step 5: Parse response
    console.log("[analyzeScreen] Step 5/5: Parsing response...");
    const result = await response.json();
    const output = result.choices?.[0]?.message?.content || "⚠️ No response from LLaVA";
    console.log("[analyzeScreen] 🎯 LLaVA response preview:", output.slice(0, 500).replace(/\n/g, " "));

    console.log("[analyzeScreen] ✅ Screen analysis complete!");
    return output;

  } catch (err) {
    console.error("[analyzeScreen] ❌ ERROR:", err.message || err);

    if (retryCount > 0) {
      console.log("[analyzeScreen] 🔄 Retrying screen analysis...");
      return analyzeScreen({ saveScreenshot, retryCount: retryCount - 1 });
    }

    return "❌ I couldn't capture/analyze the screen. Check permissions, API, or network.";
  }
}

function setMainWindow(mainWindow) {
  global.mainWindow = mainWindow;
}

module.exports = {
  analyzeScreen,
  setMainWindow,
};
